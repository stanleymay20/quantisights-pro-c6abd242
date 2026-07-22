import { describe, expect, it } from "vitest";

import {
  AGENT_GATEWAY_SCHEMA_VERSION,
  AGENT_GATEWAY_VERSION,
} from "@/lib/agent-gateway";
import {
  createIdempotencyStore,
  InMemoryIdempotencyStoreAdapter,
} from "@/lib/idempotency-store";
import {
  RUNTIME_GATEWAY_VERSION,
} from "@/lib/runtime-types";
import type {
  IdempotencyRecord,
  IdempotencyStoreAdapter,
  IdempotencyStoreSaveInput,
} from "@/lib/idempotency-store-types";

const NOW = "2026-07-05T12:00:00.000Z";
const LATER = "2026-07-05T12:05:00.000Z";
const AFTER_EXPIRY = "2026-07-05T13:01:00.000Z";

describe("AG-3C durable idempotency and replay store", () => {
  it("reserves a new idempotency key with deterministic lifecycle metadata", async () => {
    const store = storeFixture();

    const result = await store.reserveKey(reservationInput());

    expect(result.status).toBe("RESERVED");
    expect(result.record).toMatchObject({
      idempotency_key: "idem-001",
      request_hash: "hash-001",
      correlation_id: "corr-001",
      tenant_id: "tenant-a",
      organization_id: "org-a",
      status: "RESERVED",
      gateway_version: AGENT_GATEWAY_VERSION,
      schema_version: AGENT_GATEWAY_SCHEMA_VERSION,
      runtime_version: RUNTIME_GATEWAY_VERSION,
      created_at: NOW,
      completed_at: null,
      expires_at: "2026-07-05T13:00:00.000Z",
    });
    expect(await store.lookupKey("idem-001")).toEqual(result.record);
  });

  it("rejects duplicate reservations with the same key and hash deterministically", async () => {
    const store = storeFixture();
    await store.reserveKey(reservationInput());

    const firstReplay = await store.reserveKey(reservationInput());
    const secondReplay = await store.detectReplay(reservationInput());

    expect(firstReplay.status).toBe("REJECTED");
    expect(firstReplay.replay).toEqual(secondReplay);
    expect(firstReplay.replay).toMatchObject({
      replayed: true,
      reason: "DUPLICATE_IDEMPOTENCY_KEY",
      retryable: false,
    });
  });

  it("detects duplicate request hashes even when the idempotency key changes", async () => {
    const store = storeFixture();
    await store.reserveKey(reservationInput());

    const replay = await store.detectReplay(reservationInput({
      idempotency_key: "idem-002",
      correlation_id: "corr-002",
    }));

    expect(replay).toMatchObject({
      replayed: true,
      reason: "DUPLICATE_REQUEST_HASH",
      retryable: false,
    });
  });

  it("detects conflicting request hashes for the same key", async () => {
    const store = storeFixture();
    await store.reserveKey(reservationInput());

    const result = await store.reserveKey(reservationInput({
      request_hash: "hash-conflict",
      correlation_id: "corr-conflict",
    }));

    expect(result.status).toBe("REJECTED");
    expect(result.replay).toMatchObject({
      replayed: true,
      reason: "CONFLICTING_REQUEST_HASH",
      retryable: false,
    });
  });

  it("expires reservations deterministically and rejects expired reservation reuse", async () => {
    const store = storeFixture();
    await store.reserveKey(reservationInput());

    const expired = await store.expireKey("idem-001", AFTER_EXPIRY);
    const reuse = await store.reserveKey(reservationInput({
      correlation_id: "corr-reuse",
    }, AFTER_EXPIRY));

    expect(expired?.status).toBe("EXPIRED");
    expect(reuse.status).toBe("REJECTED");
    expect(reuse.replay).toMatchObject({
      replayed: true,
      reason: "EXPIRED_RESERVATION_REUSE",
      retryable: false,
    });
  });

  it("purges expired records without deleting active reservations", async () => {
    const store = storeFixture();
    await store.reserveKey(reservationInput());
    await store.reserveKey(reservationInput({
      idempotency_key: "idem-active",
      request_hash: "hash-active",
      correlation_id: "corr-active",
    }, LATER));
    await store.expireKey("idem-001", AFTER_EXPIRY);

    const result = await store.purgeExpired(AFTER_EXPIRY);

    expect(result.deleted_count).toBe(1);
    expect(await store.lookupKey("idem-001")).toBeNull();
    expect(await store.lookupKey("idem-active")).toMatchObject({
      idempotency_key: "idem-active",
      status: "RESERVED",
    });
  });

  it("enforces cross-tenant isolation for idempotency keys", async () => {
    const store = storeFixture();
    await store.reserveKey(reservationInput());

    const replay = await store.detectReplay(reservationInput({
      tenant_id: "tenant-b",
      organization_id: "org-b",
      request_hash: "hash-tenant-b",
    }));

    expect(replay).toMatchObject({
      replayed: true,
      reason: "CROSS_TENANT_KEY_REUSE",
      retryable: false,
    });
  });

  it("completes and fails records without mutating immutable reservation fields", async () => {
    const store = storeFixture();
    const reserved = await store.reserveKey(reservationInput());

    const completed = await store.completeKey("idem-001", {
      status: "COMPLETED",
      completed_at: LATER,
    });

    expect(completed).toMatchObject({
      idempotency_key: reserved.record?.idempotency_key,
      request_hash: reserved.record?.request_hash,
      correlation_id: reserved.record?.correlation_id,
      status: "COMPLETED",
      completed_at: LATER,
      created_at: NOW,
    });
  });

  it("returns identical replay outcomes for identical inputs", async () => {
    const store = storeFixture();
    await store.reserveKey(reservationInput());

    const first = await store.detectReplay(reservationInput());
    const second = await store.detectReplay(reservationInput());

    expect(first).toEqual(second);
  });

  it("surfaces adapter failures deterministically", async () => {
    const store = createIdempotencyStore({
      adapter: new FailingIdempotencyAdapter(),
      now: () => NOW,
    });

    const result = await store.reserveKey(reservationInput());

    expect(result).toMatchObject({
      status: "FAILED",
      record: null,
      replay: {
        replayed: false,
        reason: "ADAPTER_FAILURE",
        retryable: true,
      },
    });
    expect(result.errors.join(" ")).toContain("adapter unavailable");
  });
});

