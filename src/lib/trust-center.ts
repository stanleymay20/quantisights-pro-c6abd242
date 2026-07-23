import { AGENT_GATEWAY_SCHEMA_VERSION, AGENT_GATEWAY_VERSION } from "@/lib/agent-gateway";
import { GATEWAY_ACKNOWLEDGEMENT_SCHEMA_VERSION, RUNTIME_GATEWAY_VERSION } from "@/lib/runtime-types";
import { RUNTIME_SERVICE_SCHEMA_VERSION, RUNTIME_SERVICE_VERSION } from "@/lib/runtime-service-types";
import { IDEMPOTENCY_STORE_VERSION } from "@/lib/idempotency-store-types";
import { RUNTIME_QUEUE_VERSION } from "@/lib/runtime-queue-types";
import { EXECUTION_RECORD_SCHEMA_VERSION, RUNTIME_PERSISTENCE_VERSION } from "@/lib/runtime-persistence-types";
import { EVIDENCE_PACK_SCHEMA_VERSION } from "@/lib/evidence-pack-types";
import { REAL_TIME_SIGNAL_SCHEMA_VERSION } from "@/lib/real-time-signals";
import {
  ENTERPRISE_VERIFIED_FACT_SCHEMA_VERSION,
  PROMOTION_ENGINE_VERSION,
} from "@/lib/verified-fact-promotion";
import {
  DECISION_CANDIDATE_ENGINE_VERSION,
  DECISION_CANDIDATE_SCHEMA_VERSION,
} from "@/lib/decision-candidate-generation";
import {
  DECISION_CANDIDATE_HANDOFF_VERSION,
  GATEWAY_SUBMISSION_RECORD_SCHEMA_VERSION,
} from "@/lib/decision-candidate-handoff";
import {
  TRUST_CENTER_SCHEMA_VERSION,
  type CapabilityEntry,
  type EnterpriseReadinessRow,
  type EvidenceIntegrityEntry,
  type GovernanceStatusEntry,
  type LimitationEntry,
  type PlatformOverview,
  type RuntimeHealthEntry,
  type TrustCenterData,
  type VersionEntry,
} from "@/lib/trust-center-types";

/**
 * TC-1 — Enterprise Trust Center data builder.
 *
 * Every entry below was verified by reading the current implementation
 * (see the file paths cited in each entry's `evidence`/`source`). Nothing
 * here is inferred from a file's mere existence — "Implemented" requires
 * the capability to be both coded and reachable from a live page, hook, or
 * edge function, not just present as a library. Where that could not be
 * confirmed, the status is "Partially Implemented", "Planned", "Not
 * Implemented", or "Unknown" — never a fabricated pass.
 */

// ─── 1. Platform Overview ──────────────────────────────────────────────────

/**
 * Only two fields here are live, queryable values (version, environment).
 * Build timestamp, git commit, and deployment status have no injection
 * mechanism in this build pipeline today — they are reported as
 * unavailable rather than guessed.
 */
export function getPlatformOverview(): PlatformOverview {
  return {
    version: "0.0.0",
    versionSource: "package.json (\"version\" field; not build-time injected)",
    environment: typeof import.meta !== "undefined" ? import.meta.env.MODE : "unknown",
    environmentSource: "import.meta.env.MODE (Vite build mode)",
    buildTimestamp: null,
    buildTimestampNote:
      "No build-time timestamp injection exists in vite.config.ts. NOT AVAILABLE.",
    gitCommit: null,
    gitCommitNote: "No git commit is injected into the client bundle at build time. NOT AVAILABLE.",
    deploymentStatus: "NOT AVAILABLE",
    deploymentStatusNote:
      "No deployment-status API is exposed to the client bundle. Deployment state is tracked by the hosting platform, not by this application.",
  };
}

// ─── 2. Capability Matrix ──────────────────────────────────────────────────

