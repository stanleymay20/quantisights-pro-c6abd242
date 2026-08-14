/**
 * SAP OData governance + helpers.
 *
 * Supports SAP S/4HANA Cloud, S/4HANA on-prem (Gateway), and SAP Business Suite OData services.
 * Both OData V2 (most SAP) and OData V4 (newer S/4HANA Cloud) are supported.
 *
 * Authentication strategies (resolved from connector.config.auth):
 *   - basic       : { username, password_secret }
 *   - oauth2_cc   : { token_url, client_id, client_secret_secret, scope? }
 *   - api_key     : { header_name, value_secret }
 *
 * Secret references are deliberately restricted to SAP_* environment variables so tenant-editable
 * connector config cannot read unrelated platform secrets such as Supabase service credentials.
 */

export type ODataVersion = "V2" | "V4";

type PeriodGrain = "day" | "week" | "month" | "quarter";
type JsonRecord = Record<string, unknown>;

type DenoRuntime = {
  env: {
    get(name: string): string | undefined;
  };
};

export interface SapAuthConfig {
  kind: "basic" | "oauth2_cc" | "api_key";
  username?: string;
  password_secret?: string;
  token_url?: string;
  client_id?: string;
  client_secret_secret?: string;
  scope?: string;
  header_name?: string;
  value_secret?: string;
}

export interface SapConnectorConfig {
  base_url: string;
  odata_version?: ODataVersion;
  auth: SapAuthConfig;
  services: string[];
  governance?: SapGovernance;
  entity_pulls?: SapEntityPull[];
  mode?: "historical_backfill" | "incremental_sync";
}

export interface SapGovernance {
  allowed_services: string[];
  allowed_entities?: Record<string, string[]>;
  allowed_fields?: Record<string, Record<string, string[]>>;
  max_top?: number;
  max_expand_depth?: number;
  query_timeout_seconds?: number;
}

export interface SapEntityPull {
  service: string;
  entity_set: string;
  select: string[];
  filter?: string;
  expand?: string;
  order_by?: string;
  top?: number;
  cursor_field?: string;
  canonical: {
    entity_type: string;
    external_id_field: string;
    display_name_field?: string;
    metric_emitters?: Array<{
      metric_key: string;
      value_field: string;
      period_field: string;
      period_grain?: PeriodGrain;
      unit?: string;
      group_by?: string;
    }>;
  };
}

export interface SapMetadataEntity {
  entity_type: string;
  entity_sets: string[];
  key_fields: string[];
  fields: Array<{ name: string; type: string; nullable: boolean; max_length?: number }>;
  navigation_properties: Array<{ name: string; target: string }>;
}

const FORBIDDEN_APPLY = /\b(groupby|aggregate|filter|compute|expand|search)\s*\(/i;
const FORBIDDEN_PATH_SEGMENTS = ["$batch", "$crossjoin", "$all"];
const ODATA_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAP_SECRET_NAME = /^SAP_[A-Z0-9_]+$/;
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const MAX_TOP = 50_000;
const DEFAULT_TOP = 5_000;
const MAX_EXPAND_DEPTH = 5;
const TOKEN_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findCaseInsensitive<T>(record: Record<string, T> | undefined, key: string): T | undefined {
  if (!record) return undefined;
  const target = key.toLowerCase();
  const match = Object.entries(record).find(([candidate]) => candidate.toLowerCase() === target);
  return match?.[1];
}

function requireOdataIdentifier(value: string, label: string): string {
  if (!ODATA_IDENTIFIER.test(value)) throw new Error(`${label} contains invalid OData identifier characters`);
  return value;
}

function boundedPositiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(1, Math.floor(value)));
}

