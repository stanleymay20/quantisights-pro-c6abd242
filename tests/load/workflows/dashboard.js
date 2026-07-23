// tests/load/workflows/dashboard.js
import http from "k6/http";
import { authHeaders } from "../lib/auth.js";
import { recordResponse } from "../lib/observability.js";

const URL = __ENV.LOAD_SUPABASE_URL;

export function dashboardReads(token, orgId) {
  const h = authHeaders(token);
  const reads = [
    `${URL}/rest/v1/metric_summaries?organization_id=eq.${orgId}&limit=20`,
    `${URL}/rest/v1/insights?organization_id=eq.${orgId}&limit=20`,
    `${URL}/rest/v1/decision_ledger?organization_id=eq.${orgId}&select=id&limit=1`,
  ];
  for (const u of reads) {
    const res = http.get(u, { headers: h, tags: { kind: "rest_read", name: "dashboard" } });
    recordResponse(res, { workflow: "dashboard", org: orgId });
  }
}
