// tests/evidence/run-all.mjs
// Enterprise Evidence runner — framework only.
//
// This runner ORCHESTRATES the pipelines. It never contains a pipeline's own
// verification logic; each pipeline in tests/evidence/pipelines/*.mjs owns
// its own controls. The runner is safe to invoke locally: every pipeline
// ships as a stub returning FRAMEWORK_INVALID until it is wired.
//
// Usage:
//   node tests/evidence/run-all.mjs                 # run every pipeline
//   node tests/evidence/run-all.mjs authentication  # run one pipeline
//
// Environment:
//   EVIDENCE_ENV       required — must be "staging" or "preview"
//   EVIDENCE_COMMIT    optional — release-candidate SHA (defaults to "unknown")
//   EVIDENCE_ACTOR     optional — CI actor id
//   EVIDENCE_ORG       optional — org id (test org, never a production org)
//
// The runner refuses production environments outright.

import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STATUS, isBlocking, assertKnown } from "./lib/taxonomy.mjs";
import { writeArtifact, todayRoot } from "./lib/artifact.mjs";
import { finalize } from "./lib/pipeline.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINES_DIR = join(__dirname, "pipelines");

const ALLOWED_ENVS = new Set(["staging", "preview"]);

function loadContext() {
  const env = process.env.EVIDENCE_ENV;
  if (!env) {
    console.error("EVIDENCE_ENV is required (staging|preview). Refusing to run.");
    process.exit(2);
  }
  if (!ALLOWED_ENVS.has(env)) {
    console.error(`EVIDENCE_ENV="${env}" is not allowed. Only staging|preview.`);
    process.exit(2);
  }
  return {
    start_time: new Date().toISOString(),
    commit_sha: process.env.EVIDENCE_COMMIT || "unknown",
    environment: env,
    actor: process.env.EVIDENCE_ACTOR || "local",
    organization: process.env.EVIDENCE_ORG || "org_evidence_test",
  };
}

async function loadPipeline(file) {
  const url = pathToFileURL(join(PIPELINES_DIR, file)).href;
  const mod = await import(url);
  if (!mod.meta?.name || typeof mod.verify !== "function") {
    throw new Error(`FRAMEWORK_INVALID: ${file} missing meta/verify`);
  }
  return mod;
}

async function main() {
  const ctx = loadContext();
  const only = process.argv[2];
  const root = todayRoot();

  const files = readdirSync(PIPELINES_DIR)
    .filter((f) => f.endsWith(".mjs"))
    .filter((f) => !only || f === `${only}.mjs`);

  if (only && files.length === 0) {
    console.error(`Unknown pipeline "${only}"`);
    process.exit(2);
  }

  const summary = [];
  let hardFailures = 0;

  for (const file of files) {
    const mod = await loadPipeline(file);
    const start = new Date().toISOString();
    let partial;
    try {
      partial = await mod.verify({ ...ctx, start_time: start });
    } catch (err) {
      partial = {
        pipeline: mod.meta.name,
        status: STATUS.FRAMEWORK_INVALID,
        positive_controls: [],
        negative_controls: [],
        warnings: [],
        failures: [{ code: "THROWN", message: String(err?.message ?? err) }],
        evidence_files: [],
      };
    }
    const record = finalize({ ...partial, start_time: start }, { ...ctx, start_time: start });
    assertKnown(record.status);
    const path = writeArtifact(root, record);
    const blocking = isBlocking(record.status);
    if (blocking) hardFailures += 1;
    summary.push({ pipeline: record.pipeline, gate: mod.meta.gate, status: record.status, blocking, artifact: path });
    console.log(`[${blocking ? "✗" : "•"}] ${record.pipeline.padEnd(28)} ${record.status.padEnd(20)} → ${path}`);
  }

  console.log("");
  console.log(`Runner complete. ${summary.length} pipelines, ${hardFailures} blocking.`);
  console.log("Note: pipelines are stubs until each is wired. FRAMEWORK_INVALID is expected on first run.");
  console.log("");
  console.log("⚠ Evidence has been generated but the release is NOT certified.");
  console.log("  Run `npm run evidence:certify` or `npm run evidence:release` to produce a certification.");

  // Exit 0 for stub runs so `npm run build` style checks succeed. Real gate
  // evaluation happens in tests/evidence/eval-gate.mjs.
  process.exit(0);

}

main().catch((err) => {
  console.error("Runner crashed:", err);
  process.exit(2);
});
