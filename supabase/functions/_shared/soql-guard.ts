/**
 * SOQL governance layer for Salesforce connectors.
 *
 * Enforces:
 *  - SELECT-only
 *  - no tooling / admin / setup objects
 *  - bounded outer LIMIT (injected if missing)
 *  - object allowlist
 *  - field allowlist (parsed from SELECT clause)
 *  - timeout cap (callers must respect)
 *
 * Tooling/Setup objects (PermissionSet, ApexClass, AuthSession, Login*, *History etc.)
 * are blocked regardless of allowlist.
 */

const FORBIDDEN_OBJECT_PATTERNS = [
  /^Permission/i,
  /^Apex/i,
  /^Auth/i,
  /^Login/i,
  /Setup$/i,
  /^Profile$/i,
  /^User(Role|License|Permission|Recent)/i,
  /History$/i,
  /Share$/i,
  /Feed$/i,
  /^Organization$/i,
  /^Network/i,
  /^Domain/i,
  /^SessionPermSet/i,
];
const FORBIDDEN_KEYWORDS = /\b(update|insert|delete|merge|upsert|undelete|grant|revoke|alter|drop|create)\b/i;
const OUTER_LIMIT_PATTERN = /\blimit\s+(\d+)(?=\s*(?:offset\s+\d+\s*)?$)/i;

export interface SoqlGovernance {
  allowed_objects: string[];                 // exact object names (case-insensitive)
  allowed_fields?: Record<string, string[]>; // object -> field allowlist; object key matching is case-insensitive
  max_query_cost?: number;                   // mapped to LIMIT cap, default 5000
  query_timeout_seconds?: number;            // default 60
}

export interface ValidatedSoql {
  query: string;
  object: string;
  fields: string[];
  limit: number;
}

function stripCommentsAndTrailingSemicolons(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim()
    .replace(/;+\s*$/, "");
}

function outerLimitOf(tail: string): number | null {
  const match = OUTER_LIMIT_PATTERN.exec(tail);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function fieldAllowlistForObject(
  allowedFields: Record<string, string[]> | undefined,
  objectName: string,
): string[] | null {
  if (!allowedFields) return null;
  const normalizedObject = objectName.toLowerCase();
  for (const [configuredObject, fields] of Object.entries(allowedFields)) {
    if (configuredObject.toLowerCase() === normalizedObject) return fields;
  }
  return null;
}

/** Parse minimal SOQL: SELECT f1, f2 FROM Object [WHERE ...] [ORDER BY ...] [LIMIT n] [OFFSET n] */
export function parseSoql(raw: string): { fields: string[]; object: string; limit: number | null } {
  const stripped = stripCommentsAndTrailingSemicolons(raw);
  const match = /^\s*select\s+(.+?)\s+from\s+([A-Za-z0-9_]+)\b([\s\S]*?)$/i.exec(stripped);
  const fieldsClause = match?.[1];
  const object = match?.[2];
  if (!fieldsClause || !object) {
    throw new Error("SOQL parse failed: expected `SELECT ... FROM Object`");
  }

  const fields = fieldsClause.split(",").map((field) => field.trim()).filter(Boolean);
  if (fields.length === 0) throw new Error("SOQL parse failed: no fields selected");

  // Reject subqueries / aggregate-injected functions outside a narrow allowlist.
  for (const field of fields) {
    if (
      /[()]/.test(field) &&
      !/^(count|sum|avg|min|max|count_distinct)\s*\([A-Za-z0-9_]*\)$/i.test(field)
    ) {
      throw new Error(`SOQL field disallowed: ${field}`);
    }
    if (!/^[A-Za-z0-9_().*, ]+$/.test(field)) {
      throw new Error(`SOQL field invalid chars: ${field}`);
    }
  }

  const tail = match?.[3] ?? "";
  return { fields, object, limit: outerLimitOf(tail) };
}

export function assertSoqlSafe(raw: string, gov: SoqlGovernance): ValidatedSoql {
  const stripped = stripCommentsAndTrailingSemicolons(raw);
  if (!stripped) throw new Error("query is empty");
  if (stripped.includes(";")) throw new Error("multiple statements not allowed");
  if (!/^\s*select\b/i.test(stripped)) throw new Error("only SELECT is allowed");
  if (FORBIDDEN_KEYWORDS.test(stripped)) throw new Error("write/DDL keywords not allowed");

  const parsed = parseSoql(stripped);

  // Object allowlist.
  if (FORBIDDEN_OBJECT_PATTERNS.some((pattern) => pattern.test(parsed.object))) {
    throw new Error(`object forbidden (tooling/admin): ${parsed.object}`);
  }
  const allowed = (gov.allowed_objects ?? []).map((objectName) => objectName.toLowerCase());
  if (!allowed.includes(parsed.object.toLowerCase())) {
    throw new Error(`object not in allowlist: ${parsed.object}`);
  }

  // Field allowlist. Object-name matching must use the same case-insensitive semantics as
  // allowed_objects; otherwise `FROM account` could bypass an `Account` field allowlist.
  const fieldAllow = fieldAllowlistForObject(gov.allowed_fields, parsed.object);
  if (fieldAllow && fieldAllow.length > 0) {
    const normalizedAllow = new Set(fieldAllow.map((field) => field.toLowerCase()));
    for (const field of parsed.fields) {
      const bare = field.replace(/^.*\(/, "").replace(/\)$/, "").trim();
      if (bare === "*") throw new Error("SELECT * not allowed");
      if (!normalizedAllow.has(bare.toLowerCase())) {
        throw new Error(`field not in allowlist for ${parsed.object}: ${bare}`);
      }
    }
  }

  // LIMIT enforcement. Only a trailing outer LIMIT counts; `LIMIT 9999` inside a quoted WHERE
  // value must not suppress insertion of the real query bound.
  const rawCap = gov.max_query_cost ?? 5_000;
  const cap = Math.min(50_000, Math.max(1, Number.isFinite(rawCap) ? Math.floor(rawCap) : 5_000));
  const limit = parsed.limit == null ? cap : Math.min(parsed.limit, cap);
  const query = parsed.limit == null
    ? `${stripped} LIMIT ${limit}`
    : stripped.replace(OUTER_LIMIT_PATTERN, `LIMIT ${limit}`);

  return { query, object: parsed.object, fields: parsed.fields, limit };
}

/** Redact obvious secret material from a header bag for safe telemetry logging. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization|api[-_]?key|token|cookie|x-connection-api-key/i.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = value;
    }
  }
  return out;
}