export function getCapabilityMatrix(): CapabilityEntry[] {
  return [
    {
      key: "rts_1",
      label: "RTS-1 (Real-Time Signal Pipeline)",
      status: "Partially Implemented",
      deployment: "Not Deployed",
      detail:
        "Signal normalization, quality scoring, contradiction detection, fact promotion, and decision-candidate generation are coded and unit-tested as pure, deterministic libraries. None of these modules are currently imported by any live page, hook, or edge function — the live product's decision creation path does not run through RTS-1.",
      evidence: [
        "docs/architecture/RTS-1-Real-Time-Signal-Architecture.md",
        "src/lib/real-time-signals.ts",
        "src/lib/signal-quality.ts",
        "src/lib/contradiction-detection.ts",
        "src/lib/verified-fact-promotion.ts",
        "src/lib/decision-candidate-generation.ts",
        "src/lib/decision-candidate-handoff.ts",
        "src/test/rts-pipeline-evidence.test.ts",
      ],
    },
    {
      key: "agent_gateway",
      label: "Agent Gateway",
      status: "Partially Implemented",
      deployment: "Not Deployed",
      detail:
        "processAgentGatewayRequest() and its dependency-injected validation/policy/signing contract are coded and tested with mock adapters. No edge function or live request path currently calls it.",
      evidence: ["docs/architecture/AG-1-Agent-Gateway.md", "src/lib/agent-gateway.ts", "src/test/agent-gateway.test.ts"],
    },
    {
      key: "runtime_gateway",
      label: "Runtime Gateway",
      status: "Partially Implemented",
      deployment: "Not Deployed",
      detail:
        "Request validation, acknowledgement signing, and rejection handling are coded and tested against an in-memory reference persistence/queue/signing stack. Not deployed to any live traffic path.",
      evidence: ["docs/architecture/AG-3-Runtime-Gateway.md", "src/lib/runtime-gateway.ts", "src/test/runtime-gateway.test.ts"],
    },
    {
      key: "runtime_service",
      label: "Runtime Service",
      status: "Partially Implemented",
      deployment: "Not Deployed",
      detail:
        "Health/readiness reporting and gateway request (de)serialization are coded and tested as a framework-agnostic boundary (AG-3B). No live caller imports it outside its own test suite.",
      evidence: [
        "docs/architecture/AG-3B-Runtime-Service.md",
        "src/lib/runtime-service.ts",
        "src/test/runtime-service.test.ts",
      ],
    },
    {
      key: "queue",
      label: "Queue",
      status: "Partially Implemented",
      deployment: "Not Deployed",
      detail:
        "The queue contract and an in-memory reference adapter (enqueue/dequeue/retry/dead-letter/expiry) are coded and tested. No real backend adapter (Kafka, SQS, Supabase Queues, etc.) exists — not even a scaffold.",
      evidence: ["docs/architecture/AG-3D-Runtime-Queue.md", "src/lib/runtime-queue.ts", "src/test/runtime-queue.test.ts"],
    },
    {
      key: "persistence",
      label: "Persistence",
      status: "Partially Implemented",
      deployment: "Not Deployed",
      detail:
        "The persistence contract and an in-memory reference adapter (executions, append-only events, hash-chained audit records, queue snapshots) are coded and tested. The Supabase and Postgres adapter classes exist only as scaffolds whose methods throw NotImplementedError.",
      evidence: [
        "docs/architecture/AG-3E-Runtime-Persistence.md",
        "src/lib/runtime-persistence.ts",
        "src/test/runtime-persistence.test.ts",
      ],
    },
    {
      key: "executive_review",
      label: "Executive Review",
      status: "Implemented",
      deployment: "Live In App",
      detail:
        "The Executive Brief → Decision Review → Outcome Prediction flow is live: it reads and writes real decision_ledger rows, gates approval on a five-item checklist, and is covered by passing tests.",
      evidence: [
        "src/pages/ExecutiveBrief.tsx",
        "src/pages/DecisionReview.tsx",
        "src/pages/DecisionOutcome.tsx",
        "src/components/decisions/ExecutiveReviewFlow.tsx",
        "src/test/ux2-review-flow.test.ts",
      ],
    },
    {
      key: "evidence_pack",
      label: "Evidence Pack",
      status: "Partially Implemented",
      deployment: "Live In App",
      detail:
        "Deterministic pack building (20 sections, canonical content hash, JSON/HTML export, PDF-ready block model) is live at /evidence-pack/:decisionId and reads real decision_ledger + audit_log rows. Actual PDF rendering and cryptographic signing are not implemented — the Digital Signature section is an explicit placeholder.",
      evidence: [
        "docs/architecture/EP-1-Enterprise-Evidence-Pack.md",
        "src/lib/evidence-pack.ts",
        "src/pages/EvidencePack.tsx",
        "src/test/evidence-pack.test.ts",
      ],
    },
    {
      key: "trust_center",
      label: "Trust Center",
      status: "Implemented",
      deployment: "Live In App",
      detail:
        "This page: a capability matrix, runtime health, evidence integrity, governance status, version matrix, known limitations, and enterprise readiness matrix, all sourced from the current implementation.",
      evidence: ["docs/architecture/TC-1-Enterprise-Trust-Center.md", "src/lib/trust-center.ts", "src/pages/TrustCenter.tsx"],
    },
    {
      key: "scenario_templates",
      label: "Scenario Templates",
      status: "Implemented",
      deployment: "Live In App",
      detail:
        "ST-1 ships six structured scenario templates (Supplier Risk, Inventory Shortage, Pricing Decision, Revenue Decline, Compliance Investigation, Cybersecurity Incident), live at /enterprise/scenarios and /enterprise/scenarios/:templateId, each with a readiness tier computed from this same capability matrix. This covers the defined scope of a template gallery and detail view only: there is no custom template authoring, no AI-generated templates, no runtime execution triggered from a template, and no direct connector onboarding from a template — none of that is wired, and none is implied.",
      evidence: [
        "docs/architecture/ST-1-Scenario-Template-Framework.md",
        "src/lib/scenario-template.ts",
        "src/pages/ScenarioTemplates.tsx",
        "src/pages/ScenarioTemplateDetail.tsx",
        "src/test/scenario-template.test.ts",
      ],
    },
    {
      key: "outcome_learning",
      label: "Outcome Learning",
      status: "Implemented",
      deployment: "Live In App",
      detail:
        "Decision outcomes are tracked in decision_outcomes, scored via the aicis-evaluate-outcomes edge function, and fed into an adaptive calibration loop. The Outcome Prediction page's feedback widget is live.",
      evidence: [
        "src/lib/lifecycle/execution.ts",
        "src/components/decision-intelligence/AdaptiveCalibrationEngine.tsx",
        "src/components/decisions/OutcomeFeedbackWidget.tsx",
        "supabase/functions/aicis-evaluate-outcomes",
      ],
    },
    {
      key: "signing",
      label: "Signing",
      status: "Not Implemented",
      deployment: "Not Deployed",
      detail:
        "No real cryptographic signing exists. The only \"signature\" values in the codebase are non-cryptographic mock hashes (mock-signature-<fnv1a hash>) used by test/reference adapters, and the Evidence Pack's Digital Signature section is an explicit null placeholder.",
      evidence: ["src/lib/runtime-gateway.ts (MockSigningAdapter)", "src/lib/evidence-pack.ts (digital signature placeholder)"],
    },
    {
      key: "observability",
      label: "Observability",
      status: "Partially Implemented",
      deployment: "Live In App",
      detail:
        "Sentry error/exception tracking is configured and live (DSN-based init). There is no metrics or distributed-tracing integration, and no live telemetry endpoint for queue depth, runtime throughput, or persistence latency.",
      evidence: ["src/lib/sentry.ts", "src/main.tsx"],
    },
    {
      key: "connector_framework",
      label: "Connector Framework",
      status: "Implemented",
      deployment: "Live In App",
      detail:
        "A real connectors table, health tracking, and 14+ dedicated pull edge functions (SAP, Salesforce, HubSpot, BigQuery, Snowflake, S3, REST, etc.) exist, alongside admin UI for configuration and health monitoring.",
      evidence: [
        "src/pages/admin/Connectors.tsx",
        "src/pages/admin/ConnectorHealth.tsx",
        "src/pages/admin/SapConnector.tsx",
        "supabase/functions/connector-sap-pull",
        "supabase/functions/connector-salesforce-pull",
      ],
    },
    {
      key: "http_runtime",
      label: "HTTP Runtime",
      status: "Not Implemented",
      deployment: "Not Deployed",
      detail:
        "No edge function or HTTP endpoint exists for the Agent Gateway or Runtime Gateway request path — every AG-3 phase's documentation explicitly scoped out HTTP endpoints, and no such endpoint was added since.",
      evidence: [],
    },
    {
      key: "authentication",
      label: "Authentication",
      status: "Implemented",
      deployment: "Live In App",
      detail:
        "Supabase Auth is live: session-based login, MFA (TOTP + WebAuthn/passkey), and SAML SSO configuration are wired and reachable from the app.",
      evidence: [
        "src/contexts/AuthContext.tsx",
        "src/pages/Login.tsx",
        "src/components/auth/MFAChallenge.tsx",
        "src/components/auth/PasskeyManagement.tsx",
        "src/pages/SSOConfig.tsx",
      ],
    },
    {
      key: "authorization",
      label: "Authorization",
      status: "Implemented",
      deployment: "Live In App",
      detail:
        "Row-Level Security policies scoped by organization role (get_user_org_role) are defined across the schema, and a client-side usePermissions hook mirrors them for UI gating.",
      evidence: ["supabase/migrations (RLS policies referencing get_user_org_role / auth.uid())", "src/hooks/usePermissions.ts"],
    },
    {
      key: "audit",
      label: "Audit",
      status: "Implemented",
      deployment: "Live In App",
      detail:
        "audit_log is a real, append-only table (no UPDATE/DELETE policy for authenticated users); writeAuditLog() is called live from the decision approval/rejection lifecycle.",
      evidence: ["src/lib/lifecycle/audit.ts", "src/lib/lifecycle/execution.ts"],
    },
    {
      key: "decision_engine",
      label: "Decision Engine",
      status: "Implemented",
      deployment: "Live In App",
      detail:
        "The live decision engine runs through decision_ledger plus edge functions (aicis-auto-decisions, intelligence-advisory-engine, prescriptive-advisory) and the deterministic decision-lifecycle library — a separate code path from the not-yet-integrated RTS-1 → Agent Gateway → Runtime Gateway pipeline described above.",
      evidence: [
        "src/lib/decision-lifecycle.ts",
        "src/pages/DecisionLedger.tsx",
        "supabase/functions/aicis-auto-decisions",
        "supabase/functions/intelligence-advisory-engine",
      ],
    },
  ];
}

