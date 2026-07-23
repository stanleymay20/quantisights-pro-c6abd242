import {
  AGENT_GATEWAY_SCHEMA_VERSION,
  AGENT_GATEWAY_VERSION,
  type AgentGatewayRequest,
  validateAgentGatewayRequest,
} from "@/lib/agent-gateway";
import {
  GATEWAY_ACKNOWLEDGEMENT_SCHEMA_VERSION,
  RUNTIME_GATEWAY_VERSION,
  type EventEmitterAdapter,
  type GatewayAcknowledgement,
  type QueueAdapter,
  type RuntimeAuditEvent,
  type RuntimeEvent,
  type RuntimeGatewayResult,
  type RuntimeHealthStatus,
  type RuntimePersistenceAdapter,
  type RuntimeQueueMessage,
  type RuntimeRejectionCode,
  type RuntimeState,
  type RuntimeValidationResult,
  type SigningAdapter,
} from "@/lib/runtime-types";

export interface RuntimeGatewayConfig {
  queue: QueueAdapter;
  persistence: RuntimePersistenceAdapter;
  signing: SigningAdapter;
  events: EventEmitterAdapter;
  now?: () => string;
  max_request_bytes?: number;
  validateTenant(input: { tenant_id: string }): Promise<{ valid: boolean; reason?: string }> | { valid: boolean; reason?: string };
  validateOrganization(input: {
    tenant_id: string;
    organization_id: string;
  }): Promise<{ valid: boolean; reason?: string }> | { valid: boolean; reason?: string };
}

export interface RuntimeGateway {
  submitGatewayRequest(rawRequest: unknown): Promise<RuntimeGatewayResult>;
  validateRuntimeRequest(rawRequest: unknown): RuntimeValidationResult;
  healthCheck(): RuntimeHealthStatus;
}

const DEFAULT_MAX_REQUEST_BYTES = 16_384;

export function createRuntimeGateway(config: RuntimeGatewayConfig): RuntimeGateway {
  const startedAt = Date.now();
  const now = () => config.now?.() ?? new Date().toISOString();
  return {
    submitGatewayRequest: (rawRequest) => submitWithConfig(rawRequest, config, now),
    validateRuntimeRequest: (rawRequest) => validateRuntimeRequest(rawRequest, {
      max_request_bytes: config.max_request_bytes,
      received_at: now(),
    }),
    healthCheck: () => buildHealth(config, startedAt),
  };
}

export function validateRuntimeRequest(
  rawRequest: unknown,
  options: { max_request_bytes?: number; received_at?: string } = {},
): RuntimeValidationResult {
  const receivedAt = options.received_at ?? new Date().toISOString();
  const sizeBytes = byteSize(rawRequest);
  const maxBytes = options.max_request_bytes ?? DEFAULT_MAX_REQUEST_BYTES;
  const parsed = validateAgentGatewayRequest(rawRequest);
  const request = parsed.data ?? null;
  const requestHash = request ? runtimeRequestHash(request) : stableHash(rawRequest);
  const correlationId = deriveCorrelationId(request, requestHash);
  const errors: string[] = [];

  if (sizeBytes > maxBytes) {
    errors.push(`request size ${sizeBytes} exceeds maximum ${maxBytes}`);
  }
  if (!parsed.success) {
    errors.push(`schema validation failed: ${parsed.errors.join("; ")}`);
  }
  const metadataVersion = request?.metadata?.agent_gateway_schema_version;
  if (metadataVersion !== undefined && metadataVersion !== AGENT_GATEWAY_SCHEMA_VERSION) {
    errors.push(`request version ${String(metadataVersion)} does not match ${AGENT_GATEWAY_SCHEMA_VERSION}`);
  }

  return {
    success: errors.length === 0 && request !== null,
    request,
    errors,
    request_hash: requestHash,
    correlation_id: correlationId,
    received_at: receivedAt,
    size_bytes: sizeBytes,
  };
}

export async function submitGatewayRequest(
  gateway: RuntimeGateway,
  rawRequest: unknown,
): Promise<RuntimeGatewayResult> {
  return gateway.submitGatewayRequest(rawRequest);
}

export function healthCheck(gateway: RuntimeGateway): RuntimeHealthStatus {
  return gateway.healthCheck();
}

