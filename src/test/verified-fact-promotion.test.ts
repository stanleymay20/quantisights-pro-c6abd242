import { describe, expect, it } from "vitest";

import { createPayloadHash, REAL_TIME_SIGNAL_SCHEMA_VERSION, type NormalizedSignal } from "@/lib/real-time-signals";
import type { ExtendedContradictionRecord } from "@/lib/contradiction-detection";
import {
  ENTERPRISE_VERIFIED_FACT_SCHEMA_VERSION,
  EnterpriseVerifiedFactSchema,
  promoteVerifiedFact,
  type PromotionPolicyName,
} from "@/lib/verified-fact-promotion";

const now = "2026-07-04T10:00:00.000Z";

const baseSignal: NormalizedSignal = {
  schema_version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
  signal_id: "signal-supplier-delay-sap",
  raw_event_id: "raw-supplier-delay-sap",
  tenant_id: "tenant-acme",
  organization_id: "org-acme",
  source_system: "sap",
  signal_type: "supplier_delay",
  observed_at: "2026-07-04T09:59:00.000Z",
  normalized_at: "2026-07-04T09:59:05.000Z",
  materiality: {
    level: "critical",
    amount: 750000,
    currency: "EUR",
    description: "Supplier delay creates production and revenue risk",
  },
  quality: {
    completeness: 98,
    consistency: 96,
    freshness: 100,
    provenance: 98,
    materiality: 100,
    overall: 98,
  },
  evidence_references: ["ev-sap-delay", "ev-supplier-portal"],
  payload: {
    supplier_id: "supplier-x",
    delay_hours: 72,
    route: "Region A",
  },
  idempotency_key: "tenant-acme:raw-supplier-delay-sap:supplier-delay",
};

const baseQuality = {
  signal_id: baseSignal.signal_id,
  completeness: 98,
  consistency: 96,
  freshness: 100,
  provenance: 98,
  materiality: 100,
  integrity: 100,
  overall: 98,
  explanation: ["signal is complete", "payload hash matches"],
};

function signal(overrides: Partial<NormalizedSignal> = {}): NormalizedSignal {
  return {
    ...baseSignal,
    ...overrides,
    materiality: {
      ...baseSignal.materiality,
      ...(overrides.materiality ?? {}),
    },
    quality: {
      ...baseSignal.quality,
      ...(overrides.quality ?? {}),
    },
  };
}

function contradiction(
  overrides: Partial<ExtendedContradictionRecord> = {},
): ExtendedContradictionRecord {
  return {
    contradiction_id: "contradiction-inventory",
    source_a: "sap",
    source_b: "warehouse_scanner",
    field: "inventory_count",
    value_a: 250,
    value_b: 143,
    severity: "medium",
    detected_at: now,
    evidence_references: ["ev-sap-delay"],
    confidence: 88,
    possible_causes: ["Inventory synchronization lag"],
    recommended_action: "Investigate before promotion.",
    explanation: "Inventory mismatch detected.",
    decision_impact: {
      blocks_decision: false,
      affected_decision_types: ["production_planning"],
      rationale: "Medium contradiction accepted by data steward.",
    },
    resolution: {
      status: "accepted",
      resolved_by: "data-steward",
      resolved_at: now,
      resolution_note: "Difference is known in current warehouse sync window.",
    },
    category: "inventory",
    lineage: {
      raw_events: [baseSignal.raw_event_id],
      signals: [baseSignal.signal_id],
    },
    ...overrides,
  };
}

function promote(policy: PromotionPolicyName = "STRICT", overrides = {}) {
  return promoteVerifiedFact({
    fact_type: "supplier_delivery_risk",
    assertion: "Supplier X will miss delivery by 72 hours.",
    signals: [baseSignal],
    contradictions: [],
    quality_scores: [baseQuality],
    evidence_references: baseSignal.evidence_references,
    confidence: 96,
    promotion_policy: policy,
    now,
    expires_at: "2026-07-04T12:00:00.000Z",
    audit_reference: "audit-evf-001",
    certification_reference: "cert-rts-1d",
    ...overrides,
  });
}

