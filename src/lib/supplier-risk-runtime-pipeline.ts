/**
 * GA-1: Supplier Risk live runtime pipeline.
 *
 * Wires the reference Supplier Risk scenario end-to-end through the
 * production RTS-1 / Agent Gateway / Runtime architecture:
 *
 *   Raw Signal -> Signal Quality -> Contradiction Detection ->
 *   Verified Fact Promotion -> Decision Candidate Generation ->
 *   Decision Candidate Handoff -> Agent Gateway -> Runtime Gateway ->
 *   Runtime Service -> Runtime Queue (AG-3D) -> Runtime Persistence (AG-3E) ->
 *   decision_ledger row.
 *
 * This module is pure orchestration: every adapter is either an in-memory
 * default (queue, gateway persistence, signing, events, execution
 * persistence) or an injected dependency the caller controls (tenant/org
 * validation, evidence assembly, policy evaluation, decision-record and
 * audit-event persistence). The caller (a Supabase edge function today)
 * supplies `persistDecisionRecord` / `writeAuditEvent` so the resulting
 * decision actually lands in `decision_ledger` / `audit_log`; this module
 * never talks to a database directly.
 */
import {
  processAgentGatewayRequest,
  type AgentGatewayDependencies,
  type AgentGatewayRequest,
  type AgentGatewayResult,
  type GatewayEvidence,
  type PolicyDecision,
} from "@/lib/agent-gateway";
import {
  detectContradictions,
  type ContradictionDetectionSignal,
  type ExtendedContradictionRecord,
} from "@/lib/contradiction-detection";
import {
  submitDecisionCandidateToGateway,
  type CandidateHandoffResult,
} from "@/lib/decision-candidate-handoff";
import {
  generateDecisionCandidates,
  type EnterpriseDecisionCandidate,
} from "@/lib/decision-candidate-generation";
import {
  createPayloadHash,
  deriveIdempotencyKey,
  deriveSignalId,
  REAL_TIME_SIGNAL_SCHEMA_VERSION,
  type NormalizedSignal,
  type RawEvent,
} from "@/lib/real-time-signals";
import {
  createRuntimeGateway,
  InMemoryRuntimePersistenceAdapter,
  InMemoryRuntimeQueueAdapter,
  MockRuntimeEventEmitterAdapter,
  MockSigningAdapter,
} from "@/lib/runtime-gateway";
import {
  createRuntimePersistence,
  MemoryRuntimePersistence,
  type ExecutionRecord,
  type RuntimePersistence,
} from "@/lib/runtime-persistence";
import {
  createRuntimeQueue,
  InMemoryRuntimeQueueAdapter as ExecutionQueueAdapter,
  type RuntimeQueue,
} from "@/lib/runtime-queue";
import { createRuntimeService, type RuntimeServiceResponse } from "@/lib/runtime-service";
import {
  calculateSignalQuality,
  type SignalQualityResult,
} from "@/lib/signal-quality";
import {
  promoteVerifiedFact,
  type EnterpriseVerifiedFact,
  type PromotionPolicyName,
} from "@/lib/verified-fact-promotion";

export const SUPPLIER_RISK_RUNTIME_PIPELINE_VERSION = "ga-1.1";

export type SupplierRiskPipelineStatus =
  | "DECISION_LEDGER_READY"
  | "NOT_PROMOTED"
  | "NO_CANDIDATE"
  | "HANDOFF_REJECTED"
  | "GATEWAY_REJECTED"
  | "RUNTIME_REJECTED";

export interface SupplierRiskSignalInput {
  event_id: string;
  source_system: string;
  connector_id: string;
  source_record_id: string;
  tenant_id: string;
  organization_id: string;
  supplier_id: string;
  delivery_delay_hours: number;
  impact_amount: number;
  description?: string;
  observed_at: string;
}

export interface SupplierRiskPipelineInput {
  signal: SupplierRiskSignalInput;
  /** Additional corroborating/conflicting signals evaluated in the same fact promotion. */
  additional_signals?: SupplierRiskSignalInput[];
  now: string;
  promotion_policy?: PromotionPolicyName;
  generation_policy?: "STRICT" | "STANDARD" | "ADVISORY";
  confidence?: number;
  agent_id?: string;
}

