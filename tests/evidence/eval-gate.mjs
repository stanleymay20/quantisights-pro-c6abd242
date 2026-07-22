#!/usr/bin/env node
// tests/evidence/eval-gate.mjs
// The Quantivis Enterprise Certification Engine.
//
// Reads evidence artifacts from audit-artifacts/<YYYY-MM-DD>/<pipeline>/
// and writes one certification per run into:
//
//   audit-artifacts/<YYYY-MM-DD>/certifications/<run_id>/
//     CERTIFICATION.json
//     CERTIFICATION.md
//     EXECUTIVE_SUMMARY.md
//
// Plus an appended history entry in audit-artifacts/history.json.

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  openSync,
  closeSync,
  fsyncSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateDay, deterministicView } from "./lib/certification.mjs";
import {
  renderCertificationReport,
  renderExecutiveSummary,
} from "./lib/report.mjs";
import { generateRunId } from "./lib/run-id.mjs";
import { appendHistory } from "./lib/history.mjs";
import {
  CERTIFICATION_ENGINE_VERSION,
  collectProvenance,
} from "./lib/provenance.mjs";
import { STATUS } from "./lib/taxonomy.mjs";

const ALLOWED_ENVIRONMENTS = new Set(["staging", "preview"]);

function parseArgs(argv = process.argv.slice(2)) {
  const out = { force: false, flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") { out.force = true; continue; }
    if (a.startsWith("--")) {
      const [k, ...rest] = a.slice(2).split("=");
      const v = rest.length ? rest.join("=") : argv[++i];
      out.flags[k] = v;
    }
  }
  return out;
}

