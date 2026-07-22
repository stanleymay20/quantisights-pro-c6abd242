import { describe, expect, it } from "vitest";

import {
  REAL_TIME_SIGNAL_SCHEMA_VERSION,
  RawEventSchema,
  NormalizedSignalSchema,
  ContradictionRecordSchema,
  VerifiedFactSchema,
  DecisionCandidateSchema,
  classifyFreshness,
  createPayloadHash,
  deriveIdempotencyKey,
  deriveSignalId,
  isFresh,
  mapDecisionCandidateToAgentGatewayRequest,
  validateSignalQualityShape,
  type DecisionCandidate,
  type NormalizedSignal,
  type RawEvent,
  type SignalQualityScore,
  type VerifiedFact,
} from "@/lib/real-time-signals";

const observedAt = "2026-07-04T09:00:00.000Z";

const rawEvent: RawEvent = {
  schema_version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
  event_id: "raw-sap-po-92831",
  source_system: "sap",
  source_type: "erp",
  tenant_id: "tenant-acme",
  organization_id: "org-acme",
  observed_at: observedAt,
  received_at: "2026-07-04T09:00:05.000Z",
  event_type: "purchase_order.delay_detected",
  payload: {
    purchase_order_id: "PO-92831",
    delay_hours: 72,
    expected_revenue_risk: 620000,
  },
  provenance: {
    connector_id: "connector-sap-prod",
    source_record_id: "PO-92831",
    payload_hash: "fnv1a-placeholder",
  },
};

const quality: SignalQualityScore = {
  completeness: 95,
  consistency: 90,
  freshness: 100,
  provenance: 92,
  materiality: 96,
  overall: 94,
};

const normalizedSignal: NormalizedSignal = {
  schema_version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
  signal_id: "signal-tenant-acme-sap-po-92831",
  raw_event_id: rawEvent.event_id,
  tenant_id: rawEvent.tenant_id,
  organization_id: rawEvent.organization_id,
  source_system: rawEvent.source_system,
  signal_type: "supplier_delay",
  observed_at: rawEvent.observed_at,
  normalized_at: "2026-07-04T09:00:10.000Z",
  materiality: {
    level: "high",
    amount: 620000,
    currency: "EUR",
    description: "Revenue risk from delayed purchase order",
  },
  quality,
  evidence_references: ["ev-sap-po-92831", "ev-supplier-api-92831"],
  payload: {
    supplier_id: "supplier-x",
    delay_hours: 72,
  },
  idempotency_key: "tenant-acme:raw-sap-po-92831:supplier_delay",
};

const verifiedFact: VerifiedFact = {
  schema_version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
  fact_id: "fact-supplier-x-delay-72h",
  tenant_id: normalizedSignal.tenant_id,
  organization_id: normalizedSignal.organization_id,
  statement: "Supplier X is expected to miss delivery by 72 hours.",
  confidence: 94,
  quality,
  source_signal_ids: [normalizedSignal.signal_id],
  evidence_references: normalizedSignal.evidence_references,
  contradictions: [],
  verified_at: "2026-07-04T09:05:00.000Z",
  expires_at: "2026-07-04T11:05:00.000Z",
};

const decisionCandidate: DecisionCandidate = {
  schema_version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
  candidate_id: "candidate-switch-supplier-region-a",
  tenant_id: verifiedFact.tenant_id,
  organization_id: verifiedFact.organization_id,
  decision_type: "supply_chain_risk",
  requested_action: "Review switching Supplier X for Region A",
  verified_fact_ids: [verifiedFact.fact_id],
  evidence_references: verifiedFact.evidence_references,
  confidence: 88,
  business_impact: {
    amount: 620000,
    currency: "EUR",
    description: "Revenue at risk if the delay is not mitigated",
  },
  risk_level: "high",
  justification: "Verified delay risk exceeds the executive decision threshold.",
  metadata: {
    source: "rts-1a-contract-test",
  },
};

