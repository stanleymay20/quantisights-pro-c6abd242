// @ts-nocheck
/**
 * SOQL governance layer for Salesforce connectors.
 *
 * Enforces:
 *  - SELECT-only
 *  - no tooling / admin / setup objects
 *  - bounded LIMIT (injected if missing)
 *  - object allowlist
 *  - field allowlist (parsed from SELECT clause)
 *  - timeout cap (callers must respect)
 *
 * Tooling/Setup objects (PermissionSet, ApexClass, AuthSession, Login*, *History etc.)
 * are blocked regardless of allowlist.
 */

const FORBIDDEN_OBJECT_PATTERNS = [
  /^Permission/i, /^Apex/i, /^Auth/i, /^Login/i, /Setup$/i,
  /^Profile$/i, /^User(Role|License|Permission|Recent)/i,
  /History$/i, /Share$/i, /Feed$/i, /^Organization$/i,
  /^Network/i, /^Domain/i, /^SessionPermSet/i,
];
const FORBIDDEN_KEYWORDS = /\b(update|insert|delete|merge|upsert|undelete|grant|revoke|alter|drop|create)\b/i;

export interface SoqlGovernance {
  allowed_objects: string[];                 // exact object names (case-insensitive)
  allowed_fields?: Record<string, string[]>; // object -> field allowlist; if absent, all non-forbidden fields allowed
  max_query_cost?: number;                   // mapped to LIMIT cap, default 5000
  query_timeout_seconds?: number;            // default 60
}

export interface ValidatedSoql {
  query: string;
  object: string;
  fields: string[];
  limit: number;
}

/** Parse minimal SOQL: SELECT f1, f2 FROM Object [WHERE ...] [ORDER BY ...] [LIMIT n] */
export function parseSoql(raw: string): { fields: string[]; object: string; limit: number | null } {
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").trim().replace(/;+\s*$/, "");
  const m = /^\s*select\s+(.+?)\s+from\s+([A-Za-z0-9_]+)\b([\s\S]*?)$/i.exec(stripped);
  if (!m) throw new Error("SOQL parse failed: expected `SELECT ... FROM Object`");
  const fields = m[1].split(",").map(s => s.trim()).filter(Boolean);
  if (fields.length === 0) throw new Error("SOQL parse failed: no fields selected");
  // Reject subqueries / aggregate-injected functions outside an allowlist
  for (const f of fields) {
    if (/[()]/.test(f) && !/^(count|sum|avg|min|max|count_distinct)\s*\([A-Za-z0-9_]*\)$/i.test(f)) {
      throw new Error(`SOQL field disallowed: ${f}`);
    }
    if (!/^[A-Za-z0-9_().*, ]+$/.test(f)) throw new Error(`SOQL field invalid chars: ${f}`);
  }
  const object = m[2];
  const tail = m[3] ?? "";
  const lm = /\blimit\s+(\d+)\b/i.exec(tail);
  return { fields, object, limit: lm ? Number(lm[1]) : null };
}

export function assertSoqlSafe(raw: string, gov: SoqlGovernance): ValidatedSoql {
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").trim().replace(/;+\s*$/, "");
  if (!stripped) throw new Error("query is empty");
  if (stripped.includes(";")) throw new Error("multiple statements not allowed");
  if (!/^\s*select\b/i.test(stripped)) throw new Error("only SELECT is allowed");
  if (FORBIDDEN_KEYWORDS.test(stripped)) throw new Error("write/DDL keywords not allowed");

  const parsed = parseSoql(stripped);

  // Object allowlist
  if (FORBIDDEN_OBJECT_PATTERNS.some(re => re.test(parsed.object))) {
    throw new Error(`object forbidden (tooling/admin): ${parsed.object}`);
  }
  const allowed = (gov.allowed_objects ?? []).map(s => s.toLowerCase());
  if (!allowed.includes(parsed.object.toLowerCase())) {
    throw new Error(`object not in allowlist: ${parsed.object}`);
  }

  // Field allowlist (when configured for this object)
  const fieldAllow = gov.allowed_fields?.[parsed.object];
  if (fieldAllow && fieldAllow.length) {
    const lowAllow = new Set(fieldAllow.map(f => f.toLowerCase()));
    for (const f of parsed.fields) {
      const bare = f.replace(/^.*\(/, "").replace(/\)$/, "").trim();
      if (bare === "*") throw new Error("SELECT * not allowed");
      if (!lowAllow.has(bare.toLowerCase())) throw new Error(`field not in allowlist for ${parsed.object}: ${bare}`);
    }
  }

  // LIMIT enforcement
  const cap = Math.min(50_000, Math.max(1, gov.max_query_cost ?? 5_000));
  let limit = parsed.limit ?? cap;
  if (limit > cap) limit = cap;
  const query = parsed.limit ? stripped.replace(/\blimit\s+\d+\b/i, `LIMIT ${limit}`) : `${stripped} LIMIT ${limit}`;

  return { query, object: parsed.object, fields: parsed.fields, limit };
}

/** Redact obvious secret material from a header bag for safe telemetry logging. */
export function redactHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (/authorization|api[-_]?key|token|cookie|x-connection-api-key/i.test(k)) out[k] = "[redacted]";
    else out[k] = v;
  }
  return out;
}
