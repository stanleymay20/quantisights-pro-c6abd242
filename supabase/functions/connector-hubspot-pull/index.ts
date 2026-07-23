// @ts-nocheck
/**
 * HubSpot connector — Phase 3A
 *
 * Modes (config.mode):
 *   - "historical_backfill" : full pull, no filter, larger page size, gentler pacing
 *   - "incremental_sync"    : pulls records modified since checkpoint cursor
 *
 * Maps to canonical:
 *   - canonical_entities      : company, contact, deal, owner, pipeline_stage
 *   - canonical_events        : deal.stage_changed, activity_event (engagement)
 *   - canonical_metrics       : sales.pipeline_value (per day, grouped by stage)
 *   - canonical_relationships : contact_of, deal_of, owner_of, activity_on_deal
 *
 * Resilience:
 *   - connector-isolation circuit breaker (shouldAllow / recordSuccess / recordFailure / deadLetter)
 *   - connector-throttle adaptive backoff + reset_at + remaining_quota tracking
 *   - connector_sync_checkpoints { cursor_field: 'lastmodifieddate' } per object
 *   - structured logConnectorEvent telemetry
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { shouldAllow, recordSuccess, recordFailure, deadLetter } from "../_shared/connector-isolation.ts";
import { preflightWait, observeResponse } from "../_shared/connector-throttle.ts";
import {
  upsertCanonicalEntities,
  upsertCanonicalEvents,
  upsertCanonicalMetrics,
  upsertCanonicalRelationships,
} from "../_shared/canonical-mapper.ts";
import { logConnectorEvent } from "../_shared/warehouse-config.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/hubspot";
const VENDOR = "hubspot";
const SOURCE: "hubspot" = "hubspot";

type Mode = "historical_backfill" | "incremental_sync";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { connector_id, mode: requestedMode } = await req.json().catch(() => ({}));
    if (!connector_id) return json({ error: "connector_id required" }, 400, cors);

    const { data: connector, error: cErr } = await svc.from("data_connectors").select("*").eq("id", connector_id).single();
    if (cErr || !connector) return json({ error: "connector not found" }, 404, cors);

    const orgId = connector.organization_id;
    const cfg = (connector.config ?? {}) as { mode?: Mode; objects?: string[]; page_size?: number };
    const mode: Mode = (requestedMode as Mode) || cfg.mode || "incremental_sync";
    const objects = cfg.objects ?? ["companies", "contacts", "deals", "pipelines", "activities"];
    const pageSize = Math.min(100, cfg.page_size ?? (mode === "historical_backfill" ? 100 : 50));

    const gate = await shouldAllow(svc, orgId, connector_id);
    if (!gate.allow) {
      logConnectorEvent({ connector_type: "hubspot", connector_id, organization_id: orgId, phase: "skipped", reason: gate.reason });
      return json({ skipped: true, reason: gate.reason }, 200, cors);
    }

    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    const HS = Deno.env.get("HUBSPOT_API_KEY");
    if (!LOVABLE || !HS) {
      await recordFailure(svc, connector_id, "missing gateway secrets (LOVABLE_API_KEY/HUBSPOT_API_KEY)");
      return json({ error: "HubSpot connector not linked" }, 412, cors);
    }

    const ctx: Ctx = { svc, orgId, connectorId: connector_id, mode, pageSize, headers: {
      Authorization: `Bearer ${LOVABLE}`,
      "X-Connection-Api-Key": HS,
      "Content-Type": "application/json",
    }};

    logConnectorEvent({ connector_type: "hubspot", connector_id, organization_id: orgId, phase: "start", reason: mode });
    const t0 = Date.now();

    // Order matters: companies + owners first, then contacts/deals (so relationships resolve), then pipelines, then activities.
    const totals = { entities: 0, events: 0, metrics: 0, relationships: 0, errors: 0 };
    // Global entity map keyed by `${type}:${external_id}` shared across passes for relationship resolution.
    const entityIdMap = new Map<string, string>();

    try {
      if (objects.includes("companies"))  Object.assign(totals, addTotals(totals, await syncCompanies(ctx, entityIdMap)));
      if (objects.includes("contacts"))   Object.assign(totals, addTotals(totals, await syncContacts(ctx, entityIdMap)));
      if (objects.includes("deals"))      Object.assign(totals, addTotals(totals, await syncDeals(ctx, entityIdMap)));
      if (objects.includes("pipelines"))  Object.assign(totals, addTotals(totals, await syncPipelines(ctx, entityIdMap)));
      if (objects.includes("activities")) Object.assign(totals, addTotals(totals, await syncActivities(ctx, entityIdMap)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordFailure(svc, connector_id, msg);
      await deadLetter(svc, { orgId, connectorId: connector_id, errorClass: "hubspot_sync", payload: { mode }, errorMessage: msg });
      logConnectorEvent({ connector_type: "hubspot", connector_id, organization_id: orgId, phase: "error", error: msg, duration_ms: Date.now() - t0 });
      return json({ error: msg, ...totals }, 502, cors);
    }

    await recordSuccess(svc, connector_id);
    logConnectorEvent({
      connector_type: "hubspot", connector_id, organization_id: orgId, phase: "complete",
      rows_inserted: totals.entities + totals.events + totals.metrics,
      rows_failed: totals.errors,
      duration_ms: Date.now() - t0,
      reason: mode,
    });
    return json({ success: true, mode, ...totals, rows_inserted: totals.entities + totals.events + totals.metrics }, 200, cors);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500, cors);
  }
});

/* ───────────────────────────── helpers ───────────────────────────── */

