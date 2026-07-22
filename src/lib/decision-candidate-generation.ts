import { z } from "zod";

import type { EnterpriseVerifiedFact } from "@/lib/verified-fact-promotion";

export const DECISION_CANDIDATE_SCHEMA_VERSION = "quantivis.enterprise-decision-candidate.v1";
export const DECISION_CANDIDATE_ENGINE_VERSION = "rts-1e.1";

export type CandidateGenerationPolicy = "STRICT" | "STANDARD" | "ADVISORY";
export type CandidateGenerationStatus = "CANDIDATES_GENERATED" | "NO_DECISION_CANDIDATES";
export type DecisionCandidateClass = "INFORMATIONAL" | "ADVISORY" | "OPERATIONAL" | "STRATEGIC" | "REGULATORY";
export type DecisionCandidateStatus =
  | "NEW"
  | "READY_FOR_GATEWAY"
  | "SUBMITTED_TO_AG2"
  | "REJECTED"
  | "EXPIRED"
  | "SUPERSEDED"
  | "ARCHIVED";
export type CandidateRiskLevel = "low" | "medium" | "high" | "critical";
export type CandidateUrgency = "low" | "medium" | "high" | "critical";
export type CandidateMateriality = "low" | "medium" | "high" | "critical";

export interface DecisionOption {
  option_id: string;
  description: string;
  advantages: string[];
  disadvantages: string[];
  expected_impact: string;
}

export interface EnterpriseDecisionCandidate {
  candidate_id: string;
  candidate_version: number;
  candidate_class: DecisionCandidateClass;
  tenant_id: string;
  organization_id: string;
  title: string;
  summary: string;
  recommended_action: string;
  decision_type: string;
  supporting_fact_ids: string[];
  supporting_signal_ids: string[];
  supporting_raw_event_ids: string[];
  confidence: number;
  business_impact: {
    financial: string;
    operational: string;
    compliance: string;
    customer: string;
    strategic: string;
    time: string;
  };
  risk_level: CandidateRiskLevel;
  urgency: CandidateUrgency;
  materiality: CandidateMateriality;
  estimated_value: number;
  estimated_cost: number;
  estimated_time_to_execute: string;
  required_approvals: string[];
  decision_owner: string;
  affected_business_units: string[];
  affected_systems: string[];
  dependencies: string[];
  constraints: string[];
  decision_rationale: string[];
  alternative_options: DecisionOption[];
  recommended_option: DecisionOption;
  expected_outcomes: string[];
  success_metrics: string[];
  expiration_time: string;
  status: DecisionCandidateStatus;
  lineage: {
    enterprise_verified_facts: string[];
    signal_ids: string[];
    raw_event_ids: string[];
    promotion_policies: string[];
    promotion_engine_versions: string[];
    signal_quality_summary: Array<{
      fact_id: string;
      average_quality: number;
      minimum_quality: number;
      signal_count: number;
    }>;
    accepted_contradictions: string[];
    resolved_contradictions: string[];
    fact_hashes: string[];
  };
  candidate_hash: string;
  audit_reference: string | null;
  schema_version: typeof DECISION_CANDIDATE_SCHEMA_VERSION;
}

export interface CandidateGenerationInput {
  facts: EnterpriseVerifiedFact[];
  generation_policy: CandidateGenerationPolicy;
  now: string;
  enterprise_config?: {
    candidate_ttl_hours?: number;
    estimated_value_by_fact_type?: Record<string, number>;
    estimated_cost_by_fact_type?: Record<string, number>;
    action_overrides_by_fact_type?: Record<string, string>;
    decision_owner_by_fact_type?: Record<string, string>;
    blocking_contradiction_ids?: string[];
    candidate_version?: number;
    audit_reference?: string | null;
  };
}

export interface CandidateGenerationResult {
  status: CandidateGenerationStatus;
  candidates: EnterpriseDecisionCandidate[];
  explanation: string[];
}

const ScoreSchema = z.number().finite().min(0).max(100);
const NonEmptyStringSchema = z.string().min(1);
const DecisionOptionSchema = z.object({
  option_id: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  advantages: z.array(NonEmptyStringSchema).min(1),
  disadvantages: z.array(NonEmptyStringSchema).min(1),
  expected_impact: NonEmptyStringSchema,
});

