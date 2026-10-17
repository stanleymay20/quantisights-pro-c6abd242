import { describe, expect, it } from "vitest";
import { completeExecutionReceipt } from "../../supabase/functions/execute-decision-action/idempotency";

type CapturedUpdate = Record<string, unknown>;

function captureSupabaseUpdate() {
  let updatePayload: CapturedUpdate | null = null;
  const query = {
    error: null as null,
    eq() {
      return this;
    },
  };

  const supabase = {
    from(table: string) {
      expect(table).toBe("execution_action_receipts");
      return {
        update(payload: CapturedUpdate) {
          updatePayload = payload;
          return query;
        },
      };
    },
  };

  return {
    supabase,
    getUpdate: () => {
      if (!updatePayload) throw new Error("No receipt update captured");
      return updatePayload;
    },
  };
}

async function captureCompletedReceipt(options: Parameters<typeof completeExecutionReceipt>[3]) {
  const capture = captureSupabaseUpdate();
  await completeExecutionReceipt(capture.supabase, "receipt-123", "succeeded", options);
  return capture.getUpdate();
}

function digestOf(update: CapturedUpdate) {
  return (update.response_metadata as Record<string, unknown>).provider_evidence_digest;
}

describe("outbound execution receipt provider evidence", () => {
  it("persists a deterministic, self-describing SHA-256 provider observation", async () => {
    const firstUpdate = await captureCompletedReceipt({
      responseStatus: 200,
      responseMetadata: {
        channel: "C123",
        success: true,
        attempts: 1,
      },
    });

    const firstMetadata = firstUpdate.response_metadata as Record<string, unknown>;
    expect(firstMetadata.provider_evidence_version).toBe("v1");
    expect(firstMetadata.provider_evidence_observed_status).toBe("succeeded");
    expect(firstMetadata.provider_evidence_response_status).toBe(200);
    expect(firstMetadata.provider_evidence_error_message).toBeNull();
    expect(firstMetadata.provider_evidence_external_reference).toBeNull();
    expect(firstMetadata.provider_evidence_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(firstMetadata.channel).toBe("C123");

    const secondUpdate = await captureCompletedReceipt({
      responseStatus: 200,
      responseMetadata: {
        attempts: 1,
        success: true,
        channel: "C123",
      },
    });

    expect(digestOf(secondUpdate)).toBe(firstMetadata.provider_evidence_digest);
  });

  it("changes the evidence digest when the observed provider outcome changes", async () => {
    const success = captureSupabaseUpdate();
    await completeExecutionReceipt(success.supabase, "receipt-abc", "succeeded", {
      responseStatus: 200,
      responseMetadata: { success: true, attempts: 1 },
    });

    const uncertain = captureSupabaseUpdate();
    await completeExecutionReceipt(uncertain.supabase, "receipt-abc", "uncertain", {
      responseStatus: 502,
      responseMetadata: { success: false, uncertain: true, attempts: 2 },
    });

    const uncertainMetadata = uncertain.getUpdate().response_metadata as Record<string, unknown>;
    expect(uncertainMetadata.provider_evidence_observed_status).toBe("uncertain");
    expect(digestOf(uncertain.getUpdate())).not.toBe(digestOf(success.getUpdate()));
  });

  it("binds bounded error evidence into the digest", async () => {
    const first = captureSupabaseUpdate();
    await completeExecutionReceipt(first.supabase, "receipt-error", "failed", {
      responseStatus: 500,
      responseMetadata: { attempts: 1 },
      errorMessage: "provider rejected request",
    });

    const second = captureSupabaseUpdate();
    await completeExecutionReceipt(second.supabase, "receipt-error", "failed", {
      responseStatus: 500,
      responseMetadata: { attempts: 1 },
      errorMessage: "provider rejected different request",
    });

    expect(digestOf(second.getUpdate())).not.toBe(digestOf(first.getUpdate()));
  });

  it("stores a bounded external provider reference and binds the observed reference into evidence", async () => {
    const longReference = "x".repeat(700);
    const first = await captureCompletedReceipt({
      responseStatus: 201,
      responseMetadata: { success: true },
      externalReference: longReference,
    });
    expect(first.external_reference).toBe("x".repeat(500));
    expect((first.response_metadata as Record<string, unknown>).provider_evidence_external_reference).toBe("x".repeat(500));

    const second = await captureCompletedReceipt({
      responseStatus: 201,
      responseMetadata: { success: true },
      externalReference: "provider-object-2",
    });
    expect(digestOf(second)).not.toBe(digestOf(first));
  });

  it("keeps the complete provider_evidence namespace server-owned", async () => {
    const clean = await captureCompletedReceipt({
      responseStatus: 200,
      responseMetadata: { channel: "C123", success: true },
    });

    const spoofed = await captureCompletedReceipt({
      responseStatus: 200,
      responseMetadata: {
        channel: "C123",
        success: true,
        provider_evidence_version: "attacker-controlled",
        provider_evidence_digest: "fake-digest",
        provider_evidence_observed_status: "failed",
        provider_evidence_future_field: "poison",
      },
    });

    const spoofedMetadata = spoofed.response_metadata as Record<string, unknown>;
    expect(spoofedMetadata.provider_evidence_version).toBe("v1");
    expect(spoofedMetadata.provider_evidence_observed_status).toBe("succeeded");
    expect(spoofedMetadata.provider_evidence_future_field).toBeUndefined();
    expect(spoofedMetadata.provider_evidence_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digestOf(spoofed)).toBe(digestOf(clean));
  });

  it("keeps top-level reconciliation metadata server-owned and outside the provider observation digest", async () => {
    const clean = await captureCompletedReceipt({
      responseStatus: 200,
      responseMetadata: { channel: "C123", success: true },
    });

    const spoofed = await captureCompletedReceipt({
      responseStatus: 200,
      responseMetadata: {
        channel: "C123",
        success: true,
        reconciliation: {
          resolution: "failed",
          reviewed_by: "attacker",
          evidence_digest: "fake",
        },
      },
    });

    const metadata = spoofed.response_metadata as Record<string, unknown>;
    expect(metadata.reconciliation).toBeUndefined();
    expect(digestOf(spoofed)).toBe(digestOf(clean));
  });
});
