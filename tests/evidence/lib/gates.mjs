// tests/evidence/lib/gates.mjs
// Single source of truth for gate composition and scoring weights.
// docs/enterprise/RELEASE_GATE.md and docs/enterprise/EVIDENCE_MATRIX.md
// are validated against this file by tests/evidence/generate-docs.mjs.
// If you change this file, run: npm run evidence:docs:check
//
// Scoring model:
//   - Each gate has an integer weight.
//   - Weights are NOT required to sum to 100.
//   - The Enterprise Readiness Score is normalized to 0-100 as
//     round( earned / TOTAL_WEIGHT * 100 ), where earned is the sum of
//     (weight * factor) over all scoring gates and factor ∈ {0, 0.5, 1}.
//   - Non-scoring gates carry weight 0 (they can still hard-block a release
//     but do not move the score).

export const GATES = Object.freeze([
  {
    key: "authentication",
    label: "Authentication",
    weight: 10,
    pipelines: ["authentication", "mfa", "oauth", "session-recovery"],
  },
  {
    key: "authorization",
    label: "Authorization",
    weight: 10,
    // EE-2: single evidence-consuming pipeline (authorization) supersedes the
    // legacy stubs (protected-routes, user-management, organization-management,
    // settings). The authorization pipeline consumes the tenant-isolation
    // harness, the concurrent browser harness, and route probes via the
    // authz-adapter. The legacy stub pipelines are retired to avoid
    // double-counting the same authz controls across multiple pipelines.
    pipelines: ["authorization"],
  },
  {
    key: "tenant_isolation",
    label: "Tenant Isolation",
    weight: 15,
    pipelines: ["tenant-isolation", "edge-functions", "realtime"],
  },
  {
    key: "decision_pipeline",
    label: "Decision Pipeline",
    weight: 10,
    // EE-3 / EC-5: the real decision-lifecycle evidence pipeline supersedes
    // the legacy decision stubs (decision-creation, decision-editing,
    // decision-approval, decision-rejection, decision-ledger). Keeping a
    // single gate input avoids double-counting the same lifecycle controls.
    pipelines: ["decision-lifecycle"],
  },
  {
    key: "evidence_pipeline",
    label: "Evidence Pipeline",
    weight: 10,
    pipelines: [
      "evidence-attachment",
      "evidence-retrieval",
      "evidence-export",
    ],
  },
  {
    key: "governance",
    label: "Governance",
    weight: 10,
    pipelines: ["governance-workflow", "confidence-scoring"],
  },
  {
    key: "ai",
    label: "AI Pipeline",
    weight: 10,
    pipelines: ["ai-recommendation", "ai-explanation"],
  },
  {
    key: "audit",
    label: "Audit",
    weight: 0, // non-scoring but hard-blocking
    pipelines: ["audit-trail"],
  },
  {
    key: "reports",
    label: "Reports",
    weight: 5,
    pipelines: ["reports", "executive-exports"],
  },
  {
    key: "notifications",
    label: "Notifications",
    weight: 0, // non-scoring but hard-blocking
    pipelines: ["notifications"],
  },
  {
    key: "billing",
    label: "Billing",
    weight: 0, // non-scoring but hard-blocking
    pipelines: ["billing", "credits"],
  },
  {
    key: "scalability",
    label: "Scalability",
    weight: 10,
    pipelines: ["dashboard-loading", "background-jobs"],
  },
  {
    key: "recovery",
    label: "Recovery",
    weight: 10,
    pipelines: ["recovery", "rollback"],
  },
  {
    key: "system_health",
    label: "System Health",
    weight: 10,
    pipelines: [
      "deployment-verification",
      "system-health",
      "search",
      "data-import",
      "dataset-versioning",
    ],
  },
]);

// Sum of gate weights. NOT required to be 100. The score is normalized
// against this denominator, so changing weights preserves the 0-100 scale.
export const TOTAL_WEIGHT = GATES.reduce((s, g) => s + g.weight, 0);

// Release-recommendation matrix
export const RECOMMENDATION = Object.freeze({
  PASS: { ship: "ship", label: "Ship" },
  PASS_WITH_WARNINGS: { ship: "ship", label: "Ship with acknowledgement" },
  CONDITIONAL_RELEASE: { ship: "hold", label: "Hold — conditional" },
  BLOCKED: { ship: "hold", label: "Hold — blocked" },
  CRITICAL_BLOCK: { ship: "rollback", label: "Rollback / do not deploy" },
});
