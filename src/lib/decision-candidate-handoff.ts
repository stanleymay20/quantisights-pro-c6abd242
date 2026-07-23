import { z } from "zod";

import {
  AGENT_GATEWAY_SCHEMA_VERSION,
  AGENT_GATEWAY_VERSION,
  type AgentGatewayRequest,
  type RiskLevel,
} from "@/lib/agent-gateway";
import {
  DECISION_CANDIDATE_SCHEMA_VERSION,
  DecisionCandidateSchema,
  type DecisionCandidateClass,
  type EnterpriseDecisionCandidate,
} from "@/lib/decision-candidate-generation";

export const GATEWAY_SUBMISSION_RECORD_SCHEMA_VERSION = "quantivis.gateway-submission-record.v1";
export const DECISION_CANDIDATE_HANDOFF_VERSION = "rts-1f.1";

export type CandidateHandoffStatus = "HANDOFF_READY" | "HANDOFF_REJECTED";
export type GatewaySubmissionStatus = "READY_FOR_SUBMISSION" | "REJECTED";

export interface CandidateHandoffOptions {
  agent_id: string;
  submitted_at: string;
  expected_tenant_id?: string;
  expected_organization_id?: string;
}

export interface GatewaySubmissionRecord {
  submission_id: string;
  candidate_id: string;
  gateway_request_hash: string;
  submitted_at: string;
  status: GatewaySubmissionStatus;
  gateway_version: typeof AGENT_GATEWAY_VERSION;
  schema_versions: {
    decision_candidate: typeof DECISION_CANDIDATE_SCHEMA_VERSION;
    agent_gateway: typeof AGENT_GATEWAY_SCHEMA_VERSION;
    handoff: typeof GATEWAY_SUBMISSION_RECORD_SCHEMA_VERSION;
  };
  lineage: {
    enterprise_verified_facts: string[];
    signal_ids: string[];
    raw_event_ids: string[];
    candidate_hash: string;
    evf_hashes: string[];
    promotion_policies: string[];
    promotion_engine_versions: string[];
  };
}

export interface CandidateHandoffResult {
  status: CandidateHandoffStatus;
  gateway_request: AgentGatewayRequest | null;
  submission_record: GatewaySubmissionRecord | null;
  explanation: string[];
}

const NonEmptyStringSchema = z.string().min(1);

export const GatewaySubmissionRecordSchema = z.object({
  submission_id: NonEmptyStringSchema,
  candidate_id: NonEmptyStringSchema,
  gateway_request_hash: NonEmptyStringSchema,
  submitted_at: z.string().datetime({ offset: true }),
  status: z.enum(["READY_FOR_SUBMISSION", "REJECTED"]),
  gateway_version: z.literal(AGENT_GATEWAY_VERSION),
  schema_versions: z.object({
    decision_candidate: z.literal(DECISION_CANDIDATE_SCHEMA_VERSION),
    agent_gateway: z.literal(AGENT_GATEWAY_SCHEMA_VERSION),
    handoff: z.literal(GATEWAY_SUBMISSION_RECORD_SCHEMA_VERSION),
  }),
  lineage: z.object({
    enterprise_verified_facts: z.array(NonEmptyStringSchema).min(1),
    signal_ids: z.array(NonEmptyStringSchema).min(1),
    raw_event_ids: z.array(NonEmptyStringSchema).min(1),
    candidate_hash: NonEmptyStringSchema,
    evf_hashes: z.array(NonEmptyStringSchema).min(1),
    promotion_policies: z.array(NonEmptyStringSchema).min(1),
    promotion_engine_versions: z.array(NonEmptyStringSchema).min(1),
  }),
});

const SUPPORTED_CLASSES: DecisionCandidateClass[] = ["OPERATIONAL", "STRATEGIC", "REGULATORY"];

