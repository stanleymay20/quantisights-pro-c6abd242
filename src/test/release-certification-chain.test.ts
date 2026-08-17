import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const gaReadiness = readFileSync(
  resolve(root, ".github/workflows/ga-readiness.yml"),
  "utf8",
);
const staging = readFileSync(
  resolve(root, ".github/workflows/deploy-supabase-staging.yml"),
  "utf8",
);
const production = readFileSync(
  resolve(root, ".github/workflows/deploy-edge-functions.yml"),
  "utf8",
);

describe("release certification chain", () => {
  it("chains GA Readiness behind successful real staging validation", () => {
    expect(gaReadiness).toContain("workflow_run:");
    expect(gaReadiness).toContain('workflows: ["GA Staging Validation"]');
    expect(gaReadiness).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(gaReadiness).toContain("actions: read");
    expect(gaReadiness).toContain('wait_for_gate "ci.yml" "CI"');
    expect(gaReadiness).toContain('wait_for_gate "deploy-supabase-staging.yml" "Deploy Supabase Staging"');
    expect(gaReadiness).toContain('wait_for_gate "ga-staging-validation.yml" "GA Staging Validation"');
    expect(gaReadiness).toContain("ref: ${{ env.CERTIFIED_SHA }}");
  });

  it("requires every exact-SHA GA gate before production checkout", () => {
    const gateStep = production.indexOf("Verify certified release workflow gates");
    const checkoutStep = production.indexOf("Checkout certified release");
    expect(gateStep).toBeGreaterThan(-1);
    expect(checkoutStep).toBeGreaterThan(gateStep);
    expect(production).toContain("actions: read");
    expect(production).toContain('require_gate "ci.yml" "CI"');
    expect(production).toContain('require_gate "deploy-supabase-staging.yml" "Deploy Supabase Staging"');
    expect(production).toContain('require_gate "ga-staging-validation.yml" "GA Staging Validation"');
    expect(production).toContain('require_gate "ga-readiness.yml" "GA Readiness"');
    expect(production).toContain('select(.head_sha == $sha)');
  });

  it("routes release-pipeline changes through staging on main only", () => {
    expect(staging).toContain("branches: [main]");
    expect(staging).not.toContain("agent/fix-staging-edge-imports");
    expect(staging).toContain('".github/workflows/ga-staging-validation.yml"');
    expect(staging).toContain('".github/workflows/ga-readiness.yml"');
    expect(staging).toContain('".github/workflows/deploy-edge-functions.yml"');
  });

  it("keeps production manual-only", () => {
    expect(production).toContain("workflow_dispatch:");
    expect(production).not.toMatch(/\n\s*push:\s*\n/);
  });
});
