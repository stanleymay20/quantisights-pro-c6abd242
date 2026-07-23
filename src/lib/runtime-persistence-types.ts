import { z } from "zod";

import {
  RuntimeQueueMessageSchema,
  type RuntimeQueueMessage,
} from "@/lib/runtime-queue-types";

export const RUNTIME_PERSISTENCE_VERSION = "ag-3e.1";
export const EXECUTION_RECORD_SCHEMA_VERSION = "quantivis.execution-record.v1";

export const EXECUTION_STATUSES = [
  "CREATED",
  "RECEIVED",
  "VALIDATED",
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const TERMINAL_EXECUTION_STATUSES = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const satisfies readonly ExecutionStatus[];

export type TerminalExecutionStatus = (typeof TERMINAL_EXECUTION_STATUSES)[number];

export interface ExecutionErrorInfo {
  code: string;
  message: string;
}

export interface ExecutionRecord {
  execution_id: string;
  correlation_id: string;
  request_hash: string;
  idempotency_key: string;
  tenant_id: string;
  organization_id: string;
  status: ExecutionStatus;
  runtime_version: string;
  gateway_version: string;
  schema_version: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: ExecutionErrorInfo | null;
  execution_hash: string;
}

export interface ExecutionCreateInput {
  execution_id: string;
  correlation_id: string;
  request_hash: string;
  idempotency_key: string;
  tenant_id: string;
  organization_id: string;
  status?: ExecutionStatus;
  runtime_version?: string;
  gateway_version?: string;
  schema_version?: string;
  metadata?: Record<string, unknown>;
  now?: string;
}

export interface ExecutionUpdateInput {
  status?: ExecutionStatus;
  metadata?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: ExecutionErrorInfo | null;
  completed_at?: string | null;
  now?: string;
}

export interface ExecutionListQuery {
  tenant_id: string;
  organization_id?: string;
  status?: ExecutionStatus;
  correlation_id?: string;
}

export interface RuntimeEventRecord {
  event_id: string;
  execution_id: string;
  correlation_id: string;
  tenant_id: string;
  organization_id: string;
  event_type: string;
  sequence_number: number;
  timestamp: string;
  payload_hash: string;
  payload: Record<string, unknown>;
  runtime_version: string;
}

export interface RuntimeEventAppendInput {
  execution_id: string;
  tenant_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  now?: string;
}

export interface RuntimeAuditRecord {
  audit_id: string;
  execution_id: string;
  tenant_id: string;
  organization_id: string;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string;
  timestamp: string;
  audit_hash: string;
  previous_audit_hash: string | null;
  metadata: Record<string, unknown>;
}

export interface RuntimeAuditAppendInput {
  execution_id: string;
  tenant_id: string;
  organization_id: string;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string;
  metadata?: Record<string, unknown>;
  now?: string;
}

export interface RuntimeQueueSnapshot {
  snapshot_id: string;
  tenant_id: string;
  captured_at: string;
  runtime_version: string;
  messages: RuntimeQueueMessage[];
  snapshot_hash: string;
}

export interface QueueSnapshotSaveInput {
  tenant_id: string;
  messages: RuntimeQueueMessage[];
  now?: string;
}

export interface ExecutionWriteResult {
  status: "PERSISTED" | "REJECTED" | "FAILED";
  execution: ExecutionRecord | null;
  errors: string[];
}

export interface RuntimeEventAppendResult {
  status: "APPENDED" | "REJECTED" | "FAILED";
  event: RuntimeEventRecord | null;
  errors: string[];
}

export interface RuntimeAuditAppendResult {
  status: "APPENDED" | "REJECTED" | "FAILED";
  record: RuntimeAuditRecord | null;
  errors: string[];
}

export interface QueueSnapshotSaveResult {
  status: "SAVED" | "FAILED";
  snapshot: RuntimeQueueSnapshot | null;
  errors: string[];
}

export interface AuditChainVerification {
  valid: boolean;
  length: number;
  broken_at: string | null;
}

export interface ExecutionPurgeResult {
  deleted_count: number;
}

/**
 * Storage boundary for the AG-3E persistence layer.
 *
 * The runtime depends only on this contract. Adapters are injected through
 * `RuntimePersistenceConfig` — the runtime never instantiates a concrete
 * backend directly. Adapters are dumb, deterministic storage: all hashing,
 * sequencing, and lifecycle decisions are made by the persistence service
 * before a record reaches the adapter.
 */
export interface RuntimePersistenceAdapter {
  createExecution(record: ExecutionRecord): Promise<ExecutionRecord> | ExecutionRecord;
  updateExecution(record: ExecutionRecord): Promise<ExecutionRecord | null> | ExecutionRecord | null;
  getExecution(
    tenant_id: string,
    execution_id: string,
  ): Promise<ExecutionRecord | null> | ExecutionRecord | null;
  listExecutions(query: ExecutionListQuery): Promise<ExecutionRecord[]> | ExecutionRecord[];
  appendRuntimeEvent(record: RuntimeEventRecord): Promise<RuntimeEventRecord> | RuntimeEventRecord;
  listRuntimeEvents(
    tenant_id: string,
    execution_id: string,
  ): Promise<RuntimeEventRecord[]> | RuntimeEventRecord[];
  createAuditRecord(record: RuntimeAuditRecord): Promise<RuntimeAuditRecord> | RuntimeAuditRecord;
  listAuditRecords(
    tenant_id: string,
    execution_id?: string,
  ): Promise<RuntimeAuditRecord[]> | RuntimeAuditRecord[];
  saveQueueSnapshot(snapshot: RuntimeQueueSnapshot): Promise<RuntimeQueueSnapshot> | RuntimeQueueSnapshot;
  loadQueueSnapshot(tenant_id: string): Promise<RuntimeQueueSnapshot | null> | RuntimeQueueSnapshot | null;
  deleteExpiredExecutions(now: string, retention_ms: number): Promise<number> | number;
  available(): boolean;
}

export interface RuntimePersistenceConfig {
  adapter: RuntimePersistenceAdapter;
  now?: () => string;
  retention_ms?: number;
  runtime_version?: string;
  gateway_version?: string;
}

export interface RuntimePersistence {
  createExecution(input: ExecutionCreateInput): Promise<ExecutionWriteResult>;
  updateExecution(
    tenant_id: string,
    execution_id: string,
    changes: ExecutionUpdateInput,
  ): Promise<ExecutionWriteResult>;
  getExecution(tenant_id: string, execution_id: string): Promise<ExecutionRecord | null>;
  listExecutions(query: ExecutionListQuery): Promise<ExecutionRecord[]>;
  appendEvent(input: RuntimeEventAppendInput): Promise<RuntimeEventAppendResult>;
  replayEvents(tenant_id: string, execution_id: string): Promise<RuntimeEventRecord[]>;
  recordAudit(input: RuntimeAuditAppendInput): Promise<RuntimeAuditAppendResult>;
  listAuditRecords(tenant_id: string, execution_id?: string): Promise<RuntimeAuditRecord[]>;
  verifyAuditChain(tenant_id: string): Promise<AuditChainVerification>;
  saveQueueSnapshot(input: QueueSnapshotSaveInput): Promise<QueueSnapshotSaveResult>;
  loadQueueSnapshot(tenant_id: string): Promise<RuntimeQueueSnapshot | null>;
  purgeExpiredExecutions(now?: string): Promise<ExecutionPurgeResult>;
}

const NonEmptyStringSchema = z.string().min(1);
const IsoTimestampSchema = z.string().datetime({ offset: true });
const MetadataSchema = z.record(z.string(), z.unknown());

export const ExecutionRecordSchema = z.object({
  execution_id: NonEmptyStringSchema,
  correlation_id: NonEmptyStringSchema,
  request_hash: NonEmptyStringSchema,
  idempotency_key: NonEmptyStringSchema,
  tenant_id: NonEmptyStringSchema,
  organization_id: NonEmptyStringSchema,
  status: z.enum(EXECUTION_STATUSES),
  runtime_version: NonEmptyStringSchema,
  gateway_version: NonEmptyStringSchema,
  schema_version: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  updated_at: IsoTimestampSchema,
  completed_at: IsoTimestampSchema.nullable(),
  metadata: MetadataSchema,
  result: MetadataSchema.nullable(),
  error: z.object({
    code: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
  }).nullable(),
  execution_hash: NonEmptyStringSchema,
});

export const RuntimeEventRecordSchema = z.object({
  event_id: NonEmptyStringSchema,
  execution_id: NonEmptyStringSchema,
  correlation_id: NonEmptyStringSchema,
  tenant_id: NonEmptyStringSchema,
  organization_id: NonEmptyStringSchema,
  event_type: NonEmptyStringSchema,
  sequence_number: z.number().int().min(1),
  timestamp: IsoTimestampSchema,
  payload_hash: NonEmptyStringSchema,
  payload: MetadataSchema,
  runtime_version: NonEmptyStringSchema,
});

export const RuntimeAuditRecordSchema = z.object({
  audit_id: NonEmptyStringSchema,
  execution_id: NonEmptyStringSchema,
  tenant_id: NonEmptyStringSchema,
  organization_id: NonEmptyStringSchema,
  actor: NonEmptyStringSchema,
  action: NonEmptyStringSchema,
  resource_type: NonEmptyStringSchema,
  resource_id: NonEmptyStringSchema,
  timestamp: IsoTimestampSchema,
  audit_hash: NonEmptyStringSchema,
  previous_audit_hash: NonEmptyStringSchema.nullable(),
  metadata: MetadataSchema,
});

export const RuntimeQueueSnapshotSchema = z.object({
  snapshot_id: NonEmptyStringSchema,
  tenant_id: NonEmptyStringSchema,
  captured_at: IsoTimestampSchema,
  runtime_version: NonEmptyStringSchema,
  messages: z.array(RuntimeQueueMessageSchema),
  snapshot_hash: NonEmptyStringSchema,
});
