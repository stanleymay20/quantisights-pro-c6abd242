import type { CapabilityStatus } from "@/lib/trust-center-types";

/**
 * ST-1 — Enterprise Scenario Template Framework types.
 *
 * A Scenario Template is a structured enterprise playbook — "what business
 * problem does Quantivis solve, and how." It is NOT a mock decision and it
 * does not execute anything. Every capability claim on a template is sourced
 * from the Trust Center's capability matrix (the single source of truth for
 * implementation status across the app) — this module never defines a
 * second, competing capability model.
 */

export const SCENARIO_TEMPLATE_SCHEMA_VERSION = "quantivis.scenario-template.v1";

/**
 * "Ready for Demonstration"        — every required capability is at least
 *                                    Partially Implemented; nothing is
 *                                    missing outright, but the full path
 *                                    isn't wired end-to-end yet.
 * "Ready for Pilot"                — every required capability is fully
 *                                    Implemented.
 * "Requires Additional Capability" — at least one required capability is
 *                                    Not Implemented or Unknown.
 */
export type ScenarioReadinessLevel =
  | "Ready for Pilot"
  | "Ready for Demonstration"
  | "Requires Additional Capability";

export type BusinessImpactBand = "Low" | "Medium" | "High" | "Critical";

export interface ScenarioBusinessImpact {
  band: BusinessImpactBand;
  /** Illustrative rationale for the band — never a fabricated live number. */
  rationale: string;
}

/**
 * One required capability, resolved against the live Trust Center
 * capability matrix. `status`/`label`/`detail` are always copied from
 * trust-center.ts at read time — never hand-typed here.
 */
export interface ScenarioCapabilityUsage {
  capability_key: string;
  label: string;
  status: CapabilityStatus;
  detail: string;
}

/**
 * One stage of the shared Decision Flow. The flow itself is fixed across
 * every template (Signal → Verified Fact → Decision Candidate → Executive
 * Review → Evidence Pack → Outcome → Learning) — templates never invent
 * their own runtime stages. Each stage's status reflects the real,
 * already-verified implementation state of the architecture that backs it.
 */
export interface ScenarioDecisionFlowStage {
  key: string;
  label: string;
  status: CapabilityStatus;
  detail: string;
  source: string;
}

export interface ScenarioTemplate {
  template_id: string;
  title: string;
  category: string;
  industry: string[];
  executive_summary: string;
  business_problem: string;
  typical_signals: string[];
  verified_facts: string[];
  expected_decisions: string[];
  business_impact: ScenarioBusinessImpact;
  typical_risks: string[];
  governance_requirements: string[];
  success_metrics: string[];
  expected_outcomes: string[];
  estimated_time_to_decision: string;
  recommended_roles: string[];
  /** Capability keys required to run this scenario end-to-end, as defined in trust-center.ts. */
  required_capabilities: string[];
  /** Resolved status for every required capability — never fewer entries than required_capabilities. */
  implementation_status: ScenarioCapabilityUsage[];
}

export interface ScenarioReadinessResult {
  readiness: ScenarioReadinessLevel;
  /** Capabilities that prevented a higher readiness tier. Empty when readiness is "Ready for Pilot". */
  blocking: ScenarioCapabilityUsage[];
  rationale: string;
}