export interface SupplierRiskRuntimeDeps {
  /**
   * Required: satisfies the Agent Gateway (AG-2) persistence contract — the
   * governance decision record itself (typically an audit_log write, called
   * once by `processAgentGatewayRequest`). This is distinct from the
   * decision_ledger business-table write, which happens later via
   * `persistDecisionLedgerRow` once the runtime pipeline completes.
   */
  persistDecisionRecord: AgentGatewayDependencies["persistDecisionRecord"];
  /** Required: must write to audit_log. */
  writeAuditEvent: AgentGatewayDependencies["writeAuditEvent"];
  /**
   * Required: the actual decision_ledger insert. Called exactly once, after
   * Runtime Gateway/Service/Queue/Persistence all confirm the execution
   * completed — matching the required flow order (...Runtime Persistence ->
   * decision_ledger). Must return the inserted row's id.
   */
  persistDecisionLedgerRow(row: SupplierRiskDecisionLedgerRow): Promise<{ decision_id: string }>;
  validateTenant?: AgentGatewayDependencies["validateTenant"];
  validateOrganization?: AgentGatewayDependencies["validateOrganization"];
  assembleEvidence?: AgentGatewayDependencies["assembleEvidence"];
  evaluatePolicy?: AgentGatewayDependencies["evaluatePolicy"];
  signDecisionToken?: AgentGatewayDependencies["signDecisionToken"];
  signing_key_id?: string;
  generateId?: AgentGatewayDependencies["generateId"];
}

export interface SupplierRiskRuntimePipelineResult {
  status: SupplierRiskPipelineStatus;
  schema_version: typeof SUPPLIER_RISK_RUNTIME_PIPELINE_VERSION;
  raw_events: RawEvent[];
  normalized_signals: NormalizedSignal[];
  signal_quality: Array<SignalQualityResult & { signal_id: string }>;
  contradictions: ExtendedContradictionRecord[];
  verified_fact: EnterpriseVerifiedFact | null;
  decision_candidate: EnterpriseDecisionCandidate | null;
  candidate_handoff: CandidateHandoffResult | null;
  agent_gateway_result: AgentGatewayResult | null;
  runtime_service_response: RuntimeServiceResponse | null;
  execution_record: ExecutionRecord | null;
  decision_ledger_row: SupplierRiskDecisionLedgerRow | null;
  explanation: string[];
}

export interface SupplierRiskDecisionLedgerRow {
  organization_id: string;
  advisory_instance_id: null;
  decision_type: string;
  recommended_action: string;
  decision_status: "pending";
  execution_status: "not_started";
  raw_confidence: number;
  capped_confidence: number;
  confidence_at_decision: number;
  confidence_cap_reason: null;
  predicted_net_impact: number;
  notes: string;
  decision_origin: "runtime_pipeline";
  source_insight_summary: string;
  recommendation_logic_type: "rts1_runtime_pipeline";
  evidence_sources: Array<Record<string, unknown>>;
  explanation_metadata: Record<string, unknown>;
}

/**
 * Runs the reference Supplier Risk scenario through every production
 * runtime stage. All queue/persistence/signing/event adapters used for the
 * Runtime Gateway, Runtime Service, Runtime Queue (AG-3D), and Runtime
 * Persistence (AG-3E) stages are freshly created in-memory adapters per
 * GA-1 scope (GA-2 replaces them with production adapters).
 */
