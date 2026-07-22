// tests/evidence/pipelines/lib/evidence-audit-controls.mjs
// EE-4 control registry for Evidence & Audit Trail evidence.

export const EVIDENCE_AUDIT_CONTROLS = Object.freeze([
  {
    control_id: "EVD-001",
    title: "Evidence attachment is linked to a decision and organization",
    pipeline: "evidence-attachment",
    type: "positive",
    severity: "security_failure",
    failure_code: "EVIDENCE_ATTACHMENT_FAILURE",
    recommendation: "Fix evidence insert/link validation before certification.",
  },
  {
    control_id: "EVD-002",
    title: "Evidence retrieval is scoped and returns the expected attached evidence",
    pipeline: "evidence-retrieval",
    type: "positive",
    severity: "security_failure",
    failure_code: "EVIDENCE_RETRIEVAL_FAILURE",
    recommendation: "Fix retrieval scope or data binding before certification.",
  },
  {
    control_id: "EVD-003",
    title: "Evidence chain integrity is preserved",
    pipeline: "evidence-attachment",
    type: "positive",
    severity: "critical_failure",
    failure_code: "EVIDENCE_CHAIN_BROKEN",
    recommendation: "Repair evidence chain hash/sequence guarantees before release.",
  },
  {
    control_id: "EVD-004",
    title: "Citations survive storage and retrieval without mutation",
    pipeline: "evidence-retrieval",
    type: "positive",
    severity: "security_failure",
    failure_code: "CITATION_PRESERVATION_FAILURE",
    recommendation: "Fix citation serialization and retrieval before certification.",
  },
  {
    control_id: "EVD-005",
    title: "Evidence mutations create audit records",
    pipeline: "audit-trail",
    type: "positive",
    severity: "security_failure",
    failure_code: "AUDIT_RECORD_MISSING",
    recommendation: "Ensure evidence mutations append audit_log records.",
  },
  {
    control_id: "EVD-006",
    title: "Audit records are immutable",
    pipeline: "audit-trail",
    type: "negative",
    severity: "critical_failure",
    failure_code: "AUDIT_IMMUTABILITY_BROKEN",
    recommendation: "Block audit update/delete paths before release.",
  },
  {
    control_id: "EVD-007",
    title: "Audit timeline ordering is monotonic and replayable",
    pipeline: "audit-trail",
    type: "positive",
    severity: "security_failure",
    failure_code: "AUDIT_TIMELINE_ORDER_BROKEN",
    recommendation: "Fix audit ordering/timestamp sequencing before certification.",
  },
  {
    control_id: "EVD-008",
    title: "Evidence export is available and contains evidence metadata",
    pipeline: "evidence-export",
    type: "positive",
    severity: "security_failure",
    failure_code: "EVIDENCE_EXPORT_UNAVAILABLE",
    recommendation: "Fix evidence export availability before certification.",
  },
  {
    control_id: "EVD-009",
    title: "Evidence and audit tamper attempts are denied",
    pipeline: "audit-trail",
    type: "negative",
    severity: "critical_failure",
    failure_code: "EVIDENCE_TAMPER_ALLOWED",
    recommendation: "Block evidence/audit tamper attempts before release.",
  },
  {
    control_id: "EVD-010",
    title: "Missing evidence is detected and surfaced",
    pipeline: "evidence-retrieval",
    type: "negative",
    severity: "security_failure",
    failure_code: "MISSING_EVIDENCE_NOT_DETECTED",
    recommendation: "Fail closed when referenced evidence is missing.",
  },
]);

export const EVIDENCE_AUDIT_CONTROL_INDEX = Object.freeze(
  Object.fromEntries(EVIDENCE_AUDIT_CONTROLS.map((control) => [control.control_id, control])),
);

export const PIPELINE_CONTROL_IDS = Object.freeze({
  "evidence-attachment": Object.freeze(["EVD-001", "EVD-003"]),
  "evidence-retrieval": Object.freeze(["EVD-002", "EVD-004", "EVD-010"]),
  "evidence-export": Object.freeze(["EVD-008"]),
  "audit-trail": Object.freeze(["EVD-005", "EVD-006", "EVD-007", "EVD-009"]),
});

export const EVIDENCE_AUDIT_REQUIRED_CONTROL_IDS = Object.freeze(
  EVIDENCE_AUDIT_CONTROLS.map((control) => control.control_id),
);
