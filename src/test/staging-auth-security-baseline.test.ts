import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const authBaselineScript = readFileSync(
  resolve(root, "scripts/configure-staging-auth-rate-limits.mjs"),
  "utf8",
);
const stagingWorkflow = readFileSync(
  resolve(root, ".github/workflows/deploy-supabase-staging.yml"),
  "utf8",
);

describe("staging Auth security baseline", () => {
  it("enables leaked-password protection only on the staging project", () => {
    expect(authBaselineScript).toContain(
      'const STAGING_REF = "cmnihsbdbpubznlkmjbc"',
    );
    expect(authBaselineScript).toContain(
      "const STAGING_PASSWORD_HIBP_ENABLED = true",
    );
    expect(authBaselineScript).toContain(
      "patch.password_hibp_enabled = STAGING_PASSWORD_HIBP_ENABLED",
    );
    expect(authBaselineScript).toContain(
      "after.password_hibp_enabled !== STAGING_PASSWORD_HIBP_ENABLED",
    );
    expect(authBaselineScript).toContain(
      "Refusing to change Auth security configuration outside Quantivis staging",
    );
    expect(authBaselineScript).not.toContain("izgfrekdamlgigehxoqs");
  });

  it("keeps the Auth baseline in the exact-SHA staging deployment path", () => {
    expect(stagingWorkflow).toContain("environment: staging");
    expect(stagingWorkflow).toContain(
      "node scripts/configure-staging-auth-rate-limits.mjs",
    );
  });
});