interface Ctx {
  svc: any; orgId: string; connectorId: string;
  mode: Mode; pageSize: number; headers: Record<string, string>;
}
interface Totals { entities: number; events: number; metrics: number; relationships: number; errors: number; }
const addTotals = (a: Totals, b: Totals): Totals => ({
  entities: a.entities + b.entities, events: a.events + b.events,
  metrics: a.metrics + b.metrics, relationships: a.relationships + b.relationships,
  errors: a.errors + b.errors,
});
const empty = (): Totals => ({ entities: 0, events: 0, metrics: 0, relationships: 0, errors: 0 });

function json(body: any, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function getCheckpoint(ctx: Ctx, field: string): Promise<string | null> {
  if (ctx.mode === "historical_backfill") return null;
  const { data } = await ctx.svc.from("connector_sync_checkpoints")
    .select("cursor_value").eq("connector_id", ctx.connectorId).eq("cursor_field", field).maybeSingle();
  return data?.cursor_value ?? null;
}

async function setCheckpoint(ctx: Ctx, field: string, value: string): Promise<void> {
  await ctx.svc.from("connector_sync_checkpoints").upsert({
    organization_id: ctx.orgId, connector_id: ctx.connectorId, cursor_field: field, cursor_value: value,
    updated_at: new Date().toISOString(),
  }, { onConflict: "connector_id,cursor_field" });
}

/**
 * Paged search with throttle awareness.
 * Uses /crm/v3/objects/{type}/search for incremental (filter by hs_lastmodifieddate > checkpoint),
 * and listing endpoint for historical_backfill.
 */
async function* pagedFetch(ctx: Ctx, opts: {
  object: string; properties: string[]; associations?: string[]; sinceCursor?: string | null;
}): AsyncGenerator<any[]> {
  const useSearch = ctx.mode === "incremental_sync" && opts.sinceCursor;
  let after: string | undefined;
  let pageCount = 0;
  const MAX_PAGES = ctx.mode === "historical_backfill" ? 200 : 50;

  while (pageCount < MAX_PAGES) {
    await preflightWait(ctx.svc, ctx.orgId, ctx.connectorId, VENDOR);

    let url: string; let body: BodyInit | undefined; let method: "GET" | "POST";
    if (useSearch) {
      method = "POST";
      url = `${GATEWAY}/crm/v3/objects/${opts.object}/search`;
      body = JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "hs_lastmodifieddate", operator: "GT", value: opts.sinceCursor }] }],
        sorts: [{ propertyName: "hs_lastmodifieddate", direction: "ASCENDING" }],
        properties: opts.properties,
        limit: ctx.pageSize,
        after,
      });
    } else {
      method = "GET";
      const params = new URLSearchParams({ limit: String(ctx.pageSize) });
      params.set("properties", opts.properties.join(","));
      if (opts.associations?.length) params.set("associations", opts.associations.join(","));
      if (after) params.set("after", after);
      url = `${GATEWAY}/crm/v3/objects/${opts.object}?${params}`;
    }

    const res = await fetch(url, { method, headers: ctx.headers, body });
    const obs = await observeResponse(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, vendor: VENDOR, res });

    if (obs.throttled) {
      // throttle handler already updated state; retry once after waiting
      await new Promise(r => setTimeout(r, obs.suggestedRetryMs));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot ${opts.object} ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const results = data.results ?? [];
    yield results;
    after = data.paging?.next?.after;
    if (!after || !results.length) return;
    pageCount++;
  }
}

