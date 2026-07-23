// tests/load/workflows/audit.js
import http from "k6/http";
import { authHeaders } from "../lib/auth.js";
import { recordResponse } from "../lib/observability.js";

const URL = __ENV.LOAD_SUPABASE_URL;

export function auditTrailFor(token, orgId, decisionId) {
  const h = authHeaders(token);
  const res = http.get(
    `${URL}/rest/v1/audit_log?organization_id=eq.${orgId}&entity_id=eq.${decisionId}&limit=10`,
    { headers: h, tags: { kind: "rest_read", name: "audit_trail" } },
  );
  recordResponse(res, { workflow: "audit_trail", org: orgId });
  if (res.status !== 200) return false;
  const rows = res.json();
  return Array.isArray(rows) && rows.length > 0;
}
