import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("runtime origin independence", () => {
  it("does not publish the retired Supabase project in the Internal Data API example", () => {
    const page = read("src/pages/admin/InternalData.tsx");
    expect(page).not.toContain("https://itpwpnwzzitkelffttyx.supabase.co/functions/v1/ingest-internal-data");
    expect(page).toContain("import.meta.env.VITE_SUPABASE_URL");
  });

  it("defaults browser E2E and transactional CTAs to the canonical Quantivis origin", () => {
    expect(read("playwright.config.ts")).toContain('process.env.E2E_BASE_URL || "https://quantivis.io"');
    expect(read("supabase/functions/morning-brief/index.ts")).toContain('href="https://quantivis.io/dashboard"');
    expect(read("supabase/functions/auth-email-hook/index.ts")).toContain(
      "const SAMPLE_PROJECT_URL = 'https://quantivis.io'",
    );
  });

  it("uses exact invite-origin membership and keeps preview origins staging-only", () => {
    const invite = read("supabase/functions/invite-team-member/index.ts");
    expect(invite).not.toContain("rawOrigin.startsWith");
    expect(invite).toContain("allowedOrigins.includes(rawOrigin)");
    expect(invite).toContain('const fallbackOrigin = "https://quantivis.io"');
    expect(invite).toContain('=== "https://cmnihsbdbpubznlkmjbc.supabase.co"');
  });
});
