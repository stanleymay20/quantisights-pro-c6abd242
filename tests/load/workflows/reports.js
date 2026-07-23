// tests/load/workflows/reports.js
// Report listing only — never triggers real PDF/PPTX gen or email under load.
import http from "k6/http";
import { check } from "k6";

export function runReports(baseUrl, token, orgId, runId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-load-run-id": runId,
  };
  const list = http.get(
    `${baseUrl}/rest/v1/reports?organization_id=eq.${orgId}&select=id,kind,created_at&limit=20`,
    { headers, tags: { name: "rest_read_reports" } },
  );
  check(list, { "reports list 200": (r) => r.status === 200 });
}
