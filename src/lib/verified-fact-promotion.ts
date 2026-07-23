import { z } from "zod";

import { type ExtendedContradictionRecord } from "@/lib/contradiction-detection";
import { type NormalizedSignal } from "@/lib/real-time-signals";
import { classifySignalFreshnessBand } from "@/lib/signal-quality";

export const ENTERPRISE_VERIFIED_FACT_SCHEMA_VERSION = "quantivis.enterprise-verified-fact.v1";
export const PROMOTION_ENGINE_VERSION = "rts-1d.1";

export type PromotionPolicyName = "STRICT" | "NORMAL" | "PERMISSIVE";
export type PromotionStatus = "PROMOTED" | "NOT_PROMOTED";
export type EnterpriseVerifiedFactLifecycleStatus =
  | "DRAFT"
  | "VERIFIED"
  | "ACTIVE"
  | "SUPERSEDED"
  | "EXPIRED"
  | "ARCHIVED";

export interface SignalQualityAssessment {
  signal_id: string;
  completeness: number;
  consistency: number;
  freshness: number;
  provenance: number;
  materiality: number;
  integrity: number;
  overall: number;
  explanation: string[];
}

export interface PromotionInput {
  fact_type: string;
  assertion: string;
  signals: NormalizedSignal[];
  contradictions: ExtendedContradictionRecord[];
  quality_scores: SignalQualityAssessment[];
  evidence_references: string[];
  confidence: number;
  promotion_policy: PromotionPolicyName;
  now: string;
  expires_at?: string;
  previous_fact?: EnterpriseVerifiedFact | null;
  audit_reference?: string | null;
  certification_reference?: string | null;
  regulated?: boolean;
}

export interface EnterpriseVerifiedFact {
  fact_id: string;
  fact_version: number;
  tenant_id: string;
  organization_id: string;
  fact_type: string;
  assertion: string;
  supporting_signal_ids: string[];
  supporting_raw_event_ids: string[];
  supporting_evidence: string[];
  quality_score: number;
  confidence: number;
  promotion_policy: PromotionPolicyName;
  promotion_reason: string;
  promotion_engine_version: typeof PROMOTION_ENGINE_VERSION;
  signal_quality_summary: {
    average_quality: number;
    minimum_quality: number;
    signal_count: number;
  };
  resolved_contradictions: string[];
  accepted_contradictions: string[];
  fact_hash: string;
  created_at: string;
  expires_at: string | null;
  status: EnterpriseVerifiedFactLifecycleStatus;
  lineage: {
    raw_events: string[];
    signals: string[];
    quality_assessments: string[];
    contradictions: string[];
    promotion_policy: PromotionPolicyName;
    promotion_engine_version: typeof PROMOTION_ENGINE_VERSION;
    previous_fact_hashes: string[];
  };
  audit_reference: string | null;
  certification_reference: string | null;
  schema_version: typeof ENTERPRISE_VERIFIED_FACT_SCHEMA_VERSION;
}

export interface PromotionResult {
  status: PromotionStatus;
  fact: EnterpriseVerifiedFact | null;
  explanation: string[];
}

const ScoreSchema = z.number().finite().min(0).max(100);
const NonEmptyStringSchema = z.string().min(1);
const EnterpriseVerifiedFactLifecycleStatusSchema = z.enum([
  "DRAFT",
  "VERIFIED",
  "ACTIVE",
  "SUPERSEDED",
  "EXPIRED",
  "ARCHIVED",
]);

