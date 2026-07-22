import { describe, expect, it } from "vitest";

import { ContradictionRecordSchema, createPayloadHash, REAL_TIME_SIGNAL_SCHEMA_VERSION } from "@/lib/real-time-signals";
import {
  detectContradictions,
  ExtendedContradictionRecordSchema,
  type ContradictionDetectionSignal,
} from "@/lib/contradiction-detection";

const now = "2026-07-04T10:00:00.000Z";

const sapInventoryPayload = {
  inventory_count: 250,
  status: "available",
  purchase_order_id: "PO-92831",
};

const baseSignal: ContradictionDetectionSignal = {
  schema_version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
  signal_id: "signal-sap-inventory",
  raw_event_id: "raw-sap-inventory",
  tenant_id: "tenant-acme",
  organization_id: "org-acme",
  source_system: "sap",
  signal_type: "inventory_snapshot",
  observed_at: "2026-07-04T09:59:00.000Z",
  normalized_at: "2026-07-04T09:59:05.000Z",
  materiality: {
    level: "high",
    amount: 620000,
    currency: "EUR",
    description: "Inventory availability affects production planning",
  },
  quality: {
    completeness: 95,
    consistency: 90,
    freshness: 100,
    provenance: 98,
    materiality: 95,
    overall: 96,
  },
  evidence_references: ["ev-sap-inventory"],
  payload: sapInventoryPayload,
  idempotency_key: "tenant-acme:raw-sap-inventory:inventory",
  provenance: {
    source_record_id: "INV-92831",
    payload_hash: createPayloadHash(sapInventoryPayload),
  },
  source_reliability: 96,
  historical_source_accuracy: 94,
};

function signal(overrides: Partial<ContradictionDetectionSignal>): ContradictionDetectionSignal {
  const payload = overrides.payload ?? baseSignal.payload;
  return {
    ...baseSignal,
    ...overrides,
    payload,
    provenance: {
      ...baseSignal.provenance,
      ...(overrides.provenance ?? {}),
      payload_hash: overrides.provenance?.payload_hash ?? createPayloadHash(payload),
    },
  };
}

