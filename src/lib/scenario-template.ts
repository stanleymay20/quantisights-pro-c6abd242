import { getCapabilityMatrix, getEvidenceIntegrity } from "@/lib/trust-center";
import type { CapabilityEntry, CapabilityStatus } from "@/lib/trust-center-types";
import {
  SCENARIO_TEMPLATE_SCHEMA_VERSION,
  type ScenarioCapabilityUsage,
  type ScenarioDecisionFlowStage,
  type ScenarioReadinessLevel,
  type ScenarioReadinessResult,
  type ScenarioTemplate,
} from "@/lib/scenario-template-types";

export { SCENARIO_TEMPLATE_SCHEMA_VERSION } from "@/lib/scenario-template-types";
export type {
  BusinessImpactBand,
  ScenarioBusinessImpact,
  ScenarioCapabilityUsage,
  ScenarioDecisionFlowStage,
  ScenarioReadinessLevel,
  ScenarioReadinessResult,
  ScenarioTemplate,
} from "@/lib/scenario-template-types";

/**
 * ST-1 — Enterprise Scenario Template Framework.
 *
 * Six structured enterprise playbooks. Every capability claim here is
 * resolved from the Trust Center's own capability matrix (trust-center.ts)
 * at read time — this module never asserts a status by hand, so it can
 * never drift from what Trust Center reports. Nothing here executes a
 * decision, calls a connector, or invokes AI — it is playbook content only.
 */

function capabilityByKey(): Map<string, CapabilityEntry> {
  return new Map(getCapabilityMatrix().map((entry) => [entry.key, entry]));
}

/** Resolves a list of capability keys against the live Trust Center capability matrix. */
export function resolveCapabilityUsage(keys: string[]): ScenarioCapabilityUsage[] {
  const byKey = capabilityByKey();
  return keys.map((key) => {
    const capability = byKey.get(key);
    if (!capability) {
      return {
        capability_key: key,
        label: key,
        status: "Unknown" as CapabilityStatus,
        detail: "This capability key is not present in the Trust Center capability matrix.",
      };
    }
    return {
      capability_key: capability.key,
      label: capability.label,
      status: capability.status,
      detail: capability.detail,
    };
  });
}

/**
 * Readiness is computed only from resolved capability statuses:
 * - Any "Not Implemented" or "Unknown"  → "Requires Additional Capability"
 * - All "Implemented"                    → "Ready for Pilot"
 * - Otherwise (mix incl. "Partially Implemented") → "Ready for Demonstration"
 */
export function computeScenarioReadiness(usage: ScenarioCapabilityUsage[]): ScenarioReadinessResult {
  const blocking = usage.filter((entry) => entry.status === "Not Implemented" || entry.status === "Unknown");
  if (blocking.length > 0) {
    return {
      readiness: "Requires Additional Capability",
      blocking,
      rationale: `${blocking.length} required capabilit${blocking.length === 1 ? "y is" : "ies are"} not yet implemented: ${blocking.map((b) => b.label).join(", ")}.`,
    };
  }

  const allImplemented = usage.every((entry) => entry.status === "Implemented");
  if (allImplemented) {
    return {
      readiness: "Ready for Pilot",
      blocking: [],
      rationale: "Every required capability is fully implemented and live.",
    };
  }

  const partial = usage.filter((entry) => entry.status === "Partially Implemented");
  return {
    readiness: "Ready for Demonstration",
    blocking: [],
    rationale: `${partial.length} required capabilit${partial.length === 1 ? "y is" : "ies are"} only partially implemented: ${partial.map((p) => p.label).join(", ")}. The scenario can be demonstrated end-to-end but is not yet pilot-ready.`,
  };
}

export function getScenarioReadiness(template: ScenarioTemplate): ScenarioReadinessResult {
  return computeScenarioReadiness(template.implementation_status);
}

/**
 * The shared Decision Flow. Identical for every template — templates
 * describe a business problem, not a bespoke pipeline. Each stage's status
 * is read directly from the Trust Center's capability matrix and Evidence
 * Integrity findings; no new runtime stage is invented here.
 */
