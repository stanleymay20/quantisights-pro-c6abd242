// @ts-nocheck
/**
 * Canonical mapper: every connector writes through these helpers so all downstream
 * intelligence (narratives, interventions, advisories, pressure models) consumes a
 * single semantic shape regardless of source.
 */

export type CanonicalSourceType =
  | "snowflake" | "bigquery" | "s3" | "hubspot" | "salesforce" | "sap"
  | "stripe" | "api" | "csv" | "webhook" | "ga4" | "quickbooks" | "xero";

export interface CanonicalEntityInput {
  entity_type: string;       // 'account' | 'contact' | 'deal' | 'product' | 'asset' | 'file' | ...
  external_id: string;
  display_name?: string;
  attributes?: Record<string, unknown>;
}

export interface CanonicalEventInput {
  event_type: string;        // 'deal.stage_changed' | 'payment.succeeded' | 'file.uploaded'
  external_id?: string;
  occurred_at: string | Date;
  entity_external_id?: string;
  entity_type?: string;
  attributes?: Record<string, unknown>;
}

export interface CanonicalMetricInput {
  metric_key: string;        // 'revenue.mrr' | 'sales.pipeline_value' | 'ops.tickets_open'
  period_start: string | Date;
  period_grain?: "day" | "week" | "month" | "quarter";
  value: number;
  unit?: string;
  dimensions?: Record<string, unknown>;
  entity_external_id?: string;
  entity_type?: string;
}

const CHUNK = 500;

async function chunkUpsert(svc: any, table: string, rows: any[], conflict: string) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await svc.from(table).upsert(slice, { onConflict: conflict, ignoreDuplicates: false });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

export async function upsertCanonicalEntities(svc: any, params: {
  orgId: string; connectorId?: string; sourceType: CanonicalSourceType; entities: CanonicalEntityInput[];
}): Promise<Map<string, string>> {
  if (!params.entities.length) return new Map();
  const now = new Date().toISOString();
  const rows = params.entities.map(e => ({
    organization_id: params.orgId,
    connector_id: params.connectorId ?? null,
    source_type: params.sourceType,
    entity_type: e.entity_type,
    external_id: e.external_id,
    display_name: e.display_name ?? null,
    attributes: e.attributes ?? {},
    last_seen_at: now,
  }));
  await chunkUpsert(svc, "canonical_entities", rows, "organization_id,source_type,entity_type,external_id");
  // Return external_id -> id map for FK use
  const keys = params.entities.map(e => `${e.entity_type}:${e.external_id}`);
  const { data } = await svc
    .from("canonical_entities")
    .select("id,natural_key")
    .eq("organization_id", params.orgId)
    .eq("source_type", params.sourceType)
    .in("natural_key", keys);
  const map = new Map<string, string>();
  for (const r of data ?? []) map.set(r.natural_key, r.id);
  return map;
}

export async function upsertCanonicalEvents(svc: any, params: {
  orgId: string; connectorId?: string; sourceType: CanonicalSourceType; events: CanonicalEventInput[];
  entityIdMap?: Map<string, string>;
}): Promise<number> {
  if (!params.events.length) return 0;
  const rows = params.events.map(ev => {
    const entityId = ev.entity_external_id && ev.entity_type
      ? params.entityIdMap?.get(`${ev.entity_type}:${ev.entity_external_id}`) ?? null
      : null;
    return {
      organization_id: params.orgId,
      connector_id: params.connectorId ?? null,
      source_type: params.sourceType,
      event_type: ev.event_type,
      external_id: ev.external_id ?? null,
      occurred_at: new Date(ev.occurred_at).toISOString(),
      entity_id: entityId,
      attributes: ev.attributes ?? {},
    };
  });
  await chunkUpsert(svc, "canonical_events", rows, "organization_id,source_type,event_type,external_id,occurred_at");
  return rows.length;
}

export async function upsertCanonicalMetrics(svc: any, params: {
  orgId: string; connectorId?: string; sourceType: CanonicalSourceType; metrics: CanonicalMetricInput[];
  entityIdMap?: Map<string, string>;
}): Promise<number> {
  if (!params.metrics.length) return 0;
  const rows = params.metrics.map(m => {
    const entityId = m.entity_external_id && m.entity_type
      ? params.entityIdMap?.get(`${m.entity_type}:${m.entity_external_id}`) ?? null
      : null;
    return {
      organization_id: params.orgId,
      connector_id: params.connectorId ?? null,
      source_type: params.sourceType,
      metric_key: m.metric_key,
      period_start: typeof m.period_start === "string" ? m.period_start : m.period_start.toISOString().slice(0, 10),
      period_grain: m.period_grain ?? "day",
      value: m.value,
      unit: m.unit ?? null,
      dimensions: m.dimensions ?? {},
      entity_id: entityId,
    };
  });
  await chunkUpsert(svc, "canonical_metrics", rows, "organization_id,metric_key,period_start,period_grain,connector_id,dimensions");
  return rows.length;
}

export interface CanonicalRelationshipInput {
  relationship_type: string;            // 'contact_of' | 'deal_of' | 'owner_of' | 'activity_on_deal'
  from_entity_type: string;
  from_external_id: string;
  to_entity_type: string;
  to_external_id: string;
  attributes?: Record<string, unknown>;
}

export async function upsertCanonicalRelationships(svc: any, params: {
  orgId: string; connectorId?: string; sourceType: CanonicalSourceType;
  relationships: CanonicalRelationshipInput[];
  entityIdMap: Map<string, string>;
}): Promise<number> {
  if (!params.relationships.length) return 0;
  const now = new Date().toISOString();
  const rows: any[] = [];
  for (const r of params.relationships) {
    const fromId = params.entityIdMap.get(`${r.from_entity_type}:${r.from_external_id}`);
    const toId   = params.entityIdMap.get(`${r.to_entity_type}:${r.to_external_id}`);
    if (!fromId || !toId) continue;
    rows.push({
      organization_id: params.orgId,
      connector_id: params.connectorId ?? null,
      source_type: params.sourceType,
      relationship_type: r.relationship_type,
      from_entity_id: fromId,
      to_entity_id: toId,
      attributes: r.attributes ?? {},
      last_seen_at: now,
    });
  }
  if (!rows.length) return 0;
  await chunkUpsert(svc, "canonical_relationships", rows,
    "organization_id,source_type,relationship_type,from_entity_id,to_entity_id");
  return rows.length;
}

