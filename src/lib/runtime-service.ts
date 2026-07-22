import {
  AGENT_GATEWAY_SCHEMA_VERSION,
  AGENT_GATEWAY_VERSION,
  type AgentGatewayRequest,
  validateAgentGatewayRequest,
} from "@/lib/agent-gateway";
import {
  RUNTIME_GATEWAY_VERSION,
  type GatewayAcknowledgement,
  type RuntimeGatewayResult,
} from "@/lib/runtime-types";
import {
  DEFAULT_RUNTIME_BUILD_METADATA,
  DEFAULT_RUNTIME_PAYLOAD_LIMITS,
  DEFAULT_RUNTIME_TIMEOUT_POLICY,
  RUNTIME_SERVICE_SCHEMA_VERSION,
  RUNTIME_SERVICE_VERSION,
  type RuntimeBuildMetadata,
  type RuntimeError,
  type RuntimeErrorCode,
  type RuntimeErrorInput,
  type RuntimePayloadLimits,
  type RuntimeReadinessStatus,
  type RuntimeService,
  type RuntimeServiceConfig,
  type RuntimeServiceHealth,
  type RuntimeServiceResponse,
  type RuntimeStatusCode,
  type RuntimeTimeoutPolicy,
} from "@/lib/runtime-service-types";

export type {
  RuntimeBuildMetadata,
  RuntimeError,
  RuntimeErrorCode,
  RuntimePayloadLimits,
  RuntimeReadinessStatus,
  RuntimeService,
  RuntimeServiceConfig,
  RuntimeServiceHealth,
  RuntimeServiceResponse,
  RuntimeStatusCode,
  RuntimeTimeoutPolicy,
} from "@/lib/runtime-service-types";

export function createRuntimeService(config: RuntimeServiceConfig): RuntimeService {
  const startedAt = Date.now();
  const now = () => config.now?.() ?? new Date().toISOString();
  const limits: RuntimePayloadLimits = {
    ...DEFAULT_RUNTIME_PAYLOAD_LIMITS,
    ...config.limits,
  };
  const timeouts: RuntimeTimeoutPolicy = {
    ...DEFAULT_RUNTIME_TIMEOUT_POLICY,
    ...config.timeouts,
  };
  const build: RuntimeBuildMetadata = {
    ...DEFAULT_RUNTIME_BUILD_METADATA,
    ...config.build,
  };

  return {
    handleRuntimeRequest: (request) => handleWithConfig(request, config, limits, now),
    health: () => healthFromConfig(config, limits, timeouts, build, startedAt),
    readiness: () => readinessFromConfig(config),
  };
}

export async function handleRuntimeRequest(
  service: RuntimeService,
  request: unknown,
): Promise<RuntimeServiceResponse> {
  return service.handleRuntimeRequest(request);
}

export function health(service: RuntimeService): RuntimeServiceHealth {
  return service.health();
}

export function readiness(service: RuntimeService): RuntimeReadinessStatus {
  return service.readiness();
}

export function serializeGatewayRequest(request: AgentGatewayRequest): string {
  return stableStringify(request);
}

export function deserializeGatewayRequest(serialized: string): AgentGatewayRequest {
  const parsed = JSON.parse(serialized) as unknown;
  const validation = validateAgentGatewayRequest(parsed);
  if (!validation.success || !validation.data) {
    throw new Error(`Invalid serialized AgentGatewayRequest: ${validation.errors.join("; ")}`);
  }
  return validation.data;
}

export function serializeAcknowledgement(acknowledgement: GatewayAcknowledgement): string {
  return stableStringify(acknowledgement);
}

export function createRuntimeError(input: RuntimeErrorInput): RuntimeError {
  const statusCode = mapRuntimeErrorToStatus(input.error_code);
  return {
    error_code: input.error_code,
    error_message: input.error_message,
    correlation_id: input.correlation_id ?? "unknown",
    status_code: statusCode,
    retryable: isRetryable(input.error_code),
    timestamp: input.timestamp ?? new Date().toISOString(),
    details: input.details ?? {},
  };
}

export function mapRuntimeErrorToStatus(code: RuntimeErrorCode): RuntimeStatusCode {
  switch (code) {
    case "BAD_REQUEST":
    case "UNSUPPORTED_VERSION":
      return 400;
    case "TENANT_NOT_FOUND":
    case "ORGANIZATION_NOT_FOUND":
      return 404;
    case "DUPLICATE_REQUEST":
      return 409;
    case "REPLAY_DETECTED":
      return 410;
    case "PAYLOAD_TOO_LARGE":
      return 413;
    case "INVALID_SCHEMA":
      return 422;
    case "QUEUE_UNAVAILABLE":
    case "SIGNING_FAILED":
      return 503;
    case "INTERNAL_ERROR":
    default:
      return 500;
  }
}

