import { describe, expect, it } from "vitest";

import {
  createRuntimeQueue,
  InMemoryRuntimeQueueAdapter,
} from "@/lib/runtime-queue";
import type {
  RuntimeQueueAdapter,
  RuntimeQueueEnqueueInput,
  RuntimeQueueMessage,
} from "@/lib/runtime-queue-types";

const NOW = "2026-07-05T12:00:00.000Z";
const LATER = "2026-07-05T12:00:10.000Z";
const AFTER_EXPIRY = "2026-07-05T13:01:00.000Z";

describe("AG-3D enterprise runtime queue", () => {
  it("enqueues a message with deterministic lifecycle metadata", async () => {
    const queue = queueFixture();

    const result = await queue.enqueue(messageInput());

    expect(result.status).toBe("QUEUED");
    expect(result.message).toMatchObject({
      queue_message_id: "queue-001",
      correlation_id: "corr-001",
      idempotency_key: "idem-001",
      request_hash: "hash-001",
      tenant_id: "tenant-a",
      organization_id: "org-a",
      payload_reference: "payload://runtime/001",
      created_at: NOW,
      available_at: NOW,
      attempt_count: 0,
      status: "QUEUED",
      priority: 5,
      expires_at: "2026-07-05T13:00:00.000Z",
    });
  });

  it("dequeues the next available message and marks it processing", async () => {
    const queue = queueFixture();
    await queue.enqueue(messageInput());

    const result = await queue.dequeue(LATER);

    expect(result.status).toBe("PROCESSING");
    expect(result.message).toMatchObject({
      queue_message_id: "queue-001",
      status: "PROCESSING",
      attempt_count: 1,
    });
  });

  it("acknowledges processing messages", async () => {
    const queue = queueFixture();
    await queue.enqueue(messageInput());
    await queue.dequeue(LATER);

    const acked = await queue.ack("queue-001", "processed", LATER);

    expect(acked).toMatchObject({
      queue_message_id: "queue-001",
      status: "ACKNOWLEDGED",
      acked_at: LATER,
      completion_reason: "processed",
    });
  });

  it("retries messages using deterministic delay and retry history", async () => {
    const queue = queueFixture();
    await queue.enqueue(messageInput());
    await queue.dequeue(LATER);

    const retried = await queue.retry("queue-001", {
      failure_reason: "transient signing outage",
      now: LATER,
    });

    expect(retried).toMatchObject({
      queue_message_id: "queue-001",
      status: "RETRY",
      available_at: "2026-07-05T12:01:10.000Z",
      failure_reason: "transient signing outage",
      retry_history: [
        {
          attempt: 1,
          failed_at: LATER,
          failure_reason: "transient signing outage",
          next_available_at: "2026-07-05T12:01:10.000Z",
        },
      ],
    });
  });

  it("moves messages to dead letter after retry threshold", async () => {
    const queue = queueFixture({ max_attempts: 1, dead_letter_threshold: 1 });
    await queue.enqueue(messageInput());
    await queue.dequeue(LATER);

    const deadLetter = await queue.retry("queue-001", {
      failure_reason: "schema rejected",
      now: LATER,
    });

    expect(deadLetter).toMatchObject({
      queue_message_id: "queue-001",
      status: "DEAD_LETTER",
      dead_letter_reason: "schema rejected",
      retry_history: [
        {
          attempt: 1,
          failure_reason: "schema rejected",
        },
      ],
    });
  });

  it("expires unavailable messages deterministically", async () => {
    const queue = queueFixture();
    await queue.enqueue(messageInput());

    const result = await queue.dequeue(AFTER_EXPIRY);

    expect(result.status).toBe("EMPTY");
    expect(await queue.peek(AFTER_EXPIRY)).toBeNull();
    expect((await queue.queueStats(AFTER_EXPIRY)).expired_count).toBe(1);
  });

  it("purges expired and acknowledged messages without deleting active queue items", async () => {
    const queue = queueFixture();
    await queue.enqueue(messageInput());
    await queue.enqueue(messageInput({
      queue_message_id: "queue-active",
      idempotency_key: "idem-active",
      request_hash: "hash-active",
      correlation_id: "corr-active",
    }));
    await queue.dequeue(LATER);
    await queue.ack("queue-001", "processed", LATER);

    const result = await queue.purge(LATER);

    expect(result.purged_count).toBe(1);
    expect(await queue.peek(LATER)).toMatchObject({
      queue_message_id: "queue-active",
    });
  });

  it("orders messages deterministically by priority and creation time", async () => {
    const queue = queueFixture();
    await queue.enqueue(messageInput({
      queue_message_id: "queue-low",
      idempotency_key: "idem-low",
      request_hash: "hash-low",
      correlation_id: "corr-low",
      priority: 1,
    }));
    await queue.enqueue(messageInput({
      queue_message_id: "queue-high",
      idempotency_key: "idem-high",
      request_hash: "hash-high",
      correlation_id: "corr-high",
      priority: 10,
    }));
    await queue.enqueue(messageInput({
      queue_message_id: "queue-high-later",
      idempotency_key: "idem-high-later",
      request_hash: "hash-high-later",
      correlation_id: "corr-high-later",
      priority: 10,
      now: "2026-07-05T12:00:01.000Z",
    }));

    expect(await queue.peek(LATER)).toMatchObject({ queue_message_id: "queue-high" });
    expect((await queue.dequeue(LATER)).message).toMatchObject({ queue_message_id: "queue-high" });
    expect((await queue.dequeue(LATER)).message).toMatchObject({ queue_message_id: "queue-high-later" });
  });

  it("reports queue statistics by lifecycle state", async () => {
    const queue = queueFixture({ max_attempts: 1, dead_letter_threshold: 1 });
    await queue.enqueue(messageInput());
    await queue.enqueue(messageInput({
      queue_message_id: "queue-acked",
      idempotency_key: "idem-acked",
      request_hash: "hash-acked",
      correlation_id: "corr-acked",
    }));
    await queue.enqueue(messageInput({
      queue_message_id: "queue-expired",
      idempotency_key: "idem-expired",
      request_hash: "hash-expired",
      correlation_id: "corr-expired",
      ttl_ms: 1,
    }));
    await queue.dequeue(LATER);
    await queue.retry("queue-001", { failure_reason: "fatal", now: LATER });
    await queue.dequeue(LATER);
    await queue.ack("queue-acked", "processed", LATER);

    const stats = await queue.queueStats(AFTER_EXPIRY);

    expect(stats).toMatchObject({
      queue_depth: 0,
      processing_count: 0,
      retry_count: 0,
      dead_letter_count: 1,
      expired_count: 1,
      acknowledged_count: 1,
    });
  });

  it("surfaces adapter failures deterministically", async () => {
    const queue = createRuntimeQueue({
      adapter: new FailingRuntimeQueueAdapter(),
      now: () => NOW,
    });

    const result = await queue.enqueue(messageInput());

    expect(result).toMatchObject({
      status: "FAILED",
      message: null,
      errors: ["queue adapter unavailable"],
    });
  });
});