export const DecisionCandidateSchema = z.object({
  candidate_id: NonEmptyStringSchema,
  candidate_version: z.number().int().positive(),
  candidate_class: z.enum(["INFORMATIONAL", "ADVISORY", "OPERATIONAL", "STRATEGIC", "REGULATORY"]),
  tenant_id: NonEmptyStringSchema,
  organization_id: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  recommended_action: NonEmptyStringSchema,
  decision_type: NonEmptyStringSchema,
  supporting_fact_ids: z.array(NonEmptyStringSchema).min(1),
  supporting_signal_ids: z.array(NonEmptyStringSchema).min(1),
  supporting_raw_event_ids: z.array(NonEmptyStringSchema).min(1),
  confidence: ScoreSchema,
  business_impact: z.object({
    financial: NonEmptyStringSchema,
    operational: NonEmptyStringSchema,
    compliance: NonEmptyStringSchema,
    customer: NonEmptyStringSchema,
    strategic: NonEmptyStringSchema,
    time: NonEmptyStringSchema,
  }),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  urgency: z.enum(["low", "medium", "high", "critical"]),
  materiality: z.enum(["low", "medium", "high", "critical"]),
  estimated_value: z.number().finite().min(0),
  estimated_cost: z.number().finite().min(0),
  estimated_time_to_execute: NonEmptyStringSchema,
  required_approvals: z.array(NonEmptyStringSchema).min(1),
  decision_owner: NonEmptyStringSchema,
  affected_business_units: z.array(NonEmptyStringSchema),
  affected_systems: z.array(NonEmptyStringSchema),
  dependencies: z.array(NonEmptyStringSchema),
  constraints: z.array(NonEmptyStringSchema),
  decision_rationale: z.array(NonEmptyStringSchema).min(1),
  alternative_options: z.array(DecisionOptionSchema).min(1),
  recommended_option: DecisionOptionSchema,
  expected_outcomes: z.array(NonEmptyStringSchema).min(1),
  success_metrics: z.array(NonEmptyStringSchema).min(1),
  expiration_time: z.string().datetime({ offset: true }),
  status: z.enum(["NEW", "READY_FOR_GATEWAY", "SUBMITTED_TO_AG2", "REJECTED", "EXPIRED", "SUPERSEDED", "ARCHIVED"]),
  lineage: z.object({
    enterprise_verified_facts: z.array(NonEmptyStringSchema).min(1),
    signal_ids: z.array(NonEmptyStringSchema).min(1),
    raw_event_ids: z.array(NonEmptyStringSchema).min(1),
    promotion_policies: z.array(NonEmptyStringSchema).min(1),
    promotion_engine_versions: z.array(NonEmptyStringSchema).min(1),
    signal_quality_summary: z.array(z.object({
      fact_id: NonEmptyStringSchema,
      average_quality: ScoreSchema,
      minimum_quality: ScoreSchema,
      signal_count: z.number().int().positive(),
    })).min(1),
    accepted_contradictions: z.array(NonEmptyStringSchema),
    resolved_contradictions: z.array(NonEmptyStringSchema),
    fact_hashes: z.array(NonEmptyStringSchema).min(1),
  }),
  candidate_hash: NonEmptyStringSchema,
  audit_reference: z.string().min(1).nullable(),
  schema_version: z.literal(DECISION_CANDIDATE_SCHEMA_VERSION),
});

const POLICY_THRESHOLDS: Record<CandidateGenerationPolicy, { quality: number; confidence: number }> = {
  STRICT: { quality: 95, confidence: 90 },
  STANDARD: { quality: 85, confidence: 80 },
  ADVISORY: { quality: 70, confidence: 70 },
};