async function handleWithConfig(
  rawRequest: unknown,
  config: RuntimeServiceConfig,
  limits: RuntimePayloadLimits,
  now: () => string,
): Promise<RuntimeServiceResponse> {
  const serviceValidation = validateServiceBoundary(rawRequest, limits, now);
  if (serviceValidation) return serviceValidation;

  try {
    const gatewayResult = await config.gateway.submitGatewayRequest(rawRequest);
    if (gatewayResult.acknowledgement && gatewayResult.status === "ACKNOWLEDGED") {
      return {
        ok: true,
        status_code: 200,
        acknowledgement: gatewayResult.acknowledgement,
        correlation_id: gatewayResult.correlation_id,
        request_hash: gatewayResult.request_hash,
      };
    }
    return gatewayFailureToServiceError(gatewayResult, now());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code: RuntimeErrorCode = message.toLowerCase().includes("sign")
      ? "SIGNING_FAILED"
      : "INTERNAL_ERROR";
    const runtimeError = createRuntimeError({
      error_code: code,
      error_message: message,
      timestamp: now(),
      details: { cause: message },
    });
    return {
      ok: false,
      status_code: runtimeError.status_code,
      error: runtimeError,
      correlation_id: runtimeError.correlation_id,
      request_hash: null,
    };
  }
}

function validateServiceBoundary(
  rawRequest: unknown,
  limits: RuntimePayloadLimits,
  now: () => string,
): RuntimeServiceResponse | null {
  const payloadBytes = byteSize(rawRequest);
  const parsed = validateAgentGatewayRequest(rawRequest);
  const request = parsed.data ?? null;
  const requestHash = request ? stableHash(withoutIdempotencyKey(request)) : stableHash(rawRequest);
  const correlationId = deriveServiceCorrelationId(request, requestHash);

  if (payloadBytes > limits.max_payload_bytes) {
    return errorResponse("PAYLOAD_TOO_LARGE", `Payload size ${payloadBytes} exceeds ${limits.max_payload_bytes}.`, {
      correlation_id: correlationId,
      request_hash: requestHash,
      timestamp: now(),
      details: { payload_bytes: payloadBytes, max_payload_bytes: limits.max_payload_bytes },
    });
  }

  if (!parsed.success || !request) {
    return errorResponse("INVALID_SCHEMA", `Invalid AgentGatewayRequest schema: ${parsed.errors.join("; ")}`, {
      correlation_id: correlationId,
      request_hash: requestHash,
      timestamp: now(),
      details: { errors: parsed.errors },
    });
  }

  const versionError = validateVersions(request);
  if (versionError) {
    return errorResponse("UNSUPPORTED_VERSION", versionError, {
      correlation_id: correlationId,
      request_hash: requestHash,
      timestamp: now(),
      details: {
        supported_runtime_version: RUNTIME_GATEWAY_VERSION,
        supported_gateway_version: AGENT_GATEWAY_VERSION,
        supported_schema_version: AGENT_GATEWAY_SCHEMA_VERSION,
      },
    });
  }

  const evidenceCount = request.evidence_references.length;
  if (evidenceCount > limits.max_evidence_references) {
    return errorResponse("BAD_REQUEST", `Evidence reference count ${evidenceCount} exceeds ${limits.max_evidence_references}.`, {
      correlation_id: correlationId,
      request_hash: requestHash,
      timestamp: now(),
      details: { evidence_count: evidenceCount, max_evidence_references: limits.max_evidence_references },
    });
  }

  const metadataBytes = byteSize(request.metadata);
  if (metadataBytes > limits.max_metadata_bytes) {
    return errorResponse("BAD_REQUEST", `Metadata size ${metadataBytes} exceeds ${limits.max_metadata_bytes}.`, {
      correlation_id: correlationId,
      request_hash: requestHash,
      timestamp: now(),
      details: { metadata_bytes: metadataBytes, max_metadata_bytes: limits.max_metadata_bytes },
    });
  }

  const justificationLength = request.justification.length;
  if (justificationLength > limits.max_justification_length) {
    return errorResponse(
      "BAD_REQUEST",
      `Justification length ${justificationLength} exceeds ${limits.max_justification_length}.`,
      {
        correlation_id: correlationId,
        request_hash: requestHash,
        timestamp: now(),
        details: {
          justification_length: justificationLength,
          max_justification_length: limits.max_justification_length,
        },
      },
    );
  }

  return null;
}

function validateVersions(request: AgentGatewayRequest): string | null {
  const metadata = request.metadata;
  const runtimeVersion = metadata.runtime_version;
  const gatewayVersion = metadata.gateway_version;
  const schemaVersion = metadata.schema_version ?? metadata.agent_gateway_schema_version;

  if (runtimeVersion !== undefined && runtimeVersion !== RUNTIME_GATEWAY_VERSION) {
    return `Unsupported runtime_version ${String(runtimeVersion)}.`;
  }
  if (gatewayVersion !== undefined && gatewayVersion !== AGENT_GATEWAY_VERSION) {
    return `Unsupported gateway_version ${String(gatewayVersion)}.`;
  }
  if (schemaVersion !== undefined && schemaVersion !== AGENT_GATEWAY_SCHEMA_VERSION) {
    return `Unsupported schema_version ${String(schemaVersion)}.`;
  }
  return null;
}

