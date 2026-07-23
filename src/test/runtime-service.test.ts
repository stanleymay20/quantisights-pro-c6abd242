import { describe, expect, it } from "vitest";

import {
  AGENT_GATEWAY_SCHEMA_VERSION,
  AGENT_GATEWAY_VERSION,
  type AgentGatewayRequest,
} from "@/lib/agent-gateway";
import {
  createRuntimeGateway,
  InMemoryRuntimePersistenceAdapter,
  InMemoryRuntimeQueueAdapter,
  MockRuntimeEventEmitterAdapter,
  MockSigningAdapter,
} from "@/lib/runtime-gateway";
import {
  createRuntimeError,
  createRuntimeService,
  deserializeGatewayRequest,
  handleRuntimeRequest,
  mapRuntimeErrorToStatus,
  serializeAcknowledgement,
  serializeGatewayRequest,
} from "@/lib/runtime-service";
import {
  RUNTIME_GATEWAY_VERSION,
  type QueueAdapter,
} from "@/lib/runtime-types";

const NOW = "2026-07-05T12:00:00.000Z";

describe("AG-3B runtime service contract", () => {
  it("accepts a valid request and returns a deterministic gateway acknowledgement", async () => {
    const first = await serviceFixture().service.handleRuntimeRequest(validRequest());
    const second = await serviceFixture().service.handleRuntimeRequest(validRequest());

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.status_code).toBe(200);
    expect(first).toEqual(second);
    if (!first.ok) throw new Error("expected acknowledgement");
    expect(first.acknowledgement).toMatchObject({
      gateway_version: AGENT_GATEWAY_VERSION,
      runtime_version: RUNTIME_GATEWAY_VERSION,
      tenant_id: "tenant-a",
      organization_id: "org-a",
      status: "ACKNOWLEDGED",
    });
  });

  it("rejects invalid schema with a runtime error and 422 status", async () => {
    const { service } = serviceFixture();
    const result = await service.handleRuntimeRequest({ tenant_id: "tenant-a" });

    expect(result.ok).toBe(false);
    expect(result.status_code).toBe(422);
    if (result.ok === true) throw new Error("expected runtime error");
    expect(result.error).toMatchObject({
      error_code: "INVALID_SCHEMA",
      status_code: 422,
      retryable: false,
    });
    expect(result.error.error_message).toContain("schema");
  });

  it("rejects unsupported runtime, gateway, and schema versions before queueing", async () => {
    const { service, queue } = serviceFixture();
    const result = await service.handleRuntimeRequest(validRequest({
      metadata: {
        runtime_version: "ag-0",
        gateway_version: AGENT_GATEWAY_VERSION,
        agent_gateway_schema_version: AGENT_GATEWAY_SCHEMA_VERSION,
      },
    }));

    expect(result.ok).toBe(false);
    expect(result.status_code).toBe(400);
    if (result.ok === true) throw new Error("expected runtime error");
    expect(result.error.error_code).toBe("UNSUPPORTED_VERSION");
    expect(queue.depth()).toBe(0);
  });

  it("enforces payload size, evidence count, metadata size, and justification length limits", async () => {
    const { service } = serviceFixture({
      limits: {
        max_payload_bytes: 2_000,
        max_evidence_references: 1,
        max_metadata_bytes: 200,
        max_justification_length: 20,
      },
    });

    const evidence = await service.handleRuntimeRequest(validRequest({
      evidence_references: ["evf:001", "evf:002"],
    }));
    const justification = await service.handleRuntimeRequest(validRequest({
      idempotency_key: "different-key",
      justification: "x".repeat(30),
    }));
    const metadata = await service.handleRuntimeRequest(validRequest({
      idempotency_key: "different-key-2",
      metadata: {
        agent_gateway_schema_version: AGENT_GATEWAY_SCHEMA_VERSION,
        large: "x".repeat(500),
      },
    }));
    const payload = await service.handleRuntimeRequest(validRequest({
      idempotency_key: "different-key-3",
      requested_action: "x".repeat(5_000),
    }));

    expect(evidence.ok).toBe(false);
    expect(justification.ok).toBe(false);
    expect(metadata.ok).toBe(false);
    expect(payload.ok).toBe(false);
    if (evidence.ok === true || justification.ok === true || metadata.ok === true || payload.ok === true) {
      throw new Error("expected limit failures");
    }
    expect(evidence.error.error_code).toBe("BAD_REQUEST");
    expect(justification.error.error_code).toBe("BAD_REQUEST");
    expect(metadata.error.error_code).toBe("BAD_REQUEST");
    expect(payload.error.error_code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("serializes and deserializes gateway requests deterministically", () => {
    const request = validRequest();
    const first = serializeGatewayRequest(request);
    const second = serializeGatewayRequest(Object.fromEntries(
      Object.entries(request).reverse(),
    ) as AgentGatewayRequest);

    expect(first).toBe(second);
    expect(deserializeGatewayRequest(first)).toEqual(request);
  });

  it("serializes acknowledgements deterministically", async () => {
    const { service } = serviceFixture();
    const result = await service.handleRuntimeRequest(validRequest());

    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error("expected acknowledgement");
    expect(serializeAcknowledgement(result.acknowledgement)).toBe(serializeAcknowledgement(result.acknowledgement));
  });

  it("creates deterministic runtime errors with supported status mapping", () => {
    const error = createRuntimeError({
      error_code: "DUPLICATE_REQUEST",
      error_message: "Duplicate request.",
      correlation_id: "corr-1",
      timestamp: NOW,
      details: { idempotency_key: "idem-1" },
    });

    expect(error).toMatchObject({
      error_code: "DUPLICATE_REQUEST",
      status_code: 409,
      retryable: false,
      correlation_id: "corr-1",
    });
    expect(mapRuntimeErrorToStatus("REPLAY_DETECTED")).toBe(410);
    expect(mapRuntimeErrorToStatus("QUEUE_UNAVAILABLE")).toBe(503);
  });

  it("maps duplicate, replay, tenant, and queue failures from AG-3A into service errors", async () => {
    const { service } = serviceFixture();
    const first = await service.handleRuntimeRequest(validRequest());
    const duplicate = await service.handleRuntimeRequest(validRequest({
      requested_action: "same idempotency, different action",
    }));
    const replay = await service.handleRuntimeRequest(validRequest({
      idempotency_key: "different-idem",
    }));
    const tenant = await service.handleRuntimeRequest(validRequest({
      idempotency_key: "tenant-miss",
      tenant_id: "missing-tenant",
    }));
    const queueFailure = await serviceFixture({ queue: new FailingQueueAdapter() }).service.handleRuntimeRequest(validRequest());

    expect(first.ok).toBe(true);
    expect(duplicate.ok).toBe(false);
    expect(replay.ok).toBe(false);
    expect(tenant.ok).toBe(false);
    expect(queueFailure.ok).toBe(false);
    if (duplicate.ok === true || replay.ok === true || tenant.ok === true || queueFailure.ok === true) throw new Error("expected errors");
    expect(duplicate.error.error_code).toBe("DUPLICATE_REQUEST");
    expect(duplicate.status_code).toBe(409);
    expect(replay.error.error_code).toBe("REPLAY_DETECTED");
    expect(replay.status_code).toBe(410);
    expect(tenant.error.error_code).toBe("TENANT_NOT_FOUND");
    expect(tenant.status_code).toBe(404);
    expect(queueFailure.error.error_code).toBe("QUEUE_UNAVAILABLE");
    expect(queueFailure.status_code).toBe(503);
  });

  it("exposes deterministic health and readiness snapshots", () => {
    const { service } = serviceFixture({
      build: {
        release: "ag-3b-test",
        commit: "commit-123",
        artifact_id: "artifact-123",
        deployment_id: "deployment-123",
      },
    });

    expect(service.health()).toMatchObject({
      runtime_version: RUNTIME_GATEWAY_VERSION,
      gateway_version: AGENT_GATEWAY_VERSION,
      supported_schema_versions: [AGENT_GATEWAY_SCHEMA_VERSION],
      alive: true,
      ready: true,
      build: {
        release: "ag-3b-test",
        commit: "commit-123",
      },
    });
    expect(service.readiness()).toEqual({
      queue_ready: true,
      persistence_ready: true,
      signing_ready: true,
      event_emitter_ready: true,
      overall_ready: true,
    });
  });

  it("exposes standalone handleRuntimeRequest, health, and readiness helpers", async () => {
    const { service } = serviceFixture();

    const response = await handleRuntimeRequest(service, validRequest());

    expect(response.ok).toBe(true);
    expect(service.health().alive).toBe(true);
    expect(service.readiness().overall_ready).toBe(true);
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
      runtime_version: RUNTIME_GATEWAY_VERSION,
      gateway_version: AGENT_GATEWAY_VERSION,
      agent_gateway_schema_version: AGENT_GATEWAY_SCHEMA_VERSION,
    },
    ...overrides,
  };
}

function serviceFixture(overrides: {
  queue?: QueueAdapter;
  limits?: Parameters<typeof createRuntimeService>[0]["limits"];
  build?: Parameters<typeof createRuntimeService>[0]["build"];
} = {}) {
  const queue = overrides.queue ?? new InMemoryRuntimeQueueAdapter();
  const persistence = new InMemoryRuntimePersistenceAdapter();
  const signing = new MockSigningAdapter("mock-key-ag3b");
  const events = new MockRuntimeEventEmitterAdapter();
  const gateway = createRuntimeGateway({
    queue,
    persistence,
    signing,
    events,
    now: () => NOW,
    validateTenant: ({ tenant_id }) => ({ valid: tenant_id === "tenant-a", reason: "unknown tenant" }),
    validateOrganization: ({ organization_id }) => ({
      valid: organization_id === "org-a",
      reason: "unknown organization",
    }),
  });
  const service = createRuntimeService({
    gateway,
    queue,
    persistence,
    signing,
    events,
    now: () => NOW,
    limits: overrides.limits,
    build: overrides.build,
  });
  return { service, queue, persistence, signing, events };
}

class FailingQueueAdapter extends InMemoryRuntimeQueueAdapter {
  enqueue(): never {
    throw new Error("enqueue failed");
  }
}
