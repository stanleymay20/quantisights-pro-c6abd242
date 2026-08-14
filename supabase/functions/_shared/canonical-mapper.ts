/**
 * Canonical mapper: every connector writes through these helpers so all downstream
 * intelligence (narratives, interventions, advisories, pressure models) consumes a
 * single semantic shape regardless of source.
 */

export type CanonicalSourceType =
  | "snowflake" | "bigquery" | "s3" | "hubspot" | "salesforce" | "sap"
  | "stripe" | "api" | "csv" | "webhook" | "ga4" | "quickbooks" | "xero";

export interface CanonicalEntityInput {
  entity_type: string;
  external_id: string;
  display_name?: string | null;
  attributes?: Record<string, unknown>;
}

export interface CanonicalEventInput {
  event_type: string;
  external_id?: string | null;
  occurred_at: string | Date;
  entity_external_id?: string;
  entity_type?: string;
  attributes?: Record<string, unknown>;
}

export interface CanonicalMetricInput {
  metric_key: string;
  period_start: string | Date;
  period_grain?: "day" | "week" | "month" | "quarter";
  value: number;
  unit?: string | null;
  dimensions?: Record<string, unknown>;
  entity_external_id?: string;
  entity_type?: string;
}

export interface CanonicalRelationshipInput {
  relationship_type: string;
  from_entity_type: string;
  from_external_id: string;
  to_entity_type: string;
  to_external_id: string;
  attributes?: Record<string, unknown>;
}

const CHUNK = 500;
const EVENT_CONFLICT =
  "organization_id,source_type,event_type,external_id_dedupe,occurred_at";
const METRIC_CONFLICT =
  "organization_id,metric_key,period_start,period_grain,connector_id_dedupe,dimensions";

type DbResult = {
  data: unknown;
  error: unknown;
};

type FilterBuilder = PromiseLike<DbResult> & {
  eq(column: string, value: string): FilterBuilder;
  in(column: string, values: string[]): FilterBuilder;
};

type CanonicalTableClient = {
  upsert(
    rows: Record<string, unknown>[],
    options: { onConflict: string; ignoreDuplicates: boolean },
  ): PromiseLike<DbResult>;
  select(columns: string): FilterBuilder;
};

type CanonicalClient = {
  from(table: string): CanonicalTableClient;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asCanonicalClient(value: unknown): CanonicalClient | null {
  return isRecord(value) && typeof value.from === "function" ? value as CanonicalClient : null;
}

function requireClient(value: unknown): CanonicalClient {
  const client = asCanonicalClient(value);
  if (!client) throw new Error("invalid canonical mapper client");
  return client;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return String(error);
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} required`);
  }
  return value.trim();
}

function optionalNonEmpty(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function objectOrEmpty(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function timestampIso(value: string | Date, label: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} invalid`);
  return date.toISOString();
}