export function submitDecisionCandidateToGateway(
  candidate: EnterpriseDecisionCandidate,
  options: CandidateHandoffOptions,
): CandidateHandoffResult {
  const explanation: string[] = [];
  const failures: string[] = [];
  const parsed = DecisionCandidateSchema.safeParse(candidate);

  if (!parsed.success) {
    failures.push(`candidate schema validation failed: ${parsed.error.issues.map((issue) => issue.path.join(".") || "candidate").join(", ")}`);
  }

  if (!options.agent_id) failures.push("agent_id is required");
  if (Number.isNaN(new Date(options.submitted_at).getTime())) failures.push("submitted_at is invalid");

  if (candidate.status !== "READY_FOR_GATEWAY") {
    failures.push(`candidate status ${candidate.status} is not READY_FOR_GATEWAY`);
  }

  if (new Date(candidate.expiration_time).getTime() <= new Date(options.submitted_at).getTime()) {
    failures.push(`candidate ${candidate.candidate_id} is expired`);
  }

  if (options.expected_tenant_id && candidate.tenant_id !== options.expected_tenant_id) {
    failures.push(`tenant mismatch: candidate tenant ${candidate.tenant_id} does not match expected tenant ${options.expected_tenant_id}`);
  }

  if (options.expected_organization_id && candidate.organization_id !== options.expected_organization_id) {
    failures.push(
      `organization mismatch: candidate organization ${candidate.organization_id} does not match expected organization ${options.expected_organization_id}`,
    );
  }

  if (!SUPPORTED_CLASSES.includes(candidate.candidate_class)) {
    failures.push(`unsupported decision class ${candidate.candidate_class}`);
  }

  if (candidate.supporting_fact_ids.length === 0 || candidate.lineage.enterprise_verified_facts.length === 0) {
    failures.push("missing EVF lineage");
  }

  if (candidate.lineage.fact_hashes.length === 0) {
    failures.push("missing evidence: EVF hashes are required for AG-2 handoff");
  }

  if (!sameSorted(candidate.supporting_fact_ids, candidate.lineage.enterprise_verified_facts)) {
    failures.push("invalid lineage: supporting facts do not match EVF lineage");
  }

  if (!sameSorted(candidate.supporting_signal_ids, candidate.lineage.signal_ids)) {
    failures.push("invalid lineage: supporting signals do not match signal lineage");
  }

  if (!sameSorted(candidate.supporting_raw_event_ids, candidate.lineage.raw_event_ids)) {
    failures.push("invalid lineage: supporting raw events do not match raw event lineage");
  }

  const expectedCandidateHash = calculateCandidateHash(candidate);
  if (candidate.candidate_hash !== expectedCandidateHash) {
    failures.push(`invalid candidate hash: expected ${expectedCandidateHash} but received ${candidate.candidate_hash}`);
  }

  explanation.push(`RTS-1F validates candidate ${candidate.candidate_id} before AG-2 handoff.`);
  explanation.push(`candidate status is ${candidate.status}.`);
  explanation.push(`candidate class is ${candidate.candidate_class}.`);
  explanation.push(`candidate expires at ${candidate.expiration_time}.`);

  if (failures.length > 0) {
    return {
      status: "HANDOFF_REJECTED",
      gateway_request: null,
      submission_record: null,
      explanation: [...explanation, ...failures.map((failure) => `handoff rejected: ${failure}.`)],
    };
  }

  const gatewayRequest = buildGatewayRequest(candidate, options);
  const gatewayRequestHash = stableHash(gatewayRequest);
  const submissionRecord: GatewaySubmissionRecord = {
    submission_id: deriveSubmissionId(candidate, gatewayRequestHash, options.submitted_at),
    candidate_id: candidate.candidate_id,
    gateway_request_hash: gatewayRequestHash,
    submitted_at: options.submitted_at,
    status: "READY_FOR_SUBMISSION",
    gateway_version: AGENT_GATEWAY_VERSION,
    schema_versions: {
      decision_candidate: DECISION_CANDIDATE_SCHEMA_VERSION,
      agent_gateway: AGENT_GATEWAY_SCHEMA_VERSION,
      handoff: GATEWAY_SUBMISSION_RECORD_SCHEMA_VERSION,
    },
    lineage: {
      enterprise_verified_facts: sortedUnique(candidate.lineage.enterprise_verified_facts),
      signal_ids: sortedUnique(candidate.lineage.signal_ids),
      raw_event_ids: sortedUnique(candidate.lineage.raw_event_ids),
      candidate_hash: candidate.candidate_hash,
      evf_hashes: sortedUnique(candidate.lineage.fact_hashes),
      promotion_policies: sortedUnique(candidate.lineage.promotion_policies),
      promotion_engine_versions: sortedUnique(candidate.lineage.promotion_engine_versions),
    },
  };

  return {
    status: "HANDOFF_READY",
    gateway_request: gatewayRequest,
    submission_record: submissionRecord,
    explanation: [
      ...explanation,
      `handoff payload built for AG-2 version ${AGENT_GATEWAY_VERSION}.`,
      `gateway request hash is ${gatewayRequestHash}.`,
    ],
  };
}

