// tests/load/workflows/billing.js
// Billing READ-ONLY. Never initiates checkout, never mutates subscription state.
import http from "k6/http";
import { check } from "k6";

export function runBilling(baseUrl, token, orgId, runId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-load-run-id": runId,
  };
  const sub = http.get(
    `${baseUrl}/rest/v1/subscriptions?organization_id=eq.${orgId}&select=id,tier,status&limit=1`,
    { headers, tags: { name: "rest_read_subscription" } },
  );
  check(sub, { "subscription read 200/206": (r) => r.status === 200 || r.status === 206 });
}