export async function runSupplierRiskRuntimePipeline(
  input: SupplierRiskPipelineInput,
  deps: SupplierRiskRuntimeDeps,
): Promise<SupplierRiskRuntimePipelineResult> {
  const explanation: string[] = [];
  const agentId = input.agent_id ?? "supplier-risk-runtime-agent";
  const allSignalInputs = [input.signal, ...(input.additional_signals ?? [])];
  const rawEvents = allSignalInputs.map((signal) => buildSupplierRiskRawEvent(signal));

  const normalizedSignals = rawEvents.map((event) => normalizeSupplierRiskSignal(event, input.now));

  const qualityScores = normalizedSignals.map((signal) => ({
    signal_id: signal.signal_id,
    ...calculateSignalQuality({
      ...signal,
      schema_version: signal.schema_version,
      provenance: {
        connector_verified: true,
        payload_hash: createPayloadHash(signal.payload),
        source_record_id: signal.raw_event_id,
        signature_present: true,
      },
      expected_payload_hash: createPayloadHash(signal.payload),
      required_payload_fields: ["supplier_id", "delivery_delay_hours", "impact_amount"],
      optional_payload_fields: ["description"],
      decision_trigger: signal.materiality.level !== "low",
      source_criticality: signal.materiality.level,
      risk_level: signal.materiality.level,
      now: input.now,
    }),
  }));

  const scoredSignals: NormalizedSignal[] = normalizedSignals.map((signal) => {
    const quality = qualityScores.find((score) => score.signal_id === signal.signal_id);
    return {
      ...signal,
      quality: {
        completeness: quality?.completeness ?? 0,
        consistency: quality?.consistency ?? 0,
        freshness: quality?.freshness ?? 0,
        provenance: quality?.provenance ?? 0,
        materiality: quality?.materiality ?? 0,
        overall: quality?.overall ?? 0,
      },
    };
  });
  explanation.push(`signal quality calculated for ${scoredSignals.length} signal(s).`);

  const contradictionSignals: ContradictionDetectionSignal[] = scoredSignals.map((signal) => ({
    ...signal,
    schema_version: signal.schema_version,
    provenance: {
      source_record_id: signal.raw_event_id,
      payload_hash: createPayloadHash(signal.payload),
    },
    source_reliability: 95,
    historical_source_accuracy: 95,
  }));
  const contradictions = detectContradictions(contradictionSignals, { now: input.now });
  explanation.push(`contradiction detection found ${contradictions.length} contradiction(s).`);

  const primarySignal = scoredSignals[0];
  const factType = primarySignal.materiality.amount != null && primarySignal.materiality.amount >= 2_000_000
    ? "supplier_strategic_delivery_risk"
    : "supplier_delivery_risk";
  const assertion = `Supplier ${input.signal.supplier_id} delivery is at risk within ${input.signal.delivery_delay_hours} hours.`;

  const promotion = promoteVerifiedFact({
    fact_type: factType,
    assertion,
    signals: scoredSignals,
    contradictions,
    quality_scores: qualityScores,
    evidence_references: sortedUnique(scoredSignals.flatMap((signal) => signal.evidence_references)),
    confidence: input.confidence ?? 96,
    promotion_policy: input.promotion_policy ?? "NORMAL",
    now: input.now,
    expires_at: addHours(input.now, 24),
    audit_reference: `audit-supplier-risk-${input.signal.event_id}`,
    certification_reference: `cert-supplier-risk-${input.signal.event_id}`,
  });
  explanation.push(...promotion.explanation);

  if (!promotion.fact) {
    return notPromotedResult(rawEvents, scoredSignals, qualityScores, contradictions, explanation);
  }

  const generation = generateDecisionCandidates({
    facts: [promotion.fact],
    generation_policy: input.generation_policy ?? "STANDARD",
    now: input.now,
    enterprise_config: {
      audit_reference: `audit-candidate-${input.signal.event_id}`,
    },
  });
  explanation.push(...generation.explanation);

  const candidate = generation.candidates.find((item) => item.status === "READY_FOR_GATEWAY") ?? null;
  if (!candidate) {
    return noCandidateResult(rawEvents, scoredSignals, qualityScores, contradictions, promotion.fact, explanation);
  }

  const handoff = submitDecisionCandidateToGateway(candidate, {
    agent_id: agentId,
    submitted_at: input.now,
    expected_tenant_id: candidate.tenant_id,
    expected_organization_id: candidate.organization_id,
  });
  explanation.push(...handoff.explanation);

  if (handoff.status !== "HANDOFF_READY" || !handoff.gateway_request) {
    return handoffRejectedResult(rawEvents, scoredSignals, qualityScores, contradictions, promotion.fact, candidate, handoff, explanation);
  }

  const agentGatewayDeps = buildAgentGatewayDependencies(deps);
  const agentGatewayResult = await processAgentGatewayRequest(handoff.gateway_request, agentGatewayDeps);
  explanation.push(`Agent Gateway status: ${agentGatewayResult.status}${agentGatewayResult.failures.length > 0 ? ` (${agentGatewayResult.failures.join(", ")})` : ""}.`);

  if (agentGatewayResult.status === "REJECTED" || !agentGatewayResult.decision_record) {
    return gatewayRejectedResult(
      rawEvents, scoredSignals, qualityScores, contradictions, promotion.fact, candidate, handoff, agentGatewayResult, explanation,
    );
  }

  const runtime = buildRuntimeAdapters(input.now);
  const runtimeService = createRuntimeService({
    gateway: createRuntimeGateway({
      queue: runtime.queue,
      persistence: runtime.gatewayPersistence,
      signing: runtime.signing,
      events: runtime.events,
      now: () => input.now,
      max_request_bytes: 65_536,
      validateTenant: deps.validateTenant ?? defaultValidateTenant,
      validateOrganization: deps.validateOrganization ?? defaultValidateOrganization,
    }),
    queue: runtime.queue,
    persistence: runtime.gatewayPersistence,
    signing: runtime.signing,
    events: runtime.events,
    now: () => input.now,
    // Enterprise Decision Candidates carry a richer metadata payload (recommended
    // option, alternatives, lineage) than the default AG-3B limits assume.
    limits: {
      max_payload_bytes: 65_536,
      max_metadata_bytes: 32_768,
    },
  });

  const runtimeServiceResponse = await runtimeService.handleRuntimeRequest(handoff.gateway_request);
  explanation.push(
    `Runtime Service response: ${runtimeServiceResponse.ok ? "ok" : (runtimeServiceResponse as { error: { error_code: string } }).error.error_code}.`,
  );

  if (!runtimeServiceResponse.ok) {
    return runtimeRejectedResult(
      rawEvents, scoredSignals, qualityScores, contradictions, promotion.fact, candidate, handoff,
      agentGatewayResult, runtimeServiceResponse, explanation,
    );
  }

  const executionRecord = await runExecutionQueueAndPersistence({
    runtimePersistence: runtime.executionPersistence,
    runtimeQueue: runtime.executionQueue,
    request: handoff.gateway_request,
    correlationId: runtimeServiceResponse.correlation_id,
    requestHash: runtimeServiceResponse.request_hash,
    decisionId: agentGatewayResult.decision_record.decision_id,
    now: input.now,
    explanation,
  });

  const decisionLedgerRow = buildDecisionLedgerRow({
    candidate,
    fact: promotion.fact,
    decisionRecord: agentGatewayResult.decision_record,
    correlationId: runtimeServiceResponse.correlation_id,
    executionId: executionRecord.execution_id,
  });

  await deps.writeAuditEvent({
    organization_id: candidate.organization_id,
    actor_id: null,
    action_type: "agent_gateway.decision_recorded",
    resource_type: "agent_gateway",
    resource_id: agentGatewayResult.decision_record.decision_id,
    payload: {
      source: "supplier_risk_runtime_pipeline",
      pipeline_version: SUPPLIER_RISK_RUNTIME_PIPELINE_VERSION,
      correlation_id: runtimeServiceResponse.correlation_id,
      execution_id: executionRecord.execution_id,
      fact_id: promotion.fact.fact_id,
      candidate_id: candidate.candidate_id,
      decision_id: agentGatewayResult.decision_record.decision_id,
    },
  });

  const decisionLedgerResult = await deps.persistDecisionLedgerRow(decisionLedgerRow);
  explanation.push(`decision_ledger row persisted with id ${decisionLedgerResult.decision_id}.`);

  return {
    status: "DECISION_LEDGER_READY",
    schema_version: SUPPLIER_RISK_RUNTIME_PIPELINE_VERSION,
    raw_events: rawEvents,
    normalized_signals: scoredSignals,
    signal_quality: qualityScores,
    contradictions,
    verified_fact: promotion.fact,
    decision_candidate: candidate,
    candidate_handoff: handoff,
    agent_gateway_result: agentGatewayResult,
    runtime_service_response: runtimeServiceResponse,
    execution_record: executionRecord,
    decision_ledger_row: decisionLedgerRow,
    explanation,
  };
}