function storeFixture() {
  return createIdempotencyStore({
    adapter: new InMemoryIdempotencyStoreAdapter(),
    ttl_ms: 60 * 60 * 1000,
    now: () => NOW,
  });
}

function reservationInput(
  overrides: Partial<Parameters<ReturnType<typeof createIdempotencyStore>["reserveKey"]>[0]> = {},
  now = NOW,
): Parameters<ReturnType<typeof createIdempotencyStore>["reserveKey"]>[0] {
  return {
    idempotency_key: "idem-001",
    request_hash: "hash-001",
    correlation_id: "corr-001",
    tenant_id: "tenant-a",
    organization_id: "org-a",
    gateway_version: AGENT_GATEWAY_VERSION,
    schema_version: AGENT_GATEWAY_SCHEMA_VERSION,
    runtime_version: RUNTIME_GATEWAY_VERSION,
    now,
    ...overrides,
  };
}

class FailingIdempotencyAdapter implements IdempotencyStoreAdapter {
  save(_record: IdempotencyStoreSaveInput): Promise<IdempotencyRecord> {
    throw new Error("adapter unavailable");
  }

  find(): Promise<IdempotencyRecord | null> {
    throw new Error("adapter unavailable");
  }

  update(): Promise<IdempotencyRecord | null> {
    throw new Error("adapter unavailable");
  }

  deleteExpired(): Promise<number> {
    throw new Error("adapter unavailable");
  }

  exists(): Promise<boolean> {
    throw new Error("adapter unavailable");
  }
}
