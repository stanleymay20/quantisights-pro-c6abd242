import { describe, expect, it } from "vitest";

import {
  AGENT_GATEWAY_SCHEMA_VERSION,
  AGENT_GATEWAY_VERSION,
  type AgentGatewayRequest,
} from "@/lib/agent-gateway";
import {
  createRuntimeGateway,
  healthCheck,
  InMemoryRuntimePersistenceAdapter,
  InMemoryRuntimeQueueAdapter,
  MockRuntimeEventEmitterAdapter,
  MockSigningAdapter,
  submitGatewayRequest,
  validateRuntimeRequest,
} from "@/lib/runtime-gateway";
import {
  GATEWAY_ACKNOWLEDGEMENT_SCHEMA_VERSION,
  GatewayAcknowledgementSchema,
  RUNTIME_GATEWAY_VERSION,
  type QueueAdapter,
} from "@/lib/runtime-types";

const NOW = "2026-07-05T12:00:00.000Z";

describe("AG-3A runtime gateway foundation", () => {
  it("accepts a valid AG-2 request, queues it, audits it, and returns a signed acknowledgement", async () => {
    const gateway = gatewayFixture();
    const result = await gateway.submitGatewayRequest(validRequest());

    expect(result.status).toBe("ACKNOWLEDGED");
    expect(result.acknowledgement).toMatchObject({
      gateway_version: AGENT_GATEWAY_VERSION,
      runtime_version: RUNTIME_GATEWAY_VERSION,
      schema_version: GATEWAY_ACKNOWLEDGEMENT_SCHEMA_VERSION,
      tenant_id: "tenant-a",
      organization_id: "org-a",
      status: "ACKNOWLEDGED",
      signature_key_id: "mock-key-ag3",
    });
    expect(GatewayAcknowledgementSchema.safeParse(result.acknowledgement).success).toBe(true);
    expect(result.signature_verified).toBe(true);
    expect(gateway.queue.peek()).toMatchObject({
      correlation_id: result.acknowledgement?.correlation_id,
      state: "QUEUED",
    });
    expect(gateway.persistence.auditEvents.map((event) => event.event_type)).toEqual([
      "gateway.request.received",
      "gateway.request.validated",
      "gateway.request.queued",
      "gateway.request.acknowledged",
    ]);
  });

  it("rejects invalid schema before queueing and records an immutable audit event", async () => {
    const gateway = gatewayFixture();
    const result = await gateway.submitGatewayRequest({ tenant_id: "tenant-a" });

    expect(result.status).toBe("REJECTED");
    expect(result.acknowledgement).toBeNull();
    expect(result.errors.join(" ")).toContain("schema");
    expect(gateway.queue.peek()).toBeNull();
    expect(gateway.persistence.auditEvents.at(-1)).toMatchObject({
      event_type: "gateway.request.rejected",
      state: "REJECTED",
    });
  });

  it("rejects duplicate idempotency keys with a deterministic duplicate response", async () => {
    const gateway = gatewayFixture();
    const request = validRequest();

    const first = await gateway.submitGatewayRequest(request);
    const duplicate = await gateway.submitGatewayRequest({
      ...request,
      requested_action: "Try to submit a different action with the same idempotency key.",
    });
    const duplicateAgain = await gateway.submitGatewayRequest({
      ...request,
      requested_action: "Try to submit a different action with the same idempotency key.",
    });

    expect(first.status).toBe("ACKNOWLEDGED");
    expect(duplicate.status).toBe("REJECTED");
    expect(duplicate.rejection_code).toBe("DUPLICATE_IDEMPOTENCY_KEY");
    expect(duplicate).toEqual(duplicateAgain);
  });

  it("rejects replayed request hashes even when idempotency key changes", async () => {
    const gateway = gatewayFixture();
    const request = validRequest();

    const first = await gateway.submitGatewayRequest(request);
    const replay = await gateway.submitGatewayRequest({
      ...request,
      idempotency_key: "different-key-same-request-content",
    });

    expect(first.status).toBe("ACKNOWLEDGED");
    expect(replay.status).toBe("REJECTED");
    expect(replay.rejection_code).toBe("REPLAYED_REQUEST_HASH");
    expect(gateway.persistence.auditEvents.at(-1)?.event_type).toBe("gateway.request.rejected");
  });

  it("creates deterministic request hashes and correlation IDs", () => {
    const request = validRequest();
    const first = validateRuntimeRequest(request, { received_at: NOW });
    const second = validateRuntimeRequest(request, { received_at: NOW });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.request_hash).toBe(second.request_hash);
    expect(first.correlation_id).toBe(second.correlation_id);
    expect(first.correlation_id).toMatch(/^qv-corr-/);
  });

  it("rejects wrong runtime schema version metadata", () => {
    const result = validateRuntimeRequest({
      ...validRequest(),
      metadata: {
        agent_gateway_schema_version: "wrong-version",
      },
    });

    expect(result.success).toBe(false);
    expect(result.errors.join(" ")).toContain("version");
  });

  it("moves failed enqueue attempts to dead letter and emits failure events", async () => {
    const failingQueue = new FailingQueueAdapter();
    const gateway = gatewayFixture({ queue: failingQueue });

    const result = await gateway.submitGatewayRequest(validRequest());

    expect(result.status).toBe("DEAD_LETTER");
    expect(result.errors.join(" ")).toContain("enqueue failed");
    expect(gateway.persistence.deadLetters).toHaveLength(1);
    expect(gateway.events.events.map((event) => event.event_type)).toContain("gateway.request.failed");
    expect(gateway.events.events.map((event) => event.event_type)).toContain("gateway.request.deadletter");
  });

  it("reports runtime health with queue and adapter availability", async () => {
    const gateway = gatewayFixture();
    await gateway.submitGatewayRequest(validRequest());

    const status = gateway.healthCheck();
    const standalone = healthCheck(gateway);

    const { uptime_ms: _statusUptime, ...stableStatus } = status;
    const { uptime_ms: _standaloneUptime, ...stableStandalone } = standalone;
    expect(stableStatus).toEqual(stableStandalone);
    expect(status).toMatchObject({
      runtime_version: RUNTIME_GATEWAY_VERSION,
      gateway_version: AGENT_GATEWAY_VERSION,
      ready: true,
      alive: true,
      queue: { available: true, depth: 1 },
      adapters: {
        queue: true,
        persistence: true,
        signing: true,
        events: true,
      },
    });
    expect(status.uptime_ms).toBeGreaterThanOrEqual(0);
  });

  it("exposes standalone submitGatewayRequest through the runtime instance", async () => {
    const gateway = gatewayFixture();
    const result = await submitGatewayRequest(gateway, validRequest());

    expect(result.status).toBe("ACKNOWLEDGED");
  });

  it("rejects oversized requests", () => {
    const result = validateRuntimeRequest({
      ...validRequest(),
      justification: "x".repeat(30_000),
    }, { max_request_bytes: 1_000 });

    expect(result.success).toBe(false);
    expect(result.errors.join(" ")).toContain("size");
  });
});

