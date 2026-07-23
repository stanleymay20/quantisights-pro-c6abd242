import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildEvidencePack,
  canonicalHash,
  evidencePackToHtml,
  evidencePackToJSON,
  evidencePackToPdfModel,
} from "@/lib/evidence-pack";
import {
  EVIDENCE_PACK_SECTION_KEYS,
  type EvidencePackAuditEntry,
  type EvidencePackDecisionInput,
} from "@/lib/evidence-pack-types";
import { DEMO_DECISION } from "@/components/decisions/executive-review-flow";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const FIXED_NOW = () => "2026-07-09T12:00:00.000Z";

function baseDecision(overrides: Partial<EvidencePackDecisionInput> = {}): EvidencePackDecisionInput {
  return {
    id: "decision-001",
    organization_id: "org-1",
    decision_type: "cost_optimization",
    recommended_action: "Renegotiate top three supplier contracts",
    chosen_action: null,
    decision_status: "pending",
    execution_status: "not_started",
    notes: null,
    source_insight_summary: "Logistics cost rose 14% over two quarters.",
    recommendation_logic_type: "rule_based",
    decision_origin: "platform",
    capped_confidence: 78,
    confidence_at_decision: 78,
    raw_confidence: 84,
    confidence_cap_reason: null,
    predicted_net_impact: 42000,
    predicted_roi_probability: 71,
    outcome_delta: null,
    outcome_measured_at: null,
    created_at: "2026-06-01T09:00:00.000Z",
    updated_at: "2026-06-01T09:00:00.000Z",
    decided_at: null,
    decided_by: null,
    explanation_metadata: {
      source_data: {
        dataset_name: "Ops dataset",
        time_range: "Last 2 quarters",
        rows_analyzed: 5842,
        key_metrics: ["logistics_cost_per_order"],
      },
      reasoning: {
        what_happened: "Logistics cost per order rose 14%.",
        why_it_matters: "Six-figure annual exposure.",
        why_this_recommendation: "Renegotiating covers 62% of the increase.",
      },
    },
    ...overrides,
  };
}

const AUDIT_ENTRIES: EvidencePackAuditEntry[] = [
  { action_type: "decision_created", actor_id: "user-1", occurred_at: "2026-06-01T09:00:00.000Z", payload: null },
  { action_type: "decision_approved", actor_id: "user-2", occurred_at: "2026-06-02T09:00:00.000Z", payload: null },
];

