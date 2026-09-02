import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const workflow = readFileSync(
  resolve(root, ".github/workflows/configure-google-oauth.yml"),
  "utf8",
);
const stagingDeploy = readFileSync(
  resolve(root, ".github/workflows/deploy-supabase-staging.yml"),
  "utf8",
);
const script = readFileSync(
  resolve(root, "scripts/configure-supabase-google-oauth.mjs"),
  "utf8",
);

const stagingCallback =
  "https://id-preview--28b43e06-9231-4c54-bc18-a49be01a6516.lovable.app/auth/callback";

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
    expect(workflow).toContain("inputs.target_environment == 'production' && 'https://quantivis.io'");
    expect(workflow).toContain("https://quantivis.io/**,https://www.quantivis.io/**");
    expect(workflow).toContain(
      "https://id-preview--28b43e06-9231-4c54-bc18-a49be01a6516.lovable.app",
    );
    expect(workflow).toContain(stagingCallback);
    expect(workflow).toContain("confirm_project_ref");
  });

  it("never configures the production project with a Lovable site URL", () => {
    const productionSiteUrl = workflow.match(
      /AUTH_SITE_URL:.*inputs\.target_environment == 'production' && '([^']+)'/,
    );
    expect(productionSiteUrl?.[1]).toBe("https://quantivis.io");
    expect(productionSiteUrl?.[1]).not.toContain("lovable.app");
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

  it("uses the Supabase-hosted provider callback rather than an app or Lovable broker callback", () => {
    expect(script).toContain("https://${projectRef}.supabase.co/auth/v1/callback");
    expect(script).not.toContain("/~oauth/callback");
  });

  it("supports a staging-only redirect repair without requiring Google provider credentials", () => {
    expect(script).toContain('SUPPORTED_ACTIONS = new Set(["full", "redirects-only"])');
    expect(script).toContain('if (action === "full")');
    expect(script).toContain('REQUIRED_ENV.push("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET")');
    expect(script).toContain('if (action === "redirects-only" && projectRef !== STAGING_REF)');
    expect(script).toContain("redirects-only is restricted to the staging Supabase project");

    const redirectsOnlyBlock = script.split('if (action === "redirects-only") {')[1]?.split("} else {")[0] ?? "";
    expect(redirectsOnlyBlock).toContain("site_url: normalizedSiteUrl");
    expect(redirectsOnlyBlock).toContain("uri_allow_list: expectedAllowList");
    expect(redirectsOnlyBlock).not.toContain("external_google_client_id");
    expect(redirectsOnlyBlock).not.toContain("external_google_secret");
  });

  it("preserves existing redirect URLs while adding required exact callbacks", () => {
    expect(script).toContain("const existingAllowEntries = parseAllowList(current.uri_allow_list)");
    expect(script).toContain("[...new Set([...existingAllowEntries, ...requiredAllowEntries])]");
    expect(script).toContain("if (!verifiedAllowEntries.has(entry))");
    expect(stagingDeploy).toContain(stagingCallback);
    expect(stagingDeploy).toContain("node scripts/configure-supabase-google-oauth.mjs redirects-only");
    expect(stagingDeploy).toContain("Ensure staging Auth redirect contract");
  });

  it("does not inject Google provider credentials into the staging deploy", () => {
    expect(stagingDeploy).toContain("SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}");
    expect(stagingDeploy).not.toContain("GOOGLE_OAUTH_CLIENT_SECRET:");
    expect(stagingDeploy).not.toContain("GOOGLE_OAUTH_CLIENT_ID:");
  });
});