// ─── 3. Runtime Health ──────────────────────────────────────────────────────

/**
 * There is no live telemetry endpoint anywhere in this codebase for any of
 * these six subsystems (confirmed: no OpenTelemetry, no metrics endpoint, no
 * queue-depth/latency API reachable from the browser). Every entry therefore
 * reports NOT AVAILABLE today — this function exists so a future live
 * integration has one place to change, not to imply health is being polled.
 *
 * This is distinct from the pre-existing, genuinely live cron/pipeline
 * health surfaced on /system-health (cron_run_log-backed) — see the note in
 * each entry's detail.
 */
export function getRuntimeHealth(): RuntimeHealthEntry[] {
  return [
    {
      key: "runtime_gateway",
      label: "Runtime Gateway",
      health: "NOT AVAILABLE",
      detail: "No live Runtime Gateway process is deployed to observe. Reference implementation only.",
      relatedCapability: "runtime_gateway",
      evidence: ["src/lib/runtime-gateway.ts"],
    },
    {
      key: "queue",
      label: "Queue",
      health: "NOT AVAILABLE",
      detail: "No real queue backend is deployed. The in-memory reference adapter has no external health surface.",
      relatedCapability: "queue",
      evidence: ["src/lib/runtime-queue.ts"],
    },
    {
      key: "persistence",
      label: "Persistence",
      health: "NOT AVAILABLE",
      detail:
        "No durable persistence backend is deployed (Supabase/Postgres adapters throw NotImplementedError). The in-memory reference adapter has no external health surface.",
      relatedCapability: "persistence",
      evidence: ["src/lib/runtime-persistence.ts"],
    },
    {
      key: "evidence",
      label: "Evidence (Evidence Pack)",
      health: "NOT AVAILABLE",
      detail:
        "Evidence Pack building is an on-demand pure function, not a running service — there is no uptime/throughput metric to report for it.",
      relatedCapability: "evidence_pack",
      evidence: ["src/lib/evidence-pack.ts"],
    },
    {
      key: "audit",
      label: "Audit",
      health: "NOT AVAILABLE",
      detail:
        "The audit_log table and its append-only policy are real and live (see Governance and Evidence Integrity below), but no live write-success-rate or latency metric is exposed to the client.",
      relatedCapability: "audit",
      evidence: ["src/lib/lifecycle/audit.ts"],
    },
    {
      key: "replay_protection",
      label: "Replay Protection",
      health: "NOT IMPLEMENTED",
      detail:
        "The AG-3C idempotency store is a tested reference implementation with no live process behind it — it is not wired to any request path, so there is nothing running to report health for.",
      relatedCapability: "queue",
      evidence: ["src/lib/idempotency-store.ts", "src/test/idempotency-store.test.ts"],
    },
  ];
}