/* ───────────────────────────── object syncers ───────────────────────────── */

async function syncCompanies(ctx: Ctx, entityIdMap: Map<string, string>): Promise<Totals> {
  const t = empty();
  const cursor = await getCheckpoint(ctx, "companies.lastmodifieddate");
  let maxModified = cursor;
  for await (const page of pagedFetch(ctx, {
    object: "companies",
    properties: ["name", "domain", "industry", "numberofemployees", "annualrevenue", "hs_lastmodifieddate", "country"],
    sinceCursor: cursor,
  })) {
    const entities = page.map((r: any) => ({
      entity_type: "company",
      external_id: String(r.id),
      display_name: r.properties?.name ?? null,
      attributes: r.properties ?? {},
    }));
    const idMap = await upsertCanonicalEntities(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, entities });
    for (const [k, v] of idMap) entityIdMap.set(k, v);
    t.entities += entities.length;
    for (const r of page) {
      const m = r.properties?.hs_lastmodifieddate;
      if (m && (!maxModified || m > maxModified)) maxModified = m;
    }
  }
  if (maxModified) await setCheckpoint(ctx, "companies.lastmodifieddate", maxModified);
  return t;
}

async function syncContacts(ctx: Ctx, entityIdMap: Map<string, string>): Promise<Totals> {
  const t = empty();
  const cursor = await getCheckpoint(ctx, "contacts.lastmodifieddate");
  let maxModified = cursor;
  for await (const page of pagedFetch(ctx, {
    object: "contacts",
    properties: ["email", "firstname", "lastname", "company", "jobtitle", "hs_lastmodifieddate"],
    associations: ["companies"],
    sinceCursor: cursor,
  })) {
    const entities = page.map((r: any) => ({
      entity_type: "contact",
      external_id: String(r.id),
      display_name: [r.properties?.firstname, r.properties?.lastname].filter(Boolean).join(" ") || r.properties?.email || null,
      attributes: r.properties ?? {},
    }));
    const idMap = await upsertCanonicalEntities(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, entities });
    for (const [k, v] of idMap) entityIdMap.set(k, v);
    t.entities += entities.length;

    // contact_of -> company relationships
    const rels: any[] = [];
    for (const r of page) {
      const assoc = r.associations?.companies?.results ?? [];
      for (const a of assoc) {
        rels.push({
          relationship_type: "contact_of",
          from_entity_type: "contact", from_external_id: String(r.id),
          to_entity_type: "company",   to_external_id: String(a.id),
        });
      }
      const m = r.properties?.hs_lastmodifieddate;
      if (m && (!maxModified || m > maxModified)) maxModified = m;
    }
    t.relationships += await upsertCanonicalRelationships(ctx.svc, {
      orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, relationships: rels, entityIdMap,
    });
  }
  if (maxModified) await setCheckpoint(ctx, "contacts.lastmodifieddate", maxModified);
  return t;
}

