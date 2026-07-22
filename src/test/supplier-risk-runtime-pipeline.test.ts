import { describe, expect, it, vi } from "vitest";

import type { DecisionRecord } from "@/lib/agent-gateway";
import {
  runSupplierRiskRuntimePipeline,
  type SupplierRiskDecisionLedgerRow,
  type SupplierRiskPipelineInput,
  type SupplierRiskRuntimeDeps,
  type SupplierRiskSignalInput,
} from "@/lib/supplier-risk-runtime-pipeline";

const NOW = "2026-07-10T12:00:00.000Z";

function baseSignal(overrides: Partial<SupplierRiskSignalInput> = {}): SupplierRiskSignalInput {
  return {
    event_id: "evt-supplier-001",
    source_system: "supplier-portal",
    connector_id: "connector-supplier-portal",
    source_record_id: "src-supplier-001",
    tenant_id: "org-acme",
    organization_id: "org-acme",
    supplier_id: "supplier-critical-1",
    delivery_delay_hours: 48,
    impact_amount: 750_000,
    description: "Critical supplier delivery risk detected via supplier portal feed.",
    observed_at: NOW,
    ...overrides,
  };
}

function buildDeps(overrides: Partial<SupplierRiskRuntimeDeps> = {}): {
  deps: SupplierRiskRuntimeDeps;
  calls: {
    persistDecisionRecord: DecisionRecord[];
    writeAuditEvent: unknown[];
    persistDecisionLedgerRow: SupplierRiskDecisionLedgerRow[];
  };
} {
  const calls = {
    persistDecisionRecord: [] as DecisionRecord[],
    writeAuditEvent: [] as unknown[],
    persistDecisionLedgerRow: [] as SupplierRiskDecisionLedgerRow[],
  };
  const deps: SupplierRiskRuntimeDeps = {
    persistDecisionRecord: vi.fn(async (record: DecisionRecord) => {
      calls.persistDecisionRecord.push(record);
      return { decision_id: record.decision_id };
    }),
    writeAuditEvent: vi.fn(async (event) => {
      calls.writeAuditEvent.push(event);
      return { audit_id: `audit-${calls.writeAuditEvent.length}` };
    }),
    persistDecisionLedgerRow: vi.fn(async (row: SupplierRiskDecisionLedgerRow) => {
      calls.persistDecisionLedgerRow.push(row);
      return { decision_id: `decision-ledger-${calls.persistDecisionLedgerRow.length}` };
    }),
    ...overrides,
  };
  return { deps, calls };
}

function runPipeline(input: Partial<SupplierRiskPipelineInput> = {}, depsOverrides: Partial<SupplierRiskRuntimeDeps> = {}) {
  const { deps, calls } = buildDeps(depsOverrides);
  const pipelineInput: SupplierRiskPipelineInput = {
    signal: baseSignal(),
    now: NOW,
    ...input,
  };
  return runSupplierRiskRuntimePipeline(pipelineInput, deps).then((result) => ({ result, calls }));
}

