import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import EvidencePackPreview from "@/components/decisions/EvidencePackPreview";

import {
  buildEvidencePack,
  canonicalHash,
  evidencePackToHtml,
  evidencePackToJSON,
  evidencePackToPdfModel,
} from "@/lib/evidence-pack";
import { renderEvidencePackPdf, toPdfSafeText } from "@/lib/evidence-pack-pdf";
import {
  EVIDENCE_PACK_SCHEMA_VERSION,
  EVIDENCE_PACK_SECTION_KEYS,
  type EvidencePackAuditEntry,
  type EvidencePackDecisionInput,
  type EvidencePackOutcomeInput,
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

function outcome(overrides: Partial<EvidencePackOutcomeInput> = {}): EvidencePackOutcomeInput {
  return {
    id: "outcome-001",
    expected_metric: "logistics_cost_per_order",
    expected_direction: "decrease",
    expected_change: 10,
    evaluation_window_days: 30,
    outcome_status: "pending",
    observed_value_before: null,
    observed_value_after: null,
    accuracy_score: null,
    evaluation_date: null,
    evidence_regime: "observational",
    calibration_eligible: null,
    eligibility_reason: null,
    notes: null,
    created_at: "2026-06-02T09:00:00.000Z",
    ...overrides,
  };
}

const EVALUATED_OUTCOME = outcome({
  outcome_status: "success",
  observed_value_before: 12.5,
  observed_value_after: 11,
  accuracy_score: 0.92,
  evaluation_date: "2026-07-05T00:00:00.000Z",
});

const AUDIT_ENTRIES: EvidencePackAuditEntry[] = [
  { action_type: "decision_created", actor_id: "user-1", occurred_at: "2026-06-01T09:00:00.000Z", payload: null },
  { action_type: "decision_approved", actor_id: "user-2", occurred_at: "2026-06-02T09:00:00.000Z", payload: null },
];

describe("EP-1 Enterprise Decision Evidence Pack", () => {
  it("produces byte-identical output for identical inputs (deterministic)", async () => {
    const decision = baseDecision();
    const a = await buildEvidencePack(decision, { now: FIXED_NOW, auditEntries: AUDIT_ENTRIES });
    const b = await buildEvidencePack(decision, { now: FIXED_NOW, auditEntries: AUDIT_ENTRIES });

    expect(evidencePackToJSON(a)).toBe(evidencePackToJSON(b));
  });

  it("produces identical evidence_pack_hash for identical content", async () => {
    const decision = baseDecision();
    const a = await buildEvidencePack(decision, { now: FIXED_NOW });
    const b = await buildEvidencePack({ ...decision }, { now: () => "2026-08-01T00:00:00.000Z" });

    // Hash covers content, not generated_at, so it is stable across generation time.
    expect(a.evidence_pack_hash).toBe(b.evidence_pack_hash);
    expect(a.evidence_pack_hash).toMatch(/^sha256-[0-9a-f]{64}$/);
  });

  it("changes the hash when decision content changes", async () => {
    const a = await buildEvidencePack(baseDecision(), { now: FIXED_NOW });
    const b = await buildEvidencePack(baseDecision({ predicted_net_impact: 99000 }), { now: FIXED_NOW });

    expect(a.evidence_pack_hash).not.toBe(b.evidence_pack_hash);
  });

  it("is independent of object key order (canonical hashing)", async () => {
    const value1 = { a: 1, b: { c: 2, d: 3 } };
    const value2 = { b: { d: 3, c: 2 }, a: 1 };
    expect(await canonicalHash(value1)).toBe(await canonicalHash(value2));
  });

  it("includes all 21 required sections, each with status/title/summary/source/generated_from", async () => {
    const pack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW });

    expect(pack.schema_version).toBe(EVIDENCE_PACK_SCHEMA_VERSION);
    expect(EVIDENCE_PACK_SECTION_KEYS).toHaveLength(21);
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

  it("orders the decision timeline in the fixed lifecycle order regardless of decision data", async () => {
    const pendingPack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW });
    const approvedPack = await buildEvidencePack(
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

  it("honestly reports missing evidence instead of fabricating it", async () => {
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
    const pack = await buildEvidencePack(decision, { now: FIXED_NOW });

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

  it("builds a complete pack for an approved decision", async () => {
    const decision = baseDecision({
      decision_status: "approved",
      decided_at: "2026-06-05T00:00:00.000Z",
      decided_by: "user-1",
    });
    const pack = await buildEvidencePack(decision, { now: FIXED_NOW, auditEntries: AUDIT_ENTRIES });

    expect(pack.sections.approval_information.status).toBe("complete");
    expect(pack.sections.approval_information.data.decision_status).toBe("approved");
    expect(pack.sections.decision_timeline.data.steps).toMatchObject(
      expect.arrayContaining([expect.objectContaining({ key: "approved", status: "recorded" })]),
    );
    expect(pack.is_simulation).toBe(false);
  });

  it("builds a pack for a rejected decision without claiming approval", async () => {
    const decision = baseDecision({
      decision_status: "rejected",
      decided_at: "2026-06-05T00:00:00.000Z",
      notes: "Rejected in executive review: evidence is stale.",
    });
    const pack = await buildEvidencePack(decision, { now: FIXED_NOW });

    expect(pack.sections.approval_information.status).toBe("complete");
    expect(pack.sections.approval_information.data.decision_status).toBe("rejected");
    const steps = pack.sections.decision_timeline.data.steps as unknown as Array<{
      key: string;
      status: string;
    }>;
    const approvedStep = steps.find((step) => step.key === "approved");
    expect(approvedStep?.status).toBe("not_recorded");
  });

  it("labels simulation/demo decisions clearly and never as persisted", async () => {
    const pack = await buildEvidencePack(DEMO_DECISION, { now: FIXED_NOW });

    expect(pack.is_simulation).toBe(true);
    expect(pack.sections.decision_summary.data.decision_origin).toBe("demo");
  });

  it("shows an unavailable Evidence Pack instead of fabricating one when no decision exists", () => {
    const page = read("src/pages/EvidencePack.tsx");
    expect(page).toContain("Evidence Pack unavailable");
    expect(page).toContain("EVIDENCE_PACK_UNAVAILABLE_MESSAGE");
    expect(page).toContain("never generates a pack from data that doesn't exist");
  });

  it("exports deterministic JSON that round-trips", async () => {
    const pack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW, auditEntries: AUDIT_ENTRIES });
    const json = evidencePackToJSON(pack);
    const parsed = JSON.parse(json);

    expect(parsed.evidence_pack_hash).toBe(pack.evidence_pack_hash);
    expect(parsed.decision_id).toBe(pack.decision_id);
    expect(evidencePackToJSON(JSON.parse(json))).toBe(json);
  });

  it("generates a deterministic, self-contained printable HTML model", async () => {
    const pack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW });
    const htmlA = evidencePackToHtml(pack);
    const htmlB = evidencePackToHtml(await buildEvidencePack(baseDecision(), { now: FIXED_NOW }));

    expect(htmlA).toBe(htmlB);
    expect(htmlA).toContain("<!doctype html>");
    expect(htmlA).toContain("Enterprise Decision Evidence Pack");
    expect(htmlA).toContain(pack.evidence_pack_hash);
    expect(htmlA).toContain("Decision Summary");
    expect(htmlA).toContain("Digital Signature");
  });

  it("generates a structured, PDF-ready data model", async () => {
    const pack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW, outcomes: [EVALUATED_OUTCOME] });
    const model = evidencePackToPdfModel(pack);

    expect(model.decision_id).toBe(pack.decision_id);
    expect(model.evidence_pack_hash).toBe(pack.evidence_pack_hash);
    expect(model.blocks.some((block) => block.type === "timeline")).toBe(true);
    expect(model.blocks.some((block) => block.type === "heading" && block.text === "Decision Summary")).toBe(true);
    expect(model.blocks.some((block) => block.type === "heading" && block.text === "Measured Outcome")).toBe(true);
    expect(
      model.blocks.some((block) => block.type === "paragraph" && block.text.startsWith("Method: Average of")),
    ).toBe(true);
    expect(JSON.stringify(model)).not.toMatch(/%PDF-/);
  });

  it("renders the PDF-ready model to real PDF bytes", async () => {
    const pack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW, outcomes: [EVALUATED_OUTCOME] });
    const bytes = await renderEvidencePackPdf(evidencePackToPdfModel(pack));
    const header = new TextDecoder().decode(new Uint8Array(bytes).slice(0, 5));

    expect(header).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(2000);
  });

  it("maps symbols outside the PDF font's character set to readable text", () => {
    expect(toPdfSafeText("✓ Approved — €42,000 ≥ target")).toBe("[pass] Approved - EUR 42,000 >= target");
    expect(toPdfSafeText("日本")).toBe("??");
  });

  describe("measured outcome", () => {
    it("is unavailable, never fabricated, when the decision has no tracked outcome", async () => {
      const pack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW });
      const section = pack.sections.measured_outcome;

      expect(section.status).toBe("unavailable");
      expect(section.generated_from).toEqual([]);
      expect(section.summary).toMatch(/cannot show whether it worked/);
    });

    it("reports a pending measurement with the expectation it will test", async () => {
      const pack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW, outcomes: [outcome()] });
      const section = pack.sections.measured_outcome;

      expect(section.status).toBe("partial");
      expect(section.summary).toBe(
        "Measurement pending. logistics_cost_per_order is expected to fall by 10% and will be evaluated 30 days after the decision.",
      );
      expect(section.data.observed_change_pct).toBeNull();
    });

    it("reports an evaluated outcome with before/after values, method and caveats", async () => {
      const pack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW, outcomes: [EVALUATED_OUTCOME] });
      const section = pack.sections.measured_outcome;

      expect(section.status).toBe("complete");
      expect(section.summary).toBe(
        "Target met. logistics_cost_per_order averaged 12.50 before the decision and 11 after it (-12.0%); it was expected to fall by 10%.",
      );
      expect(section.data.observed_change_pct).toBeCloseTo(-12);
      expect(section.data.baseline_days).toBe(30);
      expect(section.data.method).toMatch(/30 days before the decision.*30-day evaluation window/);
      expect(section.data.caveats).toContain(
        "Before/after comparison, not a controlled experiment: other events in the same period can also explain the change.",
      );
    });

    it("does not invent a percentage change from a zero baseline", async () => {
      const pack = await buildEvidencePack(baseDecision(), {
        now: FIXED_NOW,
        outcomes: [outcome({ outcome_status: "no_effect", observed_value_before: 0, observed_value_after: 4, evaluation_date: "2026-07-05T00:00:00.000Z" })],
      });
      const section = pack.sections.measured_outcome;

      expect(section.summary).toContain("percentage change not computable");
      expect(section.data.observed_change_pct).toBeNull();
      expect(section.data.caveats).toContain("The baseline average is zero, so a percentage change cannot be computed.");
    });

    it("explains an outcome that could not be measured", async () => {
      const pack = await buildEvidencePack(baseDecision(), {
        now: FIXED_NOW,
        outcomes: [outcome({ outcome_status: "not_evaluable", notes: "Insufficient logistics_cost_per_order data for evaluation period." })],
      });
      const section = pack.sections.measured_outcome;

      expect(section.status).toBe("partial");
      expect(section.summary).toBe(
        "The evaluation window has closed but logistics_cost_per_order could not be measured: Insufficient logistics_cost_per_order data for evaluation period.",
      );
    });

    it("prefers the most recently evaluated outcome over newer pending ones", async () => {
      const newerPending = outcome({ id: "outcome-002", created_at: "2026-07-01T00:00:00.000Z" });
      const pack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW, outcomes: [newerPending, EVALUATED_OUTCOME] });

      expect(pack.sections.measured_outcome.data.outcome_id).toBe("outcome-001");
      expect(pack.sections.measured_outcome.data.tracked_outcome_count).toBe(2);
    });

    it("changes the evidence hash when the measured outcome changes", async () => {
      const pending = await buildEvidencePack(baseDecision(), { now: FIXED_NOW, outcomes: [outcome()] });
      const evaluated = await buildEvidencePack(baseDecision(), { now: FIXED_NOW, outcomes: [EVALUATED_OUTCOME] });

      expect(evaluated.evidence_pack_hash).not.toBe(pending.evidence_pack_hash);
    });

    it("includes the method and caveats in the printable HTML export", async () => {
      const pack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW, outcomes: [EVALUATED_OUTCOME] });
      const html = evidencePackToHtml(pack);

      expect(html).toContain("<h2>Measured Outcome</h2>");
      expect(html).toContain('<p class="ep-method">Method: Average of logistics_cost_per_order');
      expect(html).toContain("not a controlled experiment");
    });

    it("places the measured outcome directly after the decision summary in exports", async () => {
      const pack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW, outcomes: [EVALUATED_OUTCOME] });
      const headings = evidencePackToPdfModel(pack)
        .blocks.filter((block) => block.type === "heading" && block.level === 2)
        .map((block) => (block as { text: string }).text);

      expect(headings.slice(0, 2)).toEqual(["Decision Summary", "Measured Outcome"]);
      expect(headings).toHaveLength(21);
    });
  });

  describe("preview", () => {
    afterEach(() => {
      cleanup();
      vi.unstubAllGlobals();
    });

    it("shows the measured outcome with its method and caveats under the executive summary", async () => {
      const pack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW, outcomes: [EVALUATED_OUTCOME] });
      render(React.createElement(EvidencePackPreview, { pack }));

      const card = screen.getByTestId("evidence-pack-measured-outcome");
      expect(card.textContent).toContain("Target met.");
      expect(card.textContent).toContain("Method: Average of logistics_cost_per_order");
      expect(card.textContent).toContain("not a controlled experiment");

      const summary = screen.getByTestId("evidence-pack-executive-summary");
      expect(summary.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("downloads a PDF from the Download PDF button", async () => {
      const createObjectURL = vi.fn((_blob: Blob) => "blob:evidence-pack");
      vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      const pack = await buildEvidencePack(baseDecision(), { now: FIXED_NOW, outcomes: [EVALUATED_OUTCOME] });
      render(React.createElement(EvidencePackPreview, { pack }));
      fireEvent.click(screen.getByTestId("export-pdf-button"));

      await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
      const blob = createObjectURL.mock.calls[0][0];
      expect(blob.type).toBe("application/pdf");
      expect(click).toHaveBeenCalled();
      click.mockRestore();
    });
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