export function getScenarioDecisionFlow(): ScenarioDecisionFlowStage[] {
  const byKey = capabilityByKey();
  const evidenceIntegrity = new Map(getEvidenceIntegrity().map((entry) => [entry.key, entry]));
  const rts1 = byKey.get("rts_1");
  const verifiedFacts = evidenceIntegrity.get("verified_facts");
  const executiveReview = byKey.get("executive_review");
  const evidencePack = byKey.get("evidence_pack");
  const outcomeLearning = byKey.get("outcome_learning");

  return [
    {
      key: "signal",
      label: "Signal",
      status: rts1?.status ?? "Unknown",
      detail:
        rts1?.detail ??
        "RTS-1 signal ingestion status could not be resolved from the Trust Center capability matrix.",
      source: "Trust Center capability: RTS-1",
    },
    {
      key: "verified_fact",
      label: "Verified Fact",
      status: verifiedFacts?.status ?? "Unknown",
      detail:
        verifiedFacts?.detail ??
        "Verified fact persistence status could not be resolved from Trust Center evidence integrity.",
      source: "Trust Center evidence integrity: Verified facts",
    },
    {
      key: "decision_candidate",
      label: "Decision Candidate",
      status: rts1?.status ?? "Unknown",
      detail:
        "RTS-1's decision-candidate generation is coded and tested but not wired into the live decision-creation path today; live decisions are created directly in the Decision Ledger.",
      source: "Trust Center capability: RTS-1 (decision-candidate generation)",
    },
    {
      key: "executive_review",
      label: "Executive Review",
      status: executiveReview?.status ?? "Unknown",
      detail: executiveReview?.detail ?? "Executive Review status could not be resolved.",
      source: "Trust Center capability: Executive Review",
    },
    {
      key: "evidence_pack",
      label: "Evidence Pack",
      status: evidencePack?.status ?? "Unknown",
      detail: evidencePack?.detail ?? "Evidence Pack status could not be resolved.",
      source: "Trust Center capability: Evidence Pack",
    },
    {
      key: "outcome",
      label: "Outcome",
      status: outcomeLearning?.status ?? "Unknown",
      detail: outcomeLearning?.detail ?? "Outcome tracking status could not be resolved.",
      source: "Trust Center capability: Outcome Learning",
    },
    {
      key: "learning",
      label: "Learning",
      status: outcomeLearning?.status ?? "Unknown",
      detail:
        "Calibration runs against measured outcomes and feeds confidence adjustments back into future decisions of the same type.",
      source: "Trust Center capability: Outcome Learning",
    },
  ];
}

const BASE_CAPABILITIES = [
  "decision_engine",
  "executive_review",
  "evidence_pack",
  "outcome_learning",
  "audit",
  "authentication",
  "authorization",
];

interface ScenarioTemplateSeed {
  template_id: string;
  title: string;
  category: string;
  industry: string[];
  executive_summary: string;
  business_problem: string;
  typical_signals: string[];
  verified_facts: string[];
  expected_decisions: string[];
  business_impact: ScenarioTemplate["business_impact"];
  typical_risks: string[];
  governance_requirements: string[];
  success_metrics: string[];
  expected_outcomes: string[];
  estimated_time_to_decision: string;
  recommended_roles: string[];
  required_capabilities: string[];
}

