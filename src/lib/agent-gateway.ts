import { z } from "zod";

export const AGENT_GATEWAY_SCHEMA_VERSION = "quantivis.decision-record.v1";
export const AGENT_GATEWAY_VERSION = "ag-2.0.0";

export type DecisionClass = "Class C" | "Class B" | "Class A";
export type GatewayDecisionStatus = "APPROVED" | "REQUIRES_APPROVAL" | "REJECTED";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type EvidenceIntegrity = "verified" | "unverified" | "failed";

const BusinessImpactSchema = z.object({
  amount: z.number().finite().optional(),
  currency: z.string().min(3).max(8).optional(),
  description: z.string().min(1),
});

const AgentGatewayRequestSchema = z.object({
  agent_id: z.string().min(1),
  tenant_id: z.string().min(1),
  organization_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  decision_type: z.string().min(1),
  requested_action: z.string().min(1),
  evidence_references: z.array(z.string().min(1)).default([]),
  confidence: z.number().min(0).max(100),
  business_impact: BusinessImpactSchema,
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  justification: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});

export type AgentGatewayRequest = z.infer<typeof AgentGatewayRequestSchema>;

export interface AgentModelReference {
  provider?: string;
  name?: string;
  version?: string;
}

export interface GatewayEvidence {
  id: string;
  uri: string;
  hash: string;
  integrity: EvidenceIntegrity;
  summary?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyDecision {
  allowed: boolean;
  policy_id: string;
  policy_version: string;
  reasons: string[];
  required_approvers: string[];
}

export interface CertificationReference {
  framework: string;
  gate?: string;
  pipeline?: string;
  deployment_verification?: string;
  artifact?: string;
}

export interface ChallengeRecord {
  strongest_argument_against: string;
  missing_evidence: string[];
  contradictory_evidence: string[];
  regulatory_concerns: string[];
}

export interface DecisionRecord {
  decision_id: string;
  decision_version: typeof AGENT_GATEWAY_SCHEMA_VERSION;
  gateway: {
    version: typeof AGENT_GATEWAY_VERSION;
  };
  record_hash: string;
  tenant: { tenant_id: string };
  organization: { organization_id: string };
  agent: { agent_id: string };
  model: AgentModelReference | null;
  decision_class: DecisionClass;
  recommendation: {
    decision_type: string;
    requested_action: string;
    justification: string;
    business_impact: AgentGatewayRequest["business_impact"];
  };
  evidence: GatewayEvidence[];
  confidence: {
    score: number;
    source: "agent_submitted";
  };
  risk: {
    level: RiskLevel;
  };
  approvals: {
    required_approvers: string[];
    policy_id: string;
    policy_version: string;
    approval_state: GatewayDecisionStatus;
  };
  challenge: ChallengeRecord | null;
  audit: {
    audit_event_id: string | null;
    request_hash: string;
  };
  timestamps: {
    requested_at: string;
    decided_at: string;
    expires_at: string;
  };
  status: GatewayDecisionStatus;
  outcome_reference: string | null;
  certification_reference: CertificationReference | null;
  metadata: Record<string, unknown>;
}

export interface DecisionTokenPayload {
  decision_id: string;
  hash: string;
  approval_state: GatewayDecisionStatus;
  expiry: string;
  required_approvers: string[];
  signing_key_id: string;
}

export interface SignedDecisionToken extends DecisionTokenPayload {
  token: string;
}

export interface AgentGatewayAuditEvent {
  organization_id: string;
  actor_id: string | null;
  action_type: "agent_gateway.received" | "agent_gateway.decision_recorded" | "agent_gateway.rejected";
  resource_type: "agent_gateway";
  resource_id: string;
  payload: Record<string, unknown>;
}

export interface AgentGatewayDependencies {
  validateTenant(input: { tenant_id: string }): Promise<{ valid: boolean; reason?: string }>;
  validateOrganization(input: { tenant_id: string; organization_id: string }): Promise<{ valid: boolean; reason?: string }>;
  assembleEvidence(references: string[], request: AgentGatewayRequest): Promise<GatewayEvidence[]>;
  evaluatePolicy(input: {
    request: AgentGatewayRequest;
    decision_class: DecisionClass;
    evidence: GatewayEvidence[];
  }): Promise<PolicyDecision>;
  persistDecisionRecord(record: DecisionRecord): Promise<{ decision_id: string }>;
  writeAuditEvent(event: AgentGatewayAuditEvent): Promise<{ audit_id: string }>;
  signDecisionToken(payload: DecisionTokenPayload): Promise<string>;
  signing_key_id: string;
  verifyReplayProtection?(input: {
    idempotency_key: string;
    request_hash: string;
    tenant_id: string;
    organization_id: string;
    agent_id: string;
    now: string;
  }): Promise<{ accepted: boolean; reason?: "duplicate_idempotency_key" | "replayed_request" | string }>;
  getCertificationReference?(input: {
    request: AgentGatewayRequest;
    decision_class: DecisionClass;
  }): Promise<CertificationReference | null>;
  now?(): string;
  generateId?(prefix: string): string;
}

export interface AgentGatewayResult {
  status: GatewayDecisionStatus;
  decision_record: DecisionRecord | null;
  decision_token: SignedDecisionToken | null;
  failures: string[];
}

export function validateAgentGatewayRequest(input: unknown): {
  success: boolean;
  data?: AgentGatewayRequest;
  errors: string[];
} {
  const parsed = AgentGatewayRequestSchema.safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data, errors: [] };
  return {
    success: false,
    errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`),
  };
}

export function isDecisionTokenExpired(
  token: Pick<DecisionTokenPayload, "expiry">,
  now: string = new Date().toISOString(),
): boolean {
  return new Date(token.expiry).getTime() <= new Date(now).getTime();
}

export function classifyAgentDecision(input: { risk_level: RiskLevel; amount?: number | null }): DecisionClass {
  if (input.risk_level === "critical") return "Class A";
  if ((input.amount ?? 0) >= 500_000) return "Class A";
  if (input.risk_level === "high") return "Class A";
  if (input.risk_level === "medium" || (input.amount ?? 0) >= 50_000) return "Class B";
  return "Class C";
}

export async function processAgentGatewayRequest(
  rawRequest: unknown,
  deps: AgentGatewayDependencies,
): Promise<AgentGatewayResult> {
  const parsed = validateAgentGatewayRequest(rawRequest);
  if (!parsed.success || !parsed.data) {
    const fallback = rawRequest as Partial<AgentGatewayRequest> | null;
    await safeAudit(deps, {
      organization_id: fallback?.organization_id ?? "unknown",
      actor_id: fallback?.agent_id ?? null,
      action_type: "agent_gateway.rejected",
      resource_type: "agent_gateway",
      resource_id: "invalid_request",
      payload: { failures: ["schema_validation_failed"], errors: parsed.errors },
    });
    return { status: "REJECTED", decision_record: null, decision_token: null, failures: ["schema_validation_failed"] };
  }

  const request = parsed.data;
  await safeAudit(deps, {
    organization_id: request.organization_id,
    actor_id: request.agent_id,
    action_type: "agent_gateway.received",
    resource_type: "agent_gateway",
    resource_id: request.agent_id,
    payload: { tenant_id: request.tenant_id, decision_type: request.decision_type },
  });

  const tenant = await deps.validateTenant({ tenant_id: request.tenant_id });
  if (!tenant.valid) return reject(request, deps, "tenant_validation_failed", tenant.reason);

  const organization = await deps.validateOrganization({
    tenant_id: request.tenant_id,
    organization_id: request.organization_id,
  });
  if (!organization.valid) return reject(request, deps, "organization_validation_failed", organization.reason);

  const requestHash = stableHash({
    agent_id: request.agent_id,
    tenant_id: request.tenant_id,
    organization_id: request.organization_id,
    idempotency_key: request.idempotency_key,
    requested_action: request.requested_action,
    evidence_references: request.evidence_references,
  });
  const now = deps.now?.() ?? new Date().toISOString();
  const replay = await deps.verifyReplayProtection?.({
    idempotency_key: request.idempotency_key,
    request_hash: requestHash,
    tenant_id: request.tenant_id,
    organization_id: request.organization_id,
    agent_id: request.agent_id,
    now,
  });
  if (replay && !replay.accepted) {
    return reject(request, deps, replay.reason ?? "replayed_request");
  }

  const evidence = await deps.assembleEvidence(request.evidence_references, request);
  if (!evidence.every((item) => item.integrity === "verified")) {
    return reject(request, deps, "evidence_integrity_failed");
  }

  const decisionClass = classifyAgentDecision({
    risk_level: request.risk_level,
    amount: request.business_impact.amount,
  });
  const policy = await deps.evaluatePolicy({ request, decision_class: decisionClass, evidence });
  if (!policy.allowed) {
    return reject(request, deps, "policy_denied", policy.reasons.join("; "));
  }

  const status: GatewayDecisionStatus =
    decisionClass === "Class C" && policy.required_approvers.length === 0
      ? "APPROVED"
      : "REQUIRES_APPROVAL";

  const decisionId = deps.generateId?.("decision") ?? `decision_${Date.now()}`;
  const evidenceBoundRequestHash = stableHash({
    agent_id: request.agent_id,
    tenant_id: request.tenant_id,
    organization_id: request.organization_id,
    idempotency_key: request.idempotency_key,
    requested_action: request.requested_action,
    evidence_hashes: evidence.map((item) => item.hash),
  });
  const expiresAt = addHours(now, 24);
  const certificationReference = await deps.getCertificationReference?.({ request, decision_class: decisionClass }) ?? {
    framework: "quantivis-enterprise-certification",
    gate: "Decision Pipeline",
    pipeline: "decision-lifecycle",
    deployment_verification: "deployment-verification",
  };

  const record: DecisionRecord = {
    decision_id: decisionId,
    decision_version: AGENT_GATEWAY_SCHEMA_VERSION,
    gateway: {
      version: AGENT_GATEWAY_VERSION,
    },
    record_hash: "",
    tenant: { tenant_id: request.tenant_id },
    organization: { organization_id: request.organization_id },
    agent: { agent_id: request.agent_id },
    model: getModelReference(request.metadata),
    decision_class: decisionClass,
    recommendation: {
      decision_type: request.decision_type,
      requested_action: request.requested_action,
      justification: request.justification,
      business_impact: request.business_impact,
    },
    evidence,
    confidence: { score: request.confidence, source: "agent_submitted" },
    risk: { level: request.risk_level },
    approvals: {
      required_approvers: policy.required_approvers,
      policy_id: policy.policy_id,
      policy_version: policy.policy_version,
      approval_state: status,
    },
    challenge: decisionClass === "Class A" ? buildChallengeRecord(request, evidence) : null,
    audit: {
      audit_event_id: null,
      request_hash: evidenceBoundRequestHash,
    },
    timestamps: {
      requested_at: now,
      decided_at: now,
      expires_at: expiresAt,
    },
    status,
    outcome_reference: null,
    certification_reference: certificationReference,
    metadata: request.metadata,
  };

  const audit = await safeAudit(deps, {
    organization_id: request.organization_id,
    actor_id: request.agent_id,
    action_type: "agent_gateway.decision_recorded",
    resource_type: "agent_gateway",
    resource_id: decisionId,
    payload: {
      decision_id: decisionId,
      decision_class: decisionClass,
      approval_state: status,
      evidence_hashes: evidence.map((item) => item.hash),
      policy_id: policy.policy_id,
      policy_version: policy.policy_version,
    },
  });
  record.audit.audit_event_id = audit.audit_id;
  record.record_hash = buildDecisionRecordHash(record);
  await deps.persistDecisionRecord(record);

  const signingKeyId = resolveSigningKeyId(deps.signing_key_id);
  const tokenPayload: DecisionTokenPayload = {
    decision_id: decisionId,
    hash: record.record_hash,
    approval_state: status,
    expiry: expiresAt,
    required_approvers: policy.required_approvers,
    signing_key_id: signingKeyId,
  };
  const token = await deps.signDecisionToken(tokenPayload);

  return {
    status,
    decision_record: record,
    decision_token: { ...tokenPayload, token },
    failures: [],
  };
}

async function reject(
  request: AgentGatewayRequest,
  deps: AgentGatewayDependencies,
  code: string,
  detail?: string,
): Promise<AgentGatewayResult> {
  await safeAudit(deps, {
    organization_id: request.organization_id,
    actor_id: request.agent_id,
    action_type: "agent_gateway.rejected",
    resource_type: "agent_gateway",
    resource_id: request.agent_id,
    payload: { failures: [code], detail },
  });
  return { status: "REJECTED", decision_record: null, decision_token: null, failures: [code] };
}

async function safeAudit(deps: AgentGatewayDependencies, event: AgentGatewayAuditEvent): Promise<{ audit_id: string }> {
  return deps.writeAuditEvent(event);
}

function getModelReference(metadata: Record<string, unknown>): AgentModelReference | null {
  const model = metadata.model;
  if (!model || typeof model !== "object") return null;
  const record = model as Record<string, unknown>;
  return {
    provider: typeof record.provider === "string" ? record.provider : undefined,
    name: typeof record.name === "string" ? record.name : undefined,
    version: typeof record.version === "string" ? record.version : undefined,
  };
}

function buildChallengeRecord(request: AgentGatewayRequest, evidence: GatewayEvidence[]): ChallengeRecord {
  const missingEvidence = request.evidence_references.length === 0 ? ["No evidence references submitted."] : [];
  const contradictoryEvidence = evidence
    .filter((item) => /contradict|conflict/i.test(`${item.summary ?? ""} ${item.metadata ? JSON.stringify(item.metadata) : ""}`))
    .map((item) => item.id);
  const regulatoryConcerns =
    request.risk_level === "critical"
      ? ["Critical-risk action requires human governance review before execution."]
      : [];

  return {
    strongest_argument_against:
      `Do not execute "${request.requested_action}" until the business impact, risk owner, and evidence chain are independently reviewed.`,
    missing_evidence: missingEvidence,
    contradictory_evidence: contradictoryEvidence,
    regulatory_concerns: regulatoryConcerns,
  };
}

function addHours(iso: string, hours: number): string {
  const date = new Date(iso);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function buildDecisionRecordHash(record: DecisionRecord): string {
  return stableHash({
    ...record,
    record_hash: "",
  });
}

function resolveSigningKeyId(signingKeyId: string): string {
  return signingKeyId;
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
