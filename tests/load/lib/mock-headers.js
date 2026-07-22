// tests/load/lib/mock-headers.js
// Allow-list of edge functions safe to call under load.
// Anything not listed is blocked from invocation.
export const ALLOWED_EDGE_FUNCTIONS = new Set([
  "auth-rate-limiter",
  "compute-kpi",
  "executive-copilot",   // only with x-test-mock: 1 → routes to mock-ai
  "mock-ai",
  "compute-iq-score",
]);

export const BLOCKED_EDGE_FUNCTIONS = new Set([
  "seed-demo-data",
  "data-export",
  "auto-create-decisions",
  "auth-email-hook",
  "connector-pull",
  "connector-salesforce-pull",
  "connector-sap-pull",
  "connector-hubspot-pull",
  "connector-bigquery-pull",
  "connector-snowflake-pull",
  "connector-s3-pull",
]);

export function assertAllowed(fnName) {
  if (BLOCKED_EDGE_FUNCTIONS.has(fnName)) {
    throw new Error(`Edge function ${fnName} is BLOCKED in load tests`);
  }
  if (!ALLOWED_EDGE_FUNCTIONS.has(fnName)) {
    throw new Error(`Edge function ${fnName} not in allow-list`);
  }
}
