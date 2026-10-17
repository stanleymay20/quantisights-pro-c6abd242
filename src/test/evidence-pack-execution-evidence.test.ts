import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DEMO_DECISION } from "@/components/decisions/executive-review-flow";
import { buildEvidencePack, canonicalHash } from "@/lib/evidence-pack";
import {
  attachExecutionEvidence,
  type EvidencePackExecutionReceiptInput,
} from "@/lib/evidence-pack-execution";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const FIXED_NOW = () => "2026-10-17T12:00:00.000Z";

async function receipt(
  overrides: Partial<EvidencePackExecutionReceiptInput> = {},
  observation: {
    observedStatus?: string;
    responseStatus?: number | null;
    providerMetadata?: Record<string, unknown>;
    errorMessage?: string | null;
    externalReference?: string | null;
  } = {},
): Promise<EvidencePackExecutionReceiptInput> {
  const id = overrides.id ?? "receipt-001";
  const observedStatus = observation.observedStatus ?? "succeeded";
  const responseStatus = observation.responseStatus ?? 200;
  const providerMetadata = observation.providerMetadata ?? { provider_message_id: "msg-123", channel: "ops" };
  const errorMessage = observation.errorMessage ?? null;
  const observedExternalReference = observation.externalReference ?? "msg-123";

  const digest = (
    await canonicalHash({
      receipt_id: id,
      version: "v1",
      observed_status: observedStatus,
      response_status: responseStatus,
      response_metadata: providerMetadata,
      error_message: errorMessage,
      external_reference: observedExternalReference,
    })
  ).replace(/^sha256-/, "");

  return {
    id,
    execution_plan_id: "plan-001",
    decision_id: DEMO_DECISION.id,
    action_type: "notify_slack",
    status: observedStatus,
    response_status: responseStatus,
    response_metadata: {
      ...providerMetadata,
      provider_evidence_version: "v1",
      provider_evidence_observed_status: observedStatus,
      provider_evidence_response_status: responseStatus,
      provider_evidence_error_message: errorMessage,
      provider_evidence_external_reference: observedExternalReference,
      provider_evidence_digest: digest,
    },
    error_message: errorMessage,
    created_at: "2026-10-17T10:00:00.000Z",
    completed_at: "2026-10-17T10:00:02.000Z",
    reconciled_at: null,
    reconciled_by: null,
    reconciliation_note: null,
    external_reference: observedExternalReference,
    attempt_count: 1,
    max_attempts: 3,
    last_attempt_at: "2026-10-17T10:00:01.000Z",
    last_retry_reason: null,
    retry_exhausted_at: null,
    ...overrides,
  };
}

