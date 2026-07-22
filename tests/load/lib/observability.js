// tests/load/lib/observability.js
// Captures correlation IDs for every failed request.
import { Counter, Rate, Trend } from "k6/metrics";

export const authFailures = new Counter("auth_failures");
export const db429 = new Counter("db_429");
export const db5xx = new Counter("db_5xx");
export const edgeFnFailures = new Counter("edge_fn_failures");
export const aiFailures = new Counter("ai_failures");
export const crossTenantLeaks = new Counter("cross_tenant_leaks");
export const workflowFailures = new Counter("workflow_failures");
export const workflowSuccessRate = new Rate("workflow_success_rate");
export const rateLimitRemaining = new Trend("rate_limit_remaining");

const failures = [];

export function recordResponse(res, ctx = {}) {
  const remaining = res.headers["X-Ratelimit-Remaining"];
  if (remaining) rateLimitRemaining.add(Number(remaining));
  if (res.status >= 500) db5xx.add(1);
  if (res.status === 429) db429.add(1);

  if (res.status >= 400) {
    failures.push({
      ts: new Date().toISOString(),
      status: res.status,
      url: res.url,
      latency_ms: res.timings.duration,
      request_id: res.headers["X-Request-Id"] || null,
      traceparent: res.headers["Traceparent"] || null,
      ...ctx,
    });
  }
}

export function handleSummary(data) {
  const stage = __ENV.LOAD_STAGE || "unknown";
  return {
    [`tests/load/reports/summary-${stage}.json`]: JSON.stringify(data, null, 2),
    [`tests/load/reports/observability-${stage}.json`]: JSON.stringify(failures, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(d) {
  return `\n=== ${__ENV.LOAD_STAGE} ===\n` +
    `requests: ${d.metrics.http_reqs?.values.count}\n` +
    `p95: ${d.metrics.http_req_duration?.values["p(95)"]?.toFixed(0)}ms\n` +
    `errors: ${(d.metrics.http_req_failed?.values.rate * 100).toFixed(2)}%\n` +
    `workflows: ${(d.metrics.workflow_success_rate?.values.rate * 100 || 0).toFixed(2)}%\n` +
    `failures captured: ${failures.length}\n`;
}
