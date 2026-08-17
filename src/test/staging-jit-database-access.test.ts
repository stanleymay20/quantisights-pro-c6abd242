import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const workflow = readFileSync(
  resolve(root, ".github/workflows/deploy-supabase-staging.yml"),
  "utf8",
);
const script = readFileSync(
  resolve(root, "scripts/supabase-jit-access.mjs"),
  "utf8",
);

describe("staging short-lived Supabase database access", () => {
  it("removes the long-lived database password from the staging deployment path", () => {
    expect(workflow).not.toContain("SUPABASE_DB_PASSWORD");
    expect(workflow).toContain("SUPABASE_ACCESS_TOKEN");
    expect(workflow).toContain("SUPABASE_POOLER_HOST: aws-0-eu-west-1.pooler.supabase.com");
    expect(workflow).not.toContain("supabase link");
  });

  it("uses JIT access only for CLI migration preview, apply, and verification", () => {
    const prepare = workflow.indexOf("Prepare short-lived staging database access");
    const preview = workflow.indexOf('supabase db push --db-url "$SUPABASE_JIT_DB_URL" --include-all --dry-run');
    const apply = workflow.indexOf('supabase db push --db-url "$SUPABASE_JIT_DB_URL" --include-all --yes');
    const verify = workflow.indexOf('supabase migration list --db-url "$SUPABASE_JIT_DB_URL"');
    const cleanup = workflow.indexOf("Revoke temporary staging database access");
    const edgeDeploy = workflow.indexOf("Deploy staging Edge Functions");

    expect(prepare).toBeGreaterThan(-1);
    expect(preview).toBeGreaterThan(prepare);
    expect(apply).toBeGreaterThan(preview);
    expect(verify).toBeGreaterThan(apply);
    expect(cleanup).toBeGreaterThan(verify);
    expect(edgeDeploy).toBeGreaterThan(cleanup);
    expect(workflow).toContain("if: always()");
  });

  it("uses official Management API JIT endpoints with a finite expiry and rollback state", () => {
    expect(script).toContain('apiRequest("/v1/profile")');
    expect(script).toContain("/database/jit-access");
    expect(script).toContain("/database/jit/list");
    expect(script).toContain("/database/jit/${userId}");
    expect(script).toContain("JIT_TTL_MS = 20 * 60 * 1000");
    expect(script).toContain("previousMapping");
    expect(script).toContain("initialAccessState");
    expect(script).toContain("mode: 0o600");
  });

  it("never prints the access token or generated database URL", () => {
    expect(script).not.toMatch(/console\.(?:log|error)\([^\n]*(?:SUPABASE_ACCESS_TOKEN|dbUrl|SUPABASE_JIT_DB_URL)/);
    expect(script).toContain('writeGitHubEnv("SUPABASE_JIT_DB_URL", dbUrl)');
    expect(script).toContain("The PAT is\n  // intentionally never written to disk.");
  });
});