// ─── 4. Evidence Integrity ─────────────────────────────────────────────────

export function getEvidenceIntegrity(): EvidenceIntegrityEntry[] {
  return [
    {
      key: "evidence_pack_availability",
      label: "Evidence Pack availability",
      status: "Implemented",
      detail: "Live at /evidence-pack/:decisionId for any decision that exists in the caller's organization.",
      evidence: ["src/pages/EvidencePack.tsx"],
    },
    {
      key: "audit_chain_support",
      label: "Audit chain support",
      status: "Partially Implemented",
      detail:
        "AG-3E's persistence layer implements a hash-linked audit chain (previous_audit_hash) in its in-memory reference adapter and tests. decision_ledger's own audit_log table is append-only but is not hash-chained record-to-record.",
      evidence: ["src/lib/runtime-persistence.ts", "supabase/migrations (audit_log table)"],
    },
    {
      key: "deterministic_hashing",
      label: "Deterministic hashing",
      status: "Implemented",
      detail:
        "Evidence Pack's evidence_pack_hash is a canonical-JSON FNV-1a hash, verified deterministic across generation time and object key order by test.",
      evidence: ["src/lib/evidence-pack.ts", "src/test/evidence-pack.test.ts"],
    },
    {
      key: "replay_protection",
      label: "Replay protection",
      status: "Partially Implemented",
      detail: "Coded and tested (AG-3C idempotency store) but not wired to any live request path today.",
      evidence: ["src/lib/idempotency-store.ts"],
    },
    {
      key: "immutable_audit",
      label: "Immutable audit",
      status: "Implemented",
      detail: "audit_log has no UPDATE/DELETE policy for authenticated users; writes are service-role/insert-only.",
      evidence: ["supabase/migrations (audit_log RLS policies)"],
    },
    {
      key: "decision_lineage",
      label: "Decision lineage",
      status: "Partially Implemented",
      detail:
        "Evidence Pack's Decision Timeline reports whichever lifecycle stages have real data on the decision, honestly marking unlinked stages (Fact Promoted, Agent Gateway, Runtime Gateway) as not recorded rather than inferring them.",
      evidence: ["src/lib/evidence-pack.ts"],
    },
    {
      key: "verified_facts",
      label: "Verified facts",
      status: "Not Implemented",
      detail:
        "No enterprise_verified_fact (or equivalent) table exists. The RTS-1 fact-promotion library defines the concept, but no decision currently links to a persisted verified fact record — Evidence Pack reports this as unavailable rather than fabricating one.",
      evidence: ["src/lib/verified-fact-promotion.ts"],
    },
  ];
}