function gatewayFailureToServiceError(result: RuntimeGatewayResult, timestamp: string): RuntimeServiceResponse {
  const code = mapGatewayFailure(result);
  const runtimeError = createRuntimeError({
    error_code: code,
    error_message: result.errors.join("; ") || code,
    correlation_id: result.correlation_id,
    timestamp,
    details: {
      gateway_status: result.status,
      gateway_rejection_code: result.rejection_code,
      errors: result.errors,
    },
  });
  return {
    ok: false,
    status_code: runtimeError.status_code,
    error: runtimeError,
    correlation_id: result.correlation_id,
    request_hash: result.request_hash,
  };
}

function mapGatewayFailure(result: RuntimeGatewayResult): RuntimeErrorCode {
  switch (result.rejection_code) {
    case "REQUEST_TOO_LARGE":
      return "PAYLOAD_TOO_LARGE";
    case "VERSION_VALIDATION_FAILED":
      return "UNSUPPORTED_VERSION";
    case "TENANT_VALIDATION_FAILED":
      return "TENANT_NOT_FOUND";
    case "ORGANIZATION_VALIDATION_FAILED":
      return "ORGANIZATION_NOT_FOUND";
    case "DUPLICATE_IDEMPOTENCY_KEY":
      return "DUPLICATE_REQUEST";
    case "REPLAYED_REQUEST_HASH":
      return "REPLAY_DETECTED";
    case "ADAPTER_FAILURE":
      return "QUEUE_UNAVAILABLE";
    case "SCHEMA_VALIDATION_FAILED":
      return "INVALID_SCHEMA";
    default:
      return "INTERNAL_ERROR";
  }
}

function errorResponse(
  code: RuntimeErrorCode,
  message: string,
  input: {
    correlation_id: string;
    request_hash: string | null;
    timestamp: string;
    details?: Record<string, unknown>;
  },
): RuntimeServiceResponse {
  const runtimeError = createRuntimeError({
    error_code: code,
    error_message: message,
    correlation_id: input.correlation_id,
    timestamp: input.timestamp,
    details: input.details,
  });
  return {
    ok: false,
    status_code: runtimeError.status_code,
    error: runtimeError,
    correlation_id: runtimeError.correlation_id,
    request_hash: input.request_hash,
  };
}

function healthFromConfig(
  config: RuntimeServiceConfig,
  limits: RuntimePayloadLimits,
  timeouts: RuntimeTimeoutPolicy,
  build: RuntimeBuildMetadata,
  startedAt: number,
): RuntimeServiceHealth {
  const adapterHealth = readinessFromConfig(config);
  return {
    runtime_service_version: RUNTIME_SERVICE_VERSION,
    runtime_version: RUNTIME_GATEWAY_VERSION,
    gateway_version: AGENT_GATEWAY_VERSION,
    service_schema_version: RUNTIME_SERVICE_SCHEMA_VERSION,
    supported_schema_versions: [AGENT_GATEWAY_SCHEMA_VERSION],
    supported_gateway_versions: [AGENT_GATEWAY_VERSION],
    supported_runtime_versions: [RUNTIME_GATEWAY_VERSION],
    adapter_health: adapterHealth,
    uptime_ms: Math.max(0, Date.now() - startedAt),
    ready: adapterHealth.overall_ready,
    alive: true,
    build,
    limits,
    timeout_policy: timeouts,
  };
}

function readinessFromConfig(config: RuntimeServiceConfig): RuntimeReadinessStatus {
  const queueReady = safeAvailable(() => config.queue.available());
  const persistenceReady = safeAvailable(() => config.persistence.available());
  const signingReady = safeAvailable(() => config.signing.available());
  const eventEmitterReady = safeAvailable(() => config.events.available());
  return {
    queue_ready: queueReady,
    persistence_ready: persistenceReady,
    signing_ready: signingReady,
    event_emitter_ready: eventEmitterReady,
    overall_ready: queueReady && persistenceReady && signingReady && eventEmitterReady,
  };
}

function isRetryable(code: RuntimeErrorCode): boolean {
  return code === "QUEUE_UNAVAILABLE" || code === "SIGNING_FAILED" || code === "INTERNAL_ERROR";
}

function deriveServiceCorrelationId(request: AgentGatewayRequest | null, requestHash: string): string {
  return `qv-corr-${stableHash({
    tenant_id: request?.tenant_id ?? "unknown",
    organization_id: request?.organization_id ?? "unknown",
    agent_id: request?.agent_id ?? "unknown",
    request_hash: requestHash,
  }).replace("fnv1a-", "")}`;
}

function withoutIdempotencyKey(request: AgentGatewayRequest): Omit<AgentGatewayRequest, "idempotency_key"> {
  const { idempotency_key: _idempotencyKey, ...withoutKey } = request;
  return withoutKey;
}

function byteSize(value: unknown): number {
  return new TextEncoder().encode(stableStringify(value)).length;
}

function safeAvailable(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}

function stableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
