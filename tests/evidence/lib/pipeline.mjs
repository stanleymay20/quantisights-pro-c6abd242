// tests/evidence/lib/pipeline.mjs
// Base helper every pipeline module uses. A pipeline exports:
//   export const meta = { name, gate }
//   export async function verify(ctx) { return partial evidence record }
// The runner wraps verify() with timing, env capture, and taxonomy validation.

import { STATUS, assertKnown } from "./taxonomy.mjs";

export function stubResult(pipeline, reason = "not_implemented") {
  return {
    pipeline,
    status: STATUS.FRAMEWORK_INVALID,
    positive_controls: [],
    negative_controls: [],
    warnings: [
      { code: "STUB", message: `Pipeline "${pipeline}" verification is stubbed (${reason}). Framework only — no live execution performed.` },
    ],
    failures: [],
    evidence_files: [],
  };
}

export function finalize(partial, ctx) {
  const record = {
    ...partial,
    start_time: ctx.start_time,
    end_time: new Date().toISOString(),
    commit_sha: ctx.commit_sha,
    environment: ctx.environment,
    actor: ctx.actor,
    organization: ctx.organization,
  };
  assertKnown(record.status);
  return record;
}