async function syncDeals(ctx: Ctx, entityIdMap: Map<string, string>): Promise<Totals> {
  const t = empty();
  const cursor = await getCheckpoint(ctx, "deals.lastmodifieddate");
  let maxModified = cursor;
  const pipelineValueByDay = new Map<string, Map<string, number>>(); // day -> stage -> sum(amount)

  for await (const page of pagedFetch(ctx, {
    object: "deals",
    properties: ["dealname", "amount", "dealstage", "pipeline", "closedate", "hs_lastmodifieddate", "hubspot_owner_id", "createdate"],
    associations: ["companies", "contacts"],
    sinceCursor: cursor,
  })) {
    // 1. Deal entities
    const entities = page.map((r: any) => ({
      entity_type: "deal",
      external_id: String(r.id),
      display_name: r.properties?.dealname ?? null,
      attributes: r.properties ?? {},
    }));
    const idMap = await upsertCanonicalEntities(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, entities });
    for (const [k, v] of idMap) entityIdMap.set(k, v);
    t.entities += entities.length;

    // 2. Owner entities (lightweight)
    const ownerIds = Array.from(new Set(page.map((r: any) => r.properties?.hubspot_owner_id).filter(Boolean)));
    if (ownerIds.length) {
      const ownerEntities = ownerIds.map((id) => ({
        entity_type: "owner", external_id: String(id), display_name: null, attributes: {},
      }));
      const ownMap = await upsertCanonicalEntities(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, entities: ownerEntities });
      for (const [k, v] of ownMap) entityIdMap.set(k, v);
      t.entities += ownerEntities.length;
    }

    // 3. Relationships + stage-changed events + daily pipeline_value rollup
    const rels: any[] = [];
    const events: any[] = [];
    for (const r of page) {
      const dealId = String(r.id);
      const ownerId = r.properties?.hubspot_owner_id;
      if (ownerId) rels.push({
        relationship_type: "owner_of",
        from_entity_type: "owner", from_external_id: String(ownerId),
        to_entity_type: "deal", to_external_id: dealId,
      });
      for (const a of r.associations?.companies?.results ?? []) {
        rels.push({
          relationship_type: "deal_of",
          from_entity_type: "deal", from_external_id: dealId,
          to_entity_type: "company", to_external_id: String(a.id),
        });
      }
      // stage_changed event per observed modification
      const modAt = r.properties?.hs_lastmodifieddate;
      if (modAt && r.properties?.dealstage) {
        events.push({
          event_type: "deal.stage_changed",
          external_id: `${dealId}:${r.properties.dealstage}:${modAt}`,
          occurred_at: modAt,
          entity_external_id: dealId,
          entity_type: "deal",
          attributes: { dealstage: r.properties.dealstage, pipeline: r.properties.pipeline, amount: r.properties.amount },
        });
      }
      // pipeline_value rollup
      const amt = Number(r.properties?.amount ?? 0);
      if (Number.isFinite(amt) && amt > 0 && modAt) {
        const day = modAt.slice(0, 10);
        const stage = r.properties?.dealstage ?? "unknown";
        if (!pipelineValueByDay.has(day)) pipelineValueByDay.set(day, new Map());
        const m = pipelineValueByDay.get(day)!;
        m.set(stage, (m.get(stage) ?? 0) + amt);
      }
      if (modAt && (!maxModified || modAt > maxModified)) maxModified = modAt;
    }
    t.relationships += await upsertCanonicalRelationships(ctx.svc, {
      orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, relationships: rels, entityIdMap,
    });
    t.events += await upsertCanonicalEvents(ctx.svc, {
      orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, events, entityIdMap,
    });
  }

  // Emit daily pipeline_value metric per stage
  const metrics: any[] = [];
  for (const [day, stages] of pipelineValueByDay) {
    for (const [stage, val] of stages) {
      metrics.push({
        metric_key: "sales.pipeline_value",
        period_start: day, period_grain: "day",
        value: val, unit: "USD",
        dimensions: { stage },
      });
    }
  }
  t.metrics += await upsertCanonicalMetrics(ctx.svc, {
    orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, metrics,
  });

  if (maxModified) await setCheckpoint(ctx, "deals.lastmodifieddate", maxModified);
  return t;
}

