// DV-1: verifies production is serving the expected release artifact.
import { DEPLOYMENT_STATUS, buildDeploymentVerification, fetchProductionHtml, getLatestGitHubCommit } from "../lib/deployment-verification.mjs";
import { STATUS } from "../lib/taxonomy.mjs";

export const meta = {
  name: "deployment-verification",
  gate: "System Health",
};

export async function verify(ctx) {
  const productionUrl = process.env.DEPLOYMENT_VERIFY_URL || "https://www.quantivis.io/";
  const outputDir = process.env.DEPLOYMENT_VERIFY_OUTPUT_DIR || "audit-artifacts/deployment-verification";
  const expectedCommit =
    process.env.DEPLOYMENT_EXPECTED_COMMIT ||
    ctx.commit_sha ||
    getLatestGitHubCommit({
      remote: process.env.DEPLOYMENT_GIT_REMOTE || "origin",
      branch: process.env.DEPLOYMENT_GIT_BRANCH || "main",
    });

  try {
    const fetched = await fetchProductionHtml(productionUrl);
    const result = buildDeploymentVerification({
      expectedCommit,
      productionUrl,
      html: fetched.html,
      headers: fetched.headers,
      outputDir,
    });

    const passed = result.status === DEPLOYMENT_STATUS.PASS;
    return {
      pipeline: meta.name,
      status: passed ? STATUS.PASS : STATUS.CRITICAL_FAILURE,
      positive_controls: passed
        ? [
            {
              name: "production_serves_expected_commit",
              status: STATUS.PASS,
              expected_commit: result.expected_commit,
              deployed_commit: result.deployed_commit,
            },
          ]
        : [],
      negative_controls: [],
      warnings: result.status === DEPLOYMENT_STATUS.PENDING
        ? [
            {
              code: "DEPLOYMENT_PENDING",
              message: `production is serving ${result.deployed_commit ?? "<missing>"} but expected ${result.expected_commit}`,
            },
          ]
        : [],
      failures: passed
        ? []
        : [
            {
              code: result.status === DEPLOYMENT_STATUS.PENDING ? "DEPLOYMENT_MISMATCH" : "DEPLOYMENT_MARKER_MISSING",
              message: `deployment verification ${result.status}`,
              expected_commit: result.expected_commit,
              deployed_commit: result.deployed_commit,
              artifact_id: result.artifact_id,
              deployment_id: result.deployment_id,
            },
          ],
      evidence_files: [result.output_path],
    };
  } catch (err) {
    const result = buildDeploymentVerification({
      expectedCommit,
      productionUrl,
      html: "",
      errors: [{ code: "FETCH_FAILED", message: String(err?.message ?? err) }],
      outputDir,
    });
    return {
      pipeline: meta.name,
      status: STATUS.API_FAILURE,
      positive_controls: [],
      negative_controls: [],
      warnings: [],
      failures: [{ code: "DEPLOYMENT_VERIFY_FETCH_FAILED", message: String(err?.message ?? err) }],
      evidence_files: [result.output_path],
    };
  }
}