function normalizeHttpsUrl(value: string, label: string, allowQuery: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is invalid`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  if (url.username || url.password) throw new Error(`${label} must not contain embedded credentials`);
  if (url.hash) throw new Error(`${label} must not contain a fragment`);
  if (!allowQuery && url.search) throw new Error(`${label} must not contain query parameters`);
  return url;
}

export function normalizeSapBaseUrl(value: string): string {
  const url = normalizeHttpsUrl(value, "SAP base_url", false);
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path === "/" ? "" : path}`;
}

export function normalizeSapTokenUrl(value: string): string {
  return normalizeHttpsUrl(value, "SAP token_url", true).toString();
}

function sapEnvGet(secretName: string | undefined): string | undefined {
  if (!secretName) return undefined;
  if (!SAP_SECRET_NAME.test(secretName)) {
    throw new Error("SAP secret reference must use an SAP_* environment variable");
  }
  const runtime = globalThis as typeof globalThis & { Deno?: DenoRuntime };
  return runtime.Deno?.env.get(secretName);
}

function safeOauthError(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.error !== "string") return null;
  const value = payload.error.trim().slice(0, 80);
  return value && /^[A-Za-z0-9_.:-]+$/.test(value) ? value : null;
}

function decodeSkipToken(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function assertOdataQuerySafe(
  service: string,
  entity: SapEntityPull,
  gov: SapGovernance,
): { url_path: string; top: number } {
  requireOdataIdentifier(service, "service");
  requireOdataIdentifier(entity.entity_set, "entity_set");
  if (entity.service.toLowerCase() !== service.toLowerCase()) {
    throw new Error(`entity service mismatch: ${entity.service} != ${service}`);
  }

  const allowedSvc = (gov.allowed_services ?? []).map((value) => value.toLowerCase());
  if (!allowedSvc.includes(service.toLowerCase())) {
    throw new Error(`service not in allowlist: ${service}`);
  }

  const entityAllowlist = findCaseInsensitive(gov.allowed_entities, service);
  if (
    entityAllowlist &&
    !entityAllowlist.map((value) => value.toLowerCase()).includes(entity.entity_set.toLowerCase())
  ) {
    throw new Error(`entity not in allowlist for ${service}: ${entity.entity_set}`);
  }

  if (!entity.select || entity.select.length === 0) {
    throw new Error(`$select required for ${service}/${entity.entity_set} (no SELECT * permitted)`);
  }
  for (const field of entity.select) requireOdataIdentifier(field, "$select field");
  if (entity.cursor_field) requireOdataIdentifier(entity.cursor_field, "cursor_field");

  const serviceFields = findCaseInsensitive(gov.allowed_fields, service);
  const fieldAllowlist = findCaseInsensitive(serviceFields, entity.entity_set);
  if (fieldAllowlist && fieldAllowlist.length) {
    const allowed = new Set(fieldAllowlist.map((field) => field.toLowerCase()));
    for (const field of entity.select) {
      if (!allowed.has(field.toLowerCase())) {
        throw new Error(`field not in allowlist: ${service}/${entity.entity_set}.${field}`);
      }
    }
  }

  if (entity.expand) {
    const depth = entity.expand.split("/").filter(Boolean).length;
    const cap = boundedPositiveInteger(gov.max_expand_depth, 1, MAX_EXPAND_DEPTH);
    if (depth > cap) throw new Error(`$expand depth ${depth} exceeds cap ${cap}`);
  }
  if (entity.filter && FORBIDDEN_APPLY.test(entity.filter)) {
    throw new Error("forbidden $apply-like expression in $filter");
  }
  for (const segment of FORBIDDEN_PATH_SEGMENTS) {
    if (entity.entity_set.toLowerCase().includes(segment)) {
      throw new Error(`forbidden path segment: ${segment}`);
    }
  }

  const cap = boundedPositiveInteger(gov.max_top, DEFAULT_TOP, MAX_TOP);
  const top = boundedPositiveInteger(entity.top, cap, cap);
  return { url_path: `${service}/${entity.entity_set}`, top };
}

export function buildOdataUrl(
  baseUrl: string,
  version: ODataVersion,
  service: string,
  entity: SapEntityPull,
  top: number,
  skipOrToken?: string,
): string {
  const root = normalizeSapBaseUrl(baseUrl);
  requireOdataIdentifier(service, "service");
  requireOdataIdentifier(entity.entity_set, "entity_set");
  for (const field of entity.select) requireOdataIdentifier(field, "$select field");

  const svcPrefix = version === "V2" ? "/sap/opu/odata/sap" : "/sap/opu/odata4/sap";
  const params = new URLSearchParams();
  params.set("$select", entity.select.join(","));
  params.set("$top", String(boundedPositiveInteger(top, DEFAULT_TOP, MAX_TOP)));
  if (entity.filter) params.set("$filter", entity.filter);
  if (entity.expand) params.set("$expand", entity.expand);
  if (entity.order_by) params.set("$orderby", entity.order_by);
  params.set("$format", "json");
  if (version === "V2") {
    params.set("$inlinecount", "allpages");
    if (skipOrToken) params.set("$skiptoken", skipOrToken);
  } else if (skipOrToken) {
    params.set("$skiptoken", skipOrToken);
  }
  return `${root}${svcPrefix}/${service}/${entity.entity_set}?${params.toString()}`;
}

export function buildMetadataUrl(baseUrl: string, version: ODataVersion, service: string): string {
  const root = normalizeSapBaseUrl(baseUrl);
  requireOdataIdentifier(service, "service");
  const svcPrefix = version === "V2" ? "/sap/opu/odata/sap" : "/sap/opu/odata4/sap";
  return `${root}${svcPrefix}/${service}/$metadata`;
}

/** Resolve OData auth headers while keeping raw credentials out of connector config. */
export async function buildSapAuthHeaders(auth: SapAuthConfig): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: "application/json" };

  if (auth.kind === "basic") {
    const password = sapEnvGet(auth.password_secret);
    if (!auth.username || !password) throw new Error("SAP basic auth missing username/password_secret");
    headers.Authorization = `Basic ${btoa(`${auth.username}:${password}`)}`;
    return headers;
  }

  if (auth.kind === "oauth2_cc") {
    const clientSecret = sapEnvGet(auth.client_secret_secret);
    if (!auth.token_url || !auth.client_id || !clientSecret) {
      throw new Error("SAP oauth2_cc missing token_url/client_id/client_secret_secret");
    }
    const tokenUrl = normalizeSapTokenUrl(auth.token_url);
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: auth.client_id,
      client_secret: clientSecret,
    });
    if (auth.scope) body.set("scope", auth.scope);

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const errorCode = safeOauthError(payload);
      throw new Error(`SAP token exchange failed [${response.status}]${errorCode ? ` ${errorCode}` : ""}`);
    }
    if (!isRecord(payload) || typeof payload.access_token !== "string" || !payload.access_token) {
      throw new Error("SAP token exchange returned no access_token");
    }
    headers.Authorization = `Bearer ${payload.access_token}`;
    return headers;
  }

  if (auth.kind === "api_key") {
    const value = sapEnvGet(auth.value_secret);
    if (!auth.header_name || !HEADER_NAME.test(auth.header_name) || !value) {
      throw new Error("SAP api_key missing/invalid header_name or value_secret");
    }
    headers[auth.header_name] = value;
    return headers;
  }

  const exhaustive: never = auth.kind;
  throw new Error(`unsupported SAP auth.kind: ${String(exhaustive)}`);
}

