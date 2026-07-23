// tests/evidence/pipelines/ai-explanation.mjs
// EE-5 AI Explanation — mocked-evidence-consuming pipeline.
import { buildPipelineEvidence, verifyPipeline } from "./lib/ai-pipeline.mjs";

export const meta = {
  name: "ai-explanation",
  gate: "AI pipeline",
};

export function buildEvidence(adapterResults) {
  return buildPipelineEvidence(meta.name, adapterResults);
}

export async function verify(_ctx) {
  return verifyPipeline(meta.name);
}
