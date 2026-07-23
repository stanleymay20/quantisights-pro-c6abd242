import type {
  AuditChainVerification,
  ExecutionCreateInput,
  ExecutionListQuery,
  ExecutionPurgeResult,
  ExecutionRecord,
  ExecutionStatus,
  ExecutionUpdateInput,
  ExecutionWriteResult,
  QueueSnapshotSaveInput,
  QueueSnapshotSaveResult,
  RuntimeAuditAppendInput,
  RuntimeAuditAppendResult,
  RuntimeAuditRecord,
  RuntimeEventAppendInput,
  RuntimeEventAppendResult,
  RuntimeEventRecord,
  RuntimePersistence,
  RuntimePersistenceAdapter,
  RuntimePersistenceConfig,
  RuntimeQueueSnapshot,
} from "@/lib/runtime-persistence-types";
import {
  EXECUTION_RECORD_SCHEMA_VERSION,
  RUNTIME_PERSISTENCE_VERSION,
  TERMINAL_EXECUTION_STATUSES,
} from "@/lib/runtime-persistence-types";
import { AGENT_GATEWAY_VERSION } from "@/lib/agent-gateway";

export type {
  AuditChainVerification,
  ExecutionCreateInput,
  ExecutionErrorInfo,
  ExecutionListQuery,
  ExecutionPurgeResult,
  ExecutionRecord,
  ExecutionStatus,
  ExecutionUpdateInput,
  ExecutionWriteResult,
  QueueSnapshotSaveInput,
  QueueSnapshotSaveResult,
  RuntimeAuditAppendInput,
  RuntimeAuditAppendResult,
  RuntimeAuditRecord,
  RuntimeEventAppendInput,
  RuntimeEventAppendResult,
  RuntimeEventRecord,
  RuntimePersistence,
  RuntimePersistenceAdapter,
  RuntimePersistenceConfig,
  RuntimeQueueSnapshot,
} from "@/lib/runtime-persistence-types";
export {
  EXECUTION_RECORD_SCHEMA_VERSION,
  EXECUTION_STATUSES,
  RUNTIME_PERSISTENCE_VERSION,
  TERMINAL_EXECUTION_STATUSES,
} from "@/lib/runtime-persistence-types";

const DEFAULT_EXECUTION_RETENTION_MS = 24 * 60 * 60 * 1000;

const EXECUTION_PROGRESSION: readonly ExecutionStatus[] = [
  "CREATED",
  "RECEIVED",
  "VALIDATED",
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
];

const TERMINAL_STATUSES: ReadonlySet<ExecutionStatus> = new Set(TERMINAL_EXECUTION_STATUSES);

