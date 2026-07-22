// tests/evidence/pipelines/audit-trail.mjs
// EE-4 Audit Trail — evidence-consuming pipeline.
import { buildPipelineEvidence, verifyPipeline } from "./lib/evidence-audit-pipeline.mjs";

export const meta = {
  name: "audit-trail",
  gate: "Audit pipeline",
};

export function buildEvidence(adapterResults) {
  return buildPipelineEvidence(meta.name, adapterResults);
}

export async function verify(_ctx) {
  return verifyPipeline(meta.name);
}
