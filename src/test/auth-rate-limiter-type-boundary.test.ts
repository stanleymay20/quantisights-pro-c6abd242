import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const limiter = read("supabase/functions/auth-rate-limiter/index.ts");
const ci = read(".github/workflows/ci.yml");

describe("auth rate limiter type boundary", () => {
  it("does not suppress TypeScript checking in the privileged auth limiter", () => {
    expect(limiter).not.toContain("@ts-nocheck");
    expect(limiter).toContain("RateLimitRequestBody");
    expect(limiter).toContain("isRateLimitRequestBody");
  });

  it("fails open explicitly when required service configuration is unavailable", () => {
    expect(limiter).toContain('Deno.env.get("SUPABASE_URL")');
    expect(limiter).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(limiter).toContain("missing required Supabase environment configuration");
    expect(limiter).toContain('warning: "Rate limiter unavailable — proceeding"');
  });

  it("pins Deno tooling and checks the auth limiter in CI through the privileged Edge wrapper", () => {
    expect(ci).toContain("denoland/setup-deno@22d081ff2d3a40755e97629de92e3bcbfa7cf2ed");
    expect(ci).toContain("deno-version: v2.9.5");
    expect(ci).toContain('deno check --config "$config" "$file"');
    expect(ci).toContain("check_edge supabase/functions/deno.json supabase/functions/auth-rate-limiter/index.ts");
  });
});
