import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { PublicAnalysisError, requestPublicAnalysis } from "@/lib/public-analysis";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const options = {
  url: "https://example.supabase.co/functions/v1/strategy-session",
  publishableKey: "publishable-test-key",
  payload: { metrics: "Revenue: 10", companyContext: "Test" },
  requestId: "11111111-1111-4111-8111-111111111111",
};

describe("public analysis client recovery", () => {
  it("uses stable request and idempotency identifiers", async () => {
    const fetchImpl = vi.fn(async () => new Response("stream", { status: 200 }));
    await requestPublicAnalysis({ ...options, fetchImpl });

    const request = fetchImpl.mock.calls[0][1];
    expect(request?.headers).toMatchObject({
      "X-Request-ID": options.requestId,
      "Idempotency-Key": options.requestId,
    });
  });

  it("retries a recoverable dependency failure and returns the successful stream", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Unavailable", code: "dependency_error" }), {
        status: 503,
        headers: { "Retry-After": "0", "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response("stream", { status: 200 }));

    const response = await requestPublicAnalysis({ ...options, fetchImpl });
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns a typed, recoverable error after retries are exhausted", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "Unavailable", code: "dependency_error" }), {
      status: 503,
      headers: { "Retry-After": "0", "Content-Type": "application/json" },
    }));

    await expect(requestPublicAnalysis({ ...options, fetchImpl })).rejects.toMatchObject<Partial<PublicAnalysisError>>({
      status: 503,
      code: "dependency_error",
      retryable: true,
    });
  });
});

describe("public analysis server and UI readiness contract", () => {
  const edge = read("supabase/functions/strategy-session/index.ts");
  const page = read("src/pages/FreeAnalysis.tsx");

  it("rate-limits, bounds input, times out dependencies, and emits structured telemetry", () => {
    expect(edge).toContain("checkRateLimit");
    expect(edge).toContain("MAX_METRICS_LENGTH");
    expect(edge).toContain("GATEWAY_TIMEOUT_MS");
    expect(edge).toContain('"Idempotency-Key"');
    expect(edge).toContain("createLogger");
    expect(edge).toContain("durationMs");
  });

  it("never leaves the UI without a cancellation and recoverable failure path", () => {
    expect(page).toContain("requestPublicAnalysis");
    expect(page).toContain("Cancel analysis");
    expect(page).toContain('setStep("input")');
    expect(page).toContain("activeRequestRef.current?.abort");
  });
});

describe("release provenance and CSP release gates", () => {
  it("injects semantic version, commit, timestamp, deployment ID and migration version", () => {
    const vite = read("vite.config.ts");
    for (const marker of ["packageVersion", "gitCommit", "buildTimestamp", "deploymentId", "migrationVersion"]) {
      expect(vite).toContain(marker);
    }
    expect(vite).toContain("const resolveGitCommit");
    expect(vite).toContain('return "unknown"');
    expect(vite).toContain('stdio: ["ignore", "pipe", "ignore"]');
    expect(JSON.parse(read("package.json")).version).toBe("0.1.0-beta.1");
    const health = read("supabase/functions/health-check/index.ts");
    expect(health).toContain("DENO_DEPLOYMENT_ID");
    expect(health).toContain("migration_version");
    expect(health).toContain("release: RELEASE");
  });

  it("prohibits unsafe-eval in every deployable CSP source", () => {
    for (const path of [
      "config/security-policy.mjs",
      "public/_headers",
      "public/_worker.js",
      "vercel.json",
      "scripts/apply-cloudflare-security.mjs",
      "scripts/apply-cloudflare-security-headers.mjs",
    ]) {
      expect(read(path), path).not.toContain("'unsafe-eval'");
    }
  });
});