describe("Evidence Pack governed execution evidence", () => {
  it("re-verifies the server-persisted provider evidence digest and includes it in the pack hash", async () => {
    const base = await buildEvidencePack(DEMO_DECISION, { now: FIXED_NOW });
    const linked = await attachExecutionEvidence(base, { receipts: [await receipt()] });
    const section = linked.sections.runtime_metadata;
    const receipts = section.data.receipts as Array<Record<string, any>>;

    expect(section.title).toBe("Runtime & Execution Evidence");
    expect(section.status).toBe("complete");
    expect(section.data.receipt_count).toBe(1);
    expect(section.data.provider_evidence_verified_count).toBe(1);
    expect(receipts[0].provider_observation.verification).toBe("verified");
    expect(receipts[0].provider_observation.stored_digest).toBe(receipts[0].provider_observation.recomputed_digest);
    expect(linked.evidence_pack_hash).not.toBe(base.evidence_pack_hash);
    expect(linked.sections.hashes.data.evidence_pack_hash).toBe(linked.evidence_pack_hash);
  });

  it("keeps the immutable uncertain provider observation separate from a later reconciliation", async () => {
    const base = await buildEvidencePack(DEMO_DECISION, { now: FIXED_NOW });
    const uncertain = await receipt(
      {
        status: "succeeded",
        reconciled_at: "2026-10-17T10:30:00.000Z",
        reconciled_by: "user-42",
        reconciliation_note: "Verified in the provider admin console.",
        external_reference: "provider-final-789",
      },
      {
        observedStatus: "uncertain",
        responseStatus: 504,
        providerMetadata: { transport: "timeout" },
        errorMessage: "Provider outcome could not be confirmed",
        externalReference: null,
      },
    );

    const linked = await attachExecutionEvidence(base, { receipts: [uncertain] });
    const evidence = (linked.sections.runtime_metadata.data.receipts as Array<Record<string, any>>)[0];

    expect(evidence.provider_observation.observed_status).toBe("uncertain");
    expect(evidence.provider_observation.verification).toBe("verified");
    expect(evidence.current_status).toBe("succeeded");
    expect(evidence.reconciliation.resolution).toBe("succeeded");
    expect(evidence.reconciliation.external_reference).toBe("provider-final-789");
    expect(evidence.reconciliation.evidence_hash).toMatch(/^sha256-[0-9a-f]{64}$/);
    expect(evidence.reconciliation.hash_scope).toBe("derived-evidence-pack-fingerprint");
  });

  it("changes only reconciliation evidence when the governed reconciliation note changes", async () => {
    const base = await buildEvidencePack(DEMO_DECISION, { now: FIXED_NOW });
    const common = {
      status: "failed",
      reconciled_at: "2026-10-17T10:30:00.000Z",
      reconciled_by: "user-42",
      external_reference: "ticket-901",
    } satisfies Partial<EvidencePackExecutionReceiptInput>;

    const first = await receipt(
      { ...common, reconciliation_note: "Confirmed failed in provider console." },
      { observedStatus: "uncertain", responseStatus: 504, providerMetadata: { transport: "timeout" }, errorMessage: "Unknown outcome", externalReference: null },
    );
    const second = await receipt(
      { ...common, reconciliation_note: "Confirmed failed via provider support ticket." },
      { observedStatus: "uncertain", responseStatus: 504, providerMetadata: { transport: "timeout" }, errorMessage: "Unknown outcome", externalReference: null },
    );

    const a = await attachExecutionEvidence(base, { receipts: [first] });
    const b = await attachExecutionEvidence(base, { receipts: [second] });
    const aReceipt = (a.sections.runtime_metadata.data.receipts as Array<Record<string, any>>)[0];
    const bReceipt = (b.sections.runtime_metadata.data.receipts as Array<Record<string, any>>)[0];

    expect(aReceipt.provider_observation.stored_digest).toBe(bReceipt.provider_observation.stored_digest);
    expect(aReceipt.provider_observation.recomputed_digest).toBe(bReceipt.provider_observation.recomputed_digest);
    expect(aReceipt.reconciliation.evidence_hash).not.toBe(bReceipt.reconciliation.evidence_hash);
    expect(a.evidence_pack_hash).not.toBe(b.evidence_pack_hash);
  });

  it("fails closed to partial evidence when a provider digest does not verify", async () => {
    const base = await buildEvidencePack(DEMO_DECISION, { now: FIXED_NOW });
    const tampered = await receipt();
    tampered.response_metadata = {
      ...tampered.response_metadata,
      provider_message_id: "tampered-after-digest",
    };

    const linked = await attachExecutionEvidence(base, { receipts: [tampered] });
    const evidence = (linked.sections.runtime_metadata.data.receipts as Array<Record<string, any>>)[0];

    expect(evidence.provider_observation.verification).toBe("mismatch");
    expect(linked.sections.runtime_metadata.status).toBe("partial");
    expect(linked.sections.runtime_metadata.data.provider_evidence_mismatch_count).toBe(1);
    expect(linked.sections.runtime_metadata.summary).toMatch(/require investigation/);
  });

  it("reports a failed receipt projection as unknown instead of claiming there were no executions", async () => {
    const base = await buildEvidencePack(DEMO_DECISION, { now: FIXED_NOW });
    const linked = await attachExecutionEvidence(base, { receipts: [], readFailed: true });

    expect(linked.sections.runtime_metadata.status).toBe("unavailable");
    expect(linked.sections.runtime_metadata.data.execution_receipts_read_failed).toBe(true);
    expect(linked.sections.runtime_metadata.summary).toMatch(/unknown/);
    expect(linked.sections.runtime_metadata.summary).toMatch(/does not mean no execution occurred/);
  });

  it("sorts receipt evidence deterministically before hashing", async () => {
    const base = await buildEvidencePack(DEMO_DECISION, { now: FIXED_NOW });
    const early = await receipt({ id: "receipt-a", created_at: "2026-10-17T09:00:00.000Z" });
    const late = await receipt({ id: "receipt-b", created_at: "2026-10-17T11:00:00.000Z" });

    const a = await attachExecutionEvidence(base, { receipts: [late, early] });
    const b = await attachExecutionEvidence(base, { receipts: [early, late] });
    const ids = (a.sections.runtime_metadata.data.receipts as Array<Record<string, any>>).map((row) => row.receipt_id);

    expect(ids).toEqual(["receipt-a", "receipt-b"]);
    expect(a.evidence_pack_hash).toBe(b.evidence_pack_hash);
  });

  it("uses the existing tenant-scoped receipt RPC and never opens direct client table access", () => {
    const page = read("src/pages/EvidencePack.tsx");

    expect(page).toContain('rpc("list_execution_action_receipts"');
    expect(page).toContain("p_organization_id: currentOrgId");
    expect(page).toContain("p_decision_id: decisionId");
    expect(page).not.toContain('.from("execution_action_receipts")');
    expect(page).toContain("executionReceiptsReadFailed");
  });
});