function dateOnly(value: string | Date, label: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const match = /^(\d{4}-\d{2}-\d{2})$/.exec(trimmed);
    if (match?.[1]) {
      const parsed = new Date(`${match[1]}T00:00:00.000Z`);
      if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === match[1]) {
        return match[1];
      }
      throw new Error(`${label} invalid`);
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} invalid`);
  return date.toISOString().slice(0, 10);
}

function entityReferenceId(
  entityType: string | undefined,
  externalId: string | undefined,
  entityIdMap: Map<string, string> | undefined,
  label: string,
): string | null {
  const type = optionalNonEmpty(entityType);
  const external = optionalNonEmpty(externalId);
  if (!type && !external) return null;
  if (!type || !external) throw new Error(`${label} entity reference incomplete`);
  if (!entityIdMap) throw new Error(`${label} entity map required`);
  const key = `${type}:${external}`;
  const id = entityIdMap.get(key);
  if (!id) throw new Error(`${label} entity reference unresolved: ${key}`);
  return id;
}

async function chunkUpsert(
  svc: CanonicalClient,
  table: string,
  rows: Record<string, unknown>[],
  conflict: string,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await svc
      .from(table)
      .upsert(slice, { onConflict: conflict, ignoreDuplicates: false });
    if (error) throw new Error(`${table} upsert failed: ${errorMessage(error)}`);
  }
}

export async function upsertCanonicalEntities(svc: unknown, params: {
  orgId: string;
  connectorId?: string;
  sourceType: CanonicalSourceType;
  entities: CanonicalEntityInput[];
}): Promise<Map<string, string>> {
  if (!params.entities.length) return new Map();
  const client = requireClient(svc);
  const orgId = nonEmpty(params.orgId, "organization_id");
  const now = new Date().toISOString();
  const expectedKeys = new Set<string>();
  const rows = params.entities.map((entity, index) => {
    const entityType = nonEmpty(entity.entity_type, `entities[${index}].entity_type`);
    const externalId = nonEmpty(entity.external_id, `entities[${index}].external_id`);
    expectedKeys.add(`${entityType}:${externalId}`);
    return {
      organization_id: orgId,
      connector_id: optionalNonEmpty(params.connectorId),
      source_type: params.sourceType,
      entity_type: entityType,
      external_id: externalId,
      display_name: optionalNonEmpty(entity.display_name),
      attributes: objectOrEmpty(entity.attributes, `entities[${index}].attributes`),
      last_seen_at: now,
    };
  });

  await chunkUpsert(
    client,
    "canonical_entities",
    rows,
    "organization_id,source_type,entity_type,external_id",
  );

  const map = new Map<string, string>();
  const keys = [...expectedKeys];
  for (let i = 0; i < keys.length; i += CHUNK) {
    const keyChunk = keys.slice(i, i + CHUNK);
    const { data, error } = await client
      .from("canonical_entities")
      .select("id,natural_key")
      .eq("organization_id", orgId)
      .eq("source_type", params.sourceType)
      .in("natural_key", keyChunk);
    if (error) throw new Error(`canonical_entities lookup failed: ${errorMessage(error)}`);
    if (!Array.isArray(data)) throw new Error("canonical_entities lookup returned malformed data");
    for (const row of data) {
      if (!isRecord(row) || typeof row.natural_key !== "string" || typeof row.id !== "string") {
        throw new Error("canonical_entities lookup returned malformed row");
      }
      map.set(row.natural_key, row.id);
    }
  }

  const missing = keys.find((key) => !map.has(key));
  if (missing) throw new Error(`canonical_entities lookup missing persisted entity: ${missing}`);
  return map;
}

export async function upsertCanonicalEvents(svc: unknown, params: {
  orgId: string;
  connectorId?: string;
  sourceType: CanonicalSourceType;
  events: CanonicalEventInput[];
  entityIdMap?: Map<string, string>;
}): Promise<number> {
  if (!params.events.length) return 0;
  const client = requireClient(svc);
  const orgId = nonEmpty(params.orgId, "organization_id");
  const rows = params.events.map((event, index) => ({
    organization_id: orgId,
    connector_id: optionalNonEmpty(params.connectorId),
    source_type: params.sourceType,
    event_type: nonEmpty(event.event_type, `events[${index}].event_type`),
    external_id: optionalNonEmpty(event.external_id),
    occurred_at: timestampIso(event.occurred_at, `events[${index}].occurred_at`),
    entity_id: entityReferenceId(
      event.entity_type,
      event.entity_external_id,
      params.entityIdMap,
      `events[${index}]`,
    ),
    attributes: objectOrEmpty(event.attributes, `events[${index}].attributes`),
  }));

  await chunkUpsert(client, "canonical_events", rows, EVENT_CONFLICT);
  return rows.length;
}

export async function upsertCanonicalMetrics(svc: unknown, params: {
  orgId: string;
  connectorId?: string;
  sourceType: CanonicalSourceType;
  metrics: CanonicalMetricInput[];
  entityIdMap?: Map<string, string>;
}): Promise<number> {
  if (!params.metrics.length) return 0;
  const client = requireClient(svc);
  const orgId = nonEmpty(params.orgId, "organization_id");
  const rows = params.metrics.map((metric, index) => {
    if (!Number.isFinite(metric.value)) throw new Error(`metrics[${index}].value invalid`);
    return {
      organization_id: orgId,
      connector_id: optionalNonEmpty(params.connectorId),
      source_type: params.sourceType,
      metric_key: nonEmpty(metric.metric_key, `metrics[${index}].metric_key`),
      period_start: dateOnly(metric.period_start, `metrics[${index}].period_start`),
      period_grain: metric.period_grain ?? "day",
      value: metric.value,
      unit: optionalNonEmpty(metric.unit),
      dimensions: objectOrEmpty(metric.dimensions, `metrics[${index}].dimensions`),
      entity_id: entityReferenceId(
        metric.entity_type,
        metric.entity_external_id,
        params.entityIdMap,
        `metrics[${index}]`,
      ),
    };
  });

  await chunkUpsert(client, "canonical_metrics", rows, METRIC_CONFLICT);
  return rows.length;
}

export async function upsertCanonicalRelationships(svc: unknown, params: {
  orgId: string;
  connectorId?: string;
  sourceType: CanonicalSourceType;
  relationships: CanonicalRelationshipInput[];
  entityIdMap: Map<string, string>;
}): Promise<number> {
  if (!params.relationships.length) return 0;
  const client = requireClient(svc);
  const orgId = nonEmpty(params.orgId, "organization_id");
  const now = new Date().toISOString();
  const rows = params.relationships.map((relationship, index) => {
    const fromType = nonEmpty(
      relationship.from_entity_type,
      `relationships[${index}].from_entity_type`,
    );
    const fromExternal = nonEmpty(
      relationship.from_external_id,
      `relationships[${index}].from_external_id`,
    );
    const toType = nonEmpty(
      relationship.to_entity_type,
      `relationships[${index}].to_entity_type`,
    );
    const toExternal = nonEmpty(
      relationship.to_external_id,
      `relationships[${index}].to_external_id`,
    );
    const fromKey = `${fromType}:${fromExternal}`;
    const toKey = `${toType}:${toExternal}`;
    const fromId = params.entityIdMap.get(fromKey);
    const toId = params.entityIdMap.get(toKey);
    if (!fromId) throw new Error(`relationships[${index}] entity reference unresolved: ${fromKey}`);
    if (!toId) throw new Error(`relationships[${index}] entity reference unresolved: ${toKey}`);

    return {
      organization_id: orgId,
      connector_id: optionalNonEmpty(params.connectorId),
      source_type: params.sourceType,
      relationship_type: nonEmpty(
        relationship.relationship_type,
        `relationships[${index}].relationship_type`,
      ),
      from_entity_id: fromId,
      to_entity_id: toId,
      attributes: objectOrEmpty(relationship.attributes, `relationships[${index}].attributes`),
      last_seen_at: now,
    };
  });

  await chunkUpsert(
    client,
    "canonical_relationships",
    rows,
    "organization_id,source_type,relationship_type,from_entity_id,to_entity_id",
  );
  return rows.length;
}
