import {
  AGENT_GATEWAY_SCHEMA_VERSION,
  AGENT_GATEWAY_VERSION,
} from "@/lib/agent-gateway";
import {
  RUNTIME_GATEWAY_VERSION,
} from "@/lib/runtime-types";
import type {
  IdempotencyPurgeResult,
  IdempotencyRecord,
  IdempotencyRecordStatus,
  IdempotencyReplayResult,
  IdempotencyReserveInput,
  IdempotencyReserveResult,
  IdempotencyStore,
  IdempotencyStoreAdapter,
  IdempotencyStoreConfig,
  IdempotencyStoreFindCriteria,
  IdempotencyStoreSaveInput,
  IdempotencyStoreUpdateInput,
  ReplayReason,
} from "@/lib/idempotency-store-types";

export type {
  IdempotencyPurgeResult,
  IdempotencyRecord,
  IdempotencyRecordStatus,
  IdempotencyReplayResult,
  IdempotencyReserveInput,
  IdempotencyReserveResult,
  IdempotencyStore,
  IdempotencyStoreAdapter,
  IdempotencyStoreConfig,
  IdempotencyStoreFindCriteria,
  IdempotencyStoreSaveInput,
  IdempotencyStoreUpdateInput,
  ReplayReason,
} from "@/lib/idempotency-store-types";

const DEFAULT_TTL_MS = 60 * 60 * 1000;

export function createIdempotencyStore(config: IdempotencyStoreConfig): IdempotencyStore {
  const now = () => config.now?.() ?? new Date().toISOString();
  const defaultTtl = config.ttl_ms ?? DEFAULT_TTL_MS;

  return {
    reserveKey: (input) => reserveKey(config.adapter, normalizeInput(input, now(), defaultTtl)),
    lookupKey: (idempotency_key) => lookupKey(config.adapter, idempotency_key),
    completeKey: (idempotency_key, changes) => completeKey(config.adapter, idempotency_key, changes, now()),
    expireKey: (idempotency_key, timestamp) => expireKey(config.adapter, idempotency_key, timestamp ?? now()),
    purgeExpired: (timestamp) => purgeExpired(config.adapter, timestamp ?? now()),
    detectReplay: (input) => detectReplay(config.adapter, normalizeInput(input, now(), defaultTtl)),
  };
}

export async function reserveKey(
  adapter: IdempotencyStoreAdapter,
  input: Required<IdempotencyReserveInput>,
): Promise<IdempotencyReserveResult> {
  try {
    const replay = await detectReplay(adapter, input);
    if (replay.replayed) {
      return {
        status: "REJECTED",
        record: null,
        replay,
        errors: [replay.explanation],
      };
    }

    const record: IdempotencyRecord = {
      idempotency_key: input.idempotency_key,
      request_hash: input.request_hash,
      correlation_id: input.correlation_id,
      tenant_id: input.tenant_id,
      organization_id: input.organization_id,
      created_at: input.now,
      completed_at: null,
      expires_at: addMilliseconds(input.now, input.ttl_ms),
      status: "RESERVED",
      gateway_version: input.gateway_version,
      schema_version: input.schema_version,
      runtime_version: input.runtime_version,
    };
    return {
      status: "RESERVED",
      record: await adapter.save(record),
      replay: noReplay(),
      errors: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failedReserve(message);
  }
}

export async function lookupKey(
  adapter: IdempotencyStoreAdapter,
  idempotency_key: string,
): Promise<IdempotencyRecord | null> {
  return adapter.find({ idempotency_key });
}

export async function completeKey(
  adapter: IdempotencyStoreAdapter,
  idempotency_key: string,
  changes: { status?: "COMPLETED" | "FAILED" | "PROCESSING"; completed_at?: string } = {},
  now: string = new Date().toISOString(),
): Promise<IdempotencyRecord | null> {
  return adapter.update(idempotency_key, {
    status: changes.status ?? "COMPLETED",
    completed_at: changes.completed_at ?? now,
  });
}

export async function expireKey(
  adapter: IdempotencyStoreAdapter,
  idempotency_key: string,
  now: string = new Date().toISOString(),
): Promise<IdempotencyRecord | null> {
  const record = await adapter.find({ idempotency_key });
  if (!record) return null;
  if (!isExpired(record, now)) return record;
  return adapter.update(idempotency_key, {
    status: "EXPIRED",
  });
}

export async function purgeExpired(
  adapter: IdempotencyStoreAdapter,
  now: string = new Date().toISOString(),
): Promise<IdempotencyPurgeResult> {
  return {
    deleted_count: await adapter.deleteExpired(now),
  };
}

export async function detectReplay(
  adapter: IdempotencyStoreAdapter,
  input: Required<IdempotencyReserveInput>,
): Promise<IdempotencyReplayResult> {
  try {
    const byKey = await adapter.find({ idempotency_key: input.idempotency_key });
    if (byKey) {
      if (byKey.tenant_id !== input.tenant_id || byKey.organization_id !== input.organization_id) {
        return replay("CROSS_TENANT_KEY_REUSE", byKey, "Idempotency key is already reserved by another tenant or organization.");
      }
      if (byKey.status === "EXPIRED" || isExpired(byKey, input.now)) {
        if (byKey.status !== "EXPIRED") {
          await adapter.update(byKey.idempotency_key, { status: "EXPIRED" });
          return replay("EXPIRED_RESERVATION_REUSE", { ...byKey, status: "EXPIRED" }, "Expired idempotency reservation cannot be reused.");
        }
        return replay("EXPIRED_RESERVATION_REUSE", byKey, "Expired idempotency reservation cannot be reused.");
      }
      if (byKey.request_hash !== input.request_hash) {
        return replay("CONFLICTING_REQUEST_HASH", byKey, "Idempotency key was reused with a conflicting request hash.");
      }
      return replay("DUPLICATE_IDEMPOTENCY_KEY", byKey, "Idempotency key was already reserved for this request.");
    }

    const byHash = await adapter.find({ request_hash: input.request_hash });
    if (byHash) {
      if (byHash.tenant_id !== input.tenant_id || byHash.organization_id !== input.organization_id) {
        return replay("CROSS_TENANT_KEY_REUSE", byHash, "Request hash is already associated with another tenant or organization.");
      }
      if (byHash.status === "EXPIRED" || isExpired(byHash, input.now)) {
        return replay("EXPIRED_RESERVATION_REUSE", byHash, "Expired request hash reservation cannot be reused.");
      }
      return replay("DUPLICATE_REQUEST_HASH", byHash, "Request hash was already reserved with a different idempotency key.");
    }

    return noReplay();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      replayed: false,
      reason: "ADAPTER_FAILURE",
      retryable: true,
      existing_record: null,
      explanation: message,
    };
  }
}

