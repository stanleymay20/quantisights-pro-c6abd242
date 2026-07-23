import { z } from "zod";

import type { AgentGatewayRequest, RiskLevel } from "@/lib/agent-gateway";

export const REAL_TIME_SIGNAL_SCHEMA_VERSION = "quantivis.real-time-signal.v1";

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const NonEmptyStringSchema = z.string().min(1);
const JsonRecordSchema = z.record(z.unknown());
const ScoreSchema = z.number().finite().min(0).max(100);
const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);

const SignalQualityScoreSchema = z.object({
  completeness: ScoreSchema,
  consistency: ScoreSchema,
  freshness: ScoreSchema,
  provenance: ScoreSchema,
  materiality: ScoreSchema,
  overall: ScoreSchema,
});

export const RawEventSchema = z.object({
  schema_version: z.literal(REAL_TIME_SIGNAL_SCHEMA_VERSION),
  event_id: NonEmptyStringSchema,
  source_system: NonEmptyStringSchema,
  source_type: NonEmptyStringSchema,
  tenant_id: NonEmptyStringSchema,
  organization_id: NonEmptyStringSchema,
  observed_at: IsoDateTimeSchema,
  received_at: IsoDateTimeSchema,
  event_type: NonEmptyStringSchema,
  payload: JsonRecordSchema,
  provenance: z.object({
    connector_id: NonEmptyStringSchema,
    source_record_id: NonEmptyStringSchema,
    payload_hash: NonEmptyStringSchema,
  }),
});

export const NormalizedSignalSchema = z.object({
  schema_version: z.literal(REAL_TIME_SIGNAL_SCHEMA_VERSION),
  signal_id: NonEmptyStringSchema,
  raw_event_id: NonEmptyStringSchema,
  tenant_id: NonEmptyStringSchema,
  organization_id: NonEmptyStringSchema,
  source_system: NonEmptyStringSchema,
  signal_type: NonEmptyStringSchema,
  observed_at: IsoDateTimeSchema,
  normalized_at: IsoDateTimeSchema,
  materiality: z.object({
    level: z.enum(["low", "medium", "high", "critical"]),
    amount: z.number().finite().optional(),
    currency: z.string().min(3).max(8).optional(),
    description: NonEmptyStringSchema,
  }),
  quality: SignalQualityScoreSchema,
  evidence_references: z.array(NonEmptyStringSchema).default([]),
  payload: JsonRecordSchema,
  idempotency_key: NonEmptyStringSchema,
});