describe("GA-1 Supplier Risk runtime pipeline", () => {
  it("travels through every RTS-1 / Agent Gateway / Runtime stage and produces a decision_ledger row", async () => {
    const { result, calls } = await runPipeline();

    expect(result.status).toBe("DECISION_LEDGER_READY");

    // RTS-1: Signal Quality
    expect(result.signal_quality).toHaveLength(1);
    expect(result.signal_quality[0].overall).toBeGreaterThanOrEqual(85);

    // RTS-1: Contradiction Detection (single clean signal -> none)
    expect(result.contradictions).toEqual([]);

    // RTS-1: Verified Fact Promotion
    expect(result.verified_fact).not.toBeNull();
    expect(result.verified_fact?.status).toBe("VERIFIED");
    expect(result.verified_fact?.fact_type).toBe("supplier_delivery_risk");

    // RTS-1E: Decision Candidate Generation
    expect(result.decision_candidate).not.toBeNull();
    expect(result.decision_candidate?.decision_type).toBe("supplier_risk_mitigation");
    expect(result.decision_candidate?.status).toBe("READY_FOR_GATEWAY");
    expect(["OPERATIONAL", "STRATEGIC"]).toContain(result.decision_candidate?.candidate_class);

    // RTS-1F: Decision Candidate Handoff
    expect(result.candidate_handoff?.status).toBe("HANDOFF_READY");
    expect(result.candidate_handoff?.gateway_request?.decision_type).toBe("supplier_risk_mitigation");

    // Agent Gateway (AG-2)
    expect(result.agent_gateway_result?.status).toMatch(/APPROVED|REQUIRES_APPROVAL/);
    expect(result.agent_gateway_result?.decision_record).not.toBeNull();
    expect(result.agent_gateway_result?.decision_token).not.toBeNull();

    // Runtime Gateway + Runtime Service (AG-3A/AG-3B)
    expect(result.runtime_service_response?.ok).toBe(true);
    if (result.runtime_service_response?.ok) {
      expect(result.runtime_service_response.acknowledgement.status).toBe("ACKNOWLEDGED");
    }

    // Runtime Queue (AG-3D) + Runtime Persistence (AG-3E)
    expect(result.execution_record?.status).toBe("COMPLETED");
    expect(result.execution_record?.result).toMatchObject({ decision_id: result.agent_gateway_result?.decision_record?.decision_id });

    // decision_ledger
    expect(result.decision_ledger_row).not.toBeNull();
    expect(calls.persistDecisionRecord).toHaveLength(1);
    expect(calls.writeAuditEvent.length).toBeGreaterThanOrEqual(1);
    expect(calls.persistDecisionLedgerRow).toHaveLength(1);
    expect(calls.persistDecisionLedgerRow[0]).toBe(result.decision_ledger_row);
  });

  it("produces a decision_ledger row shaped like the existing decision_ledger schema (no tenant_id column, correct enums)", async () => {
    const { result } = await runPipeline();
    const row = result.decision_ledger_row as SupplierRiskDecisionLedgerRow;

    expect(row.organization_id).toBe("org-acme");
    expect(row).not.toHaveProperty("tenant_id");
    expect(row.advisory_instance_id).toBeNull();
    expect(row.decision_status).toBe("pending");
    expect(row.execution_status).toBe("not_started");
    expect(row.decision_origin).toBe("runtime_pipeline");
    expect(row.recommendation_logic_type).toBe("rts1_runtime_pipeline");
    expect(typeof row.recommended_action).toBe("string");
    expect(row.recommended_action.length).toBeGreaterThan(0);
    expect(typeof row.source_insight_summary).toBe("string");
    expect(row.evidence_sources.length).toBeGreaterThan(0);

    const metadata = row.explanation_metadata as Record<string, any>;
    expect(metadata.lineage.fact_id).toBe(result.verified_fact?.fact_id);
    expect(metadata.lineage.candidate_id).toBe(result.decision_candidate?.candidate_id);
    expect(metadata.lineage.decision_id).toBe(result.agent_gateway_result?.decision_record?.decision_id);
    expect(metadata.source.execution_id).toBe(result.execution_record?.execution_id);
  });

  it("preserves audit lineage and evidence references end to end", async () => {
    const { result } = await runPipeline();
    const row = result.decision_ledger_row as SupplierRiskDecisionLedgerRow;
    const metadata = row.explanation_metadata as Record<string, any>;

    expect(metadata.lineage.supporting_signal_ids).toEqual(result.decision_candidate?.supporting_signal_ids);
    expect(metadata.lineage.supporting_raw_event_ids).toEqual(result.decision_candidate?.supporting_raw_event_ids);
    expect(result.decision_candidate?.lineage.enterprise_verified_facts).toContain(result.verified_fact?.fact_id);
    expect(result.verified_fact?.lineage.raw_events).toContain(result.raw_events[0].event_id);
  });

  it("blocks promotion for an expired signal (freshness gate) and never reaches decision_ledger", async () => {
    const { result, calls } = await runPipeline({
      signal: baseSignal({ observed_at: "2020-01-01T00:00:00.000Z" }),
    });

    expect(result.status).toBe("NOT_PROMOTED");
    expect(result.verified_fact).toBeNull();
    expect(result.decision_ledger_row).toBeNull();
    expect(calls.persistDecisionLedgerRow).toHaveLength(0);
    expect(calls.persistDecisionRecord).toHaveLength(0);
  });

  it("blocks promotion across a tenant/organization boundary (tenant isolation preserved)", async () => {
    const { result, calls } = await runPipeline({
      signal: baseSignal({ event_id: "evt-supplier-tenant-a", tenant_id: "org-acme", organization_id: "org-acme" }),
      additional_signals: [
        baseSignal({
          event_id: "evt-supplier-tenant-b",
          tenant_id: "org-globex",
          organization_id: "org-globex",
          source_record_id: "src-supplier-002",
        }),
      ],
    });

    expect(result.status).toBe("NOT_PROMOTED");
    expect(result.contradictions.some((c) => c.category === "identity" && c.severity === "critical")).toBe(true);
    expect(calls.persistDecisionLedgerRow).toHaveLength(0);
  });

  it("stops before Agent Gateway when no decision candidate clears generation thresholds", async () => {
    const { result, calls } = await runPipeline({
      confidence: 85,
      promotion_policy: "NORMAL",
      generation_policy: "STRICT",
    });

    expect(result.status).toBe("NO_CANDIDATE");
    expect(result.verified_fact).not.toBeNull();
    expect(result.decision_candidate).toBeNull();
    expect(result.decision_ledger_row).toBeNull();
    expect(calls.persistDecisionRecord).toHaveLength(0);
    expect(calls.persistDecisionLedgerRow).toHaveLength(0);
  });

  it("is deterministic: identical input produces identical fact and candidate hashes", async () => {
    const { result: first } = await runPipeline();
    const { result: second } = await runPipeline();

    expect(first.verified_fact?.fact_hash).toBe(second.verified_fact?.fact_hash);
    expect(first.decision_candidate?.candidate_hash).toBe(second.decision_candidate?.candidate_hash);
  });

  it("is rejected by the Agent Gateway when tenant validation fails, and never writes decision_ledger", async () => {
    const { deps, calls } = buildDeps({
      validateTenant: async () => ({ valid: false, reason: "synthetic rejection for test" }),
    });

    const result = await runSupplierRiskRuntimePipeline({ signal: baseSignal(), now: NOW }, deps);

    expect(result.status).toBe("GATEWAY_REJECTED");
    expect(result.agent_gateway_result?.status).toBe("REJECTED");
    expect(result.agent_gateway_result?.failures).toContain("tenant_validation_failed");
    expect(result.runtime_service_response).toBeNull();
    expect(result.decision_ledger_row).toBeNull();
    expect(calls.persistDecisionLedgerRow).toHaveLength(0);
    expect(calls.persistDecisionRecord).toHaveLength(0);
  });
});
