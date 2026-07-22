// tests/evidence/lib/artifact.mjs
// Writes a single pipeline evidence artifact to
// audit-artifacts/<YYYY-MM-DD>/<pipeline>/evidence.json.
// The runner never mutates a pipeline's own verification result — it only
// records what the pipeline reports.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertKnown } from "./taxonomy.mjs";

const REQUIRED_FIELDS = [
  "pipeline",
  "start_time",
  "end_time",
  "commit_sha",
  "environment",
  "actor",
  "organization",
  "status",
  "positive_controls",
  "negative_controls",
  "warnings",
  "failures",
  "evidence_files",
];

export function validate(record) {
  const missing = REQUIRED_FIELDS.filter((k) => !(k in record));
  if (missing.length) {
    throw new Error(`FRAMEWORK_INVALID: evidence missing fields ${missing.join(", ")}`);
  }
  assertKnown(record.status);
  return record;
}

export function writeArtifact(root, record) {
  validate(record);
  const dir = join(root, record.pipeline);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "evidence.json");
  writeFileSync(path, JSON.stringify(record, null, 2));
  return path;
}

export function todayRoot(base = "audit-artifacts") {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(base, day);
  mkdirSync(dir, { recursive: true });
  return dir;
}