export function buildSupplierRiskRawEvent(signal: SupplierRiskSignalInput): RawEvent {
  const payload = {
    supplier_id: signal.supplier_id,
    delivery_delay_hours: signal.delivery_delay_hours,
    impact_amount: signal.impact_amount,
    description: signal.description ?? `Supplier ${signal.supplier_id} delivery risk detected.`,
    materiality_level: materialityFromAmount(signal.impact_amount),
  };
  return {
    schema_version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
    event_id: signal.event_id,
    source_system: signal.source_system,
    source_type: "supplier-risk-runtime-ingest",
    tenant_id: signal.tenant_id,
    organization_id: signal.organization_id,
    observed_at: signal.observed_at,
    received_at: signal.observed_at,
    event_type: "supplier_delivery_risk",
    payload,
    provenance: {
      connector_id: signal.connector_id,
      source_record_id: signal.source_record_id,
      payload_hash: createPayloadHash(payload),
    },
  };
}

function normalizeSupplierRiskSignal(event: RawEvent, now: string): NormalizedSignal {
  const signalId = deriveSignalId(event, event.event_type);
  const impactAmount = typeof event.payload.impact_amount === "number" ? event.payload.impact_amount : undefined;
  return {
    schema_version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
    signal_id: signalId,
    raw_event_id: event.event_id,
    tenant_id: event.tenant_id,
    organization_id: event.organization_id,
    source_system: event.source_system,
    signal_type: event.event_type,
    observed_at: event.observed_at,
    normalized_at: now,
    materiality: {
      level: materialityFromAmount(impactAmount),
      amount: impactAmount,
      currency: impactAmount === undefined ? undefined : "USD",
      description: String(event.payload.description ?? `${event.event_type} signal`),
    },
    quality: {
      completeness: 100,
      consistency: 100,
      freshness: 100,
      provenance: 100,
      materiality: 100,
      overall: 100,
    },
    evidence_references: [`evidence:${event.event_id}`],
    payload: event.payload,
    idempotency_key: deriveIdempotencyKey({
      tenant_id: event.tenant_id,
      source_id: event.event_id,
      purpose: "supplier-risk-runtime-normalization",
    }),
  };
}