export function createRuntimePersistence(config: RuntimePersistenceConfig): RuntimePersistence {
  const adapter = config.adapter;
  const now = () => config.now?.() ?? new Date().toISOString();
  const retentionMs = config.retention_ms ?? DEFAULT_EXECUTION_RETENTION_MS;
  const runtimeVersion = config.runtime_version ?? RUNTIME_PERSISTENCE_VERSION;
  const gatewayVersion = config.gateway_version ?? AGENT_GATEWAY_VERSION;

  const createExecution = async (input: ExecutionCreateInput): Promise<ExecutionWriteResult> => {
    try {
      const existing = await adapter.getExecution(input.tenant_id, input.execution_id);
      if (existing) {
        return rejectedExecution(`duplicate execution_id ${input.execution_id}`);
      }

      const timestamp = input.now ?? now();
      const record = withExecutionHash({
        execution_id: input.execution_id,
        correlation_id: input.correlation_id,
        request_hash: input.request_hash,
        idempotency_key: input.idempotency_key,
        tenant_id: input.tenant_id,
        organization_id: input.organization_id,
        status: input.status ?? "CREATED",
        runtime_version: input.runtime_version ?? runtimeVersion,
        gateway_version: input.gateway_version ?? gatewayVersion,
        schema_version: input.schema_version ?? EXECUTION_RECORD_SCHEMA_VERSION,
        created_at: timestamp,
        updated_at: timestamp,
        completed_at: null,
        metadata: input.metadata ?? {},
        result: null,
        error: null,
      });

      return {
        status: "PERSISTED",
        execution: await adapter.createExecution(record),
        errors: [],
      };
    } catch (error) {
      return failedExecution(error);
    }
  };

  const updateExecution = async (
    tenant_id: string,
    execution_id: string,
    changes: ExecutionUpdateInput,
  ): Promise<ExecutionWriteResult> => {
    try {
      const existing = await adapter.getExecution(tenant_id, execution_id);
      if (!existing) {
        return rejectedExecution(`execution ${execution_id} not found for tenant ${tenant_id}`);
      }

      const nextStatus = changes.status ?? existing.status;
      if (changes.status && !isValidTransition(existing.status, changes.status)) {
        return rejectedExecution(
          `invalid execution status transition ${existing.status} -> ${changes.status}`,
        );
      }

      const timestamp = changes.now ?? now();
      const completedAt = changes.completed_at !== undefined
        ? changes.completed_at
        : resolveCompletedAt(existing, nextStatus, timestamp);

      const record = withExecutionHash({
        ...stripExecutionHash(existing),
        status: nextStatus,
        metadata: changes.metadata ?? existing.metadata,
        result: changes.result !== undefined ? changes.result : existing.result,
        error: changes.error !== undefined ? changes.error : existing.error,
        completed_at: completedAt,
        updated_at: timestamp,
      });

      const updated = await adapter.updateExecution(record);
      if (!updated) {
        return rejectedExecution(`execution ${execution_id} not found for tenant ${tenant_id}`);
      }
      return {
        status: "PERSISTED",
        execution: updated,
        errors: [],
      };
    } catch (error) {
      return failedExecution(error);
    }
  };

  const appendEvent = async (input: RuntimeEventAppendInput): Promise<RuntimeEventAppendResult> => {
    try {
      const execution = await adapter.getExecution(input.tenant_id, input.execution_id);
      if (!execution) {
        return {
          status: "REJECTED",
          event: null,
          errors: [`execution ${input.execution_id} not found for tenant ${input.tenant_id}`],
        };
      }

      const events = await adapter.listRuntimeEvents(input.tenant_id, input.execution_id);
      const sequenceNumber = (events[events.length - 1]?.sequence_number ?? 0) + 1;
      const payloadHash = stableRuntimeHash(input.payload);
      const record: RuntimeEventRecord = {
        event_id: deriveDeterministicId("qv-evt", {
          tenant_id: input.tenant_id,
          execution_id: input.execution_id,
          sequence_number: sequenceNumber,
        }),
        execution_id: input.execution_id,
        correlation_id: execution.correlation_id,
        tenant_id: input.tenant_id,
        organization_id: execution.organization_id,
        event_type: input.event_type,
        sequence_number: sequenceNumber,
        timestamp: input.now ?? now(),
        payload_hash: payloadHash,
        payload: input.payload,
        runtime_version: runtimeVersion,
      };

      return {
        status: "APPENDED",
        event: await adapter.appendRuntimeEvent(record),
        errors: [],
      };
    } catch (error) {
      return {
        status: "FAILED",
        event: null,
        errors: [messageFrom(error)],
      };
    }
  };

  const recordAudit = async (input: RuntimeAuditAppendInput): Promise<RuntimeAuditAppendResult> => {
    try {
      const chain = await adapter.listAuditRecords(input.tenant_id);
      const previousHash = chain[chain.length - 1]?.audit_hash ?? null;
      const timestamp = input.now ?? now();
      const content = {
        execution_id: input.execution_id,
        tenant_id: input.tenant_id,
        organization_id: input.organization_id,
        actor: input.actor,
        action: input.action,
        resource_type: input.resource_type,
        resource_id: input.resource_id,
        timestamp,
        metadata: input.metadata ?? {},
      };
      const auditHash = computeAuditHash(content, previousHash);
      const record: RuntimeAuditRecord = {
        audit_id: deriveDeterministicId("qv-aud", {
          tenant_id: input.tenant_id,
          chain_position: chain.length + 1,
          audit_hash: auditHash,
        }),
        ...content,
        audit_hash: auditHash,
        previous_audit_hash: previousHash,
      };

      return {
        status: "APPENDED",
        record: await adapter.createAuditRecord(record),
        errors: [],
      };
    } catch (error) {
      return {
        status: "FAILED",
        record: null,
        errors: [messageFrom(error)],
      };
    }
  };

  const verifyAuditChain = async (tenant_id: string): Promise<AuditChainVerification> => {
    const chain = await adapter.listAuditRecords(tenant_id);
    let previousHash: string | null = null;
    for (const record of chain) {
      const expectedHash = computeAuditHash({
        execution_id: record.execution_id,
        tenant_id: record.tenant_id,
        organization_id: record.organization_id,
        actor: record.actor,
        action: record.action,
        resource_type: record.resource_type,
        resource_id: record.resource_id,
        timestamp: record.timestamp,
        metadata: record.metadata,
      }, previousHash);
      if (record.previous_audit_hash !== previousHash || record.audit_hash !== expectedHash) {
        return {
          valid: false,
          length: chain.length,
          broken_at: record.audit_id,
        };
      }
      previousHash = record.audit_hash;
    }
    return {
      valid: true,
      length: chain.length,
      broken_at: null,
    };
  };

  const saveQueueSnapshot = async (input: QueueSnapshotSaveInput): Promise<QueueSnapshotSaveResult> => {
    try {
      const capturedAt = input.now ?? now();
      const snapshotHash = stableRuntimeHash(input.messages);
      const snapshot: RuntimeQueueSnapshot = {
        snapshot_id: deriveDeterministicId("qv-snap", {
          tenant_id: input.tenant_id,
          captured_at: capturedAt,
          snapshot_hash: snapshotHash,
        }),
        tenant_id: input.tenant_id,
        captured_at: capturedAt,
        runtime_version: runtimeVersion,
        messages: input.messages,
        snapshot_hash: snapshotHash,
      };

      return {
        status: "SAVED",
        snapshot: await adapter.saveQueueSnapshot(snapshot),
        errors: [],
      };
    } catch (error) {
      return {
        status: "FAILED",
        snapshot: null,
        errors: [messageFrom(error)],
      };
    }
  };

  return {
    createExecution,
    updateExecution,
    getExecution: (tenant_id, execution_id) => Promise.resolve(adapter.getExecution(tenant_id, execution_id)),
    listExecutions: (query: ExecutionListQuery) => Promise.resolve(adapter.listExecutions(query)),
    appendEvent,
    replayEvents: (tenant_id, execution_id) =>
      Promise.resolve(adapter.listRuntimeEvents(tenant_id, execution_id)),
    recordAudit,
    listAuditRecords: (tenant_id, execution_id) =>
      Promise.resolve(adapter.listAuditRecords(tenant_id, execution_id)),
    verifyAuditChain,
    saveQueueSnapshot,
    loadQueueSnapshot: (tenant_id) => Promise.resolve(adapter.loadQueueSnapshot(tenant_id)),
    purgeExpiredExecutions: async (timestamp) => ({
      deleted_count: await adapter.deleteExpiredExecutions(timestamp ?? now(), retentionMs),
    }),
  };
}