// ─── 5. Governance Status ───────────────────────────────────────────────────

export function getGovernanceStatus(): GovernanceStatusEntry[] {
  return [
    {
      key: "approval_workflow",
      label: "Decision approval workflow",
      status: "Implemented",
      detail: "Approve/reject writes to decision_ledger, live from the Decision Review page and the Decision Ledger.",
      evidence: ["src/pages/DecisionReview.tsx", "src/pages/DecisionLedger.tsx"],
    },
    {
      key: "executive_review",
      label: "Executive review",
      status: "Implemented",
      detail: "A checklist-gated review flow (evidence, confidence, risks, alternatives, responsibility) blocks approval until confirmed.",
      evidence: ["src/components/decisions/ExecutiveReviewFlow.tsx", "src/components/decisions/executive-review-flow.ts"],
    },
    {
      key: "outcome_tracking",
      label: "Outcome tracking",
      status: "Implemented",
      detail: "decision_outcomes rows are created on approval (gated by an evaluability check) and scored by the calibration loop.",
      evidence: ["src/lib/lifecycle/execution.ts", "src/lib/lifecycle/evaluability.ts"],
    },
    {
      key: "evidence_export",
      label: "Evidence export",
      status: "Partially Implemented",
      detail: "JSON and printable HTML export are live. PDF export and cryptographic signing are not implemented.",
      evidence: ["src/lib/evidence-pack.ts", "src/components/decisions/EvidencePackPreview.tsx"],
    },
    {
      key: "approval_checklist",
      label: "Approval checklist",
      status: "Implemented",
      detail: "Five-item checklist (evidence, confidence, risks, alternatives, governance responsibility) gates the Approve action.",
      evidence: ["src/components/decisions/executive-review-flow.ts"],
    },
  ];
}