function queueFixture(policy: Partial<Parameters<typeof createRuntimeQueue>[0]["retry_policy"]> = {}) {
  return createRuntimeQueue({
    adapter: new InMemoryRuntimeQueueAdapter(),
    ttl_ms: 60 * 60 * 1000,
    now: () => LATER,
    retry_policy: {
      max_attempts: 3,
      retry_delay_ms: 60 * 1000,
      dead_letter_threshold: 3,
      ...policy,
    },
  });
}

function messageInput(overrides: Partial<RuntimeQueueEnqueueInput> = {}): RuntimeQueueEnqueueInput {
  return {
    queue_message_id: "queue-001",
    correlation_id: "corr-001",
    idempotency_key: "idem-001",
    request_hash: "hash-001",
    tenant_id: "tenant-a",
    organization_id: "org-a",
    payload_reference: "payload://runtime/001",
    priority: 5,
    now: NOW,
    ...overrides,
  };
}

class FailingRuntimeQueueAdapter implements RuntimeQueueAdapter {
  enqueue(_message: RuntimeQueueMessage): Promise<RuntimeQueueMessage> {
    throw new Error("queue adapter unavailable");
  }

  peek(): Promise<RuntimeQueueMessage | null> {
    throw new Error("queue adapter unavailable");
  }

  dequeue(): Promise<RuntimeQueueMessage | null> {
    throw new Error("queue adapter unavailable");
  }

  ack(): Promise<RuntimeQueueMessage | null> {
    throw new Error("queue adapter unavailable");
  }

  retry(): Promise<RuntimeQueueMessage | null> {
    throw new Error("queue adapter unavailable");
  }

  deadLetter(): Promise<RuntimeQueueMessage | null> {
    throw new Error("queue adapter unavailable");
  }

  stats(): Promise<never> {
    throw new Error("queue adapter unavailable");
  }

  purge(): Promise<number> {
    throw new Error("queue adapter unavailable");
  }
}
