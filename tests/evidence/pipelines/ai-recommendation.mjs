// tests/evidence/pipelines/ai-recommendation.mjs
// EE-5 AI Recommendation — mocked-evidence-consuming pipeline.
import { buildPipelineEvidence, verifyPipeline } from "./lib/ai-pipeline.mjs";

export const meta = {
  name: "ai-recommendation",
  gate: "AI pipeline",
};

export function buildEvidence(adapterResults) {
  return buildPipelineEvidence(meta.name, adapterResults);
}

export async function verify(_ctx) {
  return verifyPipeline(meta.name);
}