// ─── 6. Version Matrix ──────────────────────────────────────────────────────

export function getVersionMatrix(): VersionEntry[] {
  return [
    {
      key: "rts_1_signal_schema",
      component: "RTS-1 — Signal schema",
      version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
      schemaVersion: REAL_TIME_SIGNAL_SCHEMA_VERSION,
      source: "src/lib/real-time-signals.ts",
    },
    {
      key: "rts_1_fact_promotion",
      component: "RTS-1 — Fact promotion engine",
      version: PROMOTION_ENGINE_VERSION,
      schemaVersion: ENTERPRISE_VERIFIED_FACT_SCHEMA_VERSION,
      source: "src/lib/verified-fact-promotion.ts",
    },
    {
      key: "rts_1_candidate_generation",
      component: "RTS-1 — Decision candidate generation",
      version: DECISION_CANDIDATE_ENGINE_VERSION,
      schemaVersion: DECISION_CANDIDATE_SCHEMA_VERSION,
      source: "src/lib/decision-candidate-generation.ts",
    },
    {
      key: "rts_1_handoff",
      component: "RTS-1 — Gateway submission handoff",
      version: DECISION_CANDIDATE_HANDOFF_VERSION,
      schemaVersion: GATEWAY_SUBMISSION_RECORD_SCHEMA_VERSION,
      source: "src/lib/decision-candidate-handoff.ts",
    },
    {
      key: "agent_gateway",
      component: "Agent Gateway",
      version: AGENT_GATEWAY_VERSION,
      schemaVersion: AGENT_GATEWAY_SCHEMA_VERSION,
      source: "src/lib/agent-gateway.ts",
    },
    {
      key: "runtime_gateway",
      component: "Runtime Gateway (AG-3A)",
      version: RUNTIME_GATEWAY_VERSION,
      schemaVersion: GATEWAY_ACKNOWLEDGEMENT_SCHEMA_VERSION,
      source: "src/lib/runtime-types.ts",
    },
    {
      key: "runtime_service",
      component: "Runtime Service (AG-3B)",
      version: RUNTIME_SERVICE_VERSION,
      schemaVersion: RUNTIME_SERVICE_SCHEMA_VERSION,
      source: "src/lib/runtime-service-types.ts",
    },
    {
      key: "idempotency_store",
      component: "Idempotency Store (AG-3C)",
      version: IDEMPOTENCY_STORE_VERSION,
      schemaVersion: null,
      source: "src/lib/idempotency-store-types.ts",
    },
    {
      key: "runtime_queue",
      component: "Runtime Queue (AG-3D)",
      version: RUNTIME_QUEUE_VERSION,
      schemaVersion: null,
      source: "src/lib/runtime-queue-types.ts",
    },
    {
      key: "runtime_persistence",
      component: "Runtime Persistence (AG-3E)",
      version: RUNTIME_PERSISTENCE_VERSION,
      schemaVersion: EXECUTION_RECORD_SCHEMA_VERSION,
      source: "src/lib/runtime-persistence-types.ts",
    },
    {
      key: "evidence_pack",
      component: "Evidence Pack (EP-1)",
      version: EVIDENCE_PACK_SCHEMA_VERSION,
      schemaVersion: EVIDENCE_PACK_SCHEMA_VERSION,
      source: "src/lib/evidence-pack-types.ts",
    },
    {
      key: "trust_center",
      component: "Trust Center (TC-1)",
      version: TRUST_CENTER_SCHEMA_VERSION,
      schemaVersion: TRUST_CENTER_SCHEMA_VERSION,
      source: "src/lib/trust-center-types.ts",
    },
  ];
}

