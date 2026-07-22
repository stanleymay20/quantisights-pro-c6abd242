// tests/evidence/pipelines/evidence-retrieval.mjs
// EE-4 Evidence Retrieval — evidence-consuming pipeline.
import { buildPipelineEvidence, verifyPipeline } from "./lib/evidence-audit-pipeline.mjs";

export const meta = {
  name: "evidence-retrieval",
  gate: "Evidence pipeline",
};

export function buildEvidence(adapterResults) {
  return buildPipelineEvidence(meta.name, adapterResults);
}

export async function verify(_ctx) {
  return verifyPipeline(meta.name);
}
