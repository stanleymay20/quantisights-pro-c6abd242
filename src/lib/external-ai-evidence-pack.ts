import { buildEvidencePack, canonicalHash } from "@/lib/evidence-pack";
import {
  EVIDENCE_PACK_SCHEMA_VERSION,
  EXTERNAL_AI_EVIDENCE_PACK_SCHEMA_VERSION,
  type BuildEvidencePackOptions,
  type EvidencePackDecisionInput,
  type EvidencePackExternalAIEvidenceInput,
  type EvidencePackSection,
  type ExternalAIEvidencePack,
} from "@/lib/evidence-pack-types";

export type ExternalAIEvidenceRecord = EvidencePackExternalAIEvidenceInput & {
  organization_id: string;
  decision_ledger_id: string;
};

function producerSummary(evidence: ExternalAIEvidenceRecord): string {
  const version = evidence.model_version ? ` version ${evidence.model_version}` : "";
  return (
    `This decision originated outside Quantivis from ${evidence.provider} ` +
    `${evidence.system_identifier}${version}. Quantivis recorded the producer identity, ` +
    "event time, ingestion time, and SHA-256 integrity references without requiring raw prompt or output content."
  );
}

export function buildExternalAIProvenanceSection(
  evidence: ExternalAIEvidenceRecord,
): EvidencePackSection {
  return {
    status: "complete",
    title: "External AI Provenance",
    summary: producerSummary(evidence),
    source: "external_ai_decision_evidence (append-only)",
    generated_from: [
      "ai_system_id",
      "system_name",
      "provider",
      "system_identifier",
      "model_version",
      "deployment_environment",
      "external_event_id",
      "occurred_at",
      "ingested_at",
      "input_hash",
      "output_hash",
      "payload_hash",
      "protocol_version",
      "decision_descriptor",
      "confidence",
      "human_oversight_state",
      "metadata",
      "provenance",
    ],
    data: {
      evidence_id: evidence.id,
      ai_system_id: evidence.ai_system_id,
      system_name: evidence.system_name,
      provider: evidence.provider,
      system_identifier: evidence.system_identifier,
      model_version: evidence.model_version,
      deployment_environment: evidence.deployment_environment,
      external_event_id: evidence.external_event_id,
      occurred_at: evidence.occurred_at,
      ingested_at: evidence.ingested_at,
      input_hash: evidence.input_hash,
      output_hash: evidence.output_hash,
      payload_hash: evidence.payload_hash,
      protocol_version: evidence.protocol_version,
      decision_descriptor: evidence.decision_descriptor,
      confidence: evidence.confidence,
      human_oversight_state: evidence.human_oversight_state,
      metadata: evidence.metadata,
      provenance: evidence.provenance,
      chain_of_custody_note:
        "Hashes are integrity references to caller-held input/output content. They do not prove the truth or quality of that content by themselves.",
      compliance_note:
        "This evidence may support governance or regulatory obligations; the pack is not a certification of legal compliance.",
    },
  };
}

/**
 * Compose the existing, stable EP-1/EP-2 pack with immutable external producer
 * evidence. The base pack is not mutated; the envelope gets its own SHA-256
 * digest over the base pack hash plus producer provenance.
 */
export async function buildExternalAIEvidencePack(
  decision: EvidencePackDecisionInput,
  evidence: ExternalAIEvidenceRecord,
  options: BuildEvidencePackOptions = {},
): Promise<ExternalAIEvidencePack> {
  if (evidence.decision_ledger_id !== decision.id) {
    throw new Error("EXTERNAL_AI_EVIDENCE_DECISION_MISMATCH");
  }
  if (decision.organization_id && evidence.organization_id !== decision.organization_id) {
    throw new Error("EXTERNAL_AI_EVIDENCE_ORGANIZATION_MISMATCH");
  }

  const basePack = await buildEvidencePack(decision, options);
  const externalAIProvenance = buildExternalAIProvenanceSection(evidence);
  const hashInput = {
    schema_version: EXTERNAL_AI_EVIDENCE_PACK_SCHEMA_VERSION,
    base_schema_version: EVIDENCE_PACK_SCHEMA_VERSION,
    decision_id: decision.id,
    organization_id: decision.organization_id ?? null,
    is_simulation: basePack.is_simulation,
    base_pack_hash: basePack.evidence_pack_hash,
    external_ai_provenance: externalAIProvenance,
  };
  const evidencePackHash = await canonicalHash(hashInput);

  return {
    schema_version: EXTERNAL_AI_EVIDENCE_PACK_SCHEMA_VERSION,
    base_schema_version: EVIDENCE_PACK_SCHEMA_VERSION,
    decision_id: decision.id,
    organization_id: decision.organization_id ?? null,
    generated_at: basePack.generated_at,
    is_simulation: basePack.is_simulation,
    base_pack: basePack,
    external_ai_provenance: externalAIProvenance,
    evidence_pack_hash: evidencePackHash,
  };
}

export function externalAIEvidencePackToJSON(pack: ExternalAIEvidencePack): string {
  return JSON.stringify(pack, null, 2);
}
