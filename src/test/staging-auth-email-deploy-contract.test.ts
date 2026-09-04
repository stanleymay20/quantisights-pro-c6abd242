import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/deploy-supabase-staging.yml",
  "utf8",
);

const STAGING_REF = "cmnihsbdbpubznlkmjbc";
const PRODUCTION_REF = "izgfrekdamlgigehxoqs";

function position(fragment: string): number {
  const index = workflow.indexOf(fragment);
  expect(index, `missing workflow fragment: ${fragment}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe("staging Auth email deployment contract", () => {
  it("is staging-scoped and requires the verified Quantivis Resend pair", () => {
    expect(workflow).toContain(`SUPABASE_PROJECT_REF: ${STAGING_REF}`);
    expect(workflow).not.toContain(PRODUCTION_REF);
    expect(workflow).toContain("RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}");
    expect(workflow).toContain("RESEND_FROM_EMAIL: ${{ secrets.RESEND_FROM_EMAIL }}");
    expect(workflow).toContain('staging RESEND_FROM_EMAIL must be alerts@quantivis.io');
  });

  it("installs a dedicated worker secret before deploying Edge Functions", () => {
    const generate = position("Generate staging email worker invocation secret");
    const setSecret = position('EMAIL_QUEUE_WORKER_SECRET="$worker_secret"');
    const deploy = position("Deploy staging Edge Functions");

    expect(generate).toBeLessThan(setSecret);
    expect(setSecret).toBeLessThan(deploy);
    expect(workflow).toContain('echo "::add-mask::$worker_secret"');
  });

  it("proves provider/runtime and private transport before SMTP and rate-limit certification", () => {
    const provider = position("node scripts/preflight-supabase-auth-email.mjs provider-input");
    const runtime = position("node scripts/preflight-supabase-auth-email.mjs runtime");
    const disable = position("node scripts/configure-supabase-auth-email.mjs disable");
    const configure = position("node scripts/configure-supabase-auth-email.mjs configure");
    const verify = position("node scripts/configure-supabase-auth-email.mjs verify");
    const smtp = position("node scripts/configure-staging-auth-smtp.mjs");
    const limits = position("node scripts/configure-staging-auth-rate-limits.mjs");

    expect(provider).toBeLessThan(runtime);
    expect(runtime).toBeLessThan(disable);
    expect(disable).toBeLessThan(configure);
    expect(configure).toBeLessThan(verify);
    expect(verify).toBeLessThan(smtp);
    expect(smtp).toBeLessThan(limits);
  });

  it("keeps the Auth email diagnostic bound to the CI-certified SHA", () => {
    expect(workflow).toContain('CERTIFIED_SHA: ${{ steps.release.outputs.sha }}');
    expect(workflow).toContain('"certified_sha": "%s"');
    expect(workflow).toContain(
      "staging-auth-email-transport-diagnostic-${{ steps.release.outputs.sha }}",
    );
  });
});