describe("Real-time signal schemas and contracts", () => {
  it("validates a RawEvent with schema version and provenance", () => {
    const parsed = RawEventSchema.safeParse(rawEvent);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.schema_version).toBe(REAL_TIME_SIGNAL_SCHEMA_VERSION);
  });

  it("rejects an invalid RawEvent without tenant and payload", () => {
    const parsed = RawEventSchema.safeParse({
      ...rawEvent,
      tenant_id: "",
      payload: undefined,
    });

    expect(parsed.success).toBe(false);
  });

  it("validates a NormalizedSignal with bounded quality and idempotency", () => {
    const parsed = NormalizedSignalSchema.safeParse(normalizedSignal);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.quality.overall).toBe(94);
    expect(parsed.success && parsed.data.idempotency_key).toContain(rawEvent.event_id);
  });

  it("classifies signal freshness from observed time and max age", () => {
    expect(
      classifyFreshness({
        observed_at: observedAt,
        now: "2026-07-04T09:01:00.000Z",
        max_age_seconds: 300,
      }),
    ).toBe("fresh");

    expect(
      classifyFreshness({
        observed_at: observedAt,
        now: "2026-07-04T09:10:01.000Z",
        max_age_seconds: 300,
      }),
    ).toBe("stale");

    expect(
      classifyFreshness({
        observed_at: "not-a-date",
        now: "2026-07-04T09:01:00.000Z",
        max_age_seconds: 300,
      }),
    ).toBe("invalid");

    expect(isFresh({ observed_at: observedAt, now: "2026-07-04T09:02:00.000Z", max_age_seconds: 300 })).toBe(true);
  });

  it("rejects signal quality scores outside 0 to 100", () => {
    expect(validateSignalQualityShape(quality).success).toBe(true);

    expect(
      validateSignalQualityShape({
        ...quality,
        overall: 101,
      }).success,
    ).toBe(false);
  });

  it("validates contradiction records between conflicting sources", () => {
    const parsed = ContradictionRecordSchema.safeParse({
      contradiction_id: "contradiction-inventory-sap-scanner",
      source_a: "sap",
      source_b: "warehouse_scanner",
      field: "inventory_count",
      value_a: 250,
      value_b: 143,
      severity: "high",
      detected_at: "2026-07-04T09:03:00.000Z",
      evidence_references: ["ev-sap-inventory", "ev-scanner-inventory"],
    });

    expect(parsed.success).toBe(true);
  });

  it("requires verified facts to reference source signals and evidence", () => {
    expect(VerifiedFactSchema.safeParse(verifiedFact).success).toBe(true);

    expect(
      VerifiedFactSchema.safeParse({
        ...verifiedFact,
        source_signal_ids: [],
      }).success,
    ).toBe(false);

    expect(
      VerifiedFactSchema.safeParse({
        ...verifiedFact,
        evidence_references: [],
      }).success,
    ).toBe(false);
  });

  it("requires decision candidates to reference verified facts", () => {
    expect(DecisionCandidateSchema.safeParse(decisionCandidate).success).toBe(true);

    expect(
      DecisionCandidateSchema.safeParse({
        ...decisionCandidate,
        verified_fact_ids: [],
      }).success,
    ).toBe(false);
  });

  it("maps decision candidates to the AG-2 handoff request shape", () => {
    const handoff = mapDecisionCandidateToAgentGatewayRequest(decisionCandidate, {
      agent_id: "aicis-signal-engine",
      idempotency_key: deriveIdempotencyKey({
        tenant_id: decisionCandidate.tenant_id,
        source_id: decisionCandidate.candidate_id,
        purpose: "agent-gateway-handoff",
      }),
    });

    expect(handoff).toMatchObject({
      agent_id: "aicis-signal-engine",
      tenant_id: decisionCandidate.tenant_id,
      organization_id: decisionCandidate.organization_id,
      idempotency_key: expect.any(String),
      decision_type: decisionCandidate.decision_type,
      requested_action: decisionCandidate.requested_action,
      evidence_references: decisionCandidate.evidence_references,
      confidence: decisionCandidate.confidence,
      business_impact: decisionCandidate.business_impact,
      risk_level: decisionCandidate.risk_level,
      justification: decisionCandidate.justification,
      metadata: expect.objectContaining({
        schema_version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
        candidate_id: decisionCandidate.candidate_id,
        verified_fact_ids: decisionCandidate.verified_fact_ids,
      }),
    });
  });

  it("derives stable payload hashes, signal IDs, and idempotency keys", () => {
    expect(createPayloadHash({ b: 2, a: 1 })).toBe(createPayloadHash({ a: 1, b: 2 }));
    expect(deriveSignalId(rawEvent, "supplier_delay")).toBe(deriveSignalId(rawEvent, "supplier_delay"));
    expect(
      deriveIdempotencyKey({
        tenant_id: rawEvent.tenant_id,
        source_id: rawEvent.event_id,
        purpose: "normalize",
      }),
    ).toContain(rawEvent.tenant_id);
  });
});
