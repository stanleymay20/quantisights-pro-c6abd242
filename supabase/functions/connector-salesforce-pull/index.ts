// @ts-nocheck
/**
 * Salesforce connector — Phase 3B
 *
 * Modes: historical_backfill | incremental_sync (filter by SystemModstamp > checkpoint).
 * Objects synced: Account, Contact, Opportunity, OpportunityLineItem, Case, Task, Event, User.
 *
 * Canonical mapping (Opportunity Intelligence):
 *   - canonical_entities      : account, contact, opportunity, opportunity_stage, case, activity_event, owner
 *   - canonical_events        : opportunity.stage_changed, case.created, activity.*
 *   - canonical_relationships : contact_of (contact→account), deal_of (opp→account),
 *                                owner_of (owner→opp/case), case_of (case→account), activity_on_deal
 *   - canonical_metrics       : sales.pipeline_value (day × stage)
 *                                sales.weighted_pipeline (day × stage; amount × probability)
 *                                sales.opportunity_count (day × stage)
 *                                support.cases_open (day × priority)
 *
 * Governance:
 *   - SOQL validated via assertSoqlSafe (allowed_objects/fields, LIMIT cap, no DDL)
 *   - Tokens fetched via getSalesforceTokens (vault + quarantine + rotation)
 *   - Throttle observed on every response; circuit breaker isolates failures
 *   - Headers redacted before any telemetry log
 *   - CDC hooks populated (high_watermark, change_event_ready) for later Streaming/CDC adoption
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { shouldAllow, recordSuccess, recordFailure, deadLetter } from "../_shared/connector-isolation.ts";
import { preflightWait, observeResponse } from "../_shared/connector-throttle.ts";
import {
  upsertCanonicalEntities, upsertCanonicalEvents,
  upsertCanonicalMetrics, upsertCanonicalRelationships,
} from "../_shared/canonical-mapper.ts";
import { logConnectorEvent } from "../_shared/warehouse-config.ts";
import { getSalesforceTokens } from "../_shared/salesforce-auth.ts";
import { assertSoqlSafe, type SoqlGovernance } from "../_shared/soql-guard.ts";

const API_VERSION = "v60.0";
const VENDOR = "salesforce";
const SOURCE: "salesforce" = "salesforce";

type Mode = "historical_backfill" | "incremental_sync";

// Default governance — overridable via connector.config.governance
const DEFAULT_GOV: SoqlGovernance = {
  allowed_objects: ["Account", "Contact", "Opportunity", "OpportunityLineItem", "Case", "Task", "Event", "User", "OpportunityStage"],
  max_query_cost: 5_000,
  query_timeout_seconds: 60,
};

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
    const cfg = (connector.config ?? {}) as { mode?: Mode; objects?: string[]; governance?: SoqlGovernance };
    const mode: Mode = (requestedMode as Mode) || cfg.mode || "incremental_sync";
    const gov: SoqlGovernance = { ...DEFAULT_GOV, ...(cfg.governance ?? {}) };
    const objects = cfg.objects ?? ["Account", "Contact", "Opportunity", "Case", "Task", "Event"];

    const gate = await shouldAllow(svc, orgId, connector_id);
    if (!gate.allow) {
      logConnectorEvent({ connector_type: "salesforce", connector_id, organization_id: orgId, phase: "skipped", reason: gate.reason });
      return json({ skipped: true, reason: gate.reason }, 200, cors);
    }

    // Tokens (vault-backed) — throws if quarantined/revoked
    let tokens;
    try { tokens = await getSalesforceTokens(svc, { orgId, connectorId: connector_id }); }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordFailure(svc, connector_id, msg);
      return json({ error: msg }, 412, cors);
    }

    const ctx: Ctx = { svc, orgId, connectorId: connector_id, mode, gov, tokens };
    logConnectorEvent({ connector_type: "salesforce", connector_id, organization_id: orgId, phase: "start", reason: mode });
    const t0 = Date.now();

    const totals: Totals = empty();
    const entityIdMap = new Map<string, string>();

    try {
      // Order matters for relationship resolution.
      if (objects.includes("User"))        addInto(totals, await syncUsers(ctx, entityIdMap));
      if (objects.includes("Account"))     addInto(totals, await syncAccounts(ctx, entityIdMap));
      if (objects.includes("Contact"))     addInto(totals, await syncContacts(ctx, entityIdMap));
      if (objects.includes("Opportunity")) addInto(totals, await syncOpportunities(ctx, entityIdMap));
      if (objects.includes("Case"))        addInto(totals, await syncCases(ctx, entityIdMap));
      if (objects.includes("Task"))        addInto(totals, await syncActivities(ctx, "Task", entityIdMap));
      if (objects.includes("Event"))       addInto(totals, await syncActivities(ctx, "Event", entityIdMap));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordFailure(svc, connector_id, msg);
      await deadLetter(svc, { orgId, connectorId: connector_id, errorClass: "salesforce_sync", payload: { mode }, errorMessage: msg });
      logConnectorEvent({ connector_type: "salesforce", connector_id, organization_id: orgId, phase: "error", error: msg, duration_ms: Date.now() - t0 });
      return json({ error: msg, ...totals }, 502, cors);
    }

    await recordSuccess(svc, connector_id);
    logConnectorEvent({
      connector_type: "salesforce", connector_id, organization_id: orgId, phase: "complete",
      rows_inserted: totals.entities + totals.events + totals.metrics, rows_failed: totals.errors,
      duration_ms: Date.now() - t0, reason: mode,
    });
    return json({ success: true, mode, ...totals, rows_inserted: totals.entities + totals.events + totals.metrics }, 200, cors);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500, cors);
  }
});

/* ───────────────────────── shared helpers ───────────────────────── */