export function generateDecisionCandidates(input: CandidateGenerationInput): CandidateGenerationResult {
  const facts = [...input.facts].sort((a, b) => a.fact_id.localeCompare(b.fact_id));
  const explanation: string[] = [];
  const failures: string[] = [];
  const thresholds = POLICY_THRESHOLDS[input.generation_policy];

  if (facts.length === 0) failures.push("no Enterprise Verified Facts were provided");

  const tenantIds = sortedUnique(facts.map((fact) => fact.tenant_id));
  const organizationIds = sortedUnique(facts.map((fact) => fact.organization_id));
  if (tenantIds.length > 1) failures.push("tenant mismatch across supporting Enterprise Verified Facts");
  if (organizationIds.length > 1) failures.push("organization mismatch across supporting Enterprise Verified Facts");

  for (const fact of facts) {
    if (fact.status !== "VERIFIED" && fact.status !== "ACTIVE") {
      failures.push(`EVF ${fact.fact_id} status ${fact.status} is not eligible for candidate generation`);
    }
    if (fact.expires_at && new Date(fact.expires_at).getTime() <= new Date(input.now).getTime()) {
      failures.push(`EVF ${fact.fact_id} is expired`);
    }
    if (fact.quality_score < thresholds.quality) {
      failures.push(`EVF ${fact.fact_id} quality ${fact.quality_score} is below ${input.generation_policy} threshold ${thresholds.quality}`);
    }
    if (fact.confidence < thresholds.confidence) {
      failures.push(`EVF ${fact.fact_id} confidence ${fact.confidence} is below ${input.generation_policy} threshold ${thresholds.confidence}`);
    }
  }

  const blockingContradictions = new Set(input.enterprise_config?.blocking_contradiction_ids ?? []);
  const factContradictions = sortedUnique(facts.flatMap((fact) => [...fact.accepted_contradictions, ...fact.resolved_contradictions]));
  const blockingMatch = factContradictions.find((contradictionId) => blockingContradictions.has(contradictionId));
  if (blockingMatch) failures.push(`blocking contradiction ${blockingMatch} prevents candidate generation`);

  explanation.push(`generation policy ${input.generation_policy} requires quality >=${thresholds.quality} and confidence >=${thresholds.confidence}.`);
  explanation.push(`evaluated ${facts.length} Enterprise Verified Fact${facts.length === 1 ? "" : "s"}.`);

  if (failures.length > 0) {
    return {
      status: "NO_DECISION_CANDIDATES",
      candidates: [],
      explanation: [...explanation, ...failures.map((failure) => `no candidate: ${failure}.`)],
    };
  }

  const candidate = buildCandidate(facts, input);
  return {
    status: "CANDIDATES_GENERATED",
    candidates: [candidate],
    explanation: [
      ...explanation,
      `generated ${candidate.candidate_class} Decision Candidate ${candidate.candidate_id}.`,
      ...candidate.decision_rationale,
    ],
  };
}

