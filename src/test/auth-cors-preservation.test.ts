import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("authentication CORS preservation", () => {
  it("keeps client-acceptance and Netlify preview origins staging-only", () => {
    const cors = read("supabase/functions/_shared/cors.ts");

    expect(cors).toContain('const STAGING_SUPABASE_URL = "https://cmnihsbdbpubznlkmjbc.supabase.co";');
    expect(cors).toContain('"http://127.0.0.1:4173"');
    expect(cors).toContain('if (supabaseUrl !== STAGING_SUPABASE_URL) return false;');
    expect(cors).toContain("STAGING_ONLY_ORIGINS.has(origin) || STAGING_NETLIFY_PREVIEW.test(origin)");
    expect(cors).toContain('"https://quantivis-insights.lovable.app"');
  });

  it("makes the auth rate limiter use the centralized CORS policy", () => {
    const limiter = read("supabase/functions/auth-rate-limiter/index.ts");

    expect(limiter).toContain('from "../_shared/cors.ts"');
    expect(limiter).toContain("corsPreflightResponse(req)");
    expect(limiter).toContain("getCorsHeaders(req)");
    expect(limiter).not.toContain('"Access-Control-Allow-Origin": "https://www.quantivis.io"');
  });
});