export class InMemoryIdempotencyStoreAdapter implements IdempotencyStoreAdapter {
  private readonly records = new Map<string, IdempotencyRecord>();

  save(record: IdempotencyStoreSaveInput): IdempotencyRecord {
    const snapshot = cloneRecord(record);
    this.records.set(snapshot.idempotency_key, snapshot);
    return cloneRecord(snapshot);
  }

  find(criteria: IdempotencyStoreFindCriteria): IdempotencyRecord | null {
    for (const record of this.records.values()) {
      if (matches(record, criteria)) return cloneRecord(record);
    }
    return null;
  }

  update(idempotency_key: string, changes: IdempotencyStoreUpdateInput): IdempotencyRecord | null {
    const existing = this.records.get(idempotency_key);
    if (!existing) return null;
    const updated: IdempotencyRecord = {
      ...existing,
      ...changes,
      completed_at: changes.completed_at === undefined ? existing.completed_at : changes.completed_at,
      expires_at: changes.expires_at ?? existing.expires_at,
    };
    this.records.set(idempotency_key, cloneRecord(updated));
    return cloneRecord(updated);
  }

  deleteExpired(now: string): number {
    let deleted = 0;
    for (const record of Array.from(this.records.values())) {
      if (record.status === "EXPIRED" || isExpired(record, now)) {
        this.records.delete(record.idempotency_key);
        deleted += 1;
      }
    }
    return deleted;
  }

  exists(criteria: IdempotencyStoreFindCriteria): boolean {
    return this.find(criteria) !== null;
  }
}

function normalizeInput(
  input: IdempotencyReserveInput,
  now: string,
  defaultTtl: number,
): Required<IdempotencyReserveInput> {
  return {
    ...input,
    gateway_version: input.gateway_version ?? AGENT_GATEWAY_VERSION,
    schema_version: input.schema_version ?? AGENT_GATEWAY_SCHEMA_VERSION,
    runtime_version: input.runtime_version ?? RUNTIME_GATEWAY_VERSION,
    now: input.now ?? now,
    ttl_ms: input.ttl_ms ?? defaultTtl,
  };
}

function replay(
  reason: Exclude<ReplayReason, "NONE" | "ADAPTER_FAILURE">,
  existing: IdempotencyRecord,
  explanation: string,
): IdempotencyReplayResult {
  return {
    replayed: true,
    reason,
    retryable: false,
    existing_record: cloneRecord(existing),
    explanation,
  };
}

function noReplay(): IdempotencyReplayResult {
  return {
    replayed: false,
    reason: "NONE",
    retryable: false,
    existing_record: null,
    explanation: "No idempotency or replay conflict detected.",
  };
}

function failedReserve(message: string): IdempotencyReserveResult {
  return {
    status: "FAILED",
    record: null,
    replay: {
      replayed: false,
      reason: "ADAPTER_FAILURE",
      retryable: true,
      existing_record: null,
      explanation: message,
    },
    errors: [message],
  };
}

function isExpired(record: IdempotencyRecord, now: string): boolean {
  return Date.parse(record.expires_at) <= Date.parse(now);
}

function addMilliseconds(timestamp: string, ttlMs: number): string {
  return new Date(Date.parse(timestamp) + ttlMs).toISOString();
}

function matches(record: IdempotencyRecord, criteria: IdempotencyStoreFindCriteria): boolean {
  return Object.entries(criteria).every(([key, value]) => {
    if (value === undefined) return true;
    return record[key as keyof IdempotencyRecord] === value;
  });
}

function cloneRecord(record: IdempotencyRecord): IdempotencyRecord {
  return { ...record };
}