function buildAgentGatewayDependencies(deps: SupplierRiskRuntimeDeps): AgentGatewayDependencies {
  return {
    validateTenant: deps.validateTenant ?? defaultValidateTenant,
    validateOrganization: deps.validateOrganization ?? defaultValidateOrganization,
    assembleEvidence: deps.assembleEvidence ?? defaultAssembleEvidence,
    evaluatePolicy: deps.evaluatePolicy ?? defaultEvaluatePolicy,
    persistDecisionRecord: deps.persistDecisionRecord,
    writeAuditEvent: deps.writeAuditEvent,
    signDecisionToken: deps.signDecisionToken ?? defaultSignDecisionToken,
    signing_key_id: deps.signing_key_id ?? "supplier-risk-runtime-key",
    generateId: deps.generateId,
  };
}

async function defaultValidateTenant(): Promise<{ valid: boolean }> {
  return { valid: true };
}

async function defaultValidateOrganization(): Promise<{ valid: boolean }> {
  return { valid: true };
}

async function defaultAssembleEvidence(references: string[]): Promise<GatewayEvidence[]> {
  return references.map((reference, index) => ({
    id: `supplier-risk-evidence-${index}`,
    uri: `evidence://${reference}`,
    hash: reference,
    integrity: "verified",
    summary: "Evidence produced by the RTS-1 Supplier Risk runtime pipeline.",
    source: "rts1-supplier-risk-runtime-pipeline",
  }));
}

async function defaultEvaluatePolicy(input: {
  request: AgentGatewayRequest;
  decision_class: "Class C" | "Class B" | "Class A";
}): Promise<PolicyDecision> {
  const requiredApprovers = input.decision_class === "Class C" ? [] : ["Operations Lead"];
  return {
    allowed: true,
    policy_id: "supplier-risk-runtime-policy",
    policy_version: "v1",
    reasons: ["Supplier risk runtime pipeline deterministic policy allows the request pending required approvals."],
    required_approvers: requiredApprovers,
  };
}

async function defaultSignDecisionToken(payload: { decision_id: string; hash: string }): Promise<string> {
  return `mock-decision-token-${payload.decision_id}-${payload.hash}`;
}

interface RuntimeAdapters {
  queue: InMemoryRuntimeQueueAdapter;
  gatewayPersistence: InMemoryRuntimePersistenceAdapter;
  signing: MockSigningAdapter;
  events: MockRuntimeEventEmitterAdapter;
  executionQueue: RuntimeQueue;
  executionPersistence: RuntimePersistence;
}

