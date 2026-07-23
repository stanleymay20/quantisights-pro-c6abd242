/**
 * TC-1 — Enterprise Trust Center types.
 *
 * The Trust Center is an observability/transparency layer only. It reports
 * on TWO independent axes and never conflates them:
 *
 *   1. Implementation Maturity (`CapabilityStatus`) — is the code written,
 *      tested, and wired to a live consumer inside THIS codebase?
 *
 *   2. Deployment Maturity (`DeploymentMaturity`) — is the capability
 *      actually reachable at runtime, and if so, in what environment?
 *
 * A capability marked "Implemented" is a statement about the source tree,
 * NOT about production. "Implemented" does not mean deployed. "Implemented"
 * does not mean production-ready. Production readiness additionally
 * depends on hosting, infrastructure, operational SLOs, and customer
 * configuration that a client-side codebase cannot verify — that dimension
 * is always reported as `Unknown` unless external evidence is cited.
 */

export const TRUST_CENTER_SCHEMA_VERSION = "quantivis.trust-center.v2";

/**
 * Implementation maturity — a statement about the source tree only.
 *
 * "Implemented"           — coded, tested, AND imported by a live page,
 *                           hook, or edge function inside this codebase.
 *                           Says nothing about deployment or production.
 * "Partially Implemented" — coded and tested, but missing a real backend,
 *                           not wired into a live path in this codebase,
 *                           or covering only part of the described capability.
 * "Planned"                — named/referenced in prior task instructions or
 *                           docs, but no code exists yet.
 * "Not Implemented"       — no code and no forward reference exists.
 * "Unknown"                — could not be verified from the current
 *                           implementation; never assumed to exist.
 */
export type CapabilityStatus =
  | "Implemented"
  | "Partially Implemented"
  | "Planned"
  | "Not Implemented"
  | "Unknown";

/**
 * Deployment maturity — a statement about runtime reachability, kept
 * strictly separate from implementation maturity so the two can never be
 * confused.
 *
 * "Not Deployed"          — the capability has no live consumer running
 *                           anywhere; it exists as a library/reference
 *                           implementation only.
 * "Live In App"           — reachable from a live route/hook/edge function
 *                           in this codebase. Describes the app surface
 *                           only — does NOT assert that any specific
 *                           customer environment is running it, and does
 *                           NOT imply production readiness.
 * "Unknown"                — deployment status cannot be verified from the
 *                           source tree alone.
 */
export type DeploymentMaturity = "Not Deployed" | "Live In App" | "Unknown";

export interface CapabilityEntry {
  key: string;
  label: string;
  /** Implementation maturity — about the source tree, NOT deployment. */
  status: CapabilityStatus;
  /** Deployment maturity — about runtime reachability, NOT production readiness. */
  deployment: DeploymentMaturity;
  detail: string;
  /** File or doc paths that back this assessment. Empty only when status is "Not Implemented" or "Unknown". */
  evidence: string[];
}

/** Exact wording required by TC-1: never a green/healthy indicator unless a live, queryable signal actually exists. */
export type HealthLabel = "NOT AVAILABLE" | "NOT IMPLEMENTED";

export interface RuntimeHealthEntry {
  key: string;
  label: string;
  health: HealthLabel;
  detail: string;
  /** Key into the capability matrix this health entry describes. */
  relatedCapability: string;
  evidence: string[];
}

export interface EvidenceIntegrityEntry {
  key: string;
  label: string;
  status: CapabilityStatus;
  detail: string;
  evidence: string[];
}

export interface GovernanceStatusEntry {
  key: string;
  label: string;
  status: CapabilityStatus;
  detail: string;
  evidence: string[];
}

export interface VersionEntry {
  key: string;
  component: string;
  version: string;
  schemaVersion: string | null;
  source: string;
}

export interface LimitationEntry {
  key: string;
  label: string;
  status: CapabilityStatus;
  deployment: DeploymentMaturity;
  detail: string;
}

export interface EnterpriseReadinessRow {
  key: string;
  dimension: string;
  /** Plain-language, non-numeric assessment. Never a computed score. */
  assessment: string;
  citedSources: string[];
}

export interface PlatformOverview {
  version: string;
  versionSource: string;
  environment: string;
  environmentSource: string;
  buildTimestamp: string | null;
  buildTimestampNote: string;
  gitCommit: string | null;
  gitCommitNote: string;
  deploymentStatus: string;
  deploymentStatusNote: string;
}

export interface TrustCenterData {
  schemaVersion: typeof TRUST_CENTER_SCHEMA_VERSION;
  generatedAt: string;
  overview: PlatformOverview;
  capabilities: CapabilityEntry[];
  runtimeHealth: RuntimeHealthEntry[];
  evidenceIntegrity: EvidenceIntegrityEntry[];
  governance: GovernanceStatusEntry[];
  versions: VersionEntry[];
  limitations: LimitationEntry[];
  enterpriseReadiness: EnterpriseReadinessRow[];
}
