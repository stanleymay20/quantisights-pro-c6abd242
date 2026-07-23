// tests/evidence/pipelines/confidence-scoring.mjs
// EE-5 Confidence Scoring — mocked-evidence-consuming pipeline.
import { buildPipelineEvidence, verifyPipeline } from "./lib/ai-pipeline.mjs";

export const meta = {
  name: "confidence-scoring",
  gate: "AI pipeline",
};

export function buildEvidence(adapterResults) {
  return buildPipelineEvidence(meta.name, adapterResults);
}

export async function verify(_ctx) {
  return verifyPipeline(meta.name);
}
