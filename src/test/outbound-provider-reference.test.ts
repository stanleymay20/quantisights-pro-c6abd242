import { describe, expect, it } from "vitest";

import {
  extractSlackExternalReference,
  extractWebhookExternalReference,
} from "../../supabase/functions/execute-decision-action/provider-reference.ts";

describe("provider-native execution references", () => {
  describe("Slack chat.postMessage", () => {
    it("uses only the provider-returned channel ID and message timestamp", () => {
      expect(extractSlackExternalReference({
        ok: true,
        channel: "C0123456789",
        ts: "1729177200.123456",
      })).toBe("slack-message:C0123456789:1729177200.123456");
    });

    it("does not synthesize a reference when provider identity is incomplete", () => {
      expect(extractSlackExternalReference({ ok: true, ts: "1729177200.123456" })).toBeNull();
      expect(extractSlackExternalReference({ ok: true, channel: "C0123456789" })).toBeNull();
      expect(extractSlackExternalReference({ ok: true })).toBeNull();
    });

    it("rejects malformed, oversized, or delimiter-injecting provider identifiers", () => {
      expect(extractSlackExternalReference({ channel: "C0123456789", ts: "not-a-slack-ts" })).toBeNull();
      expect(extractSlackExternalReference({ channel: `C${"A".repeat(120)}`, ts: "1729177200.123456" })).toBeNull();
      expect(extractSlackExternalReference({ channel: "C0123:evil", ts: "1729177200.123456" })).toBeNull();
      expect(extractSlackExternalReference({ channel: "C0123456789", ts: "1729177200.123456:evil" })).toBeNull();
    });
  });

  describe("generic webhook response", () => {
    it("captures the first explicit allowlisted request/correlation identifier", () => {
      const headers = new Headers({
        "x-correlation-id": "corr-222",
        "x-request-id": "req-111",
      });

      expect(extractWebhookExternalReference(headers)).toEqual({
        externalReference: "webhook-response:x-request-id:req-111",
        sourceHeader: "x-request-id",
      });
    });

    it("returns no reference when the remote server provides no allowlisted identifier", () => {
      const headers = new Headers({
        etag: "abc123",
        location: "https://provider.example/secret?token=do-not-record",
      });

      expect(extractWebhookExternalReference(headers)).toEqual({
        externalReference: null,
        sourceHeader: null,
      });
    });

    it("rejects oversized or non-opaque header values instead of truncating them", () => {
      const oversized = new Headers({ "x-request-id": "a".repeat(201) });
      expect(extractWebhookExternalReference(oversized)).toEqual({ externalReference: null, sourceHeader: null });

      const whitespace = new Headers({ "x-request-id": "request id with spaces" });
      expect(extractWebhookExternalReference(whitespace)).toEqual({ externalReference: null, sourceHeader: null });
    });

    it("can use a lower-priority allowlisted identifier when a higher-priority value is invalid", () => {
      const headers = new Headers({
        "x-request-id": "request id with spaces",
        "x-trace-id": "trace-333",
      });

      expect(extractWebhookExternalReference(headers)).toEqual({
        externalReference: "webhook-response:x-trace-id:trace-333",
        sourceHeader: "x-trace-id",
      });
    });
  });
});