// ─── 7. Known Limitations ──────────────────────────────────────────────────

/**
 * Derived automatically from the capability matrix — anything not
 * "Implemented" is a limitation, by construction. This guarantees the
 * limitations list can never silently drift out of sync with the matrix
 * above (and can never omit an entry the matrix has already flagged).
 */
export function getKnownLimitations(): LimitationEntry[] {
  return getCapabilityMatrix()
    .filter((capability) => capability.status !== "Implemented")
    .map((capability) => ({
      key: capability.key,
      label: capability.label,
      status: capability.status,
      deployment: capability.deployment,
      detail: capability.detail,
    }));
}

// ─── 8. Enterprise Readiness ────────────────────────────────────────────────

/**
 * A matrix only — no numeric or percentage score is computed anywhere in
 * this module. Each row states what is actually true today and cites where
 * that statement can be verified.
 */
export function getEnterpriseReadinessMatrix(): EnterpriseReadinessRow[] {
  return [
    {
      key: "architecture",
      dimension: "Architecture",
      assessment:
        "RTS-1 → Agent Gateway → Runtime Gateway → Queue → Persistence is fully documented and each phase has a tested, deterministic reference implementation. The phases are not yet wired to each other or to any live traffic path.",
      citedSources: [
        "docs/architecture/RTS-1-Real-Time-Signal-Architecture.md",
        "docs/architecture/AG-1-Agent-Gateway.md",
        "docs/architecture/AG-3-Runtime-Gateway.md",
        "docs/architecture/AG-3E-Runtime-Persistence.md",
      ],
    },
    {
      key: "runtime",
      dimension: "Runtime",
      assessment:
        "No subsystem in the Runtime Health section reports a live, queryable health signal today (see Runtime Health above) — every runtime component is a tested reference implementation, not a deployed service.",
      citedSources: ["src/lib/trust-center.ts (getRuntimeHealth)"],
    },
    {
      key: "governance",
      dimension: "Governance",
      assessment:
        "The approval workflow, executive review checklist, and outcome tracking are live and enforced today; evidence export is live for JSON/HTML but not for PDF or signed exports.",
      citedSources: ["src/pages/DecisionReview.tsx", "src/lib/lifecycle/execution.ts"],
    },
    {
      key: "evidence",
      dimension: "Evidence",
      assessment:
        "Evidence Pack generation, deterministic hashing, and immutable decision_ledger-level audit logging are live. Hash-chained audit records and verified-fact persistence exist only in the not-yet-integrated AG-3E/RTS-1 reference implementations.",
      citedSources: ["src/lib/evidence-pack.ts", "src/lib/runtime-persistence.ts"],
    },
    {
      key: "operations",
      dimension: "Operations",
      assessment:
        "Cron-based pipeline jobs (outcome evaluation, calibration, retention cleanup) are live and monitored via cron_run_log, surfaced on /system-health. No metrics/tracing observability (OpenTelemetry or equivalent) exists for the AG-3 runtime components.",
      citedSources: ["src/hooks/useSystemHealth.ts", "src/lib/sentry.ts"],
    },
    {
      key: "security",
      dimension: "Security",
      assessment:
        "Authentication (with MFA/SSO), Row-Level Security authorization, and append-only audit logging are live. Cryptographic signing of decisions or evidence packs is not implemented anywhere in the codebase.",
      citedSources: ["src/contexts/AuthContext.tsx", "supabase/migrations (RLS policies)"],
    },
    {
      key: "pilot_readiness",
      dimension: "Pilot Readiness (Implementation only)",
      assessment:
        "Implementation-only assessment: the executive-review path (decision_ledger, executive review, outcome tracking, evidence export) is coded, tested, and wired live inside this codebase. This is a source-tree statement — it does NOT assert deployment to any specific customer environment, and does NOT constitute a pilot go/no-go decision, which additionally depends on hosting, data loading, and customer configuration outside this repository.",
      citedSources: ["src/pages/DecisionLedger.tsx", "src/pages/ExecutiveBrief.tsx"],
    },
    {
      key: "deployment_readiness",
      dimension: "Deployment Readiness",
      assessment:
        "UNKNOWN — deployment status of any specific customer environment cannot be verified from client-side source alone. The Capability Matrix's Deployment column reports only whether each capability is reachable inside THIS codebase's app surface, not whether it is running for a customer.",
      citedSources: [],
    },
    {
      key: "production_readiness",
      dimension: "Production Readiness",
      assessment:
        "UNKNOWN — production readiness depends on infrastructure, SLOs, incident response, data governance controls, and operational maturity that a client-side codebase cannot verify. Nothing on this page should be interpreted as a production-readiness attestation.",
      citedSources: [],
    },

  ];
}

// ─── Aggregate ──────────────────────────────────────────────────────────────

export function buildTrustCenterData(now: () => string = () => new Date().toISOString()): TrustCenterData {
  return {
    schemaVersion: TRUST_CENTER_SCHEMA_VERSION,
    generatedAt: now(),
    overview: getPlatformOverview(),
    capabilities: getCapabilityMatrix(),
    runtimeHealth: getRuntimeHealth(),
    evidenceIntegrity: getEvidenceIntegrity(),
    governance: getGovernanceStatus(),
    versions: getVersionMatrix(),
    limitations: getKnownLimitations(),
    enterpriseReadiness: getEnterpriseReadinessMatrix(),
  };
}