function buildRuntimeAdapters(now: string): RuntimeAdapters {
  return {
    queue: new InMemoryRuntimeQueueAdapter(),
    gatewayPersistence: new InMemoryRuntimePersistenceAdapter(),
    signing: new MockSigningAdapter("supplier-risk-runtime-signing-key"),
    events: new MockRuntimeEventEmitterAdapter(),
    executionQueue: createRuntimeQueue({ adapter: new ExecutionQueueAdapter(), now: () => now }),
    executionPersistence: createRuntimePersistence({ adapter: new MemoryRuntimePersistence(), now: () => now }),
  };
}

async function runExecutionQueueAndPersistence(input: {
  runtimePersistence: RuntimePersistence;
  runtimeQueue: RuntimeQueue;
  request: AgentGatewayRequest;
  correlationId: string;
  requestHash: string;
  decisionId: string;
  now: string;
  explanation: string[];
}): Promise<ExecutionRecord> {
  const executionId = `exec-${input.correlationId}`;

  const created = await input.runtimePersistence.createExecution({
    execution_id: executionId,
    correlation_id: input.correlationId,
    request_hash: input.requestHash,
    idempotency_key: input.request.idempotency_key,
    tenant_id: input.request.tenant_id,
    organization_id: input.request.organization_id,
    status: "RECEIVED",
    metadata: { decision_type: input.request.decision_type, decision_id: input.decisionId },
    now: input.now,
  });
  if (!created.execution) {
    throw new Error(`Runtime Persistence failed to create execution: ${created.errors.join("; ")}`);
  }

  await input.runtimePersistence.appendEvent({
    execution_id: executionId,
    tenant_id: input.request.tenant_id,
    event_type: "runtime.execution.received",
    payload: { correlation_id: input.correlationId },
    now: input.now,
  });

  const enqueueResult = await input.runtimeQueue.enqueue({
    queue_message_id: `qmsg-${input.correlationId}`,
    correlation_id: input.correlationId,
    idempotency_key: input.request.idempotency_key,
    request_hash: input.requestHash,
    tenant_id: input.request.tenant_id,
    organization_id: input.request.organization_id,
    payload_reference: executionId,
    now: input.now,
  });
  input.explanation.push(`Runtime Queue enqueue status: ${enqueueResult.status}.`);

  await input.runtimePersistence.updateExecution(input.request.tenant_id, executionId, {
    status: "QUEUED",
    now: input.now,
  });
  await input.runtimePersistence.appendEvent({
    execution_id: executionId,
    tenant_id: input.request.tenant_id,
    event_type: "runtime.execution.queued",
    payload: { queue_message_id: enqueueResult.message?.queue_message_id ?? null },
    now: input.now,
  });

  const dequeueResult = await input.runtimeQueue.dequeue(input.now);
  if (dequeueResult.message) {
    await input.runtimeQueue.ack(dequeueResult.message.queue_message_id, "processed", input.now);
  }
  input.explanation.push(`Runtime Queue dequeue status: ${dequeueResult.status}.`);

  await input.runtimePersistence.updateExecution(input.request.tenant_id, executionId, {
    status: "PROCESSING",
    now: input.now,
  });
  await input.runtimePersistence.appendEvent({
    execution_id: executionId,
    tenant_id: input.request.tenant_id,
    event_type: "runtime.execution.processing",
    payload: {},
    now: input.now,
  });

  await input.runtimePersistence.recordAudit({
    execution_id: executionId,
    tenant_id: input.request.tenant_id,
    organization_id: input.request.organization_id,
    actor: "supplier-risk-runtime-pipeline",
    action: "runtime.execution.processed",
    resource_type: "decision",
    resource_id: input.decisionId,
    metadata: { correlation_id: input.correlationId },
    now: input.now,
  });

  const completed = await input.runtimePersistence.updateExecution(input.request.tenant_id, executionId, {
    status: "COMPLETED",
    result: { decision_id: input.decisionId },
    now: input.now,
  });
  await input.runtimePersistence.appendEvent({
    execution_id: executionId,
    tenant_id: input.request.tenant_id,
    event_type: "runtime.execution.completed",
    payload: { decision_id: input.decisionId },
    now: input.now,
  });

  if (!completed.execution) {
    throw new Error(`Runtime Persistence failed to complete execution: ${completed.errors.join("; ")}`);
  }
  input.explanation.push(`Runtime Persistence execution ${executionId} reached status ${completed.execution.status}.`);
  return completed.execution;
}

