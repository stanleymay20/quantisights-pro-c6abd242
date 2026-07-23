// tests/evidence/pipelines/rollback.mjs
// Enterprise Evidence pipeline stub — framework only. No live execution.
// Fill `verify()` with the actual assertions when this pipeline is wired.
import { stubResult } from "../lib/pipeline.mjs";

export const meta = {
  name: "rollback",
  gate: "Recovery",
};

export async function verify(_ctx) {
  return stubResult(meta.name, "awaiting_implementation");
}