function buildCandidate(facts: EnterpriseVerifiedFact[], input: CandidateGenerationInput): EnterpriseDecisionCandidate {
  const primaryFact = facts[0];
  const decisionType = deriveDecisionType(facts);
  const estimatedValue = estimateValue(facts, input.enterprise_config?.estimated_value_by_fact_type);
  const estimatedCost = estimateCost(facts, input.enterprise_config?.estimated_cost_by_fact_type, estimatedValue);
  const candidateClass = classifyCandidate(facts, estimatedValue);
  const confidence = Math.round(Math.min(...facts.map((fact) => fact.confidence)));
  const riskLevel = deriveRiskLevel(facts, estimatedValue, candidateClass);
  const urgency = deriveUrgency(facts, riskLevel);
  const materiality = deriveMateriality(estimatedValue, riskLevel, candidateClass);
  const recommendedAction =
    input.enterprise_config?.action_overrides_by_fact_type?.[primaryFact.fact_type] ?? recommendedActionFor(decisionType);
  const recommendedOption = buildRecommendedOption(decisionType);
  const alternativeOptions = buildAlternativeOptions(decisionType);
  const ttlHours = input.enterprise_config?.candidate_ttl_hours ?? 24;
  const expirationTime = addHours(input.now, ttlHours);
  const status: DecisionCandidateStatus =
    candidateClass === "INFORMATIONAL" || candidateClass === "ADVISORY" ? "NEW" : "READY_FOR_GATEWAY";
  const lineage = {
    enterprise_verified_facts: sortedUnique(facts.map((fact) => fact.fact_id)),
    signal_ids: sortedUnique(facts.flatMap((fact) => fact.supporting_signal_ids)),
    raw_event_ids: sortedUnique(facts.flatMap((fact) => fact.supporting_raw_event_ids)),
    promotion_policies: sortedUnique(facts.map((fact) => fact.promotion_policy)),
    promotion_engine_versions: sortedUnique(facts.map((fact) => fact.promotion_engine_version)),
    signal_quality_summary: facts.map((fact) => ({
      fact_id: fact.fact_id,
      average_quality: fact.signal_quality_summary.average_quality,
      minimum_quality: fact.signal_quality_summary.minimum_quality,
      signal_count: fact.signal_quality_summary.signal_count,
    })).sort((a, b) => a.fact_id.localeCompare(b.fact_id)),
    accepted_contradictions: sortedUnique(facts.flatMap((fact) => fact.accepted_contradictions)),
    resolved_contradictions: sortedUnique(facts.flatMap((fact) => fact.resolved_contradictions)),
    fact_hashes: sortedUnique(facts.map((fact) => fact.fact_hash)),
  };
  const decisionRationale = buildRationale(facts, input.generation_policy);
  const withoutHash: Omit<EnterpriseDecisionCandidate, "candidate_hash"> = {
    candidate_id: deriveCandidateId(facts, decisionType),
    candidate_version: input.enterprise_config?.candidate_version ?? 1,
    candidate_class: candidateClass,
    tenant_id: primaryFact.tenant_id,
    organization_id: primaryFact.organization_id,
    title: titleFor(decisionType),
    summary: summaryFor(facts, decisionType),
    recommended_action: recommendedAction,
    decision_type: decisionType,
    supporting_fact_ids: lineage.enterprise_verified_facts,
    supporting_signal_ids: lineage.signal_ids,
    supporting_raw_event_ids: lineage.raw_event_ids,
    confidence,
    business_impact: buildBusinessImpact(decisionType, estimatedValue, riskLevel),
    risk_level: riskLevel,
    urgency,
    materiality,
    estimated_value: estimatedValue,
    estimated_cost: estimatedCost,
    estimated_time_to_execute: estimatedTimeFor(decisionType, candidateClass),
    required_approvals: requiredApprovalsFor(candidateClass, decisionType, estimatedValue),
    decision_owner: input.enterprise_config?.decision_owner_by_fact_type?.[primaryFact.fact_type] ?? decisionOwnerFor(decisionType),
    affected_business_units: affectedBusinessUnitsFor(decisionType),
    affected_systems: affectedSystemsFor(decisionType),
    dependencies: dependenciesFor(decisionType),
    constraints: constraintsFor(facts, decisionType),
    decision_rationale: decisionRationale,
    alternative_options: alternativeOptions,
    recommended_option: recommendedOption,
    expected_outcomes: expectedOutcomesFor(decisionType, estimatedValue),
    success_metrics: successMetricsFor(decisionType),
    expiration_time: expirationTime,
    status,
    lineage,
    audit_reference: input.enterprise_config?.audit_reference ?? null,
    schema_version: DECISION_CANDIDATE_SCHEMA_VERSION,
  };

  return {
    ...withoutHash,
    candidate_hash: stableHash(withoutHash),
  };
}

function deriveDecisionType(facts: EnterpriseVerifiedFact[]): string {
  const text = facts.map((fact) => `${fact.fact_type} ${fact.assertion}`).join(" ").toLowerCase();
  if (/observation|status|informational/.test(text)) return "operational_observation";
  if (/regulatory|compliance|policy|audit|evidence/.test(text)) return "regulatory_governance_review";
  if (/supplier|delivery|vendor|purchase/.test(text)) return "supplier_risk_mitigation";
  if (/inventory|stock|warehouse|production/.test(text)) return "inventory_rebalancing";
  if (/cyber|security|incident|vulnerability/.test(text)) return "security_risk_response";
  if (/finance|revenue|margin|cash|cost/.test(text)) return "financial_risk_review";
  return "operational_decision";
}