function buildDecisionLedgerRow(input: {
  candidate: EnterpriseDecisionCandidate;
  fact: EnterpriseVerifiedFact;
  decisionRecord: NonNullable<AgentGatewayResult["decision_record"]>;
  correlationId: string;
  executionId: string;
}): SupplierRiskDecisionLedgerRow {
  const { candidate, fact, decisionRecord } = input;
  return {
    organization_id: candidate.organization_id,
    advisory_instance_id: null,
    decision_type: candidate.decision_type,
    recommended_action: `${candidate.title}: ${candidate.recommended_action}`,
    decision_status: "pending",
    execution_status: "not_started",
    raw_confidence: candidate.confidence,
    capped_confidence: candidate.confidence,
    confidence_at_decision: candidate.confidence,
    confidence_cap_reason: null,
    predicted_net_impact: candidate.estimated_value,
    notes: candidate.summary,
    decision_origin: "runtime_pipeline",
    source_insight_summary: candidate.title,
    recommendation_logic_type: "rts1_runtime_pipeline",
    evidence_sources: decisionRecord.evidence.map((evidence: GatewayEvidence) => ({
      source_type: "runtime_pipeline",
      source_name: evidence.source ?? "rts1-supplier-risk-runtime-pipeline",
      source_id: evidence.id,
      contribution_weight: 1,
      confidence: candidate.confidence,
      hash: evidence.hash,
    })),
    explanation_metadata: {
      source: {
        kind: "runtime_pipeline",
        pipeline_version: SUPPLIER_RISK_RUNTIME_PIPELINE_VERSION,
        tenant_id: candidate.tenant_id,
        correlation_id: input.correlationId,
        execution_id: input.executionId,
      },
      lineage: {
        fact_id: fact.fact_id,
        fact_hash: fact.fact_hash,
        candidate_id: candidate.candidate_id,
        candidate_hash: candidate.candidate_hash,
        decision_id: decisionRecord.decision_id,
        decision_record_hash: decisionRecord.record_hash,
        supporting_signal_ids: candidate.supporting_signal_ids,
        supporting_raw_event_ids: candidate.supporting_raw_event_ids,
      },
      reasoning: {
        what_happened: candidate.summary,
        why_it_matters: candidate.business_impact.operational,
        why_this_recommendation: candidate.recommended_action,
      },
      expected_impact: {
        range: candidate.estimated_value,
        parsed_value: candidate.estimated_value,
        basis: "RTS-1 Enterprise Decision Candidate estimate",
      },
      confidence_explanation: {
        score: candidate.confidence,
        capped: false,
        cap_reason: null,
      },
      evidence_classification: "RUNTIME_PIPELINE_VERIFIED_FACT",
      limitations: [
        "Created by the GA-1 Supplier Risk runtime pipeline vertical slice. Requires executive review before execution.",
      ],
      decision_class: decisionRecord.decision_class,
      approval_state: decisionRecord.status,
      required_approvers: decisionRecord.approvals.required_approvers,
    },
  };
}

function notPromotedResult(
  rawEvents: RawEvent[],
  signals: NormalizedSignal[],
  qualityScores: Array<SignalQualityResult & { signal_id: string }>,
  contradictions: ExtendedContradictionRecord[],
  explanation: string[],
): SupplierRiskRuntimePipelineResult {
  return {
    status: "NOT_PROMOTED",
    schema_version: SUPPLIER_RISK_RUNTIME_PIPELINE_VERSION,
    raw_events: rawEvents,
    normalized_signals: signals,
    signal_quality: qualityScores,
    contradictions,
    verified_fact: null,
    decision_candidate: null,
    candidate_handoff: null,
    agent_gateway_result: null,
    runtime_service_response: null,
    execution_record: null,
    decision_ledger_row: null,
    explanation,
  };
}

