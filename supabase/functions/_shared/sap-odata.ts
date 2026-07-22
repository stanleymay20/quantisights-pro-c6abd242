// @ts-nocheck
/**
 * SAP OData governance + helpers.
 *
 * Supports SAP S/4HANA Cloud, S/4HANA on-prem (Gateway), and SAP Business Suite OData services.
 * Both OData V2 (most SAP) and OData V4 (newer S/4HANA Cloud) are supported.
 *
 * Authentication strategies (resolved from connector.config.auth):
 *   - basic       : { username, password_secret }  (vault-stored)
 *   - oauth2_cc   : { token_url, client_id, client_secret_secret, scope? }  (BTP destination pattern)
 *   - api_key     : { header_name, value_secret }  (rare; cloud gateways)
 *
 * Governance:
 *   - service+entity allowlist (no blanket read across catalog)
 *   - $select required (no SELECT *)
 *   - $top cap (default 5_000; cluster cap 50_000)
 *   - timeout cap (default 60s)
 *   - $expand depth cap (default 1)
 *   - forbidden $apply patterns (no server-side aggregation that can melt ABAP cores)
 *   - read-only: only GET requests are ever issued
 */

export type ODataVersion = "V2" | "V4";

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
  base_url: string;                          // e.g. https://my300000-api.s4hana.cloud.sap
  odata_version?: ODataVersion;              // default V2
  auth: SapAuthConfig;
  services: string[];                        // ['API_BUSINESS_PARTNER','API_SALES_ORDER_SRV']
  governance?: SapGovernance;
  entity_pulls?: SapEntityPull[];            // declarative pull spec
  mode?: "historical_backfill" | "incremental_sync";
}

export interface SapGovernance {
  allowed_services: string[];
  allowed_entities?: Record<string, string[]>;          // service -> entity allowlist
  allowed_fields?: Record<string, Record<string, string[]>>; // service -> entity -> field allowlist
  max_top?: number;                                     // default 5000
  max_expand_depth?: number;                            // default 1
  query_timeout_seconds?: number;                       // default 60
}

export interface SapEntityPull {
  service: string;
  entity_set: string;
  select: string[];                            // required — no SELECT *
  filter?: string;                             // OData $filter
  expand?: string;                             // OData $expand (depth-limited)
  order_by?: string;                           // OData $orderby
  top?: number;                                // overridden by governance cap
  cursor_field?: string;                       // e.g. 'LastChangeDateTime'
  canonical: {
    entity_type: string;                       // 'account'|'sales_order'|'material'|'opportunity'
    external_id_field: string;                 // OData key field
    display_name_field?: string;
    metric_emitters?: Array<{
      metric_key: string;                      // 'sales.order_value'
      value_field: string;
      period_field: string;                    // OData datetime field
      period_grain?: "day" | "week" | "month" | "quarter";
      unit?: string;
      group_by?: string;                       // dimension column
    }>;
  };
}

