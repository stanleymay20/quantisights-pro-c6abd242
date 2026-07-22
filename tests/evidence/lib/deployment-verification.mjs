// DV-1 deployment verification helpers.
// Read-only: compares the expected GitHub commit to the artifact currently
// served by the production HTML and writes deployment-verification.json.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DEPLOYMENT_STATUS = Object.freeze({
  PASS: "PASS",
  PENDING: "PENDING",
  FAILED: "FAILED",
});

function normalizeHeaders(headers = {}) {
  const out = {};
  if (headers && typeof headers.entries === "function") {
    for (const [key, value] of headers.entries()) out[key.toLowerCase()] = value;
    return out;
  }
  for (const [key, value] of Object.entries(headers || {})) {
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function parseDeploymentMarkers(html, { headers = {} } = {}) {
  const normalizedHeaders = normalizeHeaders(headers);
  const commitMatch = html.match(/\bdata-commit-sha=["']([^"']+)["']/i);
  const artifactMatch = html.match(/\bdata-artifact-id=["']([^"']+)["']/i);
  const kindMatch = html.match(/\bdata-artifact-kind=["']([^"']+)["']/i);
  const scriptAssets = Array.from(html.matchAll(/\bsrc=["']\/assets\/([^"']+)["']/gi)).map((m) => m[1]);
  const styleAssets = Array.from(html.matchAll(/\bhref=["']\/assets\/([^"']+)["']/gi)).map((m) => m[1]);
  const deploymentId =
    normalizedHeaders["x-deployment-id"] ||
    normalizedHeaders["x-lovable-deployment-id"] ||
    (kindMatch?.[1] === "cf_deployment_id" ? artifactMatch?.[1] : null) ||
    null;

  return {
    commit_sha: commitMatch?.[1] ?? null,
    artifact_id: artifactMatch?.[1] ?? null,
    artifact_kind: kindMatch?.[1] ?? null,
    deployment_id: deploymentId,
    asset_hashes: unique([...scriptAssets, ...styleAssets]),
  };
}

export function classifyDeployment({ expectedCommit, deployedCommit }) {
  if (!expectedCommit || !deployedCommit) return DEPLOYMENT_STATUS.FAILED;
  return expectedCommit === deployedCommit
    ? DEPLOYMENT_STATUS.PASS
    : DEPLOYMENT_STATUS.PENDING;
}

export function buildDeploymentVerification({
  expectedCommit,
  productionUrl,
  html,
  headers = {},
  errors = [],
  outputDir = ".",
  now = () => new Date().toISOString(),
} = {}) {
  const markers = parseDeploymentMarkers(html || "", { headers });
  const status = classifyDeployment({
    expectedCommit,
    deployedCommit: markers.commit_sha,
  });
  const artifact = {
    schema_version: 1,
    status,
    checked_at: now(),
    production_url: productionUrl,
    expected_commit: expectedCommit || null,
    deployed_commit: markers.commit_sha,
    artifact_id: markers.artifact_id,
    artifact_kind: markers.artifact_kind,
    deployment_id: markers.deployment_id,
    asset_hashes: markers.asset_hashes,
    errors,
  };

  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, "deployment-verification.json");
  writeFileSync(outputPath, JSON.stringify(artifact, null, 2));
  return { ...artifact, output_path: outputPath };
}

export function getLatestGitHubCommit({ cwd = process.cwd(), remote = "origin", branch = "main" } = {}) {
  execFileSync("git", ["fetch", remote, branch], { cwd, stdio: "ignore" });
  return execFileSync("git", ["rev-parse", `${remote}/${branch}`], {
    cwd,
    encoding: "utf8",
  }).trim();
}

export async function fetchProductionHtml(productionUrl) {
  const response = await fetch(productionUrl, { cache: "no-store" });
  const html = await response.text();
  const headers = {};
  for (const [key, value] of response.headers.entries()) headers[key] = value;
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    html,
    headers,
  };
}

export function readHtmlFile(path) {
  if (path === "-") {
    return readFileSync(0, "utf8");
  }
  return readFileSync(path, "utf8");
}