async function submitWithConfig(
  rawRequest: unknown,
  config: RuntimeGatewayConfig,
  now: () => string,
): Promise<RuntimeGatewayResult> {
  const validation = validateRuntimeRequest(rawRequest, {
    max_request_bytes: config.max_request_bytes,
    received_at: now(),
  });
  await emitAndAudit(config, validation, "gateway.request.received", "RECEIVED", {
    size_bytes: validation.size_bytes,
  });

  if (!validation.success || !validation.request) {
    await emitAndAudit(config, validation, "gateway.request.rejected", "REJECTED", {
      errors: validation.errors,
    });
    return rejected(validation, "SCHEMA_VALIDATION_FAILED", validation.errors);
  }

  if (validation.errors.some((error) => error.includes("size"))) {
    await emitAndAudit(config, validation, "gateway.request.rejected", "REJECTED", { errors: validation.errors });
    return rejected(validation, "REQUEST_TOO_LARGE", validation.errors);
  }
  if (validation.errors.some((error) => error.includes("version"))) {
    await emitAndAudit(config, validation, "gateway.request.rejected", "REJECTED", { errors: validation.errors });
    return rejected(validation, "VERSION_VALIDATION_FAILED", validation.errors);
  }

  const tenant = await config.validateTenant({ tenant_id: validation.request.tenant_id });
  if (!tenant.valid) {
    const errors = [`tenant validation failed${tenant.reason ? `: ${tenant.reason}` : ""}`];
    await emitAndAudit(config, validation, "gateway.request.rejected", "REJECTED", { errors });
    return rejected(validation, "TENANT_VALIDATION_FAILED", errors);
  }

  const organization = await config.validateOrganization({
    tenant_id: validation.request.tenant_id,
    organization_id: validation.request.organization_id,
  });
  if (!organization.valid) {
    const errors = [`organization validation failed${organization.reason ? `: ${organization.reason}` : ""}`];
    await emitAndAudit(config, validation, "gateway.request.rejected", "REJECTED", { errors });
    return rejected(validation, "ORGANIZATION_VALIDATION_FAILED", errors);
  }

  if (config.persistence.hasIdempotencyKey(validation.request.idempotency_key)) {
    const errors = [`duplicate idempotency key ${validation.request.idempotency_key}`];
    await emitAndAudit(config, validation, "gateway.request.rejected", "REJECTED", { errors });
    return rejected(validation, "DUPLICATE_IDEMPOTENCY_KEY", errors);
  }

  if (config.persistence.hasRequestHash(validation.request_hash)) {
    const errors = [`replayed request hash ${validation.request_hash}`];
    await emitAndAudit(config, validation, "gateway.request.rejected", "REJECTED", { errors });
    return rejected(validation, "REPLAYED_REQUEST_HASH", errors);
  }

  await emitAndAudit(config, validation, "gateway.request.validated", "VALIDATED", {});
  await config.persistence.storeRequest({
    correlation_id: validation.correlation_id,
    request_hash: validation.request_hash,
    idempotency_key: validation.request.idempotency_key,
    request: validation.request,
    state: "VALIDATED",
    received_at: validation.received_at,
  });

  const message: RuntimeQueueMessage = {
    message_id: deriveMessageId(validation.correlation_id, validation.request_hash),
    correlation_id: validation.correlation_id,
    request_hash: validation.request_hash,
    idempotency_key: validation.request.idempotency_key,
    tenant_id: validation.request.tenant_id,
    organization_id: validation.request.organization_id,
    request: validation.request,
    state: "QUEUED",
    enqueued_at: validation.received_at,
    attempts: 0,
  };

  try {
    await config.queue.enqueue(message);
    await config.persistence.markQueued(validation.correlation_id);
    await emitAndAudit(config, validation, "gateway.request.queued", "QUEUED", {
      message_id: message.message_id,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await config.persistence.markDeadLetter(validation.correlation_id, reason);
    await emitAndAudit(config, validation, "gateway.request.failed", "FAILED", { reason });
    await emitAndAudit(config, validation, "gateway.request.deadletter", "DEAD_LETTER", { reason });
    return {
      status: "DEAD_LETTER",
      acknowledgement: null,
      rejection_code: "ADAPTER_FAILURE",
      errors: [reason],
      correlation_id: validation.correlation_id,
      request_hash: validation.request_hash,
      signature_verified: false,
    };
  }

  const acknowledgementWithoutSignature: Omit<GatewayAcknowledgement, "signature"> = {
    acknowledgement_id: deriveAcknowledgementId(validation.correlation_id, validation.request_hash),
    correlation_id: validation.correlation_id,
    request_hash: validation.request_hash,
    gateway_version: AGENT_GATEWAY_VERSION,
    received_at: validation.received_at,
    status: "ACKNOWLEDGED",
    tenant_id: validation.request.tenant_id,
    organization_id: validation.request.organization_id,
    schema_version: GATEWAY_ACKNOWLEDGEMENT_SCHEMA_VERSION,
    runtime_version: RUNTIME_GATEWAY_VERSION,
    signature_key_id: config.signing.key_id,
    estimated_processing: "queued_for_downstream_processing",
  };
  const acknowledgement: GatewayAcknowledgement = {
    ...acknowledgementWithoutSignature,
    signature: await config.signing.signAcknowledgement(acknowledgementWithoutSignature),
  };
  await config.persistence.storeAcknowledgement(acknowledgement);
  await emitAndAudit(config, validation, "gateway.request.acknowledged", "ACKNOWLEDGED", {
    acknowledgement_id: acknowledgement.acknowledgement_id,
  });

  return {
    status: "ACKNOWLEDGED",
    acknowledgement,
    rejection_code: null,
    errors: [],
    correlation_id: validation.correlation_id,
    request_hash: validation.request_hash,
    signature_verified: await config.signing.verifyAcknowledgement(acknowledgement),
  };
}

function rejected(
  validation: RuntimeValidationResult,
  code: RuntimeRejectionCode,
  errors: string[],
): RuntimeGatewayResult {
  return {
    status: "REJECTED",
    acknowledgement: null,
    rejection_code: code,
    errors,
    correlation_id: validation.correlation_id,
    request_hash: validation.request_hash,
    signature_verified: false,
  };
}

async function emitAndAudit(
  config: RuntimeGatewayConfig,
  validation: RuntimeValidationResult,
  eventType: RuntimeEvent["event_type"],
  state: RuntimeState,
  payload: Record<string, unknown>,
): Promise<void> {
  const event: RuntimeEvent = {
    event_type: eventType,
    correlation_id: validation.correlation_id,
    request_hash: validation.request_hash,
    occurred_at: validation.received_at,
    state,
    payload,
  };
  await config.events.emit(event);
  const request = validation.request;
  const audit: RuntimeAuditEvent = {
    audit_id: `audit-${stableHash({ eventType, correlationId: validation.correlation_id, state }).replace("fnv1a-", "")}`,
    event_type: eventType,
    correlation_id: validation.correlation_id,
    request_hash: validation.request_hash,
    idempotency_key: request?.idempotency_key ?? null,
    tenant_id: request?.tenant_id ?? "unknown",
    organization_id: request?.organization_id ?? "unknown",
    state,
    occurred_at: validation.received_at,
    payload,
  };
  await config.persistence.storeAudit(audit);
}

function buildHealth(config: RuntimeGatewayConfig, startedAt: number): RuntimeHealthStatus {
  const queueAvailable = safeAvailable(() => config.queue.available());
  const persistenceAvailable = safeAvailable(() => config.persistence.available());
  const signingAvailable = safeAvailable(() => config.signing.available());
  const eventsAvailable = safeAvailable(() => config.events.available());
  const depth = safeDepth(config.queue);
  return {
    runtime_version: RUNTIME_GATEWAY_VERSION,
    gateway_version: AGENT_GATEWAY_VERSION,
    queue: {
      available: queueAvailable,
      depth,
    },
    adapters: {
      queue: queueAvailable,
      persistence: persistenceAvailable,
      signing: signingAvailable,
      events: eventsAvailable,
    },
    uptime_ms: Math.max(0, Date.now() - startedAt),
    ready: queueAvailable && persistenceAvailable && signingAvailable && eventsAvailable,
    alive: true,
  };
}

export class InMemoryRuntimeQueueAdapter implements QueueAdapter {
  public readonly messages: RuntimeQueueMessage[] = [];
  public readonly deadLetters: Array<{ message_id: string; reason: string }> = [];

  enqueue(message: RuntimeQueueMessage): void {
    this.messages.push(message);
  }

  peek(): RuntimeQueueMessage | null {
    return this.messages[0] ?? null;
  }

  ack(message_id: string): void {
    const index = this.messages.findIndex((message) => message.message_id === message_id);
    if (index >= 0) this.messages.splice(index, 1);
  }

  retry(message_id: string): void {
    const message = this.messages.find((entry) => entry.message_id === message_id);
    if (message) {
      message.attempts += 1;
      message.state = "RETRYING";
    }
  }

  deadLetter(message_id: string, reason: string): void {
    this.deadLetters.push({ message_id, reason });
  }

  depth(): number {
    return this.messages.length;
  }

  available(): boolean {
    return true;
  }
}

export class InMemoryRuntimePersistenceAdapter implements RuntimePersistenceAdapter {
  public readonly requests: Array<Parameters<RuntimePersistenceAdapter["storeRequest"]>[0]> = [];
  public readonly acknowledgements: GatewayAcknowledgement[] = [];
  public readonly auditEvents: RuntimeAuditEvent[] = [];
  public readonly deadLetters: Array<{ correlation_id: string; reason: string }> = [];

  storeRequest(record: Parameters<RuntimePersistenceAdapter["storeRequest"]>[0]): void {
    this.requests.push(record);
  }

  storeAcknowledgement(acknowledgement: GatewayAcknowledgement): void {
    this.acknowledgements.push(acknowledgement);
  }

  storeAudit(event: RuntimeAuditEvent): void {
    this.auditEvents.push(Object.freeze({ ...event, payload: Object.freeze({ ...event.payload }) }));
  }

  markQueued(correlation_id: string): void {
    const request = this.requests.find((record) => record.correlation_id === correlation_id);
    if (request) request.state = "QUEUED";
  }

  markDeadLetter(correlation_id: string, reason: string): void {
    this.deadLetters.push({ correlation_id, reason });
  }

  hasIdempotencyKey(idempotency_key: string): boolean {
    return this.requests.some((record) => record.idempotency_key === idempotency_key);
  }

  hasRequestHash(request_hash: string): boolean {
    return this.requests.some((record) => record.request_hash === request_hash);
  }

  available(): boolean {
    return true;
  }
}

export class MockSigningAdapter implements SigningAdapter {
  constructor(public readonly key_id: string = "mock-runtime-key") {}

  signAcknowledgement(acknowledgement: Omit<GatewayAcknowledgement, "signature">): string {
    return `mock-signature-${stableHash({ key_id: this.key_id, acknowledgement }).replace("fnv1a-", "")}`;
  }

  verifyAcknowledgement(acknowledgement: GatewayAcknowledgement): boolean {
    const { signature: _signature, ...withoutSignature } = acknowledgement;
    return acknowledgement.signature === this.signAcknowledgement(withoutSignature);
  }

  available(): boolean {
    return true;
  }
}

export class MockRuntimeEventEmitterAdapter implements EventEmitterAdapter {
  public readonly events: RuntimeEvent[] = [];

  emit(event: RuntimeEvent): void {
    this.events.push(event);
  }

  available(): boolean {
    return true;
  }
}

function runtimeRequestHash(request: AgentGatewayRequest): string {
  const { idempotency_key: _idempotencyKey, ...requestWithoutIdempotencyKey } = request;
  return stableHash(requestWithoutIdempotencyKey);
}

function deriveCorrelationId(request: AgentGatewayRequest | null, requestHash: string): string {
  return `qv-corr-${stableHash({
    tenant_id: request?.tenant_id ?? "unknown",
    organization_id: request?.organization_id ?? "unknown",
    agent_id: request?.agent_id ?? "unknown",
    request_hash: requestHash,
  }).replace("fnv1a-", "")}`;
}

function deriveMessageId(correlationId: string, requestHash: string): string {
  return `qv-msg-${stableHash({ correlationId, requestHash }).replace("fnv1a-", "")}`;
}

function deriveAcknowledgementId(correlationId: string, requestHash: string): string {
  return `qv-ack-${stableHash({ correlationId, requestHash }).replace("fnv1a-", "")}`;
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

function safeDepth(queue: QueueAdapter): number {
  try {
    return queue.depth();
  } catch {
    return 0;
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
