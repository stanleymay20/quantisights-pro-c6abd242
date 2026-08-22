import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const retry = readFileSync(
  resolve(process.cwd(), "src/lib/edge-function-retry.ts"),
  "utf8",
);

describe("edge function retry contract", () => {
  it("retries authoritative HTTP 5xx responses", () => {
    expect(retry).toContain("httpStatus >= 500");
    expect(retry).toContain("parsed?.status");
    expect(retry).not.toContain("if (!isRetryable(error.message))");
  });

  it("treats per-attempt timeouts as transient", () => {
    expect(retry).toContain('msg.includes("timed out after")');
    expect(retry).toContain("clearTimeout(timeoutId)");
  });

  it("keeps 402 entitlement failures non-retryable and observable", () => {
    expect(retry).toContain("parsed?.status === 402");
    expect(retry).toContain("quantivis:upgrade-required");
  });
});
