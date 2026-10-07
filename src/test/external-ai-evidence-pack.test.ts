import { describe, expect, it } from "vitest";
import {
  buildExternalAIEvidencePack,
  type ExternalAIEvidenceRecord,
} from "@/lib/external-ai-evidence-pack";
import type { EvidencePackDecisionInput } from "@/lib/evidence-pack-types";

function decision(): EvidencePackDecisionInput {
  return {
    id: "decision-ext-1",
    organization_id: "org-1",
    decision_type: "external_ai",
    recommended_action: "Hold supplier payment for review",
    chosen_action: null,
    decision_status: "pending",
    execution_status: "not_started",
    notes: "External AI decision ingested through the Quantivis evidence protocol.",
    source_insight_summary: null,
    recommendation_logic_type: null,
    decision_origin: "platform",
    capped_confidence: null,
    confidence_at_decision: 91,
    raw_confidence: null,
    confidence_cap_reason: null,
    predicted_net_impact: null,
    predicted_roi_probability: null,
    outcome_delta: null,
    outcome_measured_at: null,
    created_at: "2026-10-07T12:00:01.000Z",
    updated_at: "2026-10-07T12:00:01.000Z",
    decided_at: null,
    decided_by: null,
    explanation_metadata: null,
  } as EvidencePackDecisionInput;
}

function evidence(overrides: Partial<ExternalAIEvidenceRecord> = {}): ExternalAIEvidenceRecord {
  return {
    id: "evidence-1",
    organization_id: "org-1",
    decision_ledger_id: "decision-ext-1",
    ai_system_id: "system-1",
    system_name: "Procurement Review Agent",
    provider: "customer-internal",
    system_identifier: "procurement-review-agent",
    model_version: "2026.10.1",
    deployment_environment: "production",
    external_event_id: "event-1",
    occurred_at: "2026-10-07T12:00:00.000Z",
    ingested_at: "2026-10-07T12:00:01.000Z",
    input_hash: `sha256:${"1".repeat(64)}`,
    output_hash: `sha256:${"2".repeat(64)}`,
    decision_descriptor: { action: "hold_payment", reason: "threshold exceeded" },
    confidence: 0.91,
    human_oversight_state: "required",
    metadata: { workflow: "supplier_payment" },
    provenance: { trace_id: "trace-1" },
    payload_hash: `sha256:${"3".repeat(64)}`,
    protocol_version: "quantivis.external-ai-decision.v1",
    ...overrides,
  };
}

const fixedNow = () => "2026-10-07T12:05:00.000Z";

describe("external AI evidence pack", () => {
  it("binds the existing Quantivis pack to immutable external producer provenance", async () => {
    const pack = await buildExternalAIEvidencePack(decision(), evidence(), { now: fixedNow });

    expect(pack.schema_version).toBe("quantivis.external-ai-evidence-pack.v1");
    expect(pack.base_schema_version).toBe("quantivis.evidence-pack.v2");
    expect(pack.base_pack.decision_id).toBe("decision-ext-1");
    expect(pack.external_ai_provenance.status).toBe("complete");
    expect(pack.external_ai_provenance.data.provider).toBe("customer-internal");
    expect(pack.external_ai_provenance.data.input_hash).toBe(`sha256:${"1".repeat(64)}`);
    expect(pack.external_ai_provenance.data.output_hash).toBe(`sha256:${"2".repeat(64)}`);
    expect(pack.external_ai_provenance.data.human_oversight_state).toBe("required");
    expect(pack.evidence_pack_hash).toMatch(/^sha256-[0-9a-f]{64}$/);
  });

  it("is deterministic for the same decision, provenance and clock", async () => {
    const a = await buildExternalAIEvidencePack(decision(), evidence(), { now: fixedNow });
    const b = await buildExternalAIEvidencePack(decision(), evidence(), { now: fixedNow });
    expect(a).toEqual(b);
  });

  it("changes the envelope hash when immutable producer evidence changes", async () => {
    const a = await buildExternalAIEvidencePack(decision(), evidence(), { now: fixedNow });
    const b = await buildExternalAIEvidencePack(
      decision(),
      evidence({ output_hash: `sha256:${"4".repeat(64)}` }),
      { now: fixedNow },
    );
    expect(a.evidence_pack_hash).not.toBe(b.evidence_pack_hash);
    expect(a.base_pack.evidence_pack_hash).toBe(b.base_pack.evidence_pack_hash);
  });

  it("fails closed if producer evidence is linked to another decision or tenant", async () => {
    await expect(
      buildExternalAIEvidencePack(decision(), evidence({ decision_ledger_id: "another-decision" }), { now: fixedNow }),
    ).rejects.toThrow("EXTERNAL_AI_EVIDENCE_DECISION_MISMATCH");

    await expect(
      buildExternalAIEvidencePack(decision(), evidence({ organization_id: "another-org" }), { now: fixedNow }),
    ).rejects.toThrow("EXTERNAL_AI_EVIDENCE_ORGANIZATION_MISMATCH");
  });

  it("states evidentiary limits rather than claiming certification", async () => {
    const pack = await buildExternalAIEvidencePack(decision(), evidence(), { now: fixedNow });
    const data = pack.external_ai_provenance.data;
    expect(String(data.chain_of_custody_note)).toContain("do not prove the truth or quality");
    expect(String(data.compliance_note)).toContain("not a certification of legal compliance");
  });
});
