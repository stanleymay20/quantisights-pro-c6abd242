// tests/load/workflows/data-pipeline.js
// Data pipeline workflow: KPI compute + dataset listing.
// AI calls go through mock-ai via x-test-mock header.
import http from "k6/http";
import { check } from "k6";
import { assertAllowed } from "../lib/mock-headers.js";

export function runDataPipeline(baseUrl, token, orgId, runId) {
  assertAllowed("compute-kpi");
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-test-mock": "1",
    "x-load-run-id": runId,
    "Content-Type": "application/json",
  };

  // 1. List datasets (REST read)
  const datasets = http.get(
    `${baseUrl}/rest/v1/datasets?organization_id=eq.${orgId}&select=id,name&limit=10`,
    { headers, tags: { name: "rest_read_datasets" } },
  );
  check(datasets, { "datasets list 200": (r) => r.status === 200 });

  // 2. Trigger KPI compute (allow-listed edge fn, mocked)
  const compute = http.post(
    `${baseUrl}/functions/v1/compute-kpi`,
    JSON.stringify({ organization_id: orgId, mock: true, test_run_id: runId }),
    { headers, tags: { name: "edge_fn_compute_kpi" } },
  );
  check(compute, { "compute-kpi 2xx": (r) => r.status >= 200 && r.status < 300 });
}
