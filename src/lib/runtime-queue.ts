import type {
  RuntimeQueue,
  RuntimeQueueAdapter,
  RuntimeQueueConfig,
  RuntimeQueueDequeueResult,
  RuntimeQueueEnqueueInput,
  RuntimeQueueEnqueueResult,
  RuntimeQueueMessage,
  RuntimeQueuePurgeResult,
  RuntimeQueueRetryInput,
  RuntimeQueueRetryPolicy,
  RuntimeQueueStats,
} from "@/lib/runtime-queue-types";

export type {
  RuntimeQueue,
  RuntimeQueueAdapter,
  RuntimeQueueConfig,
  RuntimeQueueDequeueResult,
  RuntimeQueueEnqueueInput,
  RuntimeQueueEnqueueResult,
  RuntimeQueueMessage,
  RuntimeQueuePurgeResult,
  RuntimeQueueRetryHistoryEntry,
  RuntimeQueueRetryInput,
  RuntimeQueueRetryPolicy,
  RuntimeQueueStats,
} from "@/lib/runtime-queue-types";

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const DEFAULT_RETRY_POLICY: RuntimeQueueRetryPolicy = {
  max_attempts: 3,
  retry_delay_ms: 60 * 1000,
  dead_letter_threshold: 3,
};

export function createRuntimeQueue(config: RuntimeQueueConfig): RuntimeQueue {
  const now = () => config.now?.() ?? new Date().toISOString();
  const ttlMs = config.ttl_ms ?? DEFAULT_TTL_MS;
  const retryPolicy = {
    ...DEFAULT_RETRY_POLICY,
    ...config.retry_policy,
  };

  return {
    enqueue: (input) => enqueue(config.adapter, normalizeEnqueueInput(input, now(), ttlMs)),
    peek: (timestamp) => peek(config.adapter, timestamp ?? now()),
    dequeue: (timestamp) => dequeue(config.adapter, timestamp ?? now()),
    ack: (queueMessageId, completionReason = "processed", timestamp) =>
      ack(config.adapter, queueMessageId, completionReason, timestamp ?? now()),
    retry: (queueMessageId, input) =>
      retry(config.adapter, queueMessageId, {
        failure_reason: input.failure_reason,
        now: input.now ?? now(),
      }, retryPolicy),
    moveToDeadLetter: (queueMessageId, reason, timestamp) =>
      moveToDeadLetter(config.adapter, queueMessageId, reason, timestamp ?? now()),
    purge: (timestamp) => purge(config.adapter, timestamp ?? now()),
    queueStats: (timestamp) => queueStats(config.adapter, timestamp ?? now()),
  };
}

export async function enqueue(
  adapter: RuntimeQueueAdapter,
  input: Required<RuntimeQueueEnqueueInput>,
): Promise<RuntimeQueueEnqueueResult> {
  try {
    const message: RuntimeQueueMessage = {
      queue_message_id: input.queue_message_id,
      correlation_id: input.correlation_id,
      idempotency_key: input.idempotency_key,
      request_hash: input.request_hash,
      tenant_id: input.tenant_id,
      organization_id: input.organization_id,
      payload_reference: input.payload_reference,
      created_at: input.now,
      available_at: input.available_at,
      attempt_count: 0,
      status: "QUEUED",
      priority: input.priority,
      expires_at: addMilliseconds(input.now, input.ttl_ms),
      retry_history: [],
      failure_reason: null,
      dead_letter_reason: null,
      acked_at: null,
      completion_reason: null,
    };

    return {
      status: "QUEUED",
      message: await adapter.enqueue(message),
      errors: [],
    };
  } catch (error) {
    return failedEnqueue(error);
  }
}

export async function peek(
  adapter: RuntimeQueueAdapter,
  now: string = new Date().toISOString(),
): Promise<RuntimeQueueMessage | null> {
  return adapter.peek(now);
}

