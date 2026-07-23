import { describe, expect, it } from "vitest";

import { AGENT_GATEWAY_VERSION, validateAgentGatewayRequest } from "@/lib/agent-gateway";
import {
  GatewaySubmissionRecordSchema,
  submitDecisionCandidateToGateway,
} from "@/lib/decision-candidate-handoff";
import {
  generateDecisionCandidates,
  type EnterpriseDecisionCandidate,
} from "@/lib/decision-candidate-generation";
import type { EnterpriseVerifiedFact } from "@/lib/verified-fact-promotion";

const now = "2026-07-05T10:00:00.000Z";

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
  created_at: "2026-07-05T09:00:00.000Z",
  expires_at: "2026-07-06T09:00:00.000Z",
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

function candidate(overrides: Partial<EnterpriseDecisionCandidate> = {}): EnterpriseDecisionCandidate {
  const result = generateDecisionCandidates({
    facts: [baseFact],
    generation_policy: "STANDARD",
    now,
  });
  if (result.status !== "CANDIDATES_GENERATED") throw new Error("candidate factory failed");
  return {
    ...result.candidates[0],
    ...overrides,
    lineage: {
      ...result.candidates[0].lineage,
      ...overrides.lineage,
    },
  };
}

function candidateWithActionOverride(action: string): EnterpriseDecisionCandidate {
  const result = generateDecisionCandidates({
    facts: [baseFact],
    generation_policy: "STANDARD",
    now,
    enterprise_config: {
      action_overrides_by_fact_type: {
        supplier_delivery_risk: action,
      },
    },
  });
  if (result.status !== "CANDIDATES_GENERATED") throw new Error("candidate override factory failed");
  return result.candidates[0];
}

function handoff(candidateInput: EnterpriseDecisionCandidate = candidate(), overrides = {}) {
  return submitDecisionCandidateToGateway(candidateInput, {
    agent_id: "quantivis-rts-1f",
    submitted_at: now,
    ...overrides,
  });
}

describe("RTS-1F deterministic AG-2 handoff", () => {
  it("maps a READY_FOR_GATEWAY Decision Candidate into a valid AG-2 request and submission record", () => {
    const result = handoff();

    expect(result.status).toBe("HANDOFF_READY");
    expect(result.gateway_request).toMatchObject({
      agent_id: "quantivis-rts-1f",
      tenant_id: "tenant-alpha",
      organization_id: "org-manufacturing",
      decision_type: "supplier_risk_mitigation",
      requested_action: expect.stringContaining("Review supplier mitigation"),
      confidence: 96,
      risk_level: "high",
    });
    expect(result.gateway_request?.idempotency_key).toContain("candidate-");
    expect(result.gateway_request?.evidence_references).toEqual([
      "evf:evf-supplier-delay",
      "evf-hash:fnv1a-facthash1",
    ]);
    expect(result.gateway_request?.metadata).toMatchObject({
      candidate_hash: expect.stringMatching(/^fnv1a-/),
      gateway_version: AGENT_GATEWAY_VERSION,
      decision_candidate_schema_version: "quantivis.enterprise-decision-candidate.v1",
      handoff_schema_version: "quantivis.gateway-submission-record.v1",
    });
    expect(validateAgentGatewayRequest(result.gateway_request).success).toBe(true);
    expect(GatewaySubmissionRecordSchema.safeParse(result.submission_record).success).toBe(true);
  });

  it("rejects expired candidates", () => {
    const result = handoff(candidate({ expiration_time: "2026-07-05T09:59:59.000Z" }));

    expect(result.status).toBe("HANDOFF_REJECTED");
    expect(result.gateway_request).toBeNull();
    expect(result.explanation.join(" ")).toContain("expired");
  });

  it("rejects wrong lifecycle states", () => {
    const result = handoff(candidate({ status: "NEW" }));

    expect(result.status).toBe("HANDOFF_REJECTED");
    expect(result.explanation.join(" ")).toContain("status NEW is not READY_FOR_GATEWAY");
  });

  it("rejects tenant mismatch against submission context", () => {
    const result = handoff(candidate(), { expected_tenant_id: "tenant-beta" });

    expect(result.status).toBe("HANDOFF_REJECTED");
    expect(result.explanation.join(" ")).toContain("tenant mismatch");
  });

  it("rejects organization mismatch against submission context", () => {
    const result = handoff(candidate(), { expected_organization_id: "org-other" });

    expect(result.status).toBe("HANDOFF_REJECTED");
    expect(result.explanation.join(" ")).toContain("organization mismatch");
  });

  it("rejects missing EVFs or evidence lineage", () => {
    const result = handoff(candidate({
      supporting_fact_ids: [],
      lineage: {
        ...candidate().lineage,
        enterprise_verified_facts: [],
        fact_hashes: [],
      },
    }));

    expect(result.status).toBe("HANDOFF_REJECTED");
    expect(result.explanation.join(" ")).toContain("missing EVF lineage");
    expect(result.explanation.join(" ")).toContain("missing evidence");
  });

  it("rejects invalid candidate hashes", () => {
    const result = handoff(candidate({ candidate_hash: "fnv1a-tampered" }));

    expect(result.status).toBe("HANDOFF_REJECTED");
    expect(result.explanation.join(" ")).toContain("invalid candidate hash");
  });

  it("rejects unsupported decision classes", () => {
    const result = handoff(candidate({
      candidate_class: "INFORMATIONAL",
      status: "READY_FOR_GATEWAY",
    }));

    expect(result.status).toBe("HANDOFF_REJECTED");
    expect(result.explanation.join(" ")).toContain("unsupported decision class INFORMATIONAL");
  });

  it("produces deterministic output for identical input", () => {
    const first = handoff();
    const second = handoff(JSON.parse(JSON.stringify(candidate())));

    expect(first).toEqual(second);
    expect(first.submission_record?.gateway_request_hash).toBe(second.submission_record?.gateway_request_hash);
  });

  it("changes gateway request hash when requested action changes", () => {
    const first = handoff();
    const second = handoff(candidateWithActionOverride("Escalate supplier remediation without switching source."));

    expect(first.status).toBe("HANDOFF_READY");
    expect(second.status).toBe("HANDOFF_READY");
    expect(first.submission_record?.gateway_request_hash).not.toBe(second.submission_record?.gateway_request_hash);
  });
});