const SCENARIO_TEMPLATE_SEEDS: ScenarioTemplateSeed[] = [
  {
    template_id: "supplier-risk",
    title: "Supplier Risk",
    category: "Supply Chain",
    industry: ["Manufacturing", "Retail", "Automotive"],
    executive_summary:
      "A key supplier shows signs of delivery, quality, or financial distress. Quantivis helps you decide whether to diversify, renegotiate, or continue with the incumbent before disruption reaches production.",
    business_problem:
      "Supplier concentration and single-source dependencies create exposure that often isn't visible until a delivery is missed. Procurement and operations teams need an evidence-backed way to decide when a supplier risk crosses the threshold for executive action.",
    typical_signals: [
      "Delivery lead time deviating from historical baseline",
      "Quality defect rate rising across recent shipments",
      "Supplier concentration exceeding a defined threshold for a category",
      "Public financial distress or credit-rating signals for the supplier",
    ],
    verified_facts: [
      "Confirmed delivery delay pattern from ERP/logistics data over a defined window",
      "Cross-referenced quality data from receiving inspection records",
      "Supplier spend concentration calculated from procurement data",
    ],
    expected_decisions: [
      "Approve dual-sourcing for the affected category",
      "Escalate to a supplier performance review before renewal",
      "Accept the risk with a documented contingency plan",
    ],
    business_impact: {
      band: "High",
      rationale:
        "Illustrative — single-source supplier disruption typically threatens production continuity, not just cost. Actual impact depends on the customer's exposure and is not calculated from live data.",
    },
    typical_risks: [
      "Switching cost and qualification lead time for an alternate supplier",
      "Incomplete visibility into tier-2/tier-3 sub-suppliers",
      "Contractual exit terms with the incumbent supplier",
    ],
    governance_requirements: [
      "Procurement policy sign-off for any dual-sourcing spend above threshold",
      "Documented rationale if risk is accepted rather than mitigated",
    ],
    success_metrics: [
      "Delivery lead time returns within baseline tolerance",
      "No unplanned production stoppage attributable to this supplier",
      "Time-to-decision from signal to executive approval",
    ],
    expected_outcomes: [
      "Reduced single-source exposure for the affected category",
      "A documented, auditable rationale for the chosen mitigation",
    ],
    estimated_time_to_decision: "3–10 business days from signal to executive decision (illustrative)",
    recommended_roles: ["Chief Procurement Officer", "VP Supply Chain", "Category Manager"],
    required_capabilities: [...BASE_CAPABILITIES, "connector_framework", "rts_1"],
  },
  {
    template_id: "inventory-shortage",
    title: "Inventory Shortage",
    category: "Operations",
    industry: ["Retail", "Manufacturing", "Consumer Goods"],
    executive_summary:
      "Stock levels for a critical SKU or component are trending toward a stockout. Quantivis helps operations leaders decide between expedited replenishment, allocation, or demand shaping before revenue or production is impacted.",
    business_problem:
      "Inventory shortages are often detected too late to act cheaply — by the time a stockout is visible on a dashboard, the cost-effective options have already narrowed. Teams need an evidence trail showing when the shortage signal first became actionable.",
    typical_signals: [
      "Days-of-supply falling below a defined safety threshold",
      "Demand forecast revised upward without a matching supply plan",
      "Inbound shipment delay affecting a committed replenishment date",
    ],
    verified_facts: [
      "Current on-hand and in-transit inventory reconciled against the order management system",
      "Confirmed demand trend from sales/order data over a defined window",
    ],
    expected_decisions: [
      "Approve expedited freight for the affected SKU",
      "Allocate remaining stock across channels by priority",
      "Adjust the demand-facing promotion or pricing to shape demand down",
    ],
    business_impact: {
      band: "Medium",
      rationale:
        "Illustrative — a stockout on a high-velocity SKU typically affects near-term revenue and channel relationships; magnitude depends on the SKU's revenue share and is not a live calculation.",
    },
    typical_risks: [
      "Expedite cost may exceed the margin at risk",
      "Allocation decisions can create channel-partner friction",
    ],
    governance_requirements: [
      "Finance sign-off on expedite spend above a defined threshold",
      "Channel allocation policy applied consistently across customers",
    ],
    success_metrics: [
      "Days-of-supply restored above the safety threshold",
      "No stockout event on the affected SKU during the review window",
    ],
    expected_outcomes: [
      "Replenishment plan executed before stockout",
      "Documented allocation rationale available for channel disputes",
    ],
    estimated_time_to_decision: "1–5 business days from signal to executive decision (illustrative)",
    recommended_roles: ["VP Operations", "Demand Planning Lead", "Category Manager"],
    required_capabilities: [...BASE_CAPABILITIES, "connector_framework", "rts_1"],
  },
  {
    template_id: "pricing-decision",
    title: "Pricing Decision",
    category: "Commercial",
    industry: ["Retail", "SaaS", "Manufacturing"],
    executive_summary:
      "A pricing signal — margin compression, competitive move, or demand elasticity shift — requires a decision on whether to adjust price, hold, or respond with a non-price lever. Quantivis provides the evidence trail behind that call.",
    business_problem:
      "Pricing decisions are high-leverage and hard to reverse cleanly. Commercial teams need a documented, evidence-based case before changing price on a material product line — not a gut call made in a spreadsheet.",
    typical_signals: [
      "Gross margin trending below target on a product line",
      "Competitor price change detected in market data",
      "Demand elasticity shift observed following a prior price change",
    ],
    verified_facts: [
      "Margin trend reconciled from sales and cost data over a defined window",
      "Competitive price points confirmed from market/pricing data sources",
    ],
    expected_decisions: [
      "Approve a price adjustment on the affected product line",
      "Hold price and respond with a non-price lever (bundling, promotion)",
      "Commission a deeper elasticity study before acting",
    ],
    business_impact: {
      band: "High",
      rationale:
        "Illustrative — pricing changes on a material product line typically move revenue and margin simultaneously; actual impact depends on volume and elasticity and is not a live calculation.",
    },
    typical_risks: [
      "Elasticity estimates carry uncertainty, especially with limited historical price variation",
      "Customer-facing price changes can affect brand perception beyond the immediate transaction",
    ],
    governance_requirements: [
      "Commercial policy sign-off for price changes above a defined magnitude",
      "Legal/compliance review for regulated pricing categories",
    ],
    success_metrics: [
      "Margin trend returns toward target within the review window",
      "Volume impact stays within the range assumed in the decision rationale",
    ],
    expected_outcomes: [
      "A documented pricing decision with measurable margin/volume follow-up",
    ],
    estimated_time_to_decision: "5–15 business days from signal to executive decision (illustrative)",
    recommended_roles: ["Chief Revenue Officer", "VP Pricing", "Finance Business Partner"],
    required_capabilities: [...BASE_CAPABILITIES, "connector_framework", "rts_1"],
  },
  {
    template_id: "revenue-decline",
    title: "Revenue Decline",
    category: "Finance",
    industry: ["SaaS", "Retail", "Financial Services"],
    executive_summary:
      "Revenue for a segment, product, or region is trending below plan. Quantivis helps leadership decide whether the cause is addressable operationally, requires a commercial response, or should be escalated to the board.",
    business_problem:
      "Revenue variance shows up on a dashboard well after the underlying cause began. Leadership needs a decision framework that ties the decline to a specific, evidenced cause before committing to a remediation plan.",
    typical_signals: [
      "Revenue trending below plan for a segment over a sustained period",
      "Churn or retention rate deviating from historical baseline",
      "Pipeline conversion rate declining ahead of a booking shortfall",
    ],
    verified_facts: [
      "Revenue trend reconciled from billing/finance data over a defined window",
      "Segment-level attribution confirmed against the customer/account data source",
    ],
    expected_decisions: [
      "Approve a targeted retention or win-back program for the affected segment",
      "Reallocate go-to-market spend toward higher-performing segments",
      "Escalate to the board with a documented remediation plan",
    ],
    business_impact: {
      band: "Critical",
      rationale:
        "Illustrative — a sustained revenue decline in a material segment typically warrants board-level visibility; actual severity depends on the segment's share of total revenue and is not a live calculation.",
    },
    typical_risks: [
      "Root-cause misattribution if the signal is driven by a seasonal or one-off factor",
      "Remediation spend committed before the cause is confirmed",
    ],
    governance_requirements: [
      "Finance sign-off on the revenue attribution before executive review",
      "Board notification threshold defined in advance for material declines",
    ],
    success_metrics: [
      "Revenue trend stabilizes or reverses within the review window",
      "Root cause confirmed and documented before remediation spend is approved",
    ],
    expected_outcomes: [
      "A documented, evidence-based remediation plan with a measurable follow-up window",
    ],
    estimated_time_to_decision: "10–20 business days from signal to executive decision (illustrative)",
    recommended_roles: ["Chief Financial Officer", "Chief Revenue Officer", "Board Audit/Finance Committee"],
    required_capabilities: [...BASE_CAPABILITIES, "connector_framework", "rts_1"],
  },
  {
    template_id: "compliance-investigation",
    title: "Compliance Investigation",
    category: "Compliance",
    industry: ["Financial Services", "Healthcare", "Insurance"],
    executive_summary:
      "A potential compliance or regulatory issue has been flagged and requires a documented, defensible investigation and decision trail. Quantivis structures the evidence and approval chain — it does not replace legal or compliance judgment.",
    business_problem:
      "Regulators and auditors expect a documented chain from signal to decision to action, with tamper-evident evidence. Compliance teams need that trail to exist by default, not reconstructed after the fact.",
    typical_signals: [
      "Automated control flag from a compliance monitoring system",
      "Whistleblower or internal escalation report",
      "Audit finding requiring a documented remediation decision",
    ],
    verified_facts: [
      "Confirmed control breach or policy exception from the source system of record",
      "Timeline of the underlying event reconstructed from available records",
    ],
    expected_decisions: [
      "Approve a remediation plan with an assigned owner and deadline",
      "Escalate to external counsel or the regulator, where required",
      "Close the investigation with a documented no-action rationale",
    ],
    business_impact: {
      band: "Critical",
      rationale:
        "Illustrative — unresolved compliance findings typically carry regulatory and reputational exposure disproportionate to the underlying transaction value; not a live calculation.",
    },
    typical_risks: [
      "Incomplete evidence chain undermining defensibility with a regulator",
      "Delayed escalation extending exposure",
    ],
    governance_requirements: [
      "Legal/compliance sign-off before closing any investigation",
      "Tamper-evident, exportable evidence trail suitable for regulator or auditor review",
    ],
    success_metrics: [
      "Time from signal to documented decision",
      "Completeness of the evidence trail at audit review",
    ],
    expected_outcomes: [
      "A documented, defensible investigation record with a clear approval chain",
    ],
    estimated_time_to_decision: "Varies by finding severity — typically 5–30 business days (illustrative)",
    recommended_roles: ["Chief Compliance Officer", "General Counsel", "Head of Internal Audit"],
    required_capabilities: [...BASE_CAPABILITIES, "connector_framework", "rts_1", "signing"],
  },
  {
    template_id: "cybersecurity-incident",
    title: "Cybersecurity Incident",
    category: "Security",
    industry: ["Technology", "Financial Services", "Healthcare"],
    executive_summary:
      "A security signal indicates a potential incident requiring an executive decision on containment, disclosure, and remediation scope. Quantivis structures the decision trail — it is not a SOC/SIEM and does not perform incident detection or response itself.",
    business_problem:
      "Security incidents require fast, defensible decisions under uncertainty: contain now versus gather more evidence, disclose versus investigate further. Leadership needs the rationale and approval chain preserved regardless of how the incident resolves.",
    typical_signals: [
      "Anomalous access pattern flagged by the security monitoring stack",
      "Confirmed indicator of compromise from threat intelligence",
      "Data exposure or exfiltration alert requiring a disclosure decision",
    ],
    verified_facts: [
      "Confirmed scope of affected systems/accounts from the security tooling of record",
      "Timeline of the incident reconstructed from available logs",
    ],
    expected_decisions: [
      "Approve containment action (isolate systems, revoke access, rotate credentials)",
      "Approve or defer customer/regulator disclosure",
      "Commission a full forensic review before further action",
    ],
    business_impact: {
      band: "Critical",
      rationale:
        "Illustrative — a confirmed security incident with data exposure typically carries disclosure obligations and reputational exposure independent of direct financial loss; not a live calculation.",
    },
    typical_risks: [
      "Premature containment destroying forensic evidence",
      "Delayed disclosure creating additional regulatory exposure",
    ],
    governance_requirements: [
      "Security incident response policy sign-off for containment actions",
      "Legal review before any external disclosure",
    ],
    success_metrics: [
      "Time from signal to containment decision",
      "Disclosure timeline compliance where legally required",
    ],
    expected_outcomes: [
      "A documented incident decision trail suitable for post-incident and regulatory review",
    ],
    estimated_time_to_decision: "Hours to a few business days depending on severity (illustrative)",
    recommended_roles: ["Chief Information Security Officer", "General Counsel", "Chief Technology Officer"],
    required_capabilities: [...BASE_CAPABILITIES, "connector_framework", "rts_1", "observability"],
  },
];

/**
 * Six templates, in the fixed order above. Returned as fresh objects each
 * call (safe to mutate by the caller) but always in the same deterministic
 * order and content — no randomness, no live data.
 */
export function getScenarioTemplates(): ScenarioTemplate[] {
  return SCENARIO_TEMPLATE_SEEDS.map((seed) => ({
    ...seed,
    implementation_status: resolveCapabilityUsage(seed.required_capabilities),
  }));
}

export function getScenarioTemplate(templateId: string): ScenarioTemplate | null {
  const seed = SCENARIO_TEMPLATE_SEEDS.find((entry) => entry.template_id === templateId);
  if (!seed) return null;
  return {
    ...seed,
    implementation_status: resolveCapabilityUsage(seed.required_capabilities),
  };
}

export const SCENARIO_TEMPLATE_IDS = SCENARIO_TEMPLATE_SEEDS.map((seed) => seed.template_id);
