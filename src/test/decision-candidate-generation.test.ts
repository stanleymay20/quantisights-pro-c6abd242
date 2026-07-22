import { describe, expect, it } from "vitest";

import {
  DECISION_CANDIDATE_SCHEMA_VERSION,
  DecisionCandidateSchema,
  generateDecisionCandidates,
  type CandidateGenerationPolicy,
} from "@/lib/decision-candidate-generation";
import type { EnterpriseVerifiedFact } from "@/lib/verified-fact-promotion";

const now = "2026-07-04T10:00:00.000Z";

const baseFact: EnterpriseVerifiedFact = {
  fact_id: "evf-supplier-delay",
  fact_version: 1,
  tenant_id: "tenant-alpha",
  organization_id: "org-manufacturing",
  fact_type: "supplier_delivery_risk",
  assertion: "Supplier X will miss delivery by 72 hours.",
  supporting_signal_ids: ["signal-sap-delay", "signal-supplier-portal"],
  supporting_raw_event_ids: ["raw-sap-1", "raw-supplier-1"],
  supporting_evidence: ["evidence-po-92831", "evidence-supplier-confirmation"],
  quality_score: 98,
  confidence: 96,
  promotion_policy: "STRICT",
  promotion_reason: "Promoted because STRICT policy thresholds were met.",
  promotion_engine_version: "rts-1d.1",
  signal_quality_summary: {
    average_quality: 98,
    minimum_quality: 97,
    signal_count: 2,
  },
  resolved_contradictions: [],
  accepted_contradictions: [],
  fact_hash: "fnv1a-facthash1",
  created_at: now,
  expires_at: "2026-07-05T10:00:00.000Z",
  status: "VERIFIED",
  lineage: {
    raw_events: ["raw-sap-1", "raw-supplier-1"],
    signals: ["signal-sap-delay", "signal-supplier-portal"],
    quality_assessments: ["signal-sap-delay", "signal-supplier-portal"],
    contradictions: [],
    promotion_policy: "STRICT",
    promotion_engine_version: "rts-1d.1",
    previous_fact_hashes: [],
  },
  audit_reference: "audit-evf-1",
  certification_reference: "cert-evf-1",
  schema_version: "quantivis.enterprise-verified-fact.v1",
};

function fact(overrides: Partial<EnterpriseVerifiedFact> = {}): EnterpriseVerifiedFact {
  return {
    ...baseFact,
    ...overrides,
    signal_quality_summary: {
      ...baseFact.signal_quality_summary,
      ...overrides.signal_quality_summary,
    },
    lineage: {
      ...baseFact.lineage,
      ...overrides.lineage,
    },
  };
}

function generate(
  facts: EnterpriseVerifiedFact[] = [baseFact],
  policy: CandidateGenerationPolicy = "STANDARD",
  overrides = {},
) {
  return generateDecisionCandidates({
    facts,
    generation_policy: policy,
    now,
    ...overrides,
  });
}