export function isValidTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  if (from === to) return true;
  if (TERMINAL_STATUSES.has(from)) return false;
  if (to === "FAILED" || to === "CANCELLED" || to === "EXPIRED") return true;
  const fromRank = EXECUTION_PROGRESSION.indexOf(from);
  const toRank = EXECUTION_PROGRESSION.indexOf(to);
  return fromRank >= 0 && toRank > fromRank;
}

export function computeExecutionHash(record: Omit<ExecutionRecord, "execution_hash">): string {
  return stableRuntimeHash(record);
}

export function computeAuditHash(
  content: Omit<RuntimeAuditRecord, "audit_id" | "audit_hash" | "previous_audit_hash">,
  previousAuditHash: string | null,
): string {
  return stableRuntimeHash({
    content,
    previous_audit_hash: previousAuditHash,
  });
}

/**
 * Deterministic FNV-1a hash over a canonical JSON encoding (object keys are
 * sorted recursively), so identical values always hash identically regardless
 * of property insertion order.
 */
export function stableRuntimeHash(value: unknown): string {
  const input = JSON.stringify(canonicalize(value));
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented; AG-3E ships the persistence contract and the in-memory adapter only`);
    this.name = "NotImplementedError";
  }
}

export class MemoryRuntimePersistence implements RuntimePersistenceAdapter {
  private readonly executions = new Map<string, ExecutionRecord>();
  private readonly events = new Map<string, RuntimeEventRecord[]>();
  private readonly audits = new Map<string, RuntimeAuditRecord[]>();
  private readonly snapshots = new Map<string, RuntimeQueueSnapshot[]>();

  createExecution(record: ExecutionRecord): ExecutionRecord {
    const key = executionKey(record.tenant_id, record.execution_id);
    if (this.executions.has(key)) {
      throw new Error(`execution ${record.execution_id} already exists for tenant ${record.tenant_id}`);
    }
    this.executions.set(key, cloneValue(record));
    return cloneValue(record);
  }

  updateExecution(record: ExecutionRecord): ExecutionRecord | null {
    const key = executionKey(record.tenant_id, record.execution_id);
    if (!this.executions.has(key)) return null;
    this.executions.set(key, cloneValue(record));
    return cloneValue(record);
  }

  getExecution(tenant_id: string, execution_id: string): ExecutionRecord | null {
    const record = this.executions.get(executionKey(tenant_id, execution_id));
    return record ? cloneValue(record) : null;
  }

  listExecutions(query: ExecutionListQuery): ExecutionRecord[] {
    return Array.from(this.executions.values())
      .filter((record) =>
        record.tenant_id === query.tenant_id &&
        (query.organization_id === undefined || record.organization_id === query.organization_id) &&
        (query.status === undefined || record.status === query.status) &&
        (query.correlation_id === undefined || record.correlation_id === query.correlation_id))
      .sort(compareExecutions)
      .map(cloneValue);
  }

  appendRuntimeEvent(record: RuntimeEventRecord): RuntimeEventRecord {
    const key = executionKey(record.tenant_id, record.execution_id);
    const chain = this.events.get(key) ?? [];
    const lastSequence = chain[chain.length - 1]?.sequence_number ?? 0;
    if (record.sequence_number !== lastSequence + 1) {
      throw new Error(
        `append-only violation for execution ${record.execution_id}: expected sequence ${lastSequence + 1}, received ${record.sequence_number}`,
      );
    }
    chain.push(cloneValue(record));
    this.events.set(key, chain);
    return cloneValue(record);
  }

  listRuntimeEvents(tenant_id: string, execution_id: string): RuntimeEventRecord[] {
    const chain = this.events.get(executionKey(tenant_id, execution_id)) ?? [];
    return chain
      .slice()
      .sort((a, b) => a.sequence_number - b.sequence_number)
      .map(cloneValue);
  }

  createAuditRecord(record: RuntimeAuditRecord): RuntimeAuditRecord {
    const chain = this.audits.get(record.tenant_id) ?? [];
    const expectedPrevious = chain[chain.length - 1]?.audit_hash ?? null;
    if (record.previous_audit_hash !== expectedPrevious) {
      throw new Error(
        `audit chain violation for tenant ${record.tenant_id}: expected previous hash ${String(expectedPrevious)}, received ${String(record.previous_audit_hash)}`,
      );
    }
    chain.push(cloneValue(record));
    this.audits.set(record.tenant_id, chain);
    return cloneValue(record);
  }

  listAuditRecords(tenant_id: string, execution_id?: string): RuntimeAuditRecord[] {
    const chain = this.audits.get(tenant_id) ?? [];
    return chain
      .filter((record) => execution_id === undefined || record.execution_id === execution_id)
      .map(cloneValue);
  }

  saveQueueSnapshot(snapshot: RuntimeQueueSnapshot): RuntimeQueueSnapshot {
    const history = this.snapshots.get(snapshot.tenant_id) ?? [];
    history.push(cloneValue(snapshot));
    this.snapshots.set(snapshot.tenant_id, history);
    return cloneValue(snapshot);
  }

  loadQueueSnapshot(tenant_id: string): RuntimeQueueSnapshot | null {
    const history = this.snapshots.get(tenant_id) ?? [];
    const latest = history
      .slice()
      .sort(compareSnapshots)[history.length - 1];
    return latest ? cloneValue(latest) : null;
  }

  deleteExpiredExecutions(now: string, retention_ms: number): number {
    let deleted = 0;
    for (const [key, record] of Array.from(this.executions.entries())) {
      if (isExpiredExecution(record, now, retention_ms)) {
        this.executions.delete(key);
        this.events.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  available(): boolean {
    return true;
  }
}

/**
 * Compile-only scaffold for the Supabase-backed adapter. AG-3E deliberately
 * ships no database SDK integration; a later phase replaces every method body
 * with real Supabase table access using the injected configuration.
 */
export interface SupabaseRuntimePersistenceConfig {
  project_url: string;
  schema?: string;
}

export class SupabaseRuntimePersistence implements RuntimePersistenceAdapter {
  protected readonly config: SupabaseRuntimePersistenceConfig;

  constructor(config: SupabaseRuntimePersistenceConfig) {
    this.config = config;
  }

  createExecution(_record: ExecutionRecord): never {
    throw new NotImplementedError("SupabaseRuntimePersistence.createExecution");
  }

  updateExecution(_record: ExecutionRecord): never {
    throw new NotImplementedError("SupabaseRuntimePersistence.updateExecution");
  }

  getExecution(_tenant_id: string, _execution_id: string): never {
    throw new NotImplementedError("SupabaseRuntimePersistence.getExecution");
  }

  listExecutions(_query: ExecutionListQuery): never {
    throw new NotImplementedError("SupabaseRuntimePersistence.listExecutions");
  }

  appendRuntimeEvent(_record: RuntimeEventRecord): never {
    throw new NotImplementedError("SupabaseRuntimePersistence.appendRuntimeEvent");
  }

  listRuntimeEvents(_tenant_id: string, _execution_id: string): never {
    throw new NotImplementedError("SupabaseRuntimePersistence.listRuntimeEvents");
  }

  createAuditRecord(_record: RuntimeAuditRecord): never {
    throw new NotImplementedError("SupabaseRuntimePersistence.createAuditRecord");
  }

  listAuditRecords(_tenant_id: string, _execution_id?: string): never {
    throw new NotImplementedError("SupabaseRuntimePersistence.listAuditRecords");
  }

  saveQueueSnapshot(_snapshot: RuntimeQueueSnapshot): never {
    throw new NotImplementedError("SupabaseRuntimePersistence.saveQueueSnapshot");
  }

  loadQueueSnapshot(_tenant_id: string): never {
    throw new NotImplementedError("SupabaseRuntimePersistence.loadQueueSnapshot");
  }

  deleteExpiredExecutions(_now: string, _retention_ms: number): never {
    throw new NotImplementedError("SupabaseRuntimePersistence.deleteExpiredExecutions");
  }

  available(): boolean {
    return false;
  }
}

/**
 * Compile-only scaffold for the Postgres-backed adapter. No driver import in
 * AG-3E; a later phase binds these methods to SQL statements over an injected
 * connection.
 */
export interface PostgresRuntimePersistenceConfig {
  connection_reference: string;
  schema?: string;
}

export class PostgresRuntimePersistence implements RuntimePersistenceAdapter {
  protected readonly config: PostgresRuntimePersistenceConfig;

  constructor(config: PostgresRuntimePersistenceConfig) {
    this.config = config;
  }

  createExecution(_record: ExecutionRecord): never {
    throw new NotImplementedError("PostgresRuntimePersistence.createExecution");
  }

  updateExecution(_record: ExecutionRecord): never {
    throw new NotImplementedError("PostgresRuntimePersistence.updateExecution");
  }

  getExecution(_tenant_id: string, _execution_id: string): never {
    throw new NotImplementedError("PostgresRuntimePersistence.getExecution");
  }

  listExecutions(_query: ExecutionListQuery): never {
    throw new NotImplementedError("PostgresRuntimePersistence.listExecutions");
  }

  appendRuntimeEvent(_record: RuntimeEventRecord): never {
    throw new NotImplementedError("PostgresRuntimePersistence.appendRuntimeEvent");
  }

  listRuntimeEvents(_tenant_id: string, _execution_id: string): never {
    throw new NotImplementedError("PostgresRuntimePersistence.listRuntimeEvents");
  }

  createAuditRecord(_record: RuntimeAuditRecord): never {
    throw new NotImplementedError("PostgresRuntimePersistence.createAuditRecord");
  }

  listAuditRecords(_tenant_id: string, _execution_id?: string): never {
    throw new NotImplementedError("PostgresRuntimePersistence.listAuditRecords");
  }

  saveQueueSnapshot(_snapshot: RuntimeQueueSnapshot): never {
    throw new NotImplementedError("PostgresRuntimePersistence.saveQueueSnapshot");
  }

  loadQueueSnapshot(_tenant_id: string): never {
    throw new NotImplementedError("PostgresRuntimePersistence.loadQueueSnapshot");
  }

  deleteExpiredExecutions(_now: string, _retention_ms: number): never {
    throw new NotImplementedError("PostgresRuntimePersistence.deleteExpiredExecutions");
  }

  available(): boolean {
    return false;
  }
}

function withExecutionHash(record: Omit<ExecutionRecord, "execution_hash">): ExecutionRecord {
  return {
    ...record,
    execution_hash: computeExecutionHash(record),
  };
}

function stripExecutionHash(record: ExecutionRecord): Omit<ExecutionRecord, "execution_hash"> {
  const { execution_hash: _execution_hash, ...rest } = record;
  return rest;
}

function resolveCompletedAt(
  existing: ExecutionRecord,
  nextStatus: ExecutionStatus,
  timestamp: string,
): string | null {
  if (existing.completed_at) return existing.completed_at;
  return TERMINAL_STATUSES.has(nextStatus) ? timestamp : null;
}

function isExpiredExecution(record: ExecutionRecord, now: string, retention_ms: number): boolean {
  if (record.status === "EXPIRED") return true;
  if (!TERMINAL_STATUSES.has(record.status)) return false;
  const settledAt = record.completed_at ?? record.updated_at;
  return Date.parse(settledAt) + retention_ms <= Date.parse(now);
}

function rejectedExecution(reason: string): ExecutionWriteResult {
  return {
    status: "REJECTED",
    execution: null,
    errors: [reason],
  };
}

function failedExecution(error: unknown): ExecutionWriteResult {
  return {
    status: "FAILED",
    execution: null,
    errors: [messageFrom(error)],
  };
}

function compareExecutions(a: ExecutionRecord, b: ExecutionRecord): number {
  const createdDelta = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (createdDelta !== 0) return createdDelta;
  return a.execution_id.localeCompare(b.execution_id);
}

function compareSnapshots(a: RuntimeQueueSnapshot, b: RuntimeQueueSnapshot): number {
  const capturedDelta = Date.parse(a.captured_at) - Date.parse(b.captured_at);
  if (capturedDelta !== 0) return capturedDelta;
  return a.snapshot_id.localeCompare(b.snapshot_id);
}

function deriveDeterministicId(prefix: string, seed: Record<string, unknown>): string {
  return `${prefix}-${stableRuntimeHash(seed).replace("fnv1a-", "")}`;
}

function executionKey(tenant_id: string, execution_id: string): string {
  return `${tenant_id}::${execution_id}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    const sorted: Record<string, unknown> = {};
    for (const [key, entry] of entries) {
      sorted[key] = canonicalize(entry);
    }
    return sorted;
  }
  return value;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