function classifyCandidate(facts: EnterpriseVerifiedFact[], estimatedValue: number): DecisionCandidateClass {
  const decisionType = deriveDecisionType(facts);
  const text = facts.map((fact) => `${fact.fact_type} ${fact.assertion}`).join(" ").toLowerCase();
  if (decisionType === "regulatory_governance_review") return "REGULATORY";
  if (estimatedValue >= 2_000_000 || /strategic|market|portfolio|merger|capacity/.test(text)) return "STRATEGIC";
  if (decisionType === "operational_observation") return "ADVISORY";
  if (estimatedValue === 0 && facts.every((fact) => fact.confidence < 80)) return "INFORMATIONAL";
  return "OPERATIONAL";
}

function estimateValue(facts: EnterpriseVerifiedFact[], configured: Record<string, number> | undefined): number {
  const configuredValues = facts.map((fact) => configured?.[fact.fact_type]).filter((value): value is number => typeof value === "number");
  if (configuredValues.length > 0) return Math.max(...configuredValues);
  const text = facts.map((fact) => `${fact.fact_type} ${fact.assertion}`).join(" ").toLowerCase();
  if (/supplier|delivery|inventory|production/.test(text)) return 750_000;
  if (/regulatory|compliance/.test(text)) return 500_000;
  if (/financial|revenue|margin/.test(text)) return 1_000_000;
  return 100_000;
}

function estimateCost(facts: EnterpriseVerifiedFact[], configured: Record<string, number> | undefined, estimatedValue: number): number {
  const configuredCosts = facts.map((fact) => configured?.[fact.fact_type]).filter((value): value is number => typeof value === "number");
  if (configuredCosts.length > 0) return Math.max(...configuredCosts);
  return Math.round(estimatedValue * 0.08);
}

function deriveRiskLevel(
  facts: EnterpriseVerifiedFact[],
  estimatedValue: number,
  candidateClass: DecisionCandidateClass,
): CandidateRiskLevel {
  if (candidateClass === "REGULATORY" || estimatedValue >= 5_000_000) return "critical";
  if (candidateClass === "STRATEGIC" || estimatedValue >= 500_000) return "high";
  if (facts.some((fact) => fact.accepted_contradictions.length > 0)) return "medium";
  return "medium";
}

function deriveUrgency(facts: EnterpriseVerifiedFact[], riskLevel: CandidateRiskLevel): CandidateUrgency {
  const text = facts.map((fact) => fact.assertion).join(" ").toLowerCase();
  if (riskLevel === "critical" || /24 hours|48 hours|72 hours|urgent|immediate/.test(text)) return "critical" === riskLevel ? "critical" : "high";
  if (riskLevel === "high") return "high";
  if (riskLevel === "medium") return "medium";
  return "low";
}

function deriveMateriality(
  estimatedValue: number,
  riskLevel: CandidateRiskLevel,
  candidateClass: DecisionCandidateClass,
): CandidateMateriality {
  if (riskLevel === "critical" || candidateClass === "REGULATORY" || estimatedValue >= 5_000_000) return "critical";
  if (riskLevel === "high" || estimatedValue >= 500_000) return "high";
  if (estimatedValue >= 100_000) return "medium";
  return "low";
}

function titleFor(decisionType: string): string {
  switch (decisionType) {
    case "supplier_risk_mitigation":
      return "Supplier delivery risk mitigation decision";
    case "inventory_rebalancing":
      return "Inventory rebalancing decision";
    case "regulatory_governance_review":
      return "Regulatory governance review decision";
    case "security_risk_response":
      return "Security risk response decision";
    case "financial_risk_review":
      return "Financial risk review decision";
    case "operational_observation":
      return "Operational observation review";
    default:
      return "Operational decision candidate";
  }
}

function summaryFor(facts: EnterpriseVerifiedFact[], decisionType: string): string {
  return `${titleFor(decisionType)} generated from ${facts.length} Enterprise Verified Fact${facts.length === 1 ? "" : "s"}: ${facts.map((fact) => fact.assertion).join(" ")}`;
}