async function syncPipelines(ctx: Ctx, entityIdMap: Map<string, string>): Promise<Totals> {
  const t = empty();
  await preflightWait(ctx.svc, ctx.orgId, ctx.connectorId, VENDOR);
  const res = await fetch(`${GATEWAY}/crm/v3/pipelines/deals`, { headers: ctx.headers });
  await observeResponse(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, vendor: VENDOR, res });
  if (!res.ok) throw new Error(`HubSpot pipelines ${res.status}`);
  const data = await res.json();
  const entities: any[] = [];
  for (const p of data.results ?? []) {
    for (const stage of p.stages ?? []) {
      entities.push({
        entity_type: "pipeline_stage",
        external_id: `${p.id}:${stage.id}`,
        display_name: `${p.label} / ${stage.label}`,
        attributes: { pipeline_id: p.id, pipeline_label: p.label, stage_id: stage.id, stage_label: stage.label, probability: stage.metadata?.probability, display_order: stage.displayOrder },
      });
    }
  }
  if (entities.length) {
    const idMap = await upsertCanonicalEntities(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, entities });
    for (const [k, v] of idMap) entityIdMap.set(k, v);
    t.entities += entities.length;
  }
  return t;
}

async function syncActivities(ctx: Ctx, entityIdMap: Map<string, string>): Promise<Totals> {
  const t = empty();
  // We sync three engagement types: calls, emails, meetings — each via /crm/v3/objects/{type}
  for (const obj of ["calls", "emails", "meetings"] as const) {
    const cursor = await getCheckpoint(ctx, `${obj}.lastmodifieddate`);
    let maxModified = cursor;
    for await (const page of pagedFetch(ctx, {
      object: obj,
      properties: ["hs_timestamp", "hs_lastmodifieddate", "hs_activity_type", "hubspot_owner_id"],
      associations: ["deals"],
      sinceCursor: cursor,
    })) {
      const entities = page.map((r: any) => ({
        entity_type: "activity_event",
        external_id: `${obj}:${r.id}`,
        display_name: r.properties?.hs_activity_type ?? obj.slice(0, -1),
        attributes: { kind: obj, ...(r.properties ?? {}) },
      }));
      const idMap = await upsertCanonicalEntities(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, entities });
      for (const [k, v] of idMap) entityIdMap.set(k, v);
      t.entities += entities.length;

      const events: any[] = [];
      const rels: any[] = [];
      for (const r of page) {
        const ts = r.properties?.hs_timestamp ?? r.properties?.hs_lastmodifieddate;
        if (ts) {
          events.push({
            event_type: `activity.${obj}`,
            external_id: `${obj}:${r.id}`,
            occurred_at: ts,
            entity_external_id: `${obj}:${r.id}`,
            entity_type: "activity_event",
            attributes: r.properties ?? {},
          });
        }
        for (const a of r.associations?.deals?.results ?? []) {
          rels.push({
            relationship_type: "activity_on_deal",
            from_entity_type: "activity_event", from_external_id: `${obj}:${r.id}`,
            to_entity_type: "deal", to_external_id: String(a.id),
          });
        }
        const m = r.properties?.hs_lastmodifieddate;
        if (m && (!maxModified || m > maxModified)) maxModified = m;
      }
      t.events += await upsertCanonicalEvents(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, events, entityIdMap });
      t.relationships += await upsertCanonicalRelationships(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, relationships: rels, entityIdMap });
    }
    if (maxModified) await setCheckpoint(ctx, `${obj}.lastmodifieddate`, maxModified);
  }
  return t;
}
