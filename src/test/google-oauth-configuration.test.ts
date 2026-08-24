import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const workflow = readFileSync(
  resolve(root, ".github/workflows/configure-google-oauth.yml"),
  "utf8",
);
const script = readFileSync(
  resolve(root, "scripts/configure-supabase-google-oauth.mjs"),
  "utf8",
);

describe("Google OAuth environment configuration", () => {
  it("keeps OAuth credentials in environment-scoped secrets", () => {
    expect(workflow).toContain("environment: ${{ inputs.target_environment }}");
    expect(workflow).toContain("GOOGLE_OAUTH_CLIENT_ID: ${{ secrets.GOOGLE_OAUTH_CLIENT_ID }}");
    expect(workflow).toContain("GOOGLE_OAUTH_CLIENT_SECRET: ${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}");
    expect(workflow).not.toMatch(/GOOGLE_OAUTH_CLIENT_SECRET:\s*(?!\$\{\{ secrets\.)[^\s]/);
  });

  it("pins staging and production to different active projects and site URLs", () => {
    expect(workflow).toContain("izgfrekdamlgigehxoqs");
    expect(workflow).toContain("cmnihsbdbpubznlkmjbc");
    expect(workflow).toContain("https://quantivis-insights.lovable.app");
    expect(workflow).toContain(
      "https://id-preview--28b43e06-9231-4c54-bc18-a49be01a6516.lovable.app",
    );
    expect(workflow).toContain("confirm_project_ref");
  });

  it("refuses the retired project and verifies the Management API result", () => {
    expect(script).toContain('RETIRED_REF = "itpwpnwzzitkelffttyx"');
    expect(script).toContain("Refusing to configure Auth on the retired Supabase project");
    expect(script).toContain("external_google_enabled: true");
    expect(script).toContain("external_google_skip_nonce_check: false");
    expect(script).toContain('requestJson("PATCH"');
    expect(script).toContain('requestJson("GET")');
    expect(script).toContain("OAuth client secret was never printed.");
  });

  it("uses the Supabase-hosted OAuth callback rather than an app or Lovable broker callback", () => {
    expect(script).toContain("https://${projectRef}.supabase.co/auth/v1/callback");
    expect(script).not.toContain("/~oauth/callback");
  });
});