function noCandidateResult(
  rawEvents: RawEvent[],
  signals: NormalizedSignal[],
  qualityScores: Array<SignalQualityResult & { signal_id: string }>,
  contradictions: ExtendedContradictionRecord[],
  fact: EnterpriseVerifiedFact,
  explanation: string[],
): SupplierRiskRuntimePipelineResult {
  return {
    status: "NO_CANDIDATE",
    schema_version: SUPPLIER_RISK_RUNTIME_PIPELINE_VERSION,
    raw_events: rawEvents,
    normalized_signals: signals,
    signal_quality: qualityScores,
    contradictions,
    verified_fact: fact,
    decision_candidate: null,
    candidate_handoff: null,
    agent_gateway_result: null,
    runtime_service_response: null,
    execution_record: null,
    decision_ledger_row: null,
    explanation,
  };
}

function handoffRejectedResult(
  rawEvents: RawEvent[],
  signals: NormalizedSignal[],
  qualityScores: Array<SignalQualityResult & { signal_id: string }>,
  contradictions: ExtendedContradictionRecord[],
  fact: EnterpriseVerifiedFact,
  candidate: EnterpriseDecisionCandidate,
  handoff: CandidateHandoffResult,
  explanation: string[],
): SupplierRiskRuntimePipelineResult {
  return {
    status: "HANDOFF_REJECTED",
    schema_version: SUPPLIER_RISK_RUNTIME_PIPELINE_VERSION,
    raw_events: rawEvents,
    normalized_signals: signals,
    signal_quality: qualityScores,
    contradictions,
    verified_fact: fact,
    decision_candidate: candidate,
    candidate_handoff: handoff,
    agent_gateway_result: null,
    runtime_service_response: null,
    execution_record: null,
    decision_ledger_row: null,
    explanation,
  };
}

function gatewayRejectedResult(
  rawEvents: RawEvent[],
  signals: NormalizedSignal[],
  qualityScores: Array<SignalQualityResult & { signal_id: string }>,
  contradictions: ExtendedContradictionRecord[],
  fact: EnterpriseVerifiedFact,
  candidate: EnterpriseDecisionCandidate,
  handoff: CandidateHandoffResult,
  agentGatewayResult: AgentGatewayResult,
  explanation: string[],
): SupplierRiskRuntimePipelineResult {
  return {
    status: "GATEWAY_REJECTED",
    schema_version: SUPPLIER_RISK_RUNTIME_PIPELINE_VERSION,
    raw_events: rawEvents,
    normalized_signals: signals,
    signal_quality: qualityScores,
    contradictions,
    verified_fact: fact,
    decision_candidate: candidate,
    candidate_handoff: handoff,
    agent_gateway_result: agentGatewayResult,
    runtime_service_response: null,
    execution_record: null,
    decision_ledger_row: null,
    explanation,
  };
}

function runtimeRejectedResult(
  rawEvents: RawEvent[],
  signals: NormalizedSignal[],
  qualityScores: Array<SignalQualityResult & { signal_id: string }>,
  contradictions: ExtendedContradictionRecord[],
  fact: EnterpriseVerifiedFact,
  candidate: EnterpriseDecisionCandidate,
  handoff: CandidateHandoffResult,
  agentGatewayResult: AgentGatewayResult,
  runtimeServiceResponse: RuntimeServiceResponse,
  explanation: string[],
): SupplierRiskRuntimePipelineResult {
  return {
    status: "RUNTIME_REJECTED",
    schema_version: SUPPLIER_RISK_RUNTIME_PIPELINE_VERSION,
    raw_events: rawEvents,
    normalized_signals: signals,
    signal_quality: qualityScores,
    contradictions,
    verified_fact: fact,
    decision_candidate: candidate,
    candidate_handoff: handoff,
    agent_gateway_result: agentGatewayResult,
    runtime_service_response: runtimeServiceResponse,
    execution_record: null,
    decision_ledger_row: null,
    explanation,
  };
}

function materialityFromAmount(amount: unknown): "low" | "medium" | "high" | "critical" {
  if (typeof amount !== "number") return "medium";
  if (amount >= 2_000_000) return "critical";
  if (amount >= 500_000) return "high";
  if (amount >= 50_000) return "medium";
  return "low";
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function addHours(iso: string, hours: number): string {
  const date = new Date(iso);
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);
  return date.toISOString();
}
