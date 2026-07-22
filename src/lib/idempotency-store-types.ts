import { z } from "zod";

import {
  AGENT_GATEWAY_SCHEMA_VERSION,
  AGENT_GATEWAY_VERSION,
} from "@/lib/agent-gateway";
import {
  RUNTIME_GATEWAY_VERSION,
} from "@/lib/runtime-types";

export const IDEMPOTENCY_STORE_VERSION = "ag-3c.1";

export type IdempotencyRecordStatus =
  | "RESERVED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";

export type ReplayReason =
  | "NONE"
  | "DUPLICATE_IDEMPOTENCY_KEY"
  | "DUPLICATE_REQUEST_HASH"
  | "EXPIRED_RESERVATION_REUSE"
  | "CONFLICTING_REQUEST_HASH"
  | "CROSS_TENANT_KEY_REUSE"
  | "ADAPTER_FAILURE";

export interface IdempotencyRecord {
  idempotency_key: string;
  request_hash: string;
  correlation_id: string;
  tenant_id: string;
  organization_id: string;
  created_at: string;
  completed_at: string | null;
  expires_at: string;
  status: IdempotencyRecordStatus;
  gateway_version: typeof AGENT_GATEWAY_VERSION;
  schema_version: typeof AGENT_GATEWAY_SCHEMA_VERSION;
  runtime_version: typeof RUNTIME_GATEWAY_VERSION;
}

export interface IdempotencyStoreSaveInput extends IdempotencyRecord {}

export interface IdempotencyStoreFindCriteria {
  idempotency_key?: string;
  request_hash?: string;
  tenant_id?: string;
  organization_id?: string;
}

export interface IdempotencyStoreUpdateInput {
  status?: IdempotencyRecordStatus;
  completed_at?: string | null;
  expires_at?: string;
}

export interface IdempotencyReplayResult {
  replayed: boolean;
  reason: ReplayReason;
  retryable: boolean;
  existing_record: IdempotencyRecord | null;
  explanation: string;
}

export interface IdempotencyReserveInput {
  idempotency_key: string;
  request_hash: string;
  correlation_id: string;
  tenant_id: string;
  organization_id: string;
  gateway_version?: typeof AGENT_GATEWAY_VERSION;
  schema_version?: typeof AGENT_GATEWAY_SCHEMA_VERSION;
  runtime_version?: typeof RUNTIME_GATEWAY_VERSION;
  now?: string;
  ttl_ms?: number;
}

export interface IdempotencyReserveResult {
  status: "RESERVED" | "REJECTED" | "FAILED";
  record: IdempotencyRecord | null;
  replay: IdempotencyReplayResult;
  errors: string[];
}

export interface IdempotencyPurgeResult {
  deleted_count: number;
}

export interface IdempotencyStoreAdapter {
  save(record: IdempotencyStoreSaveInput): Promise<IdempotencyRecord> | IdempotencyRecord;
  find(criteria: IdempotencyStoreFindCriteria): Promise<IdempotencyRecord | null> | IdempotencyRecord | null;
  update(
    idempotency_key: string,
    changes: IdempotencyStoreUpdateInput,
  ): Promise<IdempotencyRecord | null> | IdempotencyRecord | null;
  deleteExpired(now: string): Promise<number> | number;
  exists(criteria: IdempotencyStoreFindCriteria): Promise<boolean> | boolean;
}

export interface IdempotencyStoreConfig {
  adapter: IdempotencyStoreAdapter;
  ttl_ms?: number;
  now?: () => string;
}

export interface IdempotencyStore {
  reserveKey(input: IdempotencyReserveInput): Promise<IdempotencyReserveResult>;
  lookupKey(idempotency_key: string): Promise<IdempotencyRecord | null>;
  completeKey(
    idempotency_key: string,
    changes?: { status?: "COMPLETED" | "FAILED" | "PROCESSING"; completed_at?: string },
  ): Promise<IdempotencyRecord | null>;
  expireKey(idempotency_key: string, now?: string): Promise<IdempotencyRecord | null>;
  purgeExpired(now?: string): Promise<IdempotencyPurgeResult>;
  detectReplay(input: IdempotencyReserveInput): Promise<IdempotencyReplayResult>;
}

export const IdempotencyRecordSchema = z.object({
  idempotency_key: z.string().min(1),
  request_hash: z.string().min(1),
  correlation_id: z.string().min(1),
  tenant_id: z.string().min(1),
  organization_id: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  expires_at: z.string().datetime({ offset: true }),
  status: z.enum(["RESERVED", "PROCESSING", "COMPLETED", "FAILED", "EXPIRED"]),
  gateway_version: z.literal(AGENT_GATEWAY_VERSION),
  schema_version: z.literal(AGENT_GATEWAY_SCHEMA_VERSION),
  runtime_version: z.literal(RUNTIME_GATEWAY_VERSION),
});
