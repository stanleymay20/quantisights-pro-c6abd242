import type { ReviewableDecision } from "@/components/decisions/executive-review-flow";

/**
 * EP-1 — Enterprise Decision Evidence Pack types.
 *
 * The Evidence Pack is a presentation/export layer only. It packages
 * information that already exists on a decision_ledger row (and, where
 * supplied, its audit_log entries) into one deterministic, auditor-facing
 * artifact. It never calls a model, a runtime, or a queue, and it never
 * invents a value that isn't already present on the source record.
 */

// v2 adds the measured_outcome section (EP-2).
export const EVIDENCE_PACK_SCHEMA_VERSION = "quantivis.evidence-pack.v2";
export const EXTERNAL_AI_EVIDENCE_PACK_SCHEMA_VERSION = "quantivis.external-ai-evidence-pack.v1";

export type EvidencePackSectionStatus = "complete" | "partial" | "unavailable" | "not_applicable";

export interface EvidencePackSection {
  status: EvidencePackSectionStatus;
  title: string;
  summary: string;
  source: string;
  generated_from: string[];
  data: Record<string, unknown>;
}

export type EvidencePackTimelineStepStatus = "recorded" | "pending" | "not_recorded";

export interface EvidencePackTimelineStep {
  key: string;
  label: string;
  status: EvidencePackTimelineStepStatus;
  timestamp: string | null;
  detail: string;
  source: string;
}

export interface EvidencePackAuditEntry {
  action_type: string;
  actor_id: string | null;
  occurred_at: string;
  payload: Record<string, unknown> | null;
}

export interface EvidencePackGovernanceItem {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export const EVIDENCE_PACK_SECTION_KEYS = [
  "decision_summary",
  "business_context",
  "decision_recommendation",
  "confidence",
  "risk_assessment",
  "business_impact",
  "evidence_summary",
  "verified_facts",
  "supporting_signals",
  "contradictions",
  "alternatives_considered",
  "governance_checklist",
  "approval_information",
  "audit_trail",
  "runtime_metadata",
  "gateway_metadata",
  "decision_timeline",
  "outcome_prediction",
  "measured_outcome",
  "hashes",
  "digital_signature",
] as const;

export type EvidencePackSectionKey = (typeof EVIDENCE_PACK_SECTION_KEYS)[number];
export type EvidencePackSections = Record<EvidencePackSectionKey, EvidencePackSection>;

export interface EvidencePack {
  schema_version: typeof EVIDENCE_PACK_SCHEMA_VERSION;
  decision_id: string;
  organization_id: string | null;
  generated_at: string;
  is_simulation: boolean;
  sections: EvidencePackSections;
  evidence_pack_hash: string;
}

export interface EvidencePackDecisionInput extends ReviewableDecision {
  linked_aicis_prediction_id?: string | null;
  linked_aicis_recommendation_id?: string | null;
  prediction_accuracy_score?: number | null;
  calibration_error?: number | null;
  decision_simulation_id?: string | null;
}

/**
 * Immutable external-AI producer evidence linked to a decision_ledger row.
 * Credential material is deliberately excluded from the export shape.
 */
export interface EvidencePackExternalAIEvidenceInput {
  id: string;
  ai_system_id: string;
  system_name: string;
  provider: string;
  system_identifier: string;
  model_version: string | null;
  deployment_environment: string;
  external_event_id: string;
  occurred_at: string;
  ingested_at: string;
  input_hash: string;
  output_hash: string;
  decision_descriptor: Record<string, unknown>;
  confidence: number | null;
  human_oversight_state: string | null;
  metadata: Record<string, unknown>;
  provenance: Record<string, unknown>;
  payload_hash: string;
  protocol_version: string;
}

/**
 * Compatibility-preserving external-AI envelope. It contains the complete
 * existing Evidence Pack plus one immutable producer-provenance section. The
 * envelope hash covers the base pack hash and that new section, so existing
 * EP-1/EP-2 consumers remain byte-compatible while external-AI exports gain a
 * stronger chain of custody.
 */
export interface ExternalAIEvidencePack {
  schema_version: typeof EXTERNAL_AI_EVIDENCE_PACK_SCHEMA_VERSION;
  base_schema_version: typeof EVIDENCE_PACK_SCHEMA_VERSION;
  decision_id: string;
  organization_id: string | null;
  generated_at: string;
  is_simulation: boolean;
  base_pack: EvidencePack;
  external_ai_provenance: EvidencePackSection;
  evidence_pack_hash: string;
}

export interface EvidencePackOutcomeInput {
  id: string;
  expected_metric: string;
  expected_direction: string;
  expected_change: number | null;
  evaluation_window_days: number;
  outcome_status: string;
  observed_value_before: number | null;
  observed_value_after: number | null;
  accuracy_score: number | null;
  evaluation_date: string | null;
  evidence_regime: string | null;
  calibration_eligible: boolean | null;
  eligibility_reason: string | null;
  notes: string | null;
  created_at: string;
}

export interface BuildEvidencePackOptions {
  now?: () => string;
  auditEntries?: EvidencePackAuditEntry[];
  isSimulation?: boolean;
  outcomes?: EvidencePackOutcomeInput[];
  outcomesReadFailed?: boolean;
}

export type EvidencePackPdfBlock =
  | { type: "heading"; level: 1 | 2; text: string }
  | { type: "status_line"; status: EvidencePackSectionStatus; text: string }
  | { type: "paragraph"; text: string }
  | { type: "key_values"; items: Array<{ label: string; value: string }> }
  | { type: "list"; items: string[] }
  | { type: "timeline"; steps: EvidencePackTimelineStep[] };

export interface EvidencePackPdfReadyModel {
  schema_version: typeof EVIDENCE_PACK_SCHEMA_VERSION;
  decision_id: string;
  evidence_pack_hash: string;
  blocks: EvidencePackPdfBlock[];
}