function recommendedActionFor(decisionType: string): string {
  switch (decisionType) {
    case "supplier_risk_mitigation":
      return "Review supplier mitigation options and approve an operational response before the delivery risk materializes.";
    case "inventory_rebalancing":
      return "Review inventory rebalancing options and approve the lowest-risk operational plan.";
    case "regulatory_governance_review":
      return "Initiate governance review and assign compliance ownership before downstream decisioning.";
    case "security_risk_response":
      return "Escalate to security response owner and approve containment planning.";
    case "financial_risk_review":
      return "Review financial exposure and approve mitigation or escalation path.";
    default:
      return "Review the verified fact and determine whether governed action is needed.";
  }
}

function buildRecommendedOption(decisionType: string): DecisionOption {
  const label = decisionTypeLabel(decisionType);
  return {
    option_id: `${decisionType}-recommended`,
    description: `Mitigate ${label} using the governed recommended action.`,
    advantages: ["Uses verified enterprise facts", "Creates auditable decision lineage", "Can be routed to AG-2 when ready"],
    disadvantages: ["Requires approval effort", "May require cross-functional coordination"],
    expected_impact: `Reduces ${label} exposure while preserving governance evidence.`,
  };
}

function buildAlternativeOptions(decisionType: string): DecisionOption[] {
  const label = decisionTypeLabel(decisionType);
  return [
    {
      option_id: `${decisionType}-alternative-a`,
      description: `Escalate ${label} for manual review`,
      advantages: ["Adds human scrutiny", "Useful when accountability is unclear"],
      disadvantages: ["Slower response", "May delay measurable mitigation"],
      expected_impact: "Improves oversight but may defer operational benefit.",
    },
    {
      option_id: `${decisionType}-alternative-b`,
      description: `Monitor ${label} until the next verified fact refresh`,
      advantages: ["Avoids premature action", "Preserves optionality"],
      disadvantages: ["Risk may increase during the waiting period", "May miss execution window"],
      expected_impact: "Reduces immediate workload but increases time sensitivity.",
    },
    {
      option_id: `${decisionType}-no-action`,
      description: "Take no immediate action",
      advantages: ["No execution cost", "Avoids operational disruption"],
      disadvantages: ["Known risk remains unmanaged", "May weaken audit defensibility"],
      expected_impact: "No mitigation occurs; risk remains dependent on external change.",
    },
  ];
}

function buildBusinessImpact(decisionType: string, estimatedValue: number, riskLevel: CandidateRiskLevel): EnterpriseDecisionCandidate["business_impact"] {
  return {
    financial: `Estimated value at stake is ${estimatedValue}.`,
    operational: `Operational exposure is ${riskLevel} for ${decisionType}.`,
    compliance: decisionType === "regulatory_governance_review" ? "Compliance action is directly implicated." : "No direct compliance action identified by RTS-1E.",
    customer: /supplier|inventory|operational/.test(decisionType) ? "Customer delivery or service reliability may be affected." : "Customer impact is indirect.",
    strategic: riskLevel === "critical" || riskLevel === "high" ? "May affect executive operating priorities." : "Strategic impact is limited.",
    time: "Candidate expires unless reviewed within the configured TTL.",
  };
}

function expectedOutcomesFor(decisionType: string, estimatedValue: number): string[] {
  if (decisionType === "supplier_risk_mitigation") {
    return [
      "Supplier delivery risk is reduced or escalated with accountable owner.",
      `Potential value protected: ${estimatedValue}.`,
      "Decision lineage is ready for AG-2 governance.",
    ];
  }
  if (decisionType === "regulatory_governance_review") {
    return ["Compliance owner assigned.", "Evidence gap is tracked before downstream approval.", "Audit trail remains defensible."];
  }
  return ["Verified fact receives governed review.", "Action path is documented.", "Outcome can be measured after execution."];
}

function successMetricsFor(decisionType: string): string[] {
  if (decisionType === "supplier_risk_mitigation") {
    return ["Delivery variance reduced", "At-risk revenue protected", "Supplier mitigation completed before deadline"];
  }
  if (decisionType === "inventory_rebalancing") return ["Stockout risk reduced", "Production interruption avoided", "Inventory variance reconciled"];
  if (decisionType === "regulatory_governance_review") return ["Evidence gap closed", "Compliance owner assigned", "Governance review completed"];
  return ["Decision reviewed", "Owner assigned", "Outcome tracked"];
}