function buildGatewayRequest(
  candidate: EnterpriseDecisionCandidate,
  options: CandidateHandoffOptions,
): AgentGatewayRequest {
  return {
    agent_id: options.agent_id,
    tenant_id: candidate.tenant_id,
    organization_id: candidate.organization_id,
    idempotency_key: candidate.candidate_id,
    decision_type: candidate.decision_type,
    requested_action: candidate.recommended_action,
    evidence_references: [
      ...candidate.supporting_fact_ids.map((factId) => `evf:${factId}`),
      ...candidate.lineage.fact_hashes.map((hash) => `evf-hash:${hash}`),
    ],
    confidence: candidate.confidence,
    business_impact: {
      amount: candidate.estimated_value,
      description: [
        candidate.business_impact.financial,
        candidate.business_impact.operational,
        candidate.business_impact.compliance,
      ].join(" "),
    },
    risk_level: candidate.risk_level as RiskLevel,
    justification: candidate.decision_rationale.join(" "),
    metadata: {
      candidate_id: candidate.candidate_id,
      candidate_hash: candidate.candidate_hash,
      candidate_class: candidate.candidate_class,
      candidate_status: candidate.status,
      required_approvals: candidate.required_approvals,
      recommended_option: candidate.recommended_option,
      alternative_options: candidate.alternative_options,
      expected_outcomes: candidate.expected_outcomes,
      success_metrics: candidate.success_metrics,
      evf_ids: candidate.lineage.enterprise_verified_facts,
      evf_hashes: candidate.lineage.fact_hashes,
      signal_ids: candidate.lineage.signal_ids,
      raw_event_ids: candidate.lineage.raw_event_ids,
      promotion_policies: candidate.lineage.promotion_policies,
      promotion_engine_versions: candidate.lineage.promotion_engine_versions,
      gateway_version: AGENT_GATEWAY_VERSION,
      handoff_version: DECISION_CANDIDATE_HANDOFF_VERSION,
      decision_candidate_schema_version: DECISION_CANDIDATE_SCHEMA_VERSION,
      agent_gateway_schema_version: AGENT_GATEWAY_SCHEMA_VERSION,
      handoff_schema_version: GATEWAY_SUBMISSION_RECORD_SCHEMA_VERSION,
    },
  };
}

function calculateCandidateHash(candidate: EnterpriseDecisionCandidate): string {
  const { candidate_hash: _candidateHash, ...withoutHash } = candidate;
  return stableHash(withoutHash);
}

function deriveSubmissionId(
  candidate: EnterpriseDecisionCandidate,
  gatewayRequestHash: string,
  submittedAt: string,
): string {
  return `gateway-submission-${stableHash({
    candidate_id: candidate.candidate_id,
    gateway_request_hash: gatewayRequestHash,
    submitted_at: submittedAt,
  }).replace("fnv1a-", "")}`;
}

function sameSorted(left: string[], right: string[]): boolean {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
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
