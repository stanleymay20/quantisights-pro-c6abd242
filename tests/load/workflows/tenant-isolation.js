// tests/load/workflows/tenant-isolation.js
// Critical: org A user must NOT see/write org B records.
import http from "k6/http";
import { authHeaders } from "../lib/auth.js";
import { recordResponse, crossTenantLeaks } from "../lib/observability.js";

const URL = __ENV.LOAD_SUPABASE_URL;
const TABLES = ["decision_ledger", "metrics", "insights", "audit_log", "evidence_sources"];

export function tenantIsolation(tokenA, orgBId) {
  const h = authHeaders(tokenA);
  for (const table of TABLES) {
    const res = http.get(
      `${URL}/rest/v1/${table}?organization_id=eq.${orgBId}&limit=1`,
      { headers: h, tags: { kind: "rest_read", name: `tenant_iso_${table}` } },
    );
    recordResponse(res, { workflow: "tenant_isolation", table });
    if (res.status === 200) {
      const rows = res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        crossTenantLeaks.add(1);
        console.error(`CRITICAL: cross-tenant read leaked on ${table}`);
      }
    }
  }
  // Write attempt
  const wr = http.post(`${URL}/rest/v1/decision_ledger`, JSON.stringify({
    organization_id: orgBId, title: "cross-tenant-probe", decision_type: "operational",
  }), { headers: h, tags: { kind: "rest_write", name: "tenant_iso_write" } });
  recordResponse(wr, { workflow: "tenant_isolation_write" });
  if (wr.status >= 200 && wr.status < 300) {
    crossTenantLeaks.add(1);
    console.error("CRITICAL: cross-tenant write succeeded");
  }
}