export const ContradictionRecordSchema = z.object({
  contradiction_id: NonEmptyStringSchema,
  source_a: NonEmptyStringSchema,
  source_b: NonEmptyStringSchema,
  field: NonEmptyStringSchema,
  value_a: z.unknown(),
  value_b: z.unknown(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  detected_at: IsoDateTimeSchema,
  evidence_references: z.array(NonEmptyStringSchema).min(1),
});

export const VerifiedFactSchema = z.object({
  schema_version: z.literal(REAL_TIME_SIGNAL_SCHEMA_VERSION),
  fact_id: NonEmptyStringSchema,
  tenant_id: NonEmptyStringSchema,
  organization_id: NonEmptyStringSchema,
  statement: NonEmptyStringSchema,
  confidence: ScoreSchema,
  quality: SignalQualityScoreSchema,
  source_signal_ids: z.array(NonEmptyStringSchema).min(1),
  evidence_references: z.array(NonEmptyStringSchema).min(1),
  contradictions: z.array(ContradictionRecordSchema).default([]),
  verified_at: IsoDateTimeSchema,
  expires_at: IsoDateTimeSchema.optional(),
});

export const DecisionCandidateSchema = z.object({
  schema_version: z.literal(REAL_TIME_SIGNAL_SCHEMA_VERSION),
  candidate_id: NonEmptyStringSchema,
  tenant_id: NonEmptyStringSchema,
  organization_id: NonEmptyStringSchema,
  decision_type: NonEmptyStringSchema,
  requested_action: NonEmptyStringSchema,
  verified_fact_ids: z.array(NonEmptyStringSchema).min(1),
  evidence_references: z.array(NonEmptyStringSchema).min(1),
  confidence: ScoreSchema,
  business_impact: z.object({
    amount: z.number().finite().optional(),
    currency: z.string().min(3).max(8).optional(),
    description: NonEmptyStringSchema,
  }),
  risk_level: RiskLevelSchema,
  justification: NonEmptyStringSchema,
  metadata: JsonRecordSchema.default({}),
});

export type RawEvent = z.infer<typeof RawEventSchema>;
export type NormalizedSignal = z.infer<typeof NormalizedSignalSchema>;
export type SignalQualityScore = z.infer<typeof SignalQualityScoreSchema>;
export type ContradictionRecord = z.infer<typeof ContradictionRecordSchema>;
export type VerifiedFact = z.infer<typeof VerifiedFactSchema>;
export type DecisionCandidate = z.infer<typeof DecisionCandidateSchema>;

export type FreshnessClassification = "fresh" | "stale" | "future" | "invalid";

export function createPayloadHash(payload: unknown): string {
  return stableHash(payload);
}

export function deriveSignalId(rawEvent: Pick<RawEvent, "tenant_id" | "source_system" | "event_id">, signalType: string): string {
  return `signal_${stableSlug(rawEvent.tenant_id)}_${stableSlug(rawEvent.source_system)}_${stableHash({
    event_id: rawEvent.event_id,
    signal_type: signalType,
  }).replace("fnv1a-", "")}`;
}

export function deriveIdempotencyKey(input: {
  tenant_id: string;
  source_id: string;
  purpose: string;
}): string {
  return `${input.tenant_id}:${input.source_id}:${input.purpose}:${stableHash(input).replace("fnv1a-", "")}`;
}

export function classifyFreshness(input: {
  observed_at: string;
  now?: string;
  max_age_seconds: number;
}): FreshnessClassification {
  const observed = new Date(input.observed_at).getTime();
  const now = new Date(input.now ?? new Date().toISOString()).getTime();
  if (!Number.isFinite(observed) || !Number.isFinite(now) || input.max_age_seconds < 0) return "invalid";
  const ageSeconds = (now - observed) / 1000;
  if (ageSeconds < 0) return "future";
  return ageSeconds <= input.max_age_seconds ? "fresh" : "stale";
}

export function isFresh(input: {
  observed_at: string;
  now?: string;
  max_age_seconds: number;
}): boolean {
  return classifyFreshness(input) === "fresh";
}

export function validateSignalQualityShape(input: unknown): {
  success: boolean;
  data?: SignalQualityScore;
  errors: string[];
} {
  const parsed = SignalQualityScoreSchema.safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data, errors: [] };
  return {
    success: false,
    errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "quality"}: ${issue.message}`),
  };
}

export function mapDecisionCandidateToAgentGatewayRequest(
  candidate: DecisionCandidate,
  input: {
    agent_id: string;
    idempotency_key?: string;
  },
): AgentGatewayRequest {
  const parsed = DecisionCandidateSchema.parse(candidate);
  return {
    agent_id: input.agent_id,
    tenant_id: parsed.tenant_id,
    organization_id: parsed.organization_id,
    idempotency_key:
      input.idempotency_key ??
      deriveIdempotencyKey({
        tenant_id: parsed.tenant_id,
        source_id: parsed.candidate_id,
        purpose: "agent-gateway-handoff",
      }),
    decision_type: parsed.decision_type,
    requested_action: parsed.requested_action,
    evidence_references: parsed.evidence_references,
    confidence: parsed.confidence,
    business_impact: parsed.business_impact,
    risk_level: parsed.risk_level as RiskLevel,
    justification: parsed.justification,
    metadata: {
      ...parsed.metadata,
      schema_version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
      candidate_id: parsed.candidate_id,
      verified_fact_ids: parsed.verified_fact_ids,
    },
  };
}

function stableSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
