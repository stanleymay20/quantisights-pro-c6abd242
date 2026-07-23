// tests/evidence/pipelines/evidence-export.mjs
// EE-4 Evidence Export — evidence-consuming pipeline.
import { buildPipelineEvidence, verifyPipeline } from "./lib/evidence-audit-pipeline.mjs";

export const meta = {
  name: "evidence-export",
  gate: "Evidence pipeline",
};

export function buildEvidence(adapterResults) {
  return buildPipelineEvidence(meta.name, adapterResults);
}

export async function verify(_ctx) {
  return verifyPipeline(meta.name);
}