/** Extract row objects from OData V2 ({ d: { results: [...] } }) or V4 ({ value: [...] }). */
export function extractRows(payload: unknown, version: ODataVersion): JsonRecord[] {
  if (!isRecord(payload)) return [];
  if (version === "V2") {
    const d = payload.d;
    if (!isRecord(d)) return [];
    if (Array.isArray(d.results)) return d.results.filter(isRecord);
    return [d];
  }
  return Array.isArray(payload.value) ? payload.value.filter(isRecord) : [];
}

export function extractNextLink(payload: unknown, version: ODataVersion): string | undefined {
  if (!isRecord(payload)) return undefined;
  let nextLink: string | undefined;
  if (version === "V2") {
    const d = payload.d;
    if (isRecord(d) && typeof d.__next === "string") nextLink = d.__next;
  } else if (typeof payload["@odata.nextLink"] === "string") {
    nextLink = payload["@odata.nextLink"];
  }
  if (!nextLink) return undefined;
  const match = /\$skiptoken=([^&]+)/i.exec(nextLink);
  return match?.[1] ? decodeSkipToken(match[1]) : undefined;
}

/** Minimal $metadata XML parser — extracts EntityType + Property + NavigationProperty + Key. */
export function parseMetadataXml(xml: string): SapMetadataEntity[] {
  const out: SapMetadataEntity[] = [];
  const entityTypePattern = /<EntityType\s+Name="([^"]+)"([\s\S]*?)<\/EntityType>/g;
  let entityMatch: RegExpExecArray | null;

  while ((entityMatch = entityTypePattern.exec(xml))) {
    const name = entityMatch[1];
    const body = entityMatch[2];
    if (!name || body === undefined) continue;

    const keyFields: string[] = [];
    const keyBlock = /<Key>([\s\S]*?)<\/Key>/.exec(body)?.[1];
    if (keyBlock) {
      const propertyRefPattern = /<PropertyRef\s+Name="([^"]+)"/g;
      let keyMatch: RegExpExecArray | null;
      while ((keyMatch = propertyRefPattern.exec(keyBlock))) {
        if (keyMatch[1]) keyFields.push(keyMatch[1]);
      }
    }

    const fields: SapMetadataEntity["fields"] = [];
    const propertyPattern = /<Property\s+Name="([^"]+)"\s+Type="([^"]+)"([^/>]*)\/?>/g;
    let propertyMatch: RegExpExecArray | null;
    while ((propertyMatch = propertyPattern.exec(body))) {
      const fieldName = propertyMatch[1];
      const fieldType = propertyMatch[2];
      const attributes = propertyMatch[3] ?? "";
      if (!fieldName || !fieldType) continue;
      const field: SapMetadataEntity["fields"][number] = {
        name: fieldName,
        type: fieldType,
        nullable: !/Nullable="false"/i.test(attributes),
      };
      const maxLengthRaw = /MaxLength="(\d+)"/i.exec(attributes)?.[1];
      if (maxLengthRaw) field.max_length = Number(maxLengthRaw);
      fields.push(field);
    }

    const navigationProperties: SapMetadataEntity["navigation_properties"] = [];
    const navigationPattern = /<NavigationProperty\s+Name="([^"]+)"[^>]*(?:ToRole|Type)="([^"]+)"/g;
    let navigationMatch: RegExpExecArray | null;
    while ((navigationMatch = navigationPattern.exec(body))) {
      if (navigationMatch[1] && navigationMatch[2]) {
        navigationProperties.push({ name: navigationMatch[1], target: navigationMatch[2] });
      }
    }

    out.push({
      entity_type: name,
      entity_sets: [],
      key_fields: keyFields,
      fields,
      navigation_properties: navigationProperties,
    });
  }

  const entitySetPattern = /<EntitySet\s+Name="([^"]+)"\s+EntityType="([^"]+)"/g;
  let entitySetMatch: RegExpExecArray | null;
  while ((entitySetMatch = entitySetPattern.exec(xml))) {
    const setName = entitySetMatch[1];
    const qualifiedType = entitySetMatch[2];
    if (!setName || !qualifiedType) continue;
    const typeName = qualifiedType.split(".").pop();
    if (!typeName) continue;
    const target = out.find((entity) => entity.entity_type === typeName);
    if (target) target.entity_sets.push(setName);
  }

  return out;
}
