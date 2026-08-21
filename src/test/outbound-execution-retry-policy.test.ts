import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const edgeSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/execute-decision-action/index.ts"),
  "utf8",
);
const retrySource = readFileSync(
  resolve(process.cwd(), "supabase/functions/execute-decision-action/retry-policy.ts"),
  "utf8",
);
const migrationSource = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260821190500_add_bounded_execution_retry_evidence.sql"),
  "utf8",
);

describe("governed outbound bounded retries", () => {
  it("caps automatic retries at three attempts and persists attempt evidence", () => {
    expect(retrySource).toContain("MAX_OUTBOUND_ATTEMPTS = 3");
    expect(retrySource).toContain("attempt_count: attempt");
    expect(retrySource).toContain("last_attempt_at: new Date().toISOString()");
    expect(retrySource).toContain('event_type: "outbound_retry_scheduled"');
    expect(retrySource).toContain('event_type: "outbound_retry_exhausted"');
    expect(migrationSource).toContain("attempt_count integer NOT NULL DEFAULT 0");
    expect(migrationSource).toContain("max_attempts integer NOT NULL DEFAULT 3");
    expect(migrationSource).toContain("retry_exhausted_at timestamptz");
  });

  it("automatically retries only explicit HTTP 429 rate limits", () => {
    expect(retrySource).toContain('if (status === 429) return "retryable_failure"');
    expect(retrySource).toContain("if (response.status !== 429)");
    expect(retrySource).toContain('last_retry_reason: "http_429"');
  });

  it("treats timeout/server responses as uncertain rather than retryable", () => {
    expect(retrySource).toContain('if (status === 408 || status >= 500) return "uncertain"');
    expect(retrySource).toContain("Any thrown transport error escapes immediately");
    expect(edgeSource).toContain('const uncertain = outcome === "uncertain"');
    expect(edgeSource).toContain('const uncertain = httpOutcome === "uncertain"');
    expect(edgeSource.match(/completeExecutionReceipt\(supabase, receipt\.id, "uncertain"/g)?.length).toBe(2);
  });

  it("uses the bounded policy for both webhook and Slack dispatch", () => {
    const webhookCase = edgeSource.indexOf('case "trigger_webhook"');
    const slackCase = edgeSource.indexOf('case "notify_slack"');
    expect(edgeSource.indexOf("dispatchWithBoundedRateLimitRetries({", webhookCase)).toBeGreaterThan(webhookCase);
    expect(edgeSource.indexOf("dispatchWithBoundedRateLimitRetries({", slackCase)).toBeGreaterThan(slackCase);
  });

  it("reuses the same downstream idempotency key across every bounded attempt", () => {
    expect(edgeSource.match(/"Idempotency-Key": idempotency_key/g)?.length).toBe(2);
    expect(edgeSource).not.toContain("crypto.randomUUID()");
  });

  it("does not expose sensitive idempotency material through the receipt read model", () => {
    expect(migrationSource).toContain("'attempt_count', r.attempt_count");
    expect(migrationSource).toContain("'retry_exhausted_at', r.retry_exhausted_at");
    expect(migrationSource).not.toContain("'idempotency_key', r.idempotency_key");
    expect(migrationSource).not.toContain("'request_fingerprint', r.request_fingerprint");
  });
});
