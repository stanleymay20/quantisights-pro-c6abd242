import type { ReviewableDecision } from "@/components/decisions/executive-review-flow";

/**
 * Enterprise Decision Evidence Pack types.
 *
 * The Evidence Pack is a presentation/export layer only. It packages
 * information that already exists on persisted Quantivis records into one
 * deterministic, auditor-facing artifact. It never calls a model, a runtime,
 * or a queue, and it never invents a value that is not present on a source
 * record.
 */

// v2 added measured_outcome. v3 adds immutable external-AI producer provenance.
export const EVIDENCE_PACK_SCHEMA_VERSION = "quantivis.evidence-pack.v3";

/**
 * "complete"      — the section is fully backed by data on the decision.
 * "partial"       — some but not all expected data is present.
 * "unavailable"   — the underlying data does not exist on this decision.
 * "not_applicable"— the section does not apply to this decision/state.
 */
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
  "external_ai_provenance",
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
  /** True for demo/unpersisted decisions — the pack is a simulation, not an audit artifact. */
  is_simulation: boolean;
  sections: EvidencePackSections;
  /** Deterministic hash over every section except "hashes" and "digital_signature". */
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
 * This shape intentionally excludes credential material. It is safe to render
 * to an auditor-facing evidence pack.
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
  /** Injectable clock for deterministic tests; defaults to the wall clock. */
  now?: () => string;
  /** Pre-fetched audit_log rows for this decision (resource_type = "decision"). */
  auditEntries?: EvidencePackAuditEntry[];
  /** Overrides the simulation flag; defaults to decision_origin === "demo". */
  isSimulation?: boolean;
  /** Pre-fetched decision_outcomes rows for this decision. */
  outcomes?: EvidencePackOutcomeInput[];
  outcomesReadFailed?: boolean;
  /** Pre-fetched immutable producer evidence when decision_type = external_ai. */
  externalAIEvidence?: EvidencePackExternalAIEvidenceInput | null;
  /** True when the linked evidence row could not be read. */
  externalAIEvidenceReadFailed?: boolean;
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
