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

describe("outbound execution receipt provider evidence", () => {
  it("persists a deterministic SHA-256 evidence digest with every completed receipt", async () => {
    const first = captureSupabaseUpdate();
    await completeExecutionReceipt(first.supabase, "receipt-123", "succeeded", {
      responseStatus: 200,
      responseMetadata: {
        channel: "C123",
        success: true,
        attempts: 1,
      },
    });

    const firstUpdate = first.getUpdate();
    const firstMetadata = firstUpdate.response_metadata as Record<string, unknown>;
    expect(firstMetadata.provider_evidence_version).toBe("v1");
    expect(firstMetadata.provider_evidence_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(firstMetadata.channel).toBe("C123");

    const second = captureSupabaseUpdate();
    await completeExecutionReceipt(second.supabase, "receipt-123", "succeeded", {
      responseStatus: 200,
      responseMetadata: {
        attempts: 1,
        success: true,
        channel: "C123",
      },
    });

    const secondMetadata = second.getUpdate().response_metadata as Record<string, unknown>;
    expect(secondMetadata.provider_evidence_digest).toBe(firstMetadata.provider_evidence_digest);
  });

  it("changes the evidence digest when the recorded provider outcome changes", async () => {
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

    const successDigest = (success.getUpdate().response_metadata as Record<string, unknown>).provider_evidence_digest;
    const uncertainDigest = (uncertain.getUpdate().response_metadata as Record<string, unknown>).provider_evidence_digest;
    expect(uncertainDigest).not.toBe(successDigest);
  });

  it("stores a bounded external provider reference when supplied", async () => {
    const capture = captureSupabaseUpdate();
    await completeExecutionReceipt(capture.supabase, "receipt-ref", "succeeded", {
      responseStatus: 201,
      responseMetadata: { success: true },
      externalReference: "x".repeat(700),
    });

    const update = capture.getUpdate();
    expect(update.external_reference).toBe("x".repeat(500));
  });
});
