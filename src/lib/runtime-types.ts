import { z } from "zod";

import {
  AGENT_GATEWAY_SCHEMA_VERSION,
  AGENT_GATEWAY_VERSION,
  type AgentGatewayRequest,
} from "@/lib/agent-gateway";

export const RUNTIME_GATEWAY_VERSION = "ag-3a.1";
export const GATEWAY_ACKNOWLEDGEMENT_SCHEMA_VERSION = "quantivis.gateway-acknowledgement.v1";

export type RuntimeState =
  | "RECEIVED"
  | "VALIDATED"
  | "REJECTED"
  | "QUEUED"
  | "ACKNOWLEDGED"
  | "FAILED"
  | "RETRYING"
  | "DEAD_LETTER";

export type RuntimeEventType =
  | "gateway.request.received"
  | "gateway.request.validated"
  | "gateway.request.rejected"
  | "gateway.request.queued"
  | "gateway.request.acknowledged"
  | "gateway.request.failed"
  | "gateway.request.deadletter";

export type RuntimeRejectionCode =
  | "SCHEMA_VALIDATION_FAILED"
  | "REQUEST_TOO_LARGE"
  | "VERSION_VALIDATION_FAILED"
  | "TENANT_VALIDATION_FAILED"
  | "ORGANIZATION_VALIDATION_FAILED"
  | "DUPLICATE_IDEMPOTENCY_KEY"
  | "REPLAYED_REQUEST_HASH"
  | "ADAPTER_FAILURE";

export interface GatewayAcknowledgement {
  acknowledgement_id: string;
  correlation_id: string;
  request_hash: string;
  gateway_version: typeof AGENT_GATEWAY_VERSION;
  received_at: string;
  status: "ACKNOWLEDGED";
  tenant_id: string;
  organization_id: string;
  schema_version: typeof GATEWAY_ACKNOWLEDGEMENT_SCHEMA_VERSION;
  runtime_version: typeof RUNTIME_GATEWAY_VERSION;
  signature_key_id: string;
  estimated_processing: string;
  signature: string;
}

export interface RuntimeQueueMessage {
  message_id: string;
  correlation_id: string;
  request_hash: string;
  idempotency_key: string;
  tenant_id: string;
  organization_id: string;
  request: AgentGatewayRequest;
  state: RuntimeState;
  enqueued_at: string;
  attempts: number;
}

export interface RuntimeAuditEvent {
  audit_id: string;
  event_type: RuntimeEventType;
  correlation_id: string;
  request_hash: string | null;
  idempotency_key: string | null;
  tenant_id: string;
  organization_id: string;
  state: RuntimeState;
  occurred_at: string;
  payload: Record<string, unknown>;
}

export interface RuntimeEvent {
  event_type: RuntimeEventType;
  correlation_id: string;
  request_hash: string | null;
  occurred_at: string;
  state: RuntimeState;
  payload: Record<string, unknown>;
}

export interface RuntimeValidationResult {
  success: boolean;
  request: AgentGatewayRequest | null;
  errors: string[];
  request_hash: string;
  correlation_id: string;
  received_at: string;
  size_bytes: number;
}

export interface RuntimeGatewayResult {
  status: RuntimeState;
  acknowledgement: GatewayAcknowledgement | null;
  rejection_code: RuntimeRejectionCode | null;
  errors: string[];
  correlation_id: string;
  request_hash: string;
  signature_verified: boolean;
}

export interface RuntimeHealthStatus {
  runtime_version: typeof RUNTIME_GATEWAY_VERSION;
  gateway_version: typeof AGENT_GATEWAY_VERSION;
  queue: {
    available: boolean;
    depth: number;
  };
  adapters: {
    queue: boolean;
    persistence: boolean;
    signing: boolean;
    events: boolean;
  };
  uptime_ms: number;
  ready: boolean;
  alive: boolean;
}

export interface QueueAdapter {
  enqueue(message: RuntimeQueueMessage): Promise<void> | void;
  peek(): RuntimeQueueMessage | null;
  ack(message_id: string): Promise<void> | void;
  retry(message_id: string): Promise<void> | void;
  deadLetter(message_id: string, reason: string): Promise<void> | void;
  depth(): number;
  available(): boolean;
}

export interface RuntimePersistenceAdapter {
  storeRequest(record: {
    correlation_id: string;
    request_hash: string;
    idempotency_key: string;
    request: AgentGatewayRequest;
    state: RuntimeState;
    received_at: string;
  }): Promise<void> | void;
  storeAcknowledgement(acknowledgement: GatewayAcknowledgement): Promise<void> | void;
  storeAudit(event: RuntimeAuditEvent): Promise<void> | void;
  markQueued(correlation_id: string): Promise<void> | void;
  markDeadLetter(correlation_id: string, reason: string): Promise<void> | void;
  hasIdempotencyKey(idempotency_key: string): boolean;
  hasRequestHash(request_hash: string): boolean;
  available(): boolean;
}

export interface SigningAdapter {
  readonly key_id: string;
  signAcknowledgement(acknowledgement: Omit<GatewayAcknowledgement, "signature">): Promise<string> | string;
  verifyAcknowledgement(acknowledgement: GatewayAcknowledgement): Promise<boolean> | boolean;
  available(): boolean;
}

export interface EventEmitterAdapter {
  emit(event: RuntimeEvent): Promise<void> | void;
  available(): boolean;
}

const NonEmptyStringSchema = z.string().min(1);

export const GatewayAcknowledgementSchema = z.object({
  acknowledgement_id: NonEmptyStringSchema,
  correlation_id: NonEmptyStringSchema,
  request_hash: NonEmptyStringSchema,
  gateway_version: z.literal(AGENT_GATEWAY_VERSION),
  received_at: z.string().datetime({ offset: true }),
  status: z.literal("ACKNOWLEDGED"),
  tenant_id: NonEmptyStringSchema,
  organization_id: NonEmptyStringSchema,
  schema_version: z.literal(GATEWAY_ACKNOWLEDGEMENT_SCHEMA_VERSION),
  runtime_version: z.literal(RUNTIME_GATEWAY_VERSION),
  signature_key_id: NonEmptyStringSchema,
  estimated_processing: NonEmptyStringSchema,
  signature: NonEmptyStringSchema,
});

export function expectedAgentGatewaySchemaVersion(): typeof AGENT_GATEWAY_SCHEMA_VERSION {
  return AGENT_GATEWAY_SCHEMA_VERSION;
}