export const EnterpriseVerifiedFactSchema = z.object({
  fact_id: NonEmptyStringSchema,
  fact_version: z.number().int().positive(),
  tenant_id: NonEmptyStringSchema,
  organization_id: NonEmptyStringSchema,
  fact_type: NonEmptyStringSchema,
  assertion: NonEmptyStringSchema,
  supporting_signal_ids: z.array(NonEmptyStringSchema).min(1),
  supporting_raw_event_ids: z.array(NonEmptyStringSchema).min(1),
  supporting_evidence: z.array(NonEmptyStringSchema).min(1),
  quality_score: ScoreSchema,
  confidence: ScoreSchema,
  promotion_policy: z.enum(["STRICT", "NORMAL", "PERMISSIVE"]),
  promotion_reason: NonEmptyStringSchema,
  promotion_engine_version: z.literal(PROMOTION_ENGINE_VERSION),
  signal_quality_summary: z.object({
    average_quality: ScoreSchema,
    minimum_quality: ScoreSchema,
    signal_count: z.number().int().positive(),
  }),
  resolved_contradictions: z.array(NonEmptyStringSchema),
  accepted_contradictions: z.array(NonEmptyStringSchema),
  fact_hash: NonEmptyStringSchema,
  created_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }).nullable(),
  status: EnterpriseVerifiedFactLifecycleStatusSchema,
  lineage: z.object({
    raw_events: z.array(NonEmptyStringSchema).min(1),
    signals: z.array(NonEmptyStringSchema).min(1),
    quality_assessments: z.array(NonEmptyStringSchema),
    contradictions: z.array(NonEmptyStringSchema),
    promotion_policy: z.enum(["STRICT", "NORMAL", "PERMISSIVE"]),
    promotion_engine_version: z.literal(PROMOTION_ENGINE_VERSION),
    previous_fact_hashes: z.array(NonEmptyStringSchema),
  }),
  audit_reference: z.string().min(1).nullable(),
  certification_reference: z.string().min(1).nullable(),
  schema_version: z.literal(ENTERPRISE_VERIFIED_FACT_SCHEMA_VERSION),
});

const POLICY_THRESHOLDS: Record<PromotionPolicyName, { quality: number; confidence: number }> = {
  STRICT: { quality: 95, confidence: 95 },
  NORMAL: { quality: 85, confidence: 80 },
  PERMISSIVE: { quality: 70, confidence: 70 },
};

