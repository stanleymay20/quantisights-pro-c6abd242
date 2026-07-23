import { describe, expect, it } from "vitest";

import { createPayloadHash, REAL_TIME_SIGNAL_SCHEMA_VERSION } from "@/lib/real-time-signals";
import {
  SIGNAL_QUALITY_WEIGHTS,
  calculateSignalQuality,
  classifySignalFreshnessBand,
  type SignalQualityInput,
} from "@/lib/signal-quality";

const now = "2026-07-04T10:00:00.000Z";

const basePayload = {
  purchase_order_id: "PO-92831",
  supplier_id: "supplier-x",
  delay_hours: 72,
  inventory_count: 250,
  status: "delayed",
  region: "Region A",
};

const perfectSignal: SignalQualityInput = {
  schema_version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
  signal_id: "signal-sap-po-92831",
  raw_event_id: "raw-sap-po-92831",
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
    description: "High revenue risk from delayed purchase order",
  },
  quality: {
    completeness: 0,
    consistency: 0,
    freshness: 0,
    provenance: 0,
    materiality: 0,
    overall: 0,
  },
  evidence_references: ["ev-sap-po-92831"],
  payload: basePayload,
  idempotency_key: "tenant-acme:raw-sap-po-92831:supplier-delay",
  provenance: {
    connector_verified: true,
    payload_hash: createPayloadHash(basePayload),
    source_record_id: "PO-92831",
    signature_present: true,
  },
  expected_payload_hash: createPayloadHash(basePayload),
  required_payload_fields: ["purchase_order_id", "supplier_id", "delay_hours", "inventory_count", "status"],
  optional_payload_fields: ["region"],
  allowed_payload_enums: {
    status: ["delayed", "on_time", "cancelled"],
  },
  compared_values: [
    {
      field: "inventory_count",
      source_a: "sap",
      value_a: 250,
      source_b: "warehouse_scanner",
      value_b: 250,
    },
  ],
  duplicate_ids: [],
  decision_trigger: true,
  source_criticality: "critical",
  now,
};

describe("RTS-1B signal quality scoring", () => {
  it("scores a perfect signal deterministically with full explanation coverage", () => {
    const result = calculateSignalQuality(perfectSignal);

    expect(result).toMatchObject({
      completeness: 100,
      consistency: 100,
      freshness: 100,
      provenance: 100,
      materiality: 100,
      integrity: 100,
      overall: 100,
    });
    expect(result.explanation).toEqual(
      expect.arrayContaining([
        expect.stringContaining("completeness scored 100"),
        expect.stringContaining("consistency scored 100"),
        expect.stringContaining("freshness scored 100"),
        expect.stringContaining("provenance scored 100"),
        expect.stringContaining("materiality scored 100"),
        expect.stringContaining("integrity scored 100"),
        expect.stringContaining("overall scored 100"),
      ]),
    );
  });

  it("reduces completeness for missing required and optional fields", () => {
    const result = calculateSignalQuality({
      ...perfectSignal,
      payload: {
        purchase_order_id: "PO-92831",
        supplier_id: "supplier-x",
      },
    });

    expect(result.completeness).toBeLessThan(100);
    expect(result.explanation.join(" ")).toContain("missing required field delay_hours");
    expect(result.explanation.join(" ")).toContain("missing optional field region");
  });

  it("classifies freshness using deterministic enterprise thresholds", () => {
    expect(classifySignalFreshnessBand({ observed_at: "2026-07-04T09:56:00.000Z", now })).toBe("fresh");
    expect(classifySignalFreshnessBand({ observed_at: "2026-07-04T09:54:59.000Z", now })).toBe("warning");
    expect(classifySignalFreshnessBand({ observed_at: "2026-07-03T10:00:00.000Z", now })).toBe("stale");
    expect(classifySignalFreshnessBand({ observed_at: "2026-07-03T09:59:59.000Z", now })).toBe("expired");
  });

  it("reduces freshness to zero for expired signals", () => {
    const result = calculateSignalQuality({
      ...perfectSignal,
      observed_at: "2026-07-03T09:59:59.000Z",
    });

    expect(result.freshness).toBe(0);
    expect(result.explanation.join(" ")).toContain("freshness reduced because signal is expired");
  });

  it("scores low materiality below high materiality", () => {
    const low = calculateSignalQuality({
      ...perfectSignal,
      materiality: {
        level: "low",
        amount: 1000,
        currency: "EUR",
        description: "Low operational impact",
      },
      risk_level: "low",
      decision_trigger: false,
      source_criticality: "low",
    });
    const high = calculateSignalQuality(perfectSignal);

    expect(low.materiality).toBeLessThan(high.materiality);
    expect(low.explanation.join(" ")).toContain("materiality reduced because no decision trigger is present");
  });

  it("detects tampered payload hashes through integrity scoring", () => {
    const result = calculateSignalQuality({
      ...perfectSignal,
      expected_payload_hash: "fnv1a-tampered",
    });

    expect(result.integrity).toBeLessThan(100);
    expect(result.explanation.join(" ")).toContain("integrity reduced because payload hash does not match");
  });

  it("reduces consistency for duplicate IDs and negative quantities", () => {
    const result = calculateSignalQuality({
      ...perfectSignal,
      duplicate_ids: ["PO-92831"],
      payload: {
        ...basePayload,
        inventory_count: -5,
      },
    });

    expect(result.consistency).toBeLessThan(100);
    expect(result.explanation.join(" ")).toContain("duplicate id PO-92831");
    expect(result.explanation.join(" ")).toContain("negative quantity inventory_count");
  });

  it("reduces consistency for schema mismatches and invalid enum values", () => {
    const result = calculateSignalQuality({
      ...perfectSignal,
      schema_version: "quantivis.real-time-signal.v0",
      payload: {
        ...basePayload,
        status: "unknown",
      },
    });

    expect(result.consistency).toBeLessThan(100);
    expect(result.explanation.join(" ")).toContain("schema mismatch");
    expect(result.explanation.join(" ")).toContain("invalid enum status=unknown");
  });

  it("is deterministic for identical input", () => {
    expect(calculateSignalQuality(perfectSignal)).toEqual(calculateSignalQuality(JSON.parse(JSON.stringify(perfectSignal))));
  });

  it("computes overall as the documented weighted average", () => {
    const result = calculateSignalQuality({
      ...perfectSignal,
      observed_at: "2026-07-04T09:40:00.000Z",
      expected_payload_hash: "fnv1a-tampered",
    });

    const expectedOverall = Math.round(
      result.completeness * SIGNAL_QUALITY_WEIGHTS.completeness +
        result.consistency * SIGNAL_QUALITY_WEIGHTS.consistency +
        result.freshness * SIGNAL_QUALITY_WEIGHTS.freshness +
        result.provenance * SIGNAL_QUALITY_WEIGHTS.provenance +
        result.materiality * SIGNAL_QUALITY_WEIGHTS.materiality +
        result.integrity * SIGNAL_QUALITY_WEIGHTS.integrity,
    );

    expect(result.overall).toBe(expectedOverall);
    expect(Object.values(SIGNAL_QUALITY_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
  });
});
