import { z } from "zod";

export const RUNTIME_QUEUE_VERSION = "ag-3d.1";

export type RuntimeQueueMessageStatus =
  | "QUEUED"
  | "PROCESSING"
  | "ACKNOWLEDGED"
  | "RETRY"
  | "DEAD_LETTER"
  | "EXPIRED"
  | "PURGED";

export interface RuntimeQueueRetryPolicy {
  max_attempts: number;
  retry_delay_ms: number;
  dead_letter_threshold: number;
}

export interface RuntimeQueueRetryHistoryEntry {
  attempt: number;
  failed_at: string;
  failure_reason: string;
  next_available_at: string | null;
}

export interface RuntimeQueueMessage {
  queue_message_id: string;
  correlation_id: string;
  idempotency_key: string;
  request_hash: string;
  tenant_id: string;
  organization_id: string;
  payload_reference: string;
  created_at: string;
  available_at: string;
  attempt_count: number;
  status: RuntimeQueueMessageStatus;
  priority: number;
  expires_at: string;
  retry_history: RuntimeQueueRetryHistoryEntry[];
  failure_reason: string | null;
  dead_letter_reason: string | null;
  acked_at: string | null;
  completion_reason: string | null;
}

export interface RuntimeQueueEnqueueInput {
  queue_message_id: string;
  correlation_id: string;
  idempotency_key: string;
  request_hash: string;
  tenant_id: string;
  organization_id: string;
  payload_reference: string;
  priority?: number;
  now?: string;
  available_at?: string;
  ttl_ms?: number;
}

export interface RuntimeQueueEnqueueResult {
  status: "QUEUED" | "FAILED";
  message: RuntimeQueueMessage | null;
  errors: string[];
}

export interface RuntimeQueueDequeueResult {
  status: "PROCESSING" | "EMPTY" | "FAILED";
  message: RuntimeQueueMessage | null;
  errors: string[];
}

export interface RuntimeQueueRetryInput {
  failure_reason: string;
  now?: string;
}

export interface RuntimeQueuePurgeResult {
  purged_count: number;
}

export interface RuntimeQueueStats {
  queue_depth: number;
  processing_count: number;
  retry_count: number;
  dead_letter_count: number;
  expired_count: number;
  acknowledged_count: number;
  purged_count: number;
}

export interface RuntimeQueueAdapter {
  enqueue(message: RuntimeQueueMessage): Promise<RuntimeQueueMessage> | RuntimeQueueMessage;
  peek(now: string): Promise<RuntimeQueueMessage | null> | RuntimeQueueMessage | null;
  dequeue(now: string): Promise<RuntimeQueueMessage | null> | RuntimeQueueMessage | null;
  ack(
    queue_message_id: string,
    completion_reason: string,
    now: string,
  ): Promise<RuntimeQueueMessage | null> | RuntimeQueueMessage | null;
  retry(
    queue_message_id: string,
    input: Required<RuntimeQueueRetryInput>,
    policy: RuntimeQueueRetryPolicy,
  ): Promise<RuntimeQueueMessage | null> | RuntimeQueueMessage | null;
  deadLetter(
    queue_message_id: string,
    reason: string,
    now: string,
  ): Promise<RuntimeQueueMessage | null> | RuntimeQueueMessage | null;
  stats(now: string): Promise<RuntimeQueueStats> | RuntimeQueueStats;
  purge(now: string): Promise<number> | number;
}

export interface RuntimeQueueConfig {
  adapter: RuntimeQueueAdapter;
  ttl_ms?: number;
  now?: () => string;
  retry_policy?: Partial<RuntimeQueueRetryPolicy>;
}

export interface RuntimeQueue {
  enqueue(input: RuntimeQueueEnqueueInput): Promise<RuntimeQueueEnqueueResult>;
  peek(now?: string): Promise<RuntimeQueueMessage | null>;
  dequeue(now?: string): Promise<RuntimeQueueDequeueResult>;
  ack(
    queue_message_id: string,
    completion_reason?: string,
    now?: string,
  ): Promise<RuntimeQueueMessage | null>;
  retry(
    queue_message_id: string,
    input: RuntimeQueueRetryInput,
  ): Promise<RuntimeQueueMessage | null>;
  moveToDeadLetter(
    queue_message_id: string,
    reason: string,
    now?: string,
  ): Promise<RuntimeQueueMessage | null>;
  purge(now?: string): Promise<RuntimeQueuePurgeResult>;
  queueStats(now?: string): Promise<RuntimeQueueStats>;
}

export const RuntimeQueueMessageSchema = z.object({
  queue_message_id: z.string().min(1),
  correlation_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  request_hash: z.string().min(1),
  tenant_id: z.string().min(1),
  organization_id: z.string().min(1),
  payload_reference: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  available_at: z.string().datetime({ offset: true }),
  attempt_count: z.number().int().min(0),
  status: z.enum([
    "QUEUED",
    "PROCESSING",
    "ACKNOWLEDGED",
    "RETRY",
    "DEAD_LETTER",
    "EXPIRED",
    "PURGED",
  ]),
  priority: z.number().int(),
  expires_at: z.string().datetime({ offset: true }),
  retry_history: z.array(z.object({
    attempt: z.number().int().min(1),
    failed_at: z.string().datetime({ offset: true }),
    failure_reason: z.string().min(1),
    next_available_at: z.string().datetime({ offset: true }).nullable(),
  })),
  failure_reason: z.string().nullable(),
  dead_letter_reason: z.string().nullable(),
  acked_at: z.string().datetime({ offset: true }).nullable(),
  completion_reason: z.string().nullable(),
});
