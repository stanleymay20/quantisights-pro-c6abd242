import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const gaStaging = readFileSync(resolve(root, ".github/workflows/ga-staging-validation.yml"), "utf8");
const clientAcceptance = readFileSync(resolve(root, ".github/workflows/client-acceptance.yml"), "utf8");
const clientAcceptancePlaywright = readFileSync(resolve(root, "playwright.client-acceptance.config.ts"), "utf8");
const gaReadiness = readFileSync(resolve(root, ".github/workflows/ga-readiness.yml"), "utf8");
const staging = readFileSync(resolve(root, ".github/workflows/deploy-supabase-staging.yml"), "utf8");
const production = readFileSync(resolve(root, ".github/workflows/deploy-edge-functions.yml"), "utf8");

describe("release certification chain", () => {
  it("publishes run-scoped tenant-isolation proof for the exact staged SHA", () => {
    expect(gaStaging).toContain("validated-sha.txt");
    expect(gaStaging).toContain("ga-staging-validation-proof");
    expect(gaStaging).toContain("staging_validation_run_id");
    expect(gaStaging).toContain("Verify checked-out staging target");
    expect(gaStaging).toContain("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02");
  });

  it("requires real client acceptance after tenant isolation and publishes an exact-SHA proof", () => {
    expect(clientAcceptance).toContain("workflow_run:");
    expect(clientAcceptance).toContain('workflows: ["GA Staging Validation"]');
    expect(clientAcceptance).toContain("ga-staging-validation-proof");
    expect(clientAcceptance).toContain("client-acceptance-proof");
    expect(clientAcceptance).toContain("client_acceptance_run_id");
    expect(clientAcceptance).toContain("Exercise public buyer and all paid-tier customer journeys");
    expect(clientAcceptance).toContain("--config=playwright.client-acceptance.config.ts");
    expect(clientAcceptancePlaywright).toContain('testDir: "./tests/client-acceptance"');
    expect(clientAcceptancePlaywright).toContain('testMatch: "**/*.spec.ts"');
    expect(clientAcceptance).toContain("Teardown disposable tier customers");
  });

  it("resolves GA Readiness SHA from client-acceptance proof, not workflow head metadata", () => {
    expect(gaReadiness).toContain("workflow_run:");
    expect(gaReadiness).toContain('workflows: ["Client Acceptance"]');
    expect(gaReadiness).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(gaReadiness).toContain("actions: read");
    expect(gaReadiness).toContain("client_acceptance_run_id");
    expect(gaReadiness).toContain("ga_staging_run_id");
    expect(gaReadiness).toContain("client-acceptance-proof");
    expect(gaReadiness).toContain("actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093");
    expect(gaReadiness).toContain("CERTIFIED_SHA=$certified_sha");
    expect(gaReadiness).not.toContain("CERTIFIED_SHA: ${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha");
    expect(gaReadiness).toContain('wait_for_gate "ci.yml" "CI"');
    expect(gaReadiness).toContain('wait_for_gate "deploy-supabase-staging.yml" "Deploy Supabase Staging"');
    expect(gaReadiness).toContain("ref: ${{ env.CERTIFIED_SHA }}");
  });

  it("publishes GA Readiness proof only after client review, release gate and live security", () => {
    const clientSource = gaReadiness.indexOf("Verify client-acceptance and staging-validation source runs");
    const releaseGate = gaReadiness.indexOf("Run official GA release gate");
    const liveSecurity = gaReadiness.indexOf("Verify live GA security baseline");
    const publishProof = gaReadiness.indexOf("Publish GA certification proof");
    expect(clientSource).toBeGreaterThan(-1);
    expect(releaseGate).toBeGreaterThan(clientSource);
    expect(liveSecurity).toBeGreaterThan(releaseGate);
    expect(publishProof).toBeGreaterThan(liveSecurity);
    expect(gaReadiness).toContain("ga-readiness-proof");
    expect(gaReadiness).toContain("client_acceptance_run_id");
    expect(gaReadiness).toContain("ga_readiness_run_id");
  });

  it("requires client-reviewed run-scoped GA proof and exact-SHA CI/staging before production checkout", () => {
    const proofStep = production.indexOf("Verify run-scoped GA certification proof");
    const gateStep = production.indexOf("Verify exact-SHA CI and staging deployment gates");
    const checkoutStep = production.indexOf("Checkout certified release");
    expect(proofStep).toBeGreaterThan(-1);
    expect(gateStep).toBeGreaterThan(proofStep);
    expect(checkoutStep).toBeGreaterThan(gateStep);
    expect(production).toContain("ga_readiness_run_id");
    expect(production).toContain("ga-readiness-proof");
    expect(production).toContain("proof_sha");
    expect(production).toContain("client_acceptance_run_id");
    expect(production).toContain('.github/workflows/client-acceptance.yml');
    expect(production).toContain('.github/workflows/ga-staging-validation.yml');
    expect(production).toContain('require_gate "ci.yml" "CI"');
    expect(production).toContain('require_gate "deploy-supabase-staging.yml" "Deploy Supabase Staging"');
    expect(production).not.toContain('require_gate "ga-staging-validation.yml"');
    expect(production).not.toContain('require_gate "ga-readiness.yml"');
    expect(production).toContain('select(.head_sha == $sha)');
  });

  it("routes client-experience and release-pipeline changes through staging on main only", () => {
    expect(staging).toContain("branches: [main]");
    expect(staging).not.toContain("agent/fix-staging-edge-imports");
    expect(staging).toContain('"tests/client-acceptance/**"');
    expect(staging).toContain('"playwright.client-acceptance.config.ts"');
    expect(staging).toContain('"src/pages/Register.tsx"');
    expect(staging).toContain('"src/routes/**"');
    expect(staging).toContain('".github/workflows/client-acceptance.yml"');
    expect(staging).toContain('".github/workflows/ga-staging-validation.yml"');
    expect(staging).toContain('".github/workflows/ga-readiness.yml"');
    expect(staging).toContain('".github/workflows/deploy-edge-functions.yml"');
  });

  it("keeps production manual-only", () => {
    expect(production).toContain("workflow_dispatch:");
    expect(production).not.toMatch(/\n\s*push:\s*\n/);
  });
});
