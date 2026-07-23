// tests/load/workflows/governance.js
// Governance pipeline workflow: evidence chain reads + IQ score + immutable audit assertion.
import http from "k6/http";
import { check } from "k6";
import { assertAllowed } from "../lib/mock-headers.js";

export function runGovernance(baseUrl, token, orgId, runId) {
  assertAllowed("compute-iq-score");
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-test-mock": "1",
    "x-load-run-id": runId,
    "Content-Type": "application/json",
  };

  // 1. Trust metrics snapshot read
  const trust = http.get(
    `${baseUrl}/rest/v1/trust_metrics_snapshots?organization_id=eq.${orgId}&select=id,evidence_hash&limit=5`,
    { headers, tags: { name: "rest_read_trust" } },
  );
  check(trust, { "trust read 200": (r) => r.status === 200 });

  // 2. Audit trail read
  const audit = http.get(
    `${baseUrl}/rest/v1/intelligence_audit_trail?organization_id=eq.${orgId}&select=id&limit=10`,
    { headers, tags: { name: "rest_read_audit" } },
  );
  check(audit, { "audit read 200": (r) => r.status === 200 });

  // 3. IQ score compute (allow-listed edge fn)
  const iq = http.post(
    `${baseUrl}/functions/v1/compute-iq-score`,
    JSON.stringify({ organization_id: orgId, mock: true, test_run_id: runId }),
    { headers, tags: { name: "edge_fn_iq" } },
  );
  check(iq, { "iq 2xx": (r) => r.status >= 200 && r.status < 300 });

  // 4. Immutability assertion: attempt UPDATE on audit_log — MUST 4xx
  const tamper = http.patch(
    `${baseUrl}/rest/v1/audit_log?organization_id=eq.${orgId}&limit=1`,
    JSON.stringify({ action: "TAMPERED" }),
    { headers, tags: { name: "audit_immutability_probe" } },
  );
  check(tamper, { "audit_log UPDATE denied (no 2xx)": (r) => r.status < 200 || r.status >= 300 });
}
