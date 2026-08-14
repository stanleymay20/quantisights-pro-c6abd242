import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { PublicAnalysisError, requestPublicAnalysis } from "@/lib/public-analysis";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
type FetchArgs = Parameters<typeof fetch>;

const options = {
  url: "https://example.supabase.co/functions/v1/strategy-session",
  publishableKey: "publishable-test-key",
  payload: { metrics: "Revenue: 10", companyContext: "Test" },
  requestId: "11111111-1111-4111-8111-111111111111",
};

describe("public analysis client recovery", () => {
  it("uses stable request and idempotency identifiers", async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => new Response("stream", { status: 200 }));
    await requestPublicAnalysis({ ...options, fetchImpl });

    const request = fetchImpl.mock.calls[0]?.[1];
    expect(request?.headers).toMatchObject({
      "X-Request-ID": options.requestId,
      "Idempotency-Key": options.requestId,
    });
  });

  it("retries a recoverable dependency failure and returns the successful stream", async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => new Response("stream", { status: 200 }))
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
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => new Response(JSON.stringify({ error: "Unavailable", code: "dependency_error" }), {
      status: 503,
      headers: { "Retry-After": "0", "Content-Type": "application/json" },
    }));

    await expect(requestPublicAnalysis({ ...options, fetchImpl })).rejects.toMatchObject({
      status: 503,
      code: "dependency_error",
      retryable: true,
    } satisfies Partial<PublicAnalysisError>);
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
  it("keeps dependency installation portable outside the Lovable environment", () => {
    const lockfile = read("package-lock.json");
    expect(lockfile).not.toContain("lovable-core-prod/sandbox-npm-cache");
    expect(existsSync(resolve(root, "bun.lock"))).toBe(false);
    expect(existsSync(resolve(root, "docs/PILOT_OPERATIONS.md"))).toBe(true);
  });

  it("keeps staging isolated from production without exposing backend secrets", () => {
    const staging = read(".env.staging.example");
    const mcp = read(".mcp.json");
    const production = read("supabase/config.toml");
    const ignore = read(".gitignore");

    expect(staging).toContain("cmnihsbdbpubznlkmjbc");
    expect(staging).not.toMatch(/SUPABASE_(?:SECRET|SERVICE_ROLE)/);
    expect(mcp).toContain("project_ref=cmnihsbdbpubznlkmjbc");
    expect(mcp).toContain("read_only=true");
    expect(production).toContain('project_id = "itpwpnwzzitkelffttyx"');
    expect(ignore).toContain(".env.*");
    expect(existsSync(resolve(root, "docs/STAGING_SUPABASE.md"))).toBe(true);
  });

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
      "docs/CLOUDFLARE_ENTERPRISE_SECURITY.md",
      "docs/HOSTING_SECURITY_HEADERS.md",
    ]) {
      expect(read(path), path).not.toContain("'unsafe-eval'");
    }
  });
});

describe("public readiness claims fail closed", () => {
  const publicClaimSources = [
    "src/pages/Ebook.tsx",
    "src/pages/Security.tsx",
    "src/pages/SecurityQuestionnaire.tsx",
    "src/pages/Pitch.tsx",
    "src/pages/DPIA.tsx",
    "src/pages/Privacy.tsx",
    "src/pages/TOMs.tsx",
    "src/pages/ProcurementPack.tsx",
    "src/lib/pitch-deck-pdf.ts",
    "src/lib/scenario-template.ts",
    "src/i18n/de-runtime.json",
  ];

  it("does not publish unverifiable RLS, SOC 2, backup, or GA-pilot claims as fact", () => {
    const forbidden = [
      "RLS on 100% of tables",
      "Row Level Security (RLS) on 100% of tables",
      "Row-Level Security (RLS) policies on 100% of tables",
      "No cross-organization data access is architecturally possible",
      "Every required capability is fully implemented and live",
      "Enterprise-grade security controls are fully implemented",
      "Full platform live — ready for enterprise pilot deployment",
      "SOC 2 compliant infrastructure",
      "SOC 2 Type II certified infrastructure",
      "SOC 2 and ISO 27001 certified data centers",
    ];

    for (const path of publicClaimSources) {
      const source = read(path);
      for (const claim of forbidden) {
        expect(source, `${path} must not contain: ${claim}`).not.toContain(claim);
      }
    }
  });
});