describe("RTS-1C contradiction detection", () => {
  it("returns no contradiction for identical cross-source values", () => {
    const warehouse = signal({
      signal_id: "signal-warehouse-inventory",
      raw_event_id: "raw-warehouse-inventory",
      source_system: "warehouse_scanner",
      evidence_references: ["ev-warehouse-inventory"],
    });

    expect(detectContradictions([baseSignal, warehouse], { now })).toEqual([]);
  });

  it("detects numeric inventory conflicts with decision-blocking impact", () => {
    const warehouse = signal({
      signal_id: "signal-warehouse-inventory",
      raw_event_id: "raw-warehouse-inventory",
      source_system: "warehouse_scanner",
      payload: {
        ...sapInventoryPayload,
        inventory_count: 143,
      },
      evidence_references: ["ev-warehouse-inventory"],
    });

    const contradictions = detectContradictions([baseSignal, warehouse], { now });

    expect(contradictions).toHaveLength(1);
    expect(contradictions[0]).toMatchObject({
      source_a: "sap",
      source_b: "warehouse_scanner",
      field: "inventory_count",
      value_a: 250,
      value_b: 143,
      severity: "high",
      category: "inventory",
      confidence: expect.any(Number),
      possible_causes: expect.arrayContaining([expect.stringContaining("synchronization")]),
      recommended_action: expect.stringContaining("Do not generate replenishment or production-planning decision"),
      decision_impact: {
        blocks_decision: true,
        affected_decision_types: expect.arrayContaining(["replenishment", "production_planning"]),
        rationale: expect.stringContaining("Inventory inconsistency"),
      },
      resolution: {
        status: "open",
      },
      lineage: {
        raw_events: expect.arrayContaining(["raw-sap-inventory", "raw-warehouse-inventory"]),
        signals: expect.arrayContaining(["signal-sap-inventory", "signal-warehouse-inventory"]),
      },
    });
    expect(contradictions[0].confidence).toBeGreaterThanOrEqual(80);
  });

  it("detects status enum conflicts", () => {
    const finance = signal({
      signal_id: "signal-finance-status",
      raw_event_id: "raw-finance-status",
      source_system: "finance",
      payload: {
        ...sapInventoryPayload,
        status: "blocked",
      },
      evidence_references: ["ev-finance-status"],
    });

    const contradictions = detectContradictions([baseSignal, finance], { now });

    expect(contradictions.some((item) => item.field === "status" && item.category === "inventory")).toBe(true);
  });

  it("detects stale-vs-fresh conflicts without choosing a winner", () => {
    const staleErp = signal({
      signal_id: "signal-erp-stale-inventory",
      raw_event_id: "raw-erp-stale-inventory",
      source_system: "erp",
      observed_at: "2026-07-03T09:00:00.000Z",
      payload: {
        ...sapInventoryPayload,
        inventory_count: 247,
      },
      evidence_references: ["ev-erp-stale"],
    });

    const contradictions = detectContradictions([baseSignal, staleErp], { now });

    expect(contradictions.some((item) => item.field === "observed_at" && item.severity === "low")).toBe(true);
    expect(contradictions.every((item) => !item.explanation.includes("winner"))).toBe(true);
  });

  it("escalates high-value financial or compliance conflicts to critical", () => {
    const finance = signal({
      signal_id: "signal-finance-revenue",
      raw_event_id: "raw-finance-revenue",
      source_system: "finance",
      signal_type: "financial_adjustment",
      materiality: {
        level: "critical",
        amount: 2_000_000,
        currency: "EUR",
        description: "Regulated revenue recognition adjustment",
      },
      payload: {
        revenue_amount: 2_000_000,
        regulated_field: "revenue_recognition",
      },
      evidence_references: ["ev-finance-revenue"],
    });
    const erp = signal({
      signal_id: "signal-erp-revenue",
      raw_event_id: "raw-erp-revenue",
      source_system: "erp",
      signal_type: "financial_adjustment",
      materiality: finance.materiality,
      payload: {
        revenue_amount: 1_100_000,
        regulated_field: "revenue_recognition",
      },
      evidence_references: ["ev-erp-revenue"],
    });

    const contradictions = detectContradictions([finance, erp], { now });

    expect(contradictions.some((item) => item.field === "revenue_amount" && item.severity === "critical")).toBe(true);
  });

  it("flags tenant or organization mismatch as critical and decision-blocking", () => {
    const otherTenant = signal({
      signal_id: "signal-other-tenant",
      raw_event_id: "raw-other-tenant",
      tenant_id: "tenant-other",
      organization_id: "org-other",
      source_system: "external_erp",
      evidence_references: ["ev-other-tenant"],
    });

    const contradictions = detectContradictions([baseSignal, otherTenant], { now });

    expect(contradictions[0]).toMatchObject({
      field: "tenant_organization_boundary",
      severity: "critical",
      category: "identity",
      decision_impact: {
        blocks_decision: true,
      },
    });
  });

  it("detects missing evidence conflicts", () => {
    const noEvidence = signal({
      signal_id: "signal-no-evidence",
      raw_event_id: "raw-no-evidence",
      source_system: "manual_upload",
      evidence_references: [],
    });

    const contradictions = detectContradictions([baseSignal, noEvidence], { now });

    expect(contradictions.some((item) => item.field === "evidence_references" && item.category === "compliance")).toBe(true);
  });

  it("detects duplicate source records with different payload hashes", () => {
    const duplicateChanged = signal({
      signal_id: "signal-sap-inventory-replay",
      raw_event_id: "raw-sap-inventory-replay",
      source_system: "sap",
      provenance: {
        source_record_id: "INV-92831",
      },
      payload: {
        ...sapInventoryPayload,
        inventory_count: 151,
      },
      evidence_references: ["ev-sap-inventory-replay"],
    });

    const contradictions = detectContradictions([baseSignal, duplicateChanged], { now });

    expect(
      contradictions.some(
        (item) => item.field === "provenance.payload_hash" && item.severity === "high" && item.category === "operational",
      ),
    ).toBe(true);
  });

  it("is deterministic for identical input", () => {
    const warehouse = signal({
      signal_id: "signal-warehouse-inventory",
      raw_event_id: "raw-warehouse-inventory",
      source_system: "warehouse_scanner",
      payload: {
        ...sapInventoryPayload,
        inventory_count: 143,
      },
      evidence_references: ["ev-warehouse-inventory"],
    });

    expect(detectContradictions([baseSignal, warehouse], { now })).toEqual(
      detectContradictions(JSON.parse(JSON.stringify([baseSignal, warehouse])), { now }),
    );
  });

  it("emits records compatible with RTS-1A base schema plus enhanced governance fields", () => {
    const warehouse = signal({
      signal_id: "signal-warehouse-inventory",
      raw_event_id: "raw-warehouse-inventory",
      source_system: "warehouse_scanner",
      payload: {
        ...sapInventoryPayload,
        inventory_count: 143,
      },
      evidence_references: ["ev-warehouse-inventory"],
    });

    const [record] = detectContradictions([baseSignal, warehouse], { now });

    expect(ContradictionRecordSchema.safeParse(record).success).toBe(true);
    expect(ExtendedContradictionRecordSchema.safeParse(record).success).toBe(true);
  });
});