describe("RTS-1E Enterprise Decision Candidate generation", () => {
  it("generates a governed Decision Candidate from a verified Enterprise Verified Fact", () => {
    const result = generate();

    expect(result.status).toBe("CANDIDATES_GENERATED");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      candidate_version: 1,
      candidate_class: "OPERATIONAL",
      tenant_id: "tenant-alpha",
      organization_id: "org-manufacturing",
      decision_type: "supplier_risk_mitigation",
      confidence: 96,
      risk_level: "high",
      urgency: "high",
      materiality: "high",
      status: "READY_FOR_GATEWAY",
      schema_version: DECISION_CANDIDATE_SCHEMA_VERSION,
    });
    expect(result.candidates[0].title).toContain("Supplier delivery risk");
    expect(result.candidates[0].supporting_fact_ids).toEqual(["evf-supplier-delay"]);
    expect(result.candidates[0].supporting_signal_ids).toEqual(["signal-sap-delay", "signal-supplier-portal"]);
    expect(result.candidates[0].supporting_raw_event_ids).toEqual(["raw-sap-1", "raw-supplier-1"]);
    expect(result.candidates[0].candidate_hash).toMatch(/^fnv1a-/);
    expect(result.explanation.join(" ")).toContain("generated");
    expect(DecisionCandidateSchema.safeParse(result.candidates[0]).success).toBe(true);
  });

  it("combines multiple EVFs with complete lineage", () => {
    const inventoryFact = fact({
      fact_id: "evf-inventory-shortage",
      fact_type: "inventory_shortage",
      assertion: "Region A inventory will be below safety stock within 48 hours.",
      supporting_signal_ids: ["signal-warehouse-shortage"],
      supporting_raw_event_ids: ["raw-warehouse-1"],
      supporting_evidence: ["evidence-warehouse-count"],
      fact_hash: "fnv1a-facthash2",
      lineage: {
        ...baseFact.lineage,
        raw_events: ["raw-warehouse-1"],
        signals: ["signal-warehouse-shortage"],
        quality_assessments: ["signal-warehouse-shortage"],
      },
    });

    const result = generate([baseFact, inventoryFact]);

    expect(result.status).toBe("CANDIDATES_GENERATED");
    expect(result.candidates[0].supporting_fact_ids).toEqual(["evf-inventory-shortage", "evf-supplier-delay"]);
    expect(result.candidates[0].lineage.enterprise_verified_facts).toEqual(["evf-inventory-shortage", "evf-supplier-delay"]);
    expect(result.candidates[0].lineage.signal_ids).toEqual([
      "signal-sap-delay",
      "signal-supplier-portal",
      "signal-warehouse-shortage",
    ]);
    expect(result.candidates[0].lineage.promotion_policies).toEqual(["STRICT"]);
    expect(result.candidates[0].lineage.promotion_engine_versions).toEqual(["rts-1d.1"]);
  });

  it("does not generate candidates from expired EVFs", () => {
    const result = generate([fact({ expires_at: "2026-07-04T09:59:59.000Z" })]);

    expect(result.status).toBe("NO_DECISION_CANDIDATES");
    expect(result.candidates).toEqual([]);
    expect(result.explanation.join(" ")).toContain("expired");
  });

  it("does not generate candidates when tenants mismatch", () => {
    const result = generate([baseFact, fact({ tenant_id: "tenant-beta", fact_id: "evf-other-tenant" })]);

    expect(result.status).toBe("NO_DECISION_CANDIDATES");
    expect(result.explanation.join(" ")).toContain("tenant mismatch");
  });

  it("does not generate candidates when organizations mismatch", () => {
    const result = generate([baseFact, fact({ organization_id: "org-other", fact_id: "evf-other-org" })]);

    expect(result.status).toBe("NO_DECISION_CANDIDATES");
    expect(result.explanation.join(" ")).toContain("organization mismatch");
  });

  it("does not generate candidates from facts with blocking contradictions", () => {
    const result = generate([fact({ accepted_contradictions: ["contradiction-high-inventory"] })], "STANDARD", {
      enterprise_config: {
        blocking_contradiction_ids: ["contradiction-high-inventory"],
      },
    });

    expect(result.status).toBe("NO_DECISION_CANDIDATES");
    expect(result.explanation.join(" ")).toContain("blocking contradiction");
  });

  it("assigns REGULATORY class for compliance facts", () => {
    const result = generate([
      fact({
        fact_type: "regulatory_compliance_gap",
        assertion: "AI usage evidence is missing for regulated workflow X.",
        quality_score: 94,
        confidence: 91,
      }),
    ]);

    expect(result.candidates[0].candidate_class).toBe("REGULATORY");
    expect(result.candidates[0].required_approvals).toContain("Compliance Officer");
  });

  it("assigns STRATEGIC class for high-value strategic facts", () => {
    const result = generate(undefined, "STANDARD", {
      enterprise_config: {
        estimated_value_by_fact_type: {
          supplier_delivery_risk: 2_500_000,
        },
      },
    });

    expect(result.candidates[0].candidate_class).toBe("STRATEGIC");
    expect(result.candidates[0].estimated_value).toBe(2_500_000);
  });

  it("sets configurable candidate expiration and never emits an already expired candidate", () => {
    const result = generate(undefined, "STANDARD", {
      enterprise_config: {
        candidate_ttl_hours: 6,
      },
    });

    expect(result.candidates[0].expiration_time).toBe("2026-07-04T16:00:00.000Z");
    expect(new Date(result.candidates[0].expiration_time).getTime()).toBeGreaterThan(new Date(now).getTime());
  });

  it("creates deterministic candidate hashes and deterministic output for identical input", () => {
    const first = generate();
    const second = generate(JSON.parse(JSON.stringify([baseFact])));

    expect(first.candidates[0].candidate_hash).toBe(second.candidates[0].candidate_hash);
    expect(first.candidates[0]).toEqual(second.candidates[0]);
  });

  it("changes candidate hash when the governed action changes", () => {
    const first = generate();
    const second = generate(undefined, "STANDARD", {
      enterprise_config: {
        action_overrides_by_fact_type: {
          supplier_delivery_risk: "Escalate supplier remediation without switching source.",
        },
      },
    });

    expect(first.candidates[0].candidate_hash).not.toBe(second.candidates[0].candidate_hash);
  });

  it("includes deterministic alternatives, recommended option, outcomes, metrics, and rationale", () => {
    const result = generate();
    const candidate = result.candidates[0];

    expect(candidate.recommended_option.description).toContain("Mitigate supplier delivery risk");
    expect(candidate.alternative_options).toHaveLength(3);
    expect(candidate.alternative_options.map((option) => option.description)).toContain("Take no immediate action");
    expect(candidate.expected_outcomes.length).toBeGreaterThan(0);
    expect(candidate.success_metrics).toContain("Delivery variance reduced");
    expect(candidate.decision_rationale.join(" ")).toContain("EVF evf-supplier-delay");
  });

  it("derives required approvals deterministically", () => {
    const result = generate(undefined, "STANDARD", {
      enterprise_config: {
        estimated_value_by_fact_type: {
          supplier_delivery_risk: 1_250_000,
        },
      },
    });

    expect(result.candidates[0].required_approvals).toEqual([
      "Decision Owner",
      "Operations Lead",
      "Finance Approver",
      "Executive Sponsor",
    ]);
  });

  it("returns NO_DECISION_CANDIDATES when quality or confidence thresholds are not met", () => {
    const result = generate([fact({ quality_score: 79, confidence: 79 })]);

    expect(result.status).toBe("NO_DECISION_CANDIDATES");
    expect(result.explanation.join(" ")).toContain("quality 79 is below STANDARD threshold 85");
    expect(result.explanation.join(" ")).toContain("confidence 79 is below STANDARD threshold 80");
  });

  it("marks advisory low-materiality candidates as NEW instead of READY_FOR_GATEWAY", () => {
    const result = generate([
      fact({
        fact_type: "operational_observation",
        assertion: "Warehouse pick time increased by 2%.",
        quality_score: 88,
        confidence: 82,
      }),
    ]);

    expect(result.candidates[0].candidate_class).toBe("ADVISORY");
    expect(result.candidates[0].status).toBe("NEW");
  });

  it("rejects non-VERIFIED and non-ACTIVE EVFs", () => {
    const result = generate([fact({ status: "DRAFT" })]);

    expect(result.status).toBe("NO_DECISION_CANDIDATES");
    expect(result.explanation.join(" ")).toContain("status DRAFT is not eligible");
  });
});
