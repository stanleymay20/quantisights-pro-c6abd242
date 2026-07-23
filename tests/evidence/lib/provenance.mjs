// tests/evidence/lib/provenance.mjs
// Certification engine version + release provenance envelope.
// Bump CERTIFICATION_ENGINE_VERSION any time scoring math or gate weights change.

export const CERTIFICATION_ENGINE_VERSION = "1.0.0";

export function collectProvenance({
  release = null,
  commit = null,
  branch = null,
  repository = null,
  environment = null,
  generated_by = null,
  run_id = null,
  timestamp = null,
} = {}) {
  return {
    run_id,
    release: release ?? process.env.EVIDENCE_RELEASE ?? null,
    commit: commit ?? process.env.EVIDENCE_COMMIT ?? process.env.GITHUB_SHA ?? null,
    branch:
      branch ??
      process.env.EVIDENCE_BRANCH ??
      process.env.GITHUB_REF_NAME ??
      null,
    repository:
      repository ??
      process.env.EVIDENCE_REPOSITORY ??
      process.env.GITHUB_REPOSITORY ??
      null,
    environment: environment ?? process.env.EVIDENCE_ENV ?? null,
    generated_by:
      generated_by ??
      process.env.EVIDENCE_ACTOR ??
      process.env.GITHUB_ACTOR ??
      process.env.USER ??
      "local",
    certification_engine_version: CERTIFICATION_ENGINE_VERSION,
    timestamp,
  };
}