function validRequest(overrides: Partial<AgentGatewayRequest> = {}): AgentGatewayRequest {
  return {
    agent_id: "aicis-agent",
    tenant_id: "tenant-a",
    organization_id: "org-a",
    idempotency_key: "idempotency-key-001",
    decision_type: "supplier_risk_mitigation",
    requested_action: "Review supplier mitigation options.",
    evidence_references: ["evf:evf-001", "evf-hash:fnv1a-12345678"],
    confidence: 94,
    business_impact: {
      amount: 750_000,
      currency: "EUR",
      description: "Potential supplier disruption impact.",
    },
    risk_level: "high",
    justification: "Supplier risk requires governed review.",
    metadata: {
      agent_gateway_schema_version: AGENT_GATEWAY_SCHEMA_VERSION,
    },
    ...overrides,
  };
}

function gatewayFixture(overrides: { queue?: QueueAdapter } = {}) {
  const queue = overrides.queue ?? new InMemoryRuntimeQueueAdapter();
  const persistence = new InMemoryRuntimePersistenceAdapter();
  const signing = new MockSigningAdapter("mock-key-ag3");
  const events = new MockRuntimeEventEmitterAdapter();
  const gateway = createRuntimeGateway({
    queue,
    persistence,
    signing,
    events,
    now: () => NOW,
    validateTenant: ({ tenant_id }) => ({ valid: tenant_id === "tenant-a", reason: "unknown tenant" }),
    validateOrganization: ({ organization_id }) => ({ valid: organization_id === "org-a", reason: "unknown organization" }),
  });
  return Object.assign(gateway, { queue, persistence, signing, events });
}

class FailingQueueAdapter extends InMemoryRuntimeQueueAdapter {
  enqueue(): never {
    throw new Error("enqueue failed");
  }
}
