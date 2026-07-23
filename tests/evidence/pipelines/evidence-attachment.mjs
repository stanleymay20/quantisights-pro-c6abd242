// tests/evidence/pipelines/evidence-attachment.mjs
// EE-4 Evidence Attachment — evidence-consuming pipeline.
import { buildPipelineEvidence, verifyPipeline } from "./lib/evidence-audit-pipeline.mjs";

export const meta = {
  name: "evidence-attachment",
  gate: "Evidence pipeline",
};

export function buildEvidence(adapterResults) {
  return buildPipelineEvidence(meta.name, adapterResults);
}

export async function verify(_ctx) {
  return verifyPipeline(meta.name);
}
