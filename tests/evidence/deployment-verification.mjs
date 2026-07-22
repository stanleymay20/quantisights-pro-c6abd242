#!/usr/bin/env node
// DV-1 CLI. Read-only production artifact verification.

import { resolve } from "node:path";
import {
  DEPLOYMENT_STATUS,
  buildDeploymentVerification,
  fetchProductionHtml,
  getLatestGitHubCommit,
  readHtmlFile,
} from "./lib/deployment-verification.mjs";

function parseArgs(argv = process.argv.slice(2)) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [rawKey, ...rest] = arg.slice(2).split("=");
    flags[rawKey] = rest.length ? rest.join("=") : argv[++i];
  }
  return flags;
}

async function main() {
  const flags = parseArgs();
  const cwd = resolve(flags.cwd || process.cwd());
  const productionUrl =
    flags["production-url"] ||
    process.env.DEPLOYMENT_VERIFY_URL ||
    "https://www.quantivis.io/";
  const outputDir =
    flags["output-dir"] ||
    process.env.DEPLOYMENT_VERIFY_OUTPUT_DIR ||
    "audit-artifacts/deployment-verification";
  let errors = [];
  let expectedCommit = flags["expected-commit"] || process.env.DEPLOYMENT_EXPECTED_COMMIT || null;
  if (!expectedCommit) {
    try {
      expectedCommit = getLatestGitHubCommit({
        cwd,
        remote: flags.remote || process.env.DEPLOYMENT_GIT_REMOTE || "origin",
        branch: flags.branch || process.env.DEPLOYMENT_GIT_BRANCH || "main",
      });
    } catch (err) {
      errors.push({ code: "GIT_FETCH_FAILED", message: String(err?.message ?? err) });
    }
  }

  let html;
  let headers = {};
  if (flags["html-file"]) {
    html = readHtmlFile(flags["html-file"]);
  } else {
    try {
      const fetched = await fetchProductionHtml(productionUrl);
      html = fetched.html;
      headers = fetched.headers;
      if (!fetched.ok) {
        errors.push({ code: "HTTP_STATUS", message: `${fetched.status} ${fetched.statusText}` });
      }
    } catch (err) {
      html = "";
      errors.push({ code: "FETCH_FAILED", message: String(err?.message ?? err) });
    }
  }

  const result = buildDeploymentVerification({
    expectedCommit,
    productionUrl,
    html,
    headers,
    errors,
    outputDir,
  });

  console.log(result.status);
  console.log(`expected_commit=${result.expected_commit ?? "<missing>"}`);
  console.log(`deployed_commit=${result.deployed_commit ?? "<missing>"}`);
  console.log(`artifact_id=${result.artifact_id ?? "<missing>"}`);
  console.log(`deployment_id=${result.deployment_id ?? "<missing>"}`);
  console.log(`asset_hashes=${result.asset_hashes.join(",") || "<missing>"}`);
  console.log(`artifact=${result.output_path}`);

  process.exit(result.status === DEPLOYMENT_STATUS.PASS ? 0 : 1);
}

main().catch((err) => {
  console.error("FAILED");
  console.error(err?.message ?? String(err));
  process.exit(2);
});