interface Ctx { svc: any; orgId: string; connectorId: string; mode: Mode; gov: SoqlGovernance; tokens: { access_token: string; instance_url: string }; }
interface Totals { entities: number; events: number; metrics: number; relationships: number; errors: number; }
const empty = (): Totals => ({ entities: 0, events: 0, metrics: 0, relationships: 0, errors: 0 });
function addInto(a: Totals, b: Totals) { a.entities += b.entities; a.events += b.events; a.metrics += b.metrics; a.relationships += b.relationships; a.errors += b.errors; }
function json(body: any, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function getCheckpoint(ctx: Ctx, field: string): Promise<string | null> {
  if (ctx.mode === "historical_backfill") return null;
  const { data } = await ctx.svc.from("connector_sync_checkpoints").select("cursor_value,high_watermark")
    .eq("connector_id", ctx.connectorId).eq("cursor_field", field).maybeSingle();
  return data?.cursor_value ?? null;
}
async function setCheckpoint(ctx: Ctx, field: string, value: string): Promise<void> {
  await ctx.svc.from("connector_sync_checkpoints").upsert({
    organization_id: ctx.orgId, connector_id: ctx.connectorId,
    cursor_field: field, cursor_value: value,
    high_watermark: value,                   // CDC-ready
    change_event_ready: false,               // flip when Streaming/CDC adopted
    updated_at: new Date().toISOString(),
  }, { onConflict: "connector_id,cursor_field" });
}

/** Execute SOQL via /query, paging /queryMore until done. Validates via assertSoqlSafe. */
async function* runSoql(ctx: Ctx, soql: string): AsyncGenerator<any[]> {
  const safe = assertSoqlSafe(soql, ctx.gov);
  let nextUrl: string | null = `${ctx.tokens.instance_url}/services/data/${API_VERSION}/query?q=${encodeURIComponent(safe.query)}`;
  let pages = 0;
  const MAX_PAGES = ctx.mode === "historical_backfill" ? 200 : 50;
  while (nextUrl && pages < MAX_PAGES) {
    await preflightWait(ctx.svc, ctx.orgId, ctx.connectorId, VENDOR);
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${ctx.tokens.access_token}` } });
    const obs = await observeResponse(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, vendor: VENDOR, res });
    if (obs.throttled) { await new Promise(r => setTimeout(r, obs.suggestedRetryMs)); continue; }
    if (!res.ok) {
      // SOQL errors return a JSON array; we log status + ErrorCode but NOT headers.
      const txt = await res.text();
      throw new Error(`Salesforce SOQL ${res.status}: ${txt.slice(0, 300)}`);
    }
    const body: any = await res.json();
    yield body.records ?? [];
    nextUrl = body.nextRecordsUrl ? `${ctx.tokens.instance_url}${body.nextRecordsUrl}` : null;
    pages++;
  }
}

function whereSince(field: string, cursor: string | null): string {
  return cursor ? ` WHERE ${field} > ${cursor}` : "";
}

/* ───────────────────────── object syncers ───────────────────────── */

async function syncUsers(ctx: Ctx, entityIdMap: Map<string, string>): Promise<Totals> {
  const t = empty();
  const cursor = await getCheckpoint(ctx, "User.SystemModstamp");
  let maxMod = cursor;
  const soql = `SELECT Id, Name, Email, IsActive, SystemModstamp FROM User${whereSince("SystemModstamp", cursor)} ORDER BY SystemModstamp ASC`;
  for await (const page of runSoql(ctx, soql)) {
    const entities = page.map((r: any) => ({
      entity_type: "owner", external_id: String(r.Id),
      display_name: r.Name ?? r.Email ?? null,
      attributes: { email: r.Email, is_active: r.IsActive },
    }));
    const m = await upsertCanonicalEntities(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, entities });
    for (const [k, v] of m) entityIdMap.set(k, v);
    t.entities += entities.length;
    for (const r of page) if (r.SystemModstamp && (!maxMod || r.SystemModstamp > maxMod)) maxMod = r.SystemModstamp;
  }
  if (maxMod) await setCheckpoint(ctx, "User.SystemModstamp", maxMod);
  return t;
}

async function syncAccounts(ctx: Ctx, entityIdMap: Map<string, string>): Promise<Totals> {
  const t = empty();
  const cursor = await getCheckpoint(ctx, "Account.SystemModstamp");
  let maxMod = cursor;
  const soql = `SELECT Id, Name, Industry, AnnualRevenue, NumberOfEmployees, BillingCountry, OwnerId, SystemModstamp FROM Account${whereSince("SystemModstamp", cursor)} ORDER BY SystemModstamp ASC`;
  for await (const page of runSoql(ctx, soql)) {
    const entities = page.map((r: any) => ({
      entity_type: "account", external_id: String(r.Id),
      display_name: r.Name ?? null,
      attributes: { industry: r.Industry, annual_revenue: r.AnnualRevenue, employees: r.NumberOfEmployees, country: r.BillingCountry },
    }));
    const m = await upsertCanonicalEntities(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, entities });
    for (const [k, v] of m) entityIdMap.set(k, v);
    t.entities += entities.length;
    const rels: any[] = [];
    for (const r of page) {
      if (r.OwnerId) rels.push({
        relationship_type: "owner_of",
        from_entity_type: "owner", from_external_id: String(r.OwnerId),
        to_entity_type: "account", to_external_id: String(r.Id),
      });
      if (r.SystemModstamp && (!maxMod || r.SystemModstamp > maxMod)) maxMod = r.SystemModstamp;
    }
    t.relationships += await upsertCanonicalRelationships(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, relationships: rels, entityIdMap });
  }
  if (maxMod) await setCheckpoint(ctx, "Account.SystemModstamp", maxMod);
  return t;
}

async function syncContacts(ctx: Ctx, entityIdMap: Map<string, string>): Promise<Totals> {
  const t = empty();
  const cursor = await getCheckpoint(ctx, "Contact.SystemModstamp");
  let maxMod = cursor;
  const soql = `SELECT Id, FirstName, LastName, Email, Title, AccountId, OwnerId, SystemModstamp FROM Contact${whereSince("SystemModstamp", cursor)} ORDER BY SystemModstamp ASC`;
  for await (const page of runSoql(ctx, soql)) {
    const entities = page.map((r: any) => ({
      entity_type: "contact", external_id: String(r.Id),
      display_name: [r.FirstName, r.LastName].filter(Boolean).join(" ") || r.Email || null,
      attributes: { email: r.Email, title: r.Title },
    }));
    const m = await upsertCanonicalEntities(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, entities });
    for (const [k, v] of m) entityIdMap.set(k, v);
    t.entities += entities.length;
    const rels: any[] = [];
    for (const r of page) {
      if (r.AccountId) rels.push({
        relationship_type: "contact_of",
        from_entity_type: "contact", from_external_id: String(r.Id),
        to_entity_type: "account",   to_external_id: String(r.AccountId),
      });
      if (r.SystemModstamp && (!maxMod || r.SystemModstamp > maxMod)) maxMod = r.SystemModstamp;
    }
    t.relationships += await upsertCanonicalRelationships(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, relationships: rels, entityIdMap });
  }
  if (maxMod) await setCheckpoint(ctx, "Contact.SystemModstamp", maxMod);
  return t;
}

async function syncOpportunities(ctx: Ctx, entityIdMap: Map<string, string>): Promise<Totals> {
  const t = empty();
  const cursor = await getCheckpoint(ctx, "Opportunity.SystemModstamp");
  let maxMod = cursor;
  const pipelineByDay = new Map<string, Map<string, { amount: number; weighted: number; count: number }>>();
  const stageEntitiesSeen = new Set<string>();

  const soql = `SELECT Id, Name, AccountId, OwnerId, StageName, Amount, Probability, CloseDate, ForecastCategoryName, IsWon, IsClosed, SystemModstamp FROM Opportunity${whereSince("SystemModstamp", cursor)} ORDER BY SystemModstamp ASC`;
  for await (const page of runSoql(ctx, soql)) {
    // 1. Opportunity entities
    const entities = page.map((r: any) => ({
      entity_type: "opportunity", external_id: String(r.Id),
      display_name: r.Name ?? null,
      attributes: { stage: r.StageName, amount: r.Amount, probability: r.Probability, close_date: r.CloseDate, forecast_category: r.ForecastCategoryName, is_won: r.IsWon, is_closed: r.IsClosed },
    }));
    const m = await upsertCanonicalEntities(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, entities });
    for (const [k, v] of m) entityIdMap.set(k, v);
    t.entities += entities.length;

    // 2. Opportunity stage entities (dedup across pages)
    const stageEntities: any[] = [];
    for (const r of page) {
      if (r.StageName && !stageEntitiesSeen.has(r.StageName)) {
        stageEntitiesSeen.add(r.StageName);
        stageEntities.push({
          entity_type: "opportunity_stage", external_id: r.StageName, display_name: r.StageName, attributes: {},
        });
      }
    }
    if (stageEntities.length) {
      const sm = await upsertCanonicalEntities(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, entities: stageEntities });
      for (const [k, v] of sm) entityIdMap.set(k, v);
      t.entities += stageEntities.length;
    }

    // 3. Relationships + stage_changed events + daily rollups
    const rels: any[] = [];
    const events: any[] = [];
    for (const r of page) {
      const oppId = String(r.Id);
      if (r.AccountId) rels.push({ relationship_type: "deal_of", from_entity_type: "opportunity", from_external_id: oppId, to_entity_type: "account", to_external_id: String(r.AccountId) });
      if (r.OwnerId)   rels.push({ relationship_type: "owner_of", from_entity_type: "owner", from_external_id: String(r.OwnerId), to_entity_type: "opportunity", to_external_id: oppId });

      const modAt = r.SystemModstamp;
      if (modAt && r.StageName) {
        events.push({
          event_type: "opportunity.stage_changed",
          external_id: `${oppId}:${r.StageName}:${modAt}`,
          occurred_at: modAt,
          entity_external_id: oppId, entity_type: "opportunity",
          attributes: { stage: r.StageName, amount: r.Amount, probability: r.Probability, is_won: r.IsWon, is_closed: r.IsClosed },
        });
      }
      // Daily pipeline rollup (only open opportunities)
      const amt = Number(r.Amount ?? 0);
      const prob = Number(r.Probability ?? 0) / 100;
      if (Number.isFinite(amt) && amt > 0 && modAt && !r.IsClosed) {
        const day = String(modAt).slice(0, 10);
        const stage = r.StageName ?? "unknown";
        if (!pipelineByDay.has(day)) pipelineByDay.set(day, new Map());
        const m2 = pipelineByDay.get(day)!;
        const cur = m2.get(stage) ?? { amount: 0, weighted: 0, count: 0 };
        cur.amount += amt; cur.weighted += amt * prob; cur.count += 1;
        m2.set(stage, cur);
      }
      if (modAt && (!maxMod || modAt > maxMod)) maxMod = modAt;
    }
    t.relationships += await upsertCanonicalRelationships(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, relationships: rels, entityIdMap });
    t.events       += await upsertCanonicalEvents(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, events, entityIdMap });
  }

  // Emit daily pipeline metrics
  const metrics: any[] = [];
  for (const [day, stages] of pipelineByDay) {
    for (const [stage, agg] of stages) {
      metrics.push({ metric_key: "sales.pipeline_value",    period_start: day, period_grain: "day", value: agg.amount,   unit: "USD", dimensions: { stage } });
      metrics.push({ metric_key: "sales.weighted_pipeline", period_start: day, period_grain: "day", value: agg.weighted, unit: "USD", dimensions: { stage } });
      metrics.push({ metric_key: "sales.opportunity_count", period_start: day, period_grain: "day", value: agg.count,    unit: "count", dimensions: { stage } });
    }
  }
  t.metrics += await upsertCanonicalMetrics(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, metrics });

  if (maxMod) await setCheckpoint(ctx, "Opportunity.SystemModstamp", maxMod);
  return t;
}

async function syncCases(ctx: Ctx, entityIdMap: Map<string, string>): Promise<Totals> {
  const t = empty();
  const cursor = await getCheckpoint(ctx, "Case.SystemModstamp");
  let maxMod = cursor;
  const openCasesByDay = new Map<string, Map<string, number>>();
  const soql = `SELECT Id, CaseNumber, AccountId, OwnerId, Status, Priority, IsClosed, CreatedDate, SystemModstamp FROM Case${whereSince("SystemModstamp", cursor)} ORDER BY SystemModstamp ASC`;
  for await (const page of runSoql(ctx, soql)) {
    const entities = page.map((r: any) => ({
      entity_type: "case", external_id: String(r.Id),
      display_name: r.CaseNumber ?? null,
      attributes: { status: r.Status, priority: r.Priority, is_closed: r.IsClosed },
    }));
    const m = await upsertCanonicalEntities(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, entities });
    for (const [k, v] of m) entityIdMap.set(k, v);
    t.entities += entities.length;

    const rels: any[] = [];
    const events: any[] = [];
    for (const r of page) {
      const cid = String(r.Id);
      if (r.AccountId) rels.push({ relationship_type: "case_of", from_entity_type: "case", from_external_id: cid, to_entity_type: "account", to_external_id: String(r.AccountId) });
      if (r.OwnerId)   rels.push({ relationship_type: "owner_of", from_entity_type: "owner", from_external_id: String(r.OwnerId), to_entity_type: "case", to_external_id: cid });
      if (r.CreatedDate) events.push({
        event_type: "case.created", external_id: cid, occurred_at: r.CreatedDate,
        entity_external_id: cid, entity_type: "case",
        attributes: { priority: r.Priority, status: r.Status },
      });
      if (!r.IsClosed && r.SystemModstamp) {
        const day = String(r.SystemModstamp).slice(0, 10);
        const pri = r.Priority ?? "unknown";
        if (!openCasesByDay.has(day)) openCasesByDay.set(day, new Map());
        const m2 = openCasesByDay.get(day)!;
        m2.set(pri, (m2.get(pri) ?? 0) + 1);
      }
      if (r.SystemModstamp && (!maxMod || r.SystemModstamp > maxMod)) maxMod = r.SystemModstamp;
    }
    t.relationships += await upsertCanonicalRelationships(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, relationships: rels, entityIdMap });
    t.events       += await upsertCanonicalEvents(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, events, entityIdMap });
  }
  const metrics: any[] = [];
  for (const [day, pris] of openCasesByDay) for (const [priority, count] of pris) {
    metrics.push({ metric_key: "support.cases_open", period_start: day, period_grain: "day", value: count, unit: "count", dimensions: { priority } });
  }
  t.metrics += await upsertCanonicalMetrics(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, metrics });
  if (maxMod) await setCheckpoint(ctx, "Case.SystemModstamp", maxMod);
  return t;
}

async function syncActivities(ctx: Ctx, sObject: "Task" | "Event", entityIdMap: Map<string, string>): Promise<Totals> {
  const t = empty();
  const ckField = `${sObject}.SystemModstamp`;
  const cursor = await getCheckpoint(ctx, ckField);
  let maxMod = cursor;
  const dateField = sObject === "Task" ? "ActivityDate" : "ActivityDateTime";
  const soql = `SELECT Id, Subject, WhoId, WhatId, OwnerId, ${dateField}, SystemModstamp FROM ${sObject}${whereSince("SystemModstamp", cursor)} ORDER BY SystemModstamp ASC`;
  for await (const page of runSoql(ctx, soql)) {
    const entities = page.map((r: any) => ({
      entity_type: "activity_event", external_id: `${sObject}:${r.Id}`,
      display_name: r.Subject ?? sObject,
      attributes: { kind: sObject.toLowerCase(), date: r[dateField] },
    }));
    const m = await upsertCanonicalEntities(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, entities });
    for (const [k, v] of m) entityIdMap.set(k, v);
    t.entities += entities.length;

    const rels: any[] = [];
    const events: any[] = [];
    for (const r of page) {
      const aid = `${sObject}:${r.Id}`;
      // Activities can attach to Opportunities (WhatId may be opportunity / account / case).
      // We only persist the link as opportunity if the entity exists in our map; otherwise skip — keeps the graph clean.
      if (r.WhatId) {
        const oppKey = `opportunity:${r.WhatId}`;
        if (entityIdMap.has(oppKey)) {
          rels.push({ relationship_type: "activity_on_deal", from_entity_type: "activity_event", from_external_id: aid, to_entity_type: "opportunity", to_external_id: String(r.WhatId) });
        }
      }
      const ts = r[dateField] ?? r.SystemModstamp;
      if (ts) events.push({
        event_type: `activity.${sObject.toLowerCase()}`,
        external_id: aid, occurred_at: ts,
        entity_external_id: aid, entity_type: "activity_event",
        attributes: { subject: r.Subject },
      });
      if (r.SystemModstamp && (!maxMod || r.SystemModstamp > maxMod)) maxMod = r.SystemModstamp;
    }
    t.relationships += await upsertCanonicalRelationships(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, relationships: rels, entityIdMap });
    t.events       += await upsertCanonicalEvents(ctx.svc, { orgId: ctx.orgId, connectorId: ctx.connectorId, sourceType: SOURCE, events, entityIdMap });
  }
  if (maxMod) await setCheckpoint(ctx, ckField, maxMod);
  return t;
}
