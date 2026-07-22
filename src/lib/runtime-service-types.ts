import { z } from "zod";

import {
  AGENT_GATEWAY_SCHEMA_VERSION,
  AGENT_GATEWAY_VERSION,
  type AgentGatewayRequest,
} from "@/lib/agent-gateway";
import {
  RUNTIME_GATEWAY_VERSION,
  type EventEmitterAdapter,
  type GatewayAcknowledgement,
  type QueueAdapter,
  type RuntimeGatewayResult,
  type RuntimePersistenceAdapter,
  type SigningAdapter,
} from "@/lib/runtime-types";

export const RUNTIME_SERVICE_VERSION = "ag-3b.1";
export const RUNTIME_SERVICE_SCHEMA_VERSION = "quantivis.runtime-service.v1";

export type RuntimeErrorCode =
  | "BAD_REQUEST"
  | "INVALID_SCHEMA"
  | "UNSUPPORTED_VERSION"
  | "PAYLOAD_TOO_LARGE"
  | "TENANT_NOT_FOUND"
  | "ORGANIZATION_NOT_FOUND"
  | "DUPLICATE_REQUEST"
  | "REPLAY_DETECTED"
  | "QUEUE_UNAVAILABLE"
  | "SIGNING_FAILED"
  | "INTERNAL_ERROR";

export type RuntimeStatusCode = 200 | 400 | 401 | 403 | 404 | 409 | 410 | 413 | 422 | 429 | 500 | 503;

export interface RuntimePayloadLimits {
  max_payload_bytes: number;
  max_evidence_references: number;
  max_metadata_bytes: number;
  max_justification_length: number;
}

export interface RuntimeTimeoutPolicy {
  request_timeout_ms: number;
  queue_timeout_ms: number;
  signing_timeout_ms: number;
}

export interface RuntimeBuildMetadata {
  release: string;
  commit: string;
  artifact_id: string;
  deployment_id: string;
}

export interface RuntimeServiceAdapters {
  queue: QueueAdapter;
  persistence: RuntimePersistenceAdapter;
  signing: SigningAdapter;
  events: EventEmitterAdapter;
}

export interface RuntimeError {
  error_code: RuntimeErrorCode;
  error_message: string;
  correlation_id: string;
  status_code: RuntimeStatusCode;
  retryable: boolean;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface RuntimeSuccessResponse {
  ok: true;
  status_code: 200;
  acknowledgement: GatewayAcknowledgement;
  correlation_id: string;
  request_hash: string;
}

export interface RuntimeErrorResponse {
  ok: false;
  status_code: RuntimeStatusCode;
  error: RuntimeError;
  correlation_id: string;
  request_hash: string | null;
}

export type RuntimeServiceResponse = RuntimeSuccessResponse | RuntimeErrorResponse;

export interface RuntimeReadinessStatus {
  queue_ready: boolean;
  persistence_ready: boolean;
  signing_ready: boolean;
  event_emitter_ready: boolean;
  overall_ready: boolean;
}

export interface RuntimeServiceHealth {
  runtime_service_version: typeof RUNTIME_SERVICE_VERSION;
  runtime_version: typeof RUNTIME_GATEWAY_VERSION;
  gateway_version: typeof AGENT_GATEWAY_VERSION;
  service_schema_version: typeof RUNTIME_SERVICE_SCHEMA_VERSION;
  supported_schema_versions: Array<typeof AGENT_GATEWAY_SCHEMA_VERSION>;
  supported_gateway_versions: Array<typeof AGENT_GATEWAY_VERSION>;
  supported_runtime_versions: Array<typeof RUNTIME_GATEWAY_VERSION>;
  adapter_health: RuntimeReadinessStatus;
  uptime_ms: number;
  ready: boolean;
  alive: boolean;
  build: RuntimeBuildMetadata;
  limits: RuntimePayloadLimits;
  timeout_policy: RuntimeTimeoutPolicy;
}

export interface RuntimeService {
  handleRuntimeRequest(request: unknown): Promise<RuntimeServiceResponse>;
  health(): RuntimeServiceHealth;
  readiness(): RuntimeReadinessStatus;
}

export interface RuntimeErrorInput {
  error_code: RuntimeErrorCode;
  error_message: string;
  correlation_id?: string;
  timestamp?: string;
  details?: Record<string, unknown>;
}

export interface RuntimeServiceValidationResult {
  valid: boolean;
  error: RuntimeError | null;
  request: AgentGatewayRequest | null;
  request_hash: string | null;
}

export interface RuntimeServiceConfig extends RuntimeServiceAdapters {
  gateway: {
    submitGatewayRequest(rawRequest: unknown): Promise<RuntimeGatewayResult>;
    validateRuntimeRequest(rawRequest: unknown): {
      success: boolean;
      request: AgentGatewayRequest | null;
      errors: string[];
      request_hash: string;
      correlation_id: string;
      received_at: string;
      size_bytes: number;
    };
    healthCheck(): {
      uptime_ms: number;
    };
  };
  limits?: Partial<RuntimePayloadLimits>;
  timeouts?: Partial<RuntimeTimeoutPolicy>;
  build?: Partial<RuntimeBuildMetadata>;
  now?: () => string;
}

export const DEFAULT_RUNTIME_PAYLOAD_LIMITS: RuntimePayloadLimits = {
  max_payload_bytes: 16_384,
  max_evidence_references: 100,
  max_metadata_bytes: 4_096,
  max_justification_length: 8_000,
};

export const DEFAULT_RUNTIME_TIMEOUT_POLICY: RuntimeTimeoutPolicy = {
  request_timeout_ms: 10_000,
  queue_timeout_ms: 2_000,
  signing_timeout_ms: 2_000,
};

export const DEFAULT_RUNTIME_BUILD_METADATA: RuntimeBuildMetadata = {
  release: "development",
  commit: "unknown",
  artifact_id: "unknown",
  deployment_id: "unknown",
};

export const RuntimeErrorSchema = z.object({
  error_code: z.enum([
    "BAD_REQUEST",
    "INVALID_SCHEMA",
    "UNSUPPORTED_VERSION",
    "PAYLOAD_TOO_LARGE",
    "TENANT_NOT_FOUND",
    "ORGANIZATION_NOT_FOUND",
    "DUPLICATE_REQUEST",
    "REPLAY_DETECTED",
    "QUEUE_UNAVAILABLE",
    "SIGNING_FAILED",
    "INTERNAL_ERROR",
  ]),
  error_message: z.string().min(1),
  correlation_id: z.string().min(1),
  status_code: z.union([
    z.literal(200),
    z.literal(400),
    z.literal(401),
    z.literal(403),
    z.literal(404),
    z.literal(409),
    z.literal(410),
    z.literal(413),
    z.literal(422),
    z.literal(429),
    z.literal(500),
    z.literal(503),
  ]),
  retryable: z.boolean(),
  timestamp: z.string().datetime({ offset: true }),
  details: z.record(z.unknown()),
});