describe("RTS-1D Enterprise Verified Fact promotion", () => {
  it("promotes perfect trusted signals into an immutable Enterprise Verified Fact", () => {
    const result = promote("STRICT");

    expect(result.status).toBe("PROMOTED");
    expect(result.fact).toMatchObject({
      fact_version: 1,
      tenant_id: "tenant-acme",
      organization_id: "org-acme",
      fact_type: "supplier_delivery_risk",
      assertion: "Supplier X will miss delivery by 72 hours.",
      supporting_signal_ids: [baseSignal.signal_id],
      supporting_raw_event_ids: [baseSignal.raw_event_id],
      supporting_evidence: baseSignal.evidence_references,
      quality_score: 98,
      confidence: 96,
      promotion_policy: "STRICT",
      promotion_engine_version: expect.any(String),
      status: "VERIFIED",
      schema_version: ENTERPRISE_VERIFIED_FACT_SCHEMA_VERSION,
    });
    expect(result.fact?.fact_hash).toMatch(/^fnv1a-/);
    expect(result.explanation.join(" ")).toContain("promoted");
    expect(EnterpriseVerifiedFactSchema.safeParse(result.fact).success).toBe(true);
  });

  it("uses explicit Enterprise Verified Fact lifecycle states", () => {
    const result = promote("STRICT");

    expect(result.status).toBe("PROMOTED");
    expect(result.fact?.status).toBe("VERIFIED");
    expect(EnterpriseVerifiedFactSchema.safeParse({ ...result.fact, status: "ACTIVE" }).success).toBe(true);
    expect(EnterpriseVerifiedFactSchema.safeParse({ ...result.fact, status: "SUPERSEDED" }).success).toBe(true);
    expect(EnterpriseVerifiedFactSchema.safeParse({ ...result.fact, status: "expired" }).success).toBe(false);
  });

  it("does not promote when quality is below the policy threshold", () => {
    const result = promote("STRICT", {
      quality_scores: [{ ...baseQuality, overall: 94 }],
    });

    expect(result.status).toBe("NOT_PROMOTED");
    expect(result.fact).toBeNull();
    expect(result.explanation.join(" ")).toContain("quality 94 is below STRICT threshold 95");
  });

  it("does not promote when confidence is below the policy threshold", () => {
    const result = promote("STRICT", { confidence: 94 });

    expect(result.status).toBe("NOT_PROMOTED");
    expect(result.explanation.join(" ")).toContain("confidence 94 is below STRICT threshold 95");
  });

  it("does not promote with critical contradictions", () => {
    const result = promote("NORMAL", {
      contradictions: [contradiction({ severity: "critical", resolution: { status: "open" } })],
    });

    expect(result.status).toBe("NOT_PROMOTED");
    expect(result.explanation.join(" ")).toContain("critical contradiction");
  });

  it("allows NORMAL promotion with explicitly accepted medium contradictions", () => {
    const result = promote("NORMAL", {
      quality_scores: [{ ...baseQuality, overall: 88 }],
      confidence: 84,
      contradictions: [contradiction()],
    });

    expect(result.status).toBe("PROMOTED");
    expect(result.fact?.accepted_contradictions).toEqual(["contradiction-inventory"]);
    expect(result.fact?.resolved_contradictions).toEqual([]);
  });

  it("does not promote when tenant or organization differs across signals", () => {
    const result = promote("STRICT", {
      signals: [
        baseSignal,
        signal({
          signal_id: "signal-other-org",
          raw_event_id: "raw-other-org",
          tenant_id: "tenant-other",
          organization_id: "org-other",
        }),
      ],
    });

    expect(result.status).toBe("NOT_PROMOTED");
    expect(result.explanation.join(" ")).toContain("tenant/organization mismatch");
  });

  it("does not promote expired evidence", () => {
    const result = promote("NORMAL", {
      signals: [
        signal({
          observed_at: "2026-07-03T09:59:00.000Z",
          quality: { ...baseSignal.quality, freshness: 0 },
        }),
      ],
    });

    expect(result.status).toBe("NOT_PROMOTED");
    expect(result.explanation.join(" ")).toContain("expired");
  });

  it("does not promote missing evidence", () => {
    const result = promote("NORMAL", {
      signals: [signal({ evidence_references: [] })],
      evidence_references: [],
    });

    expect(result.status).toBe("NOT_PROMOTED");
    expect(result.explanation.join(" ")).toContain("required evidence is missing");
  });

  it("increments fact_version without mutating the previous EVF", () => {
    const first = promote("STRICT");
    const previous = JSON.parse(JSON.stringify(first.fact));
    const second = promote("STRICT", {
      previous_fact: first.fact,
      evidence_references: [...baseSignal.evidence_references, "ev-new-supplier-confirmation"],
    });

    expect(second.fact?.fact_version).toBe(2);
    expect(first.fact).toEqual(previous);
    expect(second.fact?.lineage.previous_fact_hashes).toEqual([first.fact?.fact_hash]);
  });

  it("creates deterministic fact hashes for identical input", () => {
    const first = promote("STRICT");
    const second = promoteVerifiedFact(JSON.parse(JSON.stringify({
      fact_type: "supplier_delivery_risk",
      assertion: "Supplier X will miss delivery by 72 hours.",
      signals: [baseSignal],
      contradictions: [],
      quality_scores: [baseQuality],
      evidence_references: baseSignal.evidence_references,
      confidence: 96,
      promotion_policy: "STRICT",
      now,
      expires_at: "2026-07-04T12:00:00.000Z",
      audit_reference: "audit-evf-001",
      certification_reference: "cert-rts-1d",
    })));

    expect(second.fact).toEqual(first.fact);
  });

  it("implements STRICT, NORMAL, and PERMISSIVE policy thresholds", () => {
    expect(promote("STRICT", { quality_scores: [{ ...baseQuality, overall: 95 }], confidence: 95 }).status).toBe("PROMOTED");
    expect(promote("NORMAL", { quality_scores: [{ ...baseQuality, overall: 85 }], confidence: 80 }).status).toBe("PROMOTED");
    expect(promote("PERMISSIVE", { quality_scores: [{ ...baseQuality, overall: 70 }], confidence: 70 }).status).toBe("PROMOTED");
  });

  it("never allows PERMISSIVE for regulated decision classes", () => {
    const result = promote("PERMISSIVE", {
      quality_scores: [{ ...baseQuality, overall: 90 }],
      confidence: 90,
      regulated: true,
    });

    expect(result.status).toBe("NOT_PROMOTED");
    expect(result.explanation.join(" ")).toContain("PERMISSIVE policy is not allowed for regulated scenarios");
  });

  it("requires verified integrity before promotion", () => {
    const result = promote("NORMAL", {
      quality_scores: [{ ...baseQuality, integrity: 69, overall: 88 }],
    });

    expect(result.status).toBe("NOT_PROMOTED");
    expect(result.explanation.join(" ")).toContain("integrity 69 is below minimum 70");
  });

  it("includes complete lineage, quality summary, and explanation coverage", () => {
    const result = promote("STRICT");

    expect(result.fact?.lineage).toMatchObject({
      raw_events: [baseSignal.raw_event_id],
      signals: [baseSignal.signal_id],
      quality_assessments: [baseSignal.signal_id],
      contradictions: [],
      promotion_policy: "STRICT",
      promotion_engine_version: expect.any(String),
    });
    expect(result.fact?.signal_quality_summary).toMatchObject({
      average_quality: 98,
      minimum_quality: 98,
      signal_count: 1,
    });
    expect(result.explanation.length).toBeGreaterThanOrEqual(5);
  });

  it("uses canonical fields for fact_hash and changes hash when assertion changes", () => {
    const first = promote("STRICT");
    const second = promote("STRICT", {
      assertion: "Supplier X will miss delivery by 48 hours.",
    });

    expect(second.fact?.fact_hash).not.toBe(first.fact?.fact_hash);
    expect(createPayloadHash(first.fact)).toMatch(/^fnv1a-/);
  });
});