const FORBIDDEN_APPLY = /\b(groupby|aggregate|filter|compute|expand|search)\s*\(/i;
const FORBIDDEN_PATH_SEGMENTS = ["$batch", "$crossjoin", "$all"];

export function assertOdataQuerySafe(
  service: string,
  entity: SapEntityPull,
  gov: SapGovernance,
): { url_path: string; top: number } {
  const allowedSvc = (gov.allowed_services ?? []).map(s => s.toLowerCase());
  if (!allowedSvc.includes(service.toLowerCase())) {
    throw new Error(`service not in allowlist: ${service}`);
  }
  const entAllow = gov.allowed_entities?.[service];
  if (entAllow && !entAllow.map(e => e.toLowerCase()).includes(entity.entity_set.toLowerCase())) {
    throw new Error(`entity not in allowlist for ${service}: ${entity.entity_set}`);
  }
  if (!entity.select || entity.select.length === 0) {
    throw new Error(`$select required for ${service}/${entity.entity_set} (no SELECT * permitted)`);
  }
  const fieldAllow = gov.allowed_fields?.[service]?.[entity.entity_set];
  if (fieldAllow && fieldAllow.length) {
    const lower = new Set(fieldAllow.map(f => f.toLowerCase()));
    for (const f of entity.select) {
      if (!lower.has(f.toLowerCase())) throw new Error(`field not in allowlist: ${service}/${entity.entity_set}.${f}`);
    }
  }
  if (entity.expand) {
    const depth = entity.expand.split("/").length;
    const cap = gov.max_expand_depth ?? 1;
    if (depth > cap) throw new Error(`$expand depth ${depth} exceeds cap ${cap}`);
  }
  if (entity.filter && FORBIDDEN_APPLY.test(entity.filter)) {
    throw new Error(`forbidden $apply-like expression in $filter`);
  }
  for (const seg of FORBIDDEN_PATH_SEGMENTS) {
    if (entity.entity_set.includes(seg)) throw new Error(`forbidden path segment: ${seg}`);
  }
  const cap = Math.min(50_000, Math.max(1, gov.max_top ?? 5_000));
  const top = Math.min(entity.top ?? cap, cap);
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
  const root = baseUrl.replace(/\/+$/, "");
  const svcPrefix = version === "V2" ? "/sap/opu/odata/sap" : "/sap/opu/odata4/sap";
  const params = new URLSearchParams();
  params.set("$select", entity.select.join(","));
  params.set("$top", String(top));
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
  const root = baseUrl.replace(/\/+$/, "");
  const svcPrefix = version === "V2" ? "/sap/opu/odata/sap" : "/sap/opu/odata4/sap";
  return `${root}${svcPrefix}/${service}/$metadata`;
}

/**
 * Resolve OData auth headers from connector config + Deno secrets / vault env vars.
 * Secret names referenced in config (password_secret, client_secret_secret, value_secret)
 * are resolved against Deno.env to keep raw credentials out of the database.
 */
export async function buildSapAuthHeaders(auth: SapAuthConfig): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (auth.kind === "basic") {
    const pw = auth.password_secret ? Deno.env.get(auth.password_secret) : undefined;
    if (!auth.username || !pw) throw new Error("SAP basic auth missing username/password_secret");
    headers["Authorization"] = "Basic " + btoa(`${auth.username}:${pw}`);
  } else if (auth.kind === "oauth2_cc") {
    const cs = auth.client_secret_secret ? Deno.env.get(auth.client_secret_secret) : undefined;
    if (!auth.token_url || !auth.client_id || !cs) {
      throw new Error("SAP oauth2_cc missing token_url/client_id/client_secret_secret");
    }
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: auth.client_id,
      client_secret: cs,
    });
    if (auth.scope) body.set("scope", auth.scope);
    const res = await fetch(auth.token_url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`SAP token exchange failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    if (!j.access_token) throw new Error("SAP token exchange returned no access_token");
    headers["Authorization"] = `Bearer ${j.access_token}`;
  } else if (auth.kind === "api_key") {
    const v = auth.value_secret ? Deno.env.get(auth.value_secret) : undefined;
    if (!auth.header_name || !v) throw new Error("SAP api_key missing header_name/value_secret");
    headers[auth.header_name] = v;
  } else {
    throw new Error(`unsupported SAP auth.kind: ${(auth as any).kind}`);
  }
  return headers;
}

/** Extract row array from OData V2 ({ d: { results: [...] } }) or V4 ({ value: [...] }) responses. */
export function extractRows(payload: any, version: ODataVersion): any[] {
  if (version === "V2") return payload?.d?.results ?? (payload?.d ? [payload.d] : []);
  return payload?.value ?? [];
}

export function extractNextLink(payload: any, version: ODataVersion): string | undefined {
  if (version === "V2") {
    const nl = payload?.d?.__next as string | undefined;
    if (!nl) return undefined;
    const m = /\$skiptoken=([^&]+)/i.exec(nl);
    return m ? decodeURIComponent(m[1]) : undefined;
  }
  const nl = payload?.["@odata.nextLink"] as string | undefined;
  if (!nl) return undefined;
  const m = /\$skiptoken=([^&]+)/i.exec(nl);
  return m ? decodeURIComponent(m[1]) : undefined;
}

/** Minimal $metadata XML parser — extracts EntityType + Property + NavigationProperty + Key. */
export function parseMetadataXml(xml: string): Array<{
  entity_type: string;
  entity_sets: string[];
  key_fields: string[];
  fields: Array<{ name: string; type: string; nullable: boolean; max_length?: number }>;
  navigation_properties: Array<{ name: string; target: string }>;
}> {
  const out: any[] = [];
  // EntityType blocks
  const etRe = /<EntityType\s+Name="([^"]+)"([\s\S]*?)<\/EntityType>/g;
  let m: RegExpExecArray | null;
  while ((m = etRe.exec(xml))) {
    const name = m[1];
    const body = m[2];
    const keys: string[] = [];
    const keyBlock = /<Key>([\s\S]*?)<\/Key>/.exec(body);
    if (keyBlock) {
      const pr = /<PropertyRef\s+Name="([^"]+)"/g;
      let km: RegExpExecArray | null;
      while ((km = pr.exec(keyBlock[1]))) keys.push(km[1]);
    }
    const fields: any[] = [];
    const propRe = /<Property\s+Name="([^"]+)"\s+Type="([^"]+)"([^/>]*)\/?>/g;
    let pm: RegExpExecArray | null;
    while ((pm = propRe.exec(body))) {
      const attrs = pm[3] || "";
      fields.push({
        name: pm[1],
        type: pm[2],
        nullable: !/Nullable="false"/i.test(attrs),
        max_length: /MaxLength="(\d+)"/i.exec(attrs)?.[1] ? Number(/MaxLength="(\d+)"/i.exec(attrs)![1]) : undefined,
      });
    }
    const navs: any[] = [];
    const navRe = /<NavigationProperty\s+Name="([^"]+)"[^>]*(?:ToRole|Type)="([^"]+)"/g;
    let nm: RegExpExecArray | null;
    while ((nm = navRe.exec(body))) navs.push({ name: nm[1], target: nm[2] });
    out.push({ entity_type: name, entity_sets: [], key_fields: keys, fields, navigation_properties: navs });
  }
  // EntitySet → EntityType binding
  const esRe = /<EntitySet\s+Name="([^"]+)"\s+EntityType="([^"]+)"/g;
  let em: RegExpExecArray | null;
  while ((em = esRe.exec(xml))) {
    const setName = em[1];
    const typeName = em[2].split(".").pop()!;
    const t = out.find(o => o.entity_type === typeName);
    if (t) t.entity_sets.push(setName);
  }
  return out;
}