export async function dequeue(
  adapter: RuntimeQueueAdapter,
  now: string = new Date().toISOString(),
): Promise<RuntimeQueueDequeueResult> {
  try {
    const message = await adapter.dequeue(now);
    if (!message) {
      return {
        status: "EMPTY",
        message: null,
        errors: [],
      };
    }
    return {
      status: "PROCESSING",
      message,
      errors: [],
    };
  } catch (error) {
    return {
      status: "FAILED",
      message: null,
      errors: [messageFrom(error)],
    };
  }
}

export async function ack(
  adapter: RuntimeQueueAdapter,
  queueMessageId: string,
  completionReason = "processed",
  now: string = new Date().toISOString(),
): Promise<RuntimeQueueMessage | null> {
  return adapter.ack(queueMessageId, completionReason, now);
}

export async function retry(
  adapter: RuntimeQueueAdapter,
  queueMessageId: string,
  input: Required<RuntimeQueueRetryInput>,
  policy: RuntimeQueueRetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<RuntimeQueueMessage | null> {
  return adapter.retry(queueMessageId, input, policy);
}

export async function moveToDeadLetter(
  adapter: RuntimeQueueAdapter,
  queueMessageId: string,
  reason: string,
  now: string = new Date().toISOString(),
): Promise<RuntimeQueueMessage | null> {
  return adapter.deadLetter(queueMessageId, reason, now);
}

export async function purge(
  adapter: RuntimeQueueAdapter,
  now: string = new Date().toISOString(),
): Promise<RuntimeQueuePurgeResult> {
  return {
    purged_count: await adapter.purge(now),
  };
}

export async function queueStats(
  adapter: RuntimeQueueAdapter,
  now: string = new Date().toISOString(),
): Promise<RuntimeQueueStats> {
  return adapter.stats(now);
}

export class InMemoryRuntimeQueueAdapter implements RuntimeQueueAdapter {
  private readonly messages = new Map<string, RuntimeQueueMessage>();

  enqueue(message: RuntimeQueueMessage): RuntimeQueueMessage {
    const snapshot = cloneMessage(message);
    this.messages.set(snapshot.queue_message_id, snapshot);
    return cloneMessage(snapshot);
  }

  peek(now: string): RuntimeQueueMessage | null {
    this.expireUnavailable(now);
    const message = this.nextAvailable(now);
    return message ? cloneMessage(message) : null;
  }

  dequeue(now: string): RuntimeQueueMessage | null {
    this.expireUnavailable(now);
    const message = this.nextAvailable(now);
    if (!message) return null;
    const updated: RuntimeQueueMessage = {
      ...message,
      status: "PROCESSING",
      attempt_count: message.attempt_count + 1,
    };
    this.messages.set(updated.queue_message_id, cloneMessage(updated));
    return cloneMessage(updated);
  }

  ack(queueMessageId: string, completionReason: string, now: string): RuntimeQueueMessage | null {
    const message = this.messages.get(queueMessageId);
    if (!message) return null;
    const updated: RuntimeQueueMessage = {
      ...message,
      status: "ACKNOWLEDGED",
      acked_at: now,
      completion_reason: completionReason,
    };
    this.messages.set(queueMessageId, cloneMessage(updated));
    return cloneMessage(updated);
  }

  retry(
    queueMessageId: string,
    input: Required<RuntimeQueueRetryInput>,
    policy: RuntimeQueueRetryPolicy,
  ): RuntimeQueueMessage | null {
    const message = this.messages.get(queueMessageId);
    if (!message) return null;

    if (message.attempt_count >= policy.max_attempts || message.attempt_count >= policy.dead_letter_threshold) {
      return this.deadLetterWithHistory(message, input.failure_reason, input.now);
    }

    const nextAvailableAt = addMilliseconds(input.now, policy.retry_delay_ms);
    const updated: RuntimeQueueMessage = {
      ...message,
      status: "RETRY",
      available_at: nextAvailableAt,
      failure_reason: input.failure_reason,
      retry_history: [
        ...message.retry_history,
        {
          attempt: Math.max(message.attempt_count, 1),
          failed_at: input.now,
          failure_reason: input.failure_reason,
          next_available_at: nextAvailableAt,
        },
      ],
    };
    this.messages.set(queueMessageId, cloneMessage(updated));
    return cloneMessage(updated);
  }

  deadLetter(queueMessageId: string, reason: string, now: string): RuntimeQueueMessage | null {
    const message = this.messages.get(queueMessageId);
    if (!message) return null;
    return this.deadLetterWithHistory(message, reason, now);
  }

  stats(now: string): RuntimeQueueStats {
    this.expireUnavailable(now);
    const stats: RuntimeQueueStats = {
      queue_depth: 0,
      processing_count: 0,
      retry_count: 0,
      dead_letter_count: 0,
      expired_count: 0,
      acknowledged_count: 0,
      purged_count: 0,
    };
    for (const message of this.messages.values()) {
      if (message.status === "QUEUED") stats.queue_depth += 1;
      if (message.status === "PROCESSING") stats.processing_count += 1;
      if (message.status === "RETRY") stats.retry_count += 1;
      if (message.status === "DEAD_LETTER") stats.dead_letter_count += 1;
      if (message.status === "EXPIRED") stats.expired_count += 1;
      if (message.status === "ACKNOWLEDGED") stats.acknowledged_count += 1;
      if (message.status === "PURGED") stats.purged_count += 1;
    }
    return stats;
  }

  purge(_now: string): number {
    let purged = 0;
    for (const message of Array.from(this.messages.values())) {
      if (message.status === "ACKNOWLEDGED" || message.status === "EXPIRED" || message.status === "PURGED") {
        this.messages.delete(message.queue_message_id);
        purged += 1;
      }
    }
    return purged;
  }

  private nextAvailable(now: string): RuntimeQueueMessage | null {
    return Array.from(this.messages.values())
      .filter((message) => isAvailable(message, now))
      .sort(compareQueueMessages)[0] ?? null;
  }

  private expireUnavailable(now: string): void {
    for (const message of Array.from(this.messages.values())) {
      if (
        (message.status === "QUEUED" || message.status === "RETRY" || message.status === "PROCESSING") &&
        isExpired(message, now)
      ) {
        this.messages.set(message.queue_message_id, {
          ...message,
          status: "EXPIRED",
        });
      }
    }
  }

  private deadLetterWithHistory(
    message: RuntimeQueueMessage,
    reason: string,
    now: string,
  ): RuntimeQueueMessage {
    const updated: RuntimeQueueMessage = {
      ...message,
      status: "DEAD_LETTER",
      failure_reason: reason,
      dead_letter_reason: reason,
      retry_history: [
        ...message.retry_history,
        {
          attempt: Math.max(message.attempt_count, 1),
          failed_at: now,
          failure_reason: reason,
          next_available_at: null,
        },
      ],
    };
    this.messages.set(message.queue_message_id, cloneMessage(updated));
    return cloneMessage(updated);
  }
}

function normalizeEnqueueInput(
  input: RuntimeQueueEnqueueInput,
  now: string,
  defaultTtlMs: number,
): Required<RuntimeQueueEnqueueInput> {
  return {
    ...input,
    priority: input.priority ?? 0,
    now: input.now ?? now,
    available_at: input.available_at ?? input.now ?? now,
    ttl_ms: input.ttl_ms ?? defaultTtlMs,
  };
}

function failedEnqueue(error: unknown): RuntimeQueueEnqueueResult {
  return {
    status: "FAILED",
    message: null,
    errors: [messageFrom(error)],
  };
}

function isAvailable(message: RuntimeQueueMessage, now: string): boolean {
  return (
    (message.status === "QUEUED" || message.status === "RETRY") &&
    !isExpired(message, now) &&
    Date.parse(message.available_at) <= Date.parse(now)
  );
}

function isExpired(message: RuntimeQueueMessage, now: string): boolean {
  return Date.parse(message.expires_at) <= Date.parse(now);
}

function compareQueueMessages(a: RuntimeQueueMessage, b: RuntimeQueueMessage): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  const createdDelta = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (createdDelta !== 0) return createdDelta;
  return a.queue_message_id.localeCompare(b.queue_message_id);
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function cloneMessage(message: RuntimeQueueMessage): RuntimeQueueMessage {
  return {
    ...message,
    retry_history: message.retry_history.map((entry) => ({ ...entry })),
  };
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