function argOrEnv(flags, name, envName, fallback) {
  return flags[name] ?? process.env[envName] ?? fallback;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function invalidEnvCertification(provenance) {
  return {
    certification_engine_version: CERTIFICATION_ENGINE_VERSION,
    ...provenance,
    duration_ms: 0,
    overall_status: "CRITICAL_BLOCK",
    recommendation: "CRITICAL_BLOCK",
    score: 0,
    score_breakdown: [],
    pipelines_passed: 0,
    pipelines_failed: 0,
    warnings_total: 0,
    critical_issues: 1,
    pipeline_results: [],
    blocking_items: [
      {
        gate: "framework",
        pipeline: "guard",
        status: STATUS.SECURITY_FAILURE,
        reason: `environment "${provenance.environment}" not on allow-list (staging|preview)`,
      },
    ],
    warnings: [],
  };
}

function missingEvidenceCertification(provenance, dayRoot) {
  return {
    certification_engine_version: CERTIFICATION_ENGINE_VERSION,
    ...provenance,
    duration_ms: 0,
    overall_status: "CRITICAL_BLOCK",
    recommendation: "CRITICAL_BLOCK",
    score: 0,
    score_breakdown: [],
    pipelines_passed: 0,
    pipelines_failed: 0,
    warnings_total: 0,
    critical_issues: 1,
    pipeline_results: [],
    blocking_items: [
      {
        gate: "framework",
        pipeline: "runner",
        status: STATUS.FRAMEWORK_INVALID,
        reason: `no evidence directory at ${dayRoot}`,
      },
    ],
    warnings: [],
  };
}

export function getCertification({
  day = today(),
  root = "audit-artifacts",
  release = null,
  commit = null,
  branch = null,
  repository = null,
  environment = null,
  generated_by = null,
  run_id = null,
  timestamp = null,
  duration_ms = null,
  now = null,
} = {}) {
  const runId = run_id ?? generateRunId();
  const ts = timestamp ?? new Date().toISOString();
  const provenance = collectProvenance({
    release,
    commit,
    branch,
    repository,
    environment,
    generated_by,
    run_id: runId,
    timestamp: ts,
  });

  const dayRoot = resolve(root, day);

  if (provenance.environment && !ALLOWED_ENVIRONMENTS.has(provenance.environment)) {
    return invalidEnvCertification(provenance);
  }
  if (!existsSync(dayRoot)) {
    return missingEvidenceCertification(provenance, dayRoot);
  }

  const cert = evaluateDay(dayRoot, {
    ...provenance,
    duration_ms: duration_ms ?? undefined,
    now: now ?? undefined,
  });
  // evaluateDay already stamps engine version + provenance from meta.
  return cert;
}

export function writeCertification({
  root = "audit-artifacts",
  day = today(),
  cert,
  force = false,
} = {}) {
  const dayRoot = resolve(root, day);
  const parent = join(dayRoot, "certifications");
  const certRoot = join(parent, cert.run_id);
  mkdirSync(parent, { recursive: true });

  let backupPath = null;
  if (existsSync(certRoot)) {
    if (!force) {
      throw new Error(
        `refusing to overwrite existing certification folder: ${certRoot} (pass --force to override — administrative recovery only)`,
      );
    }
    // --force is an administrative recovery operation. Preserve the previous
    // certification folder before we overwrite it. Evidence is never destroyed.
    // Backup name pattern: <run_id>.backup.<timestamp>.<randomHex> — the random
    // suffix removes any theoretical collision on rapid successive --force runs.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rand = randomBytes(4).toString("hex");
    backupPath = `${certRoot}.backup.${stamp}.${rand}`;
    renameSync(certRoot, backupPath);
    console.warn(
      `[cert] WARNING: --force in use. Previous certification preserved at ${backupPath}`,
    );
  }

  // Exclusive create: fails with EEXIST if a concurrent writer beat us here.
  // recursive:false is the default; we spell it out for intent.
  try {
    mkdirSync(certRoot, { recursive: false });
  } catch (err) {
    if (err.code === "EEXIST") {
      throw new Error(
        `concurrent certification writer detected at ${certRoot}; refusing to corrupt evidence`,
      );
    }
    throw err;
  }

  const jsonPath = join(certRoot, "CERTIFICATION.json");
  const mdPath = join(certRoot, "CERTIFICATION.md");
  const execPath = join(certRoot, "EXECUTIVE_SUMMARY.md");
  atomicWriteFile(jsonPath, JSON.stringify(cert, null, 2));
  atomicWriteFile(mdPath, renderCertificationReport(cert));
  atomicWriteFile(execPath, renderExecutiveSummary(cert));
  return { certRoot, jsonPath, mdPath, execPath, backupPath };
}

// Atomic write: temp file + fsync + rename. Prevents partially-written
// certification artifacts if the process crashes mid-write. Rename is
// atomic on POSIX within the same directory.
function atomicWriteFile(finalPath, contents) {
  const rand = randomBytes(4).toString("hex");
  const tmpPath = `${finalPath}.tmp.${process.pid}.${Date.now()}.${rand}`;
  const fd = openSync(tmpPath, "w");
  try {
    writeFileSync(fd, contents);
    try { fsyncSync(fd); } catch { /* fsync unsupported on some FS — best effort */ }
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, finalPath);
}


export function historyEntry(cert) {
  return {
    run_id: cert.run_id,
    date: cert.timestamp,
    release: cert.release,
    commit: cert.commit,
    branch: cert.branch,
    repository: cert.repository,
    environment: cert.environment,
    generated_by: cert.generated_by,
    certification_engine_version: cert.certification_engine_version,
    overall_status: cert.overall_status,
    score: cert.score,
    blocked_gates: cert.pipeline_results
      .filter((g) => g.blocking)
      .map((g) => g.gate),
    warnings: cert.warnings_total,
    duration_ms: cert.duration_ms,
  };
}

// Exported for tests.
export { deterministicView };

async function main() {
  const args = parseArgs();
  const day = argOrEnv(args.flags, "day", "EVIDENCE_DAY", today());
  const root = argOrEnv(args.flags, "root", "EVIDENCE_ROOT", "audit-artifacts");
  const release = argOrEnv(args.flags, "release", "EVIDENCE_RELEASE", null);
  const commit = argOrEnv(args.flags, "commit", "EVIDENCE_COMMIT", null);
  const branch = argOrEnv(args.flags, "branch", "EVIDENCE_BRANCH", null);
  const repository = argOrEnv(args.flags, "repository", "EVIDENCE_REPOSITORY", null);
  const environment = argOrEnv(args.flags, "environment", "EVIDENCE_ENV", null);
  const generated_by = argOrEnv(args.flags, "generated-by", "EVIDENCE_ACTOR", null);
  const run_id_arg = argOrEnv(args.flags, "run-id", "EVIDENCE_RUN_ID", null);

  const cert = getCertification({
    day,
    root,
    release,
    commit,
    branch,
    repository,
    environment,
    generated_by,
    run_id: run_id_arg,
  });

  let paths;
  try {
    paths = writeCertification({ root, day, cert, force: args.force });
  } catch (err) {
    console.error(`[cert] ${err.message}`);
    process.exit(3);
  }

  const historyPath = join(root, "history.json");
  const hist = appendHistory(historyPath, historyEntry(cert));

  const line = `[cert] ${cert.overall_status.padEnd(20)} score=${cert.score} run_id=${cert.run_id} blocking=${cert.blocking_items.length} warnings=${cert.warnings_total}`;
  console.log(line);
  console.log(`  -> ${paths.jsonPath}`);
  console.log(`  -> ${paths.mdPath}`);
  console.log(`  -> ${paths.execPath}`);
  console.log(`  -> ${historyPath} (${hist.count} entries)`);
  if (hist.quarantined) {
    console.warn(`  ! previous history.json was corrupt — quarantined to ${hist.quarantined}`);
  }

  const shipping =
    cert.overall_status === "PASS" || cert.overall_status === "PASS_WITH_WARNINGS";
  process.exit(shipping ? 0 : 1);
}

const isCli =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((err) => {
    console.error("[cert] FATAL", err);
    process.exit(2);
  });
}