function requiredApprovalsFor(candidateClass: DecisionCandidateClass, decisionType: string, estimatedValue: number): string[] {
  const approvals = ["Decision Owner"];
  if (candidateClass === "REGULATORY") approvals.push("Compliance Officer");
  if (/supplier|inventory|operational/.test(decisionType)) approvals.push("Operations Lead");
  if (estimatedValue >= 500_000) approvals.push("Finance Approver");
  if (candidateClass === "STRATEGIC" || estimatedValue >= 1_000_000) approvals.push("Executive Sponsor");
  return sortedUniquePreserveOrder(approvals);
}

function decisionOwnerFor(decisionType: string): string {
  if (decisionType === "regulatory_governance_review") return "Compliance Officer";
  if (decisionType === "security_risk_response") return "Security Lead";
  if (decisionType === "financial_risk_review") return "Finance Lead";
  return "Operations Lead";
}

function affectedBusinessUnitsFor(decisionType: string): string[] {
  if (decisionType === "supplier_risk_mitigation") return ["Operations", "Procurement", "Finance"];
  if (decisionType === "inventory_rebalancing") return ["Operations", "Supply Chain"];
  if (decisionType === "regulatory_governance_review") return ["Compliance", "Legal", "Operations"];
  return ["Operations"];
}

function affectedSystemsFor(decisionType: string): string[] {
  if (decisionType === "supplier_risk_mitigation") return ["ERP", "Supplier Portal", "Decision Ledger"];
  if (decisionType === "inventory_rebalancing") return ["WMS", "ERP", "Decision Ledger"];
  if (decisionType === "regulatory_governance_review") return ["Policy Register", "Evidence Store", "Decision Ledger"];
  return ["Decision Ledger"];
}

function dependenciesFor(decisionType: string): string[] {
  if (decisionType === "supplier_risk_mitigation") return ["Supplier confirmation", "Inventory position", "Operations owner"];
  if (decisionType === "regulatory_governance_review") return ["Compliance owner", "Evidence package"];
  return ["Decision owner", "Supporting evidence"];
}

function constraintsFor(facts: EnterpriseVerifiedFact[], decisionType: string): string[] {
  const constraints = ["Candidate must be submitted before expiration.", "Only AG-2 may perform governance routing."];
  if (facts.some((fact) => fact.accepted_contradictions.length > 0)) {
    constraints.push("Accepted contradictions must remain visible in downstream review.");
  }
  if (decisionType === "regulatory_governance_review") constraints.push("Compliance review is mandatory before approval.");
  return constraints;
}

function buildRationale(facts: EnterpriseVerifiedFact[], policy: CandidateGenerationPolicy): string[] {
  return [
    ...facts.map((fact) => `EVF ${fact.fact_id} supports candidate generation: ${fact.assertion}`),
    `All supporting EVFs are VERIFIED or ACTIVE.`,
    `Generation policy ${policy} thresholds were satisfied.`,
    `No blocking contradictions were present.`,
    `Candidate is deterministic and contains complete lineage.`,
  ];
}

function estimatedTimeFor(decisionType: string, candidateClass: DecisionCandidateClass): string {
  if (candidateClass === "REGULATORY") return "2-5 business days";
  if (decisionType === "supplier_risk_mitigation") return "24-72 hours";
  if (candidateClass === "STRATEGIC") return "3-10 business days";
  return "1-3 business days";
}

function decisionTypeLabel(decisionType: string): string {
  if (decisionType === "supplier_risk_mitigation") return "supplier delivery risk";
  return decisionType.replace(/_/g, " ");
}

function deriveCandidateId(facts: EnterpriseVerifiedFact[], decisionType: string): string {
  return `candidate-${stableHash({
    decisionType,
    factIds: facts.map((fact) => fact.fact_id).sort(),
    factHashes: facts.map((fact) => fact.fact_hash).sort(),
  }).replace("fnv1a-", "")}`;
}

function addHours(iso: string, hours: number): string {
  const date = new Date(iso);
  date.setTime(date.getTime() + Math.max(1, hours) * 60 * 60 * 1000);
  return date.toISOString();
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sortedUniquePreserveOrder(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function stableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