export function promoteVerifiedFact(input: PromotionInput): PromotionResult {
  const explanation: string[] = [];
  const failures: string[] = [];
  const signals = [...input.signals].sort((a, b) => a.signal_id.localeCompare(b.signal_id));
  const contradictions = [...input.contradictions].sort((a, b) => a.contradiction_id.localeCompare(b.contradiction_id));
  const qualityScores = [...input.quality_scores].sort((a, b) => a.signal_id.localeCompare(b.signal_id));
  const evidence = [...new Set(input.evidence_references)].sort();
  const thresholds = POLICY_THRESHOLDS[input.promotion_policy];

  if (signals.length === 0) failures.push("no validated signals were provided");
  if (input.promotion_policy === "PERMISSIVE" && input.regulated) {
    failures.push("PERMISSIVE policy is not allowed for regulated scenarios");
  }

  const boundary = validateBoundary(signals);
  if (!boundary.valid) failures.push("tenant/organization mismatch across supporting signals");

  if (evidence.length === 0 || signals.some((signal) => signal.evidence_references.length === 0)) {
    failures.push("required evidence is missing");
  }

  const expiredSignal = signals.find((signal) => classifySignalFreshnessBand({ observed_at: signal.observed_at, now: input.now }) === "expired");
  if (expiredSignal) failures.push(`signal ${expiredSignal.signal_id} has expired evidence`);

  const qualityScore = calculateQualityScore(signals, qualityScores);
  const minimumIntegrity = qualityScores.length > 0 ? Math.min(...qualityScores.map((score) => score.integrity)) : 0;
  if (qualityScore < thresholds.quality) {
    failures.push(`quality ${qualityScore} is below ${input.promotion_policy} threshold ${thresholds.quality}`);
  }
  if (input.confidence < thresholds.confidence) {
    failures.push(`confidence ${input.confidence} is below ${input.promotion_policy} threshold ${thresholds.confidence}`);
  }
  if (minimumIntegrity < 70) {
    failures.push(`integrity ${minimumIntegrity} is below minimum 70`);
  }

  const criticalContradiction = contradictions.find((record) => record.severity === "critical");
  if (criticalContradiction) failures.push(`critical contradiction ${criticalContradiction.contradiction_id} is present`);

  const unresolvedBlocking = contradictions.find((record) => {
    if (record.severity === "critical") return true;
    if (input.promotion_policy === "STRICT") return record.resolution.status !== "resolved";
    if (input.promotion_policy === "NORMAL") {
      if (record.severity === "medium") return record.resolution.status !== "accepted" && record.resolution.status !== "resolved";
      return record.severity === "high" && record.resolution.status !== "resolved";
    }
    return record.decision_impact.blocks_decision && record.resolution.status !== "accepted" && record.resolution.status !== "resolved";
  });
  if (unresolvedBlocking) failures.push(`unresolved contradiction ${unresolvedBlocking.contradiction_id} is not allowed by ${input.promotion_policy}`);

  explanation.push(`policy ${input.promotion_policy} requires quality >=${thresholds.quality} and confidence >=${thresholds.confidence}.`);
  explanation.push(`calculated quality score is ${qualityScore}.`);
  explanation.push(`submitted confidence is ${input.confidence}.`);
  explanation.push(`supporting evidence count is ${evidence.length}.`);
  explanation.push(`contradiction count is ${contradictions.length}.`);

  if (failures.length > 0) {
    return {
      status: "NOT_PROMOTED",
      fact: null,
      explanation: [...explanation, ...failures.map((failure) => `not promoted: ${failure}.`)],
    };
  }

  const tenantId = signals[0].tenant_id;
  const organizationId = signals[0].organization_id;
  const factVersion = (input.previous_fact?.fact_version ?? 0) + 1;
  const lineage: EnterpriseVerifiedFact["lineage"] = {
    raw_events: sortedUnique(signals.map((signal) => signal.raw_event_id)),
    signals: sortedUnique(signals.map((signal) => signal.signal_id)),
    quality_assessments: sortedUnique(qualityScores.map((score) => score.signal_id)),
    contradictions: sortedUnique(contradictions.map((record) => record.contradiction_id)),
    promotion_policy: input.promotion_policy,
    promotion_engine_version: PROMOTION_ENGINE_VERSION,
    previous_fact_hashes: input.previous_fact?.fact_hash ? [input.previous_fact.fact_hash] : [],
  };
  const resolvedContradictions = sortedUnique(
    contradictions.filter((record) => record.resolution.status === "resolved").map((record) => record.contradiction_id),
  );
  const acceptedContradictions = sortedUnique(
    contradictions.filter((record) => record.resolution.status === "accepted").map((record) => record.contradiction_id),
  );
  const qualitySummary = {
    average_quality: qualityScore,
    minimum_quality: qualityScores.length > 0 ? Math.min(...qualityScores.map((score) => score.overall)) : qualityScore,
    signal_count: signals.length,
  };

  const withoutHash: Omit<EnterpriseVerifiedFact, "fact_hash"> = {
    fact_id: deriveFactId(tenantId, organizationId, input.fact_type, input.assertion),
    fact_version: factVersion,
    tenant_id: tenantId,
    organization_id: organizationId,
    fact_type: input.fact_type,
    assertion: input.assertion,
    supporting_signal_ids: lineage.signals,
    supporting_raw_event_ids: lineage.raw_events,
    supporting_evidence: evidence,
    quality_score: qualityScore,
    confidence: input.confidence,
    promotion_policy: input.promotion_policy,
    promotion_reason: `Promoted because ${input.promotion_policy} policy thresholds were met with quality ${qualityScore}, confidence ${input.confidence}, evidence present, and no disallowed contradictions.`,
    promotion_engine_version: PROMOTION_ENGINE_VERSION,
    signal_quality_summary: qualitySummary,
    resolved_contradictions: resolvedContradictions,
    accepted_contradictions: acceptedContradictions,
    created_at: input.now,
    expires_at: input.expires_at ?? null,
    status: "VERIFIED",
    lineage,
    audit_reference: input.audit_reference ?? null,
    certification_reference: input.certification_reference ?? null,
    schema_version: ENTERPRISE_VERIFIED_FACT_SCHEMA_VERSION,
  };
  const fact: EnterpriseVerifiedFact = {
    ...withoutHash,
    fact_hash: stableHash(withoutHash),
  };

  return {
    status: "PROMOTED",
    fact,
    explanation: [
      ...explanation,
      `promoted Enterprise Verified Fact ${fact.fact_id} version ${fact.fact_version}.`,
      fact.promotion_reason,
    ],
  };
}

function validateBoundary(signals: NormalizedSignal[]): { valid: boolean } {
  if (signals.length === 0) return { valid: false };
  const tenantId = signals[0].tenant_id;
  const organizationId = signals[0].organization_id;
  return {
    valid: signals.every((signal) => signal.tenant_id === tenantId && signal.organization_id === organizationId),
  };
}

function calculateQualityScore(signals: NormalizedSignal[], qualityScores: SignalQualityAssessment[]): number {
  if (qualityScores.length > 0) {
    return clampScore(average(qualityScores.map((score) => score.overall)));
  }
  if (signals.length === 0) return 0;
  return clampScore(average(signals.map((signal) => signal.quality.overall)));
}

function deriveFactId(tenantId: string, organizationId: string, factType: string, assertion: string): string {
  return `evf-${stableHash({ assertion, factType, organizationId, tenantId }).replace("fnv1a-", "")}`;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
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