describe("EP-1 Enterprise Decision Evidence Pack", () => {
  it("produces byte-identical output for identical inputs (deterministic)", () => {
    const decision = baseDecision();
    const a = buildEvidencePack(decision, { now: FIXED_NOW, auditEntries: AUDIT_ENTRIES });
    const b = buildEvidencePack(decision, { now: FIXED_NOW, auditEntries: AUDIT_ENTRIES });

    expect(evidencePackToJSON(a)).toBe(evidencePackToJSON(b));
  });

  it("produces identical evidence_pack_hash for identical content", () => {
    const decision = baseDecision();
    const a = buildEvidencePack(decision, { now: FIXED_NOW });
    const b = buildEvidencePack({ ...decision }, { now: () => "2026-08-01T00:00:00.000Z" });

    // Hash covers content, not generated_at, so it is stable across generation time.
    expect(a.evidence_pack_hash).toBe(b.evidence_pack_hash);
    expect(a.evidence_pack_hash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
  });

  it("changes the hash when decision content changes", () => {
    const a = buildEvidencePack(baseDecision(), { now: FIXED_NOW });
    const b = buildEvidencePack(baseDecision({ predicted_net_impact: 99000 }), { now: FIXED_NOW });

    expect(a.evidence_pack_hash).not.toBe(b.evidence_pack_hash);
  });

  it("is independent of object key order (canonical hashing)", () => {
    const value1 = { a: 1, b: { c: 2, d: 3 } };
    const value2 = { b: { d: 3, c: 2 }, a: 1 };
    expect(canonicalHash(value1)).toBe(canonicalHash(value2));
  });

  it("includes all 20 required sections, each with status/title/summary/source/generated_from", () => {
    const pack = buildEvidencePack(baseDecision(), { now: FIXED_NOW });

    expect(EVIDENCE_PACK_SECTION_KEYS).toHaveLength(20);
    for (const key of EVIDENCE_PACK_SECTION_KEYS) {
      const section = pack.sections[key];
      expect(section, `section ${key}`).toBeDefined();
      expect(typeof section.status).toBe("string");
      expect(typeof section.title).toBe("string");
      expect(typeof section.summary).toBe("string");
      expect(typeof section.source).toBe("string");
      expect(Array.isArray(section.generated_from)).toBe(true);
    }
  });

  it("orders the decision timeline in the fixed lifecycle order regardless of decision data", () => {
    const pendingPack = buildEvidencePack(baseDecision(), { now: FIXED_NOW });
    const approvedPack = buildEvidencePack(
      baseDecision({ decision_status: "approved", decided_at: "2026-06-05T00:00:00.000Z" }),
      { now: FIXED_NOW },
    );

    const expectedOrder = [
      "signal_received",
      "evidence_verified",
      "fact_promoted",
      "decision_candidate",
      "agent_gateway",
      "runtime_gateway",
      "executive_review",
      "approved",
      "outcome_prediction",
    ];

    for (const pack of [pendingPack, approvedPack]) {
      const steps = pack.sections.decision_timeline.data.steps as unknown as Array<{ key: string }>;
      expect(steps.map((step) => step.key)).toEqual(expectedOrder);
    }
  });

  it("honestly reports missing evidence instead of fabricating it", () => {
    const decision = baseDecision({
      source_insight_summary: null,
      notes: null,
      explanation_metadata: null,
      predicted_net_impact: null,
      predicted_roi_probability: null,
      capped_confidence: null,
      confidence_at_decision: null,
      raw_confidence: null,
    });
    const pack = buildEvidencePack(decision, { now: FIXED_NOW });

    expect(pack.sections.business_context.status).toBe("unavailable");
    expect(pack.sections.confidence.status).toBe("unavailable");
    expect(pack.sections.business_impact.status).toBe("unavailable");
    expect(pack.sections.evidence_summary.status).toBe("unavailable");
    expect(pack.sections.supporting_signals.status).toBe("unavailable");
    expect(pack.sections.verified_facts.status).toBe("unavailable");
    expect(pack.sections.runtime_metadata.status).toBe("not_applicable");
    expect(pack.sections.gateway_metadata.status).toBe("not_applicable");
    expect(pack.sections.alternatives_considered.status).toBe("not_applicable");
    // None of these sections may claim data they don't have.
    expect(pack.sections.confidence.generated_from).toEqual([]);
    expect(pack.sections.business_impact.generated_from).toEqual([]);
  });

  it("builds a complete pack for an approved decision", () => {
    const decision = baseDecision({
      decision_status: "approved",
      decided_at: "2026-06-05T00:00:00.000Z",
      decided_by: "user-1",
    });
    const pack = buildEvidencePack(decision, { now: FIXED_NOW, auditEntries: AUDIT_ENTRIES });

    expect(pack.sections.approval_information.status).toBe("complete");
    expect(pack.sections.approval_information.data.decision_status).toBe("approved");
    expect(pack.sections.decision_timeline.data.steps).toMatchObject(
      expect.arrayContaining([expect.objectContaining({ key: "approved", status: "recorded" })]),
    );
    expect(pack.is_simulation).toBe(false);
  });

  it("builds a pack for a rejected decision without claiming approval", () => {
    const decision = baseDecision({
      decision_status: "rejected",
      decided_at: "2026-06-05T00:00:00.000Z",
      notes: "Rejected in executive review: evidence is stale.",
    });
    const pack = buildEvidencePack(decision, { now: FIXED_NOW });

    expect(pack.sections.approval_information.status).toBe("complete");
    expect(pack.sections.approval_information.data.decision_status).toBe("rejected");
    const steps = pack.sections.decision_timeline.data.steps as unknown as Array<{
      key: string;
      status: string;
    }>;
    const approvedStep = steps.find((step) => step.key === "approved");
    expect(approvedStep?.status).toBe("not_recorded");
  });

  it("labels simulation/demo decisions clearly and never as persisted", () => {
    const pack = buildEvidencePack(DEMO_DECISION, { now: FIXED_NOW });

    expect(pack.is_simulation).toBe(true);
    expect(pack.sections.decision_summary.data.decision_origin).toBe("demo");
  });

  it("shows an unavailable Evidence Pack instead of fabricating one when no decision exists", () => {
    const page = read("src/pages/EvidencePack.tsx");
    expect(page).toContain("Evidence Pack unavailable");
    expect(page).toContain("EVIDENCE_PACK_UNAVAILABLE_MESSAGE");
    expect(page).toContain("never generates a pack from data that doesn't exist");
  });

  it("exports deterministic JSON that round-trips", () => {
    const pack = buildEvidencePack(baseDecision(), { now: FIXED_NOW, auditEntries: AUDIT_ENTRIES });
    const json = evidencePackToJSON(pack);
    const parsed = JSON.parse(json);

    expect(parsed.evidence_pack_hash).toBe(pack.evidence_pack_hash);
    expect(parsed.decision_id).toBe(pack.decision_id);
    expect(evidencePackToJSON(JSON.parse(json))).toBe(json);
  });

  it("generates a deterministic, self-contained printable HTML model", () => {
    const pack = buildEvidencePack(baseDecision(), { now: FIXED_NOW });
    const htmlA = evidencePackToHtml(pack);
    const htmlB = evidencePackToHtml(buildEvidencePack(baseDecision(), { now: FIXED_NOW }));

    expect(htmlA).toBe(htmlB);
    expect(htmlA).toContain("<!doctype html>");
    expect(htmlA).toContain("Enterprise Decision Evidence Pack");
    expect(htmlA).toContain(pack.evidence_pack_hash);
    expect(htmlA).toContain("Decision Summary");
    expect(htmlA).toContain("Digital Signature");
  });

  it("generates a structured, PDF-ready data model without producing a PDF", () => {
    const pack = buildEvidencePack(baseDecision(), { now: FIXED_NOW });
    const model = evidencePackToPdfModel(pack);

    expect(model.decision_id).toBe(pack.decision_id);
    expect(model.evidence_pack_hash).toBe(pack.evidence_pack_hash);
    expect(model.blocks.some((block) => block.type === "timeline")).toBe(true);
    expect(model.blocks.some((block) => block.type === "heading" && block.text === "Decision Summary")).toBe(true);
    // No PDF bytes/base64 are produced in EP-1.
    expect(JSON.stringify(model)).not.toMatch(/%PDF-/);
  });

  it("registers the /evidence-pack/:decisionId route", () => {
    const routes = read("src/routes/index.tsx");
    expect(routes).toContain('path: "/evidence-pack/:decisionId"');
  });

  it("does not modify AG-1/AG-2/AG-3/RTS-1/runtime source files", () => {
    const evidencePackLib = read("src/lib/evidence-pack.ts");
    expect(evidencePackLib).not.toMatch(/from "@\/lib\/(agent-gateway|runtime-|idempotency-store)/);
  });
});
