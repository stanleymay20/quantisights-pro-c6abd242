// tests/evidence/pipelines/lib/decision-controls.mjs
// EE-3 — Canonical control registry for the Decision Lifecycle evidence
// pipeline. Contract between the execution adapters (decision workflow
// harness, audit trail harness, report generator, concurrent-browser harness)
// and the certification engine.
//
// Fields mirror lib/authz-controls.mjs:
//   control_id            stable identifier (used as JSON key)
//   control_name          human label rendered in reports
//   category              creation | evidence | ai | review | approval |
//                         audit | metadata | outcome | reporting | search |
//                         immutability
//   phase                 create | recommend | review | decide | record |
//                         report | protect  (lifecycle stage)
//   coverage              short description of what is exercised
//   expected_outcome      what a PASS observation looks like
//   failure_condition     what turns the observation into a failure
//   failure_code          taxonomy failure code recorded on the artifact
//   blocking              "critical" (blocks release) | "warning" (non-blocking)
//   severity              "security_failure" | "critical_failure"
//                         critical_failure → STATUS.CRITICAL_FAILURE (tamper /
//                         immutability breach; blocks release with the
//                         strongest classification).
//                         security_failure → STATUS.SECURITY_FAILURE.
//   recommendation        remediation guidance surfaced on the certification report

export const DECISION_CONTROLS = Object.freeze([
  // ---------- Creation ----------------------------------------------------
  {
    control_id: "DEC-001",
    control_name: "Decision created",
    category: "creation",
    phase: "create",
    coverage: "Authenticated user inserts a decision_ledger row",
    expected_outcome: "201/200 with decision_id and organization_id echoed",
    failure_condition: "Non-2xx or missing decision_id in response",
    failure_code: "DECISION_CREATE_FAILURE",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Verify decision insert path, RLS INSERT policy, and org scoping.",
  },
  {
    control_id: "DEC-002",
    control_name: "Required fields validated",
    category: "creation",
    phase: "create",
    coverage: "Insert without required fields (title/status) is rejected",
    expected_outcome: "4xx with validation error; row not created",
    failure_condition: "Row accepted or 5xx without validation surface",
    failure_code: "DECISION_VALIDATION_FAILURE",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Enforce NOT NULL + CHECK constraints on decision_ledger and surface validation.",
  },
  {
    control_id: "DEC-003",
    control_name: "Decision assigned organization",
    category: "creation",
    phase: "create",
    coverage: "Persisted row carries organization_id = actor's active org",
    expected_outcome: "SELECT after insert shows organization_id match",
    failure_condition: "organization_id null or mismatched",
    failure_code: "DECISION_ORG_ASSIGNMENT_FAILURE",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "useActiveDataContext must set organization_id on every decision insert.",
  },
  {
    control_id: "DEC-004",
    control_name: "Decision assigned owner",
    category: "creation",
    phase: "create",
    coverage: "Persisted row carries created_by / owner = actor user_id",
    expected_outcome: "SELECT after insert shows owner match",
    failure_condition: "owner null or mismatched",
    failure_code: "DECISION_OWNER_ASSIGNMENT_FAILURE",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Set created_by = auth.uid() via default or trigger.",
  },
  {
    control_id: "DEC-005",
    control_name: "Initial status correct",
    category: "creation",
    phase: "create",
    coverage: "New decision status starts at documented initial state",
    expected_outcome: "status ∈ {'pending','draft'} per lifecycle contract",
    failure_condition: "Status is 'approved' or unknown on create",
    failure_code: "DECISION_INITIAL_STATUS_FAILURE",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Do not permit client-set 'approved' on insert; enforce initial status.",
  },

  // ---------- Evidence / AI / Review --------------------------------------
  {
    control_id: "DEC-006",
    control_name: "Evidence attached",
    category: "evidence",
    phase: "create",
    coverage: "evidence_sources JSONB contains at least one attachment",
    expected_outcome: "SELECT shows non-empty evidence_sources array",
    failure_condition: "evidence_sources empty or null after attach flow",
    failure_code: "DECISION_EVIDENCE_MISSING",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "enrich-decision-context / attach flow must write to evidence_sources.",
  },
  {
    control_id: "DEC-007",
    control_name: "AI recommendation generated",
    category: "ai",
    phase: "recommend",
    coverage: "prescriptive-advisory produces a recommendation record",
    expected_outcome: "recommendation payload present with confidence and rationale",
    failure_condition: "No recommendation, missing confidence, or LLM-only prose",
    failure_code: "DECISION_RECOMMENDATION_MISSING",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "prescriptive-advisory must emit deterministic recommendation with confidence.",
  },
  {
    control_id: "DEC-008",
    control_name: "Human review performed",
    category: "review",
    phase: "review",
    coverage: "A reviewer records a review action before approval",
    expected_outcome: "review row exists linking reviewer_id → decision_id",
    failure_condition: "Approval reached without a recorded review event",
    failure_code: "DECISION_HUMAN_REVIEW_MISSING",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Require reviewer step before approval transition.",
  },

  // ---------- Approval / Rejection ----------------------------------------
  {
    control_id: "DEC-009",
    control_name: "Approval recorded",
    category: "approval",
    phase: "decide",
    coverage: "Approve action transitions status pending→approved",
    expected_outcome: "Updated row status='approved' with approver_id",
    failure_condition: "Status unchanged or approver_id missing",
    failure_code: "DECISION_APPROVAL_FAILURE",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Approval RPC must write approver_id, timestamp, and update status atomically.",
  },
  {
    control_id: "DEC-010",
    control_name: "Rejection recorded",
    category: "approval",
    phase: "decide",
    coverage: "Reject action transitions status pending→rejected",
    expected_outcome: "Updated row status='rejected' with rejecter_id and reason",
    failure_condition: "Status unchanged, reason missing, or rejecter_id missing",
    failure_code: "DECISION_REJECTION_FAILURE",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Rejection RPC must persist rejecter_id, reason, and timestamp.",
  },
  {
    control_id: "DEC-011",
    control_name: "Approval history immutable",
    category: "immutability",
    phase: "protect",
    coverage: "Attempt to UPDATE/DELETE approval_history is denied",
    expected_outcome: "42501 / 403 / 401 on UPDATE and DELETE",
    failure_condition: "Any 2xx on tamper attempt against approval history",
    failure_code: "DECISION_APPROVAL_HISTORY_TAMPER",
    blocking: "critical",
    severity: "critical_failure",
    recommendation: "approval_history must be append-only via RLS DENY UPDATE/DELETE.",
  },
  {
    control_id: "DEC-012",
    control_name: "Status transition valid",
    category: "approval",
    phase: "decide",
    coverage: "Invalid transitions (e.g. approved→pending) are rejected",
    expected_outcome: "State-machine trigger rejects out-of-graph transitions",
    failure_condition: "Backward or illegal transition accepted",
    failure_code: "DECISION_INVALID_TRANSITION",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Encode allowed state graph in BEFORE UPDATE trigger.",
  },

  // ---------- Audit / Timeline / Metadata ---------------------------------
  {
    control_id: "DEC-013",
    control_name: "Audit trail generated",
    category: "audit",
    phase: "record",
    coverage: "Every lifecycle transition writes an audit_log row",
    expected_outcome: "audit_log contains rows for create, review, decide",
    failure_condition: "One or more transitions missing audit entry",
    failure_code: "DECISION_AUDIT_MISSING",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "AFTER INSERT/UPDATE trigger writes audit_log rows scoped to organization_id.",
  },
  {
    control_id: "DEC-014",
    control_name: "Timeline generated",
    category: "audit",
    phase: "record",
    coverage: "Decision timeline API returns ordered lifecycle events",
    expected_outcome: "Timeline includes create → review → decide events in order",
    failure_condition: "Empty timeline or out-of-order events",
    failure_code: "DECISION_TIMELINE_FAILURE",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Timeline view/RPC must join audit_log by decision_id ordered by ts.",
  },
  {
    control_id: "DEC-015",
    control_name: "Confidence stored",
    category: "metadata",
    phase: "record",
    coverage: "Decision row persists confidence value from recommendation",
    expected_outcome: "confidence in [0, 0.85] present on approved decision",
    failure_condition: "Missing confidence or value > 0.85 cap",
    failure_code: "DECISION_CONFIDENCE_MISSING",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Store confidence with adaptive-confidence cap at 0.85.",
  },
  {
    control_id: "DEC-016",
    control_name: "Recommendation explanation stored",
    category: "metadata",
    phase: "record",
    coverage: "Explanation JSON persisted with anchored stats",
    expected_outcome: "explanation contains label:value pairs and stat anchors",
    failure_condition: "Explanation missing or contains conversational prose only",
    failure_code: "DECISION_EXPLANATION_MISSING",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Explanation must follow Canonical Insight Object schema (Label: value + stats).",
  },
  {
    control_id: "DEC-017",
    control_name: "Risk assessment stored",
    category: "metadata",
    phase: "record",
    coverage: "risk_score persisted on decision row",
    expected_outcome: "risk_score numeric present after recommendation",
    failure_condition: "risk_score null when recommendation exists",
    failure_code: "DECISION_RISK_MISSING",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Populate risk_score from Cost-of-Delay / risk engine.",
  },
  {
    control_id: "DEC-018",
    control_name: "Governance metadata stored",
    category: "metadata",
    phase: "record",
    coverage: "governance_profile_id + context_pack persisted on decision",
    expected_outcome: "Governance context echoed on decision row",
    failure_condition: "Missing governance profile or unresolved context",
    failure_code: "DECISION_GOVERNANCE_MISSING",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Contextual Governance Engine must stamp governance_profile_id on decision.",
  },

  // ---------- Outcome ------------------------------------------------------
  {
    control_id: "DEC-019",
    control_name: "Decision outcome recorded",
    category: "outcome",
    phase: "record",
    coverage: "Outcome (observed result) can be attached to approved decision",
    expected_outcome: "outcome row/field present and joined to decision_id",
    failure_condition: "Outcome cannot be recorded or fails to persist",
    failure_code: "DECISION_OUTCOME_MISSING",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Ensure outcome insert path exists and is RLS-scoped by organization_id.",
  },
  {
    control_id: "DEC-020",
    control_name: "Outcome immutable",
    category: "immutability",
    phase: "protect",
    coverage: "Attempt to overwrite outcome after recording is denied",
    expected_outcome: "UPDATE on locked outcome returns 42501 / 403",
    failure_condition: "Outcome overwrite accepted (2xx)",
    failure_code: "DECISION_OUTCOME_TAMPER",
    blocking: "critical",
    severity: "critical_failure",
    recommendation: "Once outcome is recorded, RLS/trigger must DENY UPDATE.",
  },

  // ---------- Reporting / Search ------------------------------------------
  {
    control_id: "DEC-021",
    control_name: "Report generation available",
    category: "reporting",
    phase: "report",
    coverage: "Report generator produces PDF/HTML for the decision",
    expected_outcome: "gen-report edge fn returns 2xx with artifact reference",
    failure_condition: "Report edge fn fails or returns empty artifact",
    failure_code: "DECISION_REPORT_FAILURE",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "gen_pptx / report edge fn must succeed with a downloadable artifact.",
  },
  {
    control_id: "DEC-022",
    control_name: "Export available",
    category: "reporting",
    phase: "report",
    coverage: "Decision + evidence exportable (CSV/JSON) for same-org user",
    expected_outcome: "Export endpoint 2xx with row(s) matching decision_id",
    failure_condition: "Export path missing or returns no rows for owner",
    failure_code: "DECISION_EXPORT_FAILURE",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Expose export endpoint scoped by organization_id + decision_id.",
  },
  {
    control_id: "DEC-023",
    control_name: "Decision searchable",
    category: "search",
    phase: "report",
    coverage: "Search API returns the decision by title / id for owner",
    expected_outcome: "Search hit contains decision_id and organization_id",
    failure_condition: "Search returns no hit for own-org decision",
    failure_code: "DECISION_SEARCH_FAILURE",
    blocking: "critical",
    severity: "security_failure",
    recommendation: "Index title + evidence tokens; scope search RPC by organization_id.",
  },

  // ---------- Protection --------------------------------------------------
  {
    control_id: "DEC-024",
    control_name: "Decision restoration blocked",
    category: "immutability",
    phase: "protect",
    coverage: "Restoring a deleted / archived decision is denied",
    expected_outcome: "Restore path returns 403 / not-permitted for authenticated user",
    failure_condition: "Restore accepted (2xx) — historical record mutation",
    failure_code: "DECISION_RESTORE_ALLOWED",
    blocking: "critical",
    severity: "critical_failure",
    recommendation: "No restore endpoint should exist; if soft-delete only, deny undelete.",
  },
  {
    control_id: "DEC-025",
    control_name: "Delete protection enforced",
    category: "immutability",
    phase: "protect",
    coverage: "DELETE on decision_ledger is denied for all client roles",
    expected_outcome: "DELETE returns 42501 / 403 / 401",
    failure_condition: "DELETE succeeds (2xx / 204)",
    failure_code: "DECISION_DELETE_ALLOWED",
    blocking: "critical",
    severity: "critical_failure",
    recommendation: "RLS must DENY DELETE on decision_ledger for anon/authenticated.",
  },
]);

export const DECISION_CONTROL_INDEX = Object.freeze(
  Object.fromEntries(DECISION_CONTROLS.map((c) => [c.control_id, c])),
);

export const DECISION_REQUIRED_CONTROL_IDS = Object.freeze(
  DECISION_CONTROLS.map((c) => c.control_id),
);

/**
 * Controls that assert an immutability / tamper-resistance guarantee.
 * A FAIL on these projects to STATUS.CRITICAL_FAILURE.
 */
export const DECISION_IMMUTABILITY_CONTROLS = Object.freeze(
  DECISION_CONTROLS.filter((c) => c.severity === "critical_failure").map((c) => c.control_id),
);
