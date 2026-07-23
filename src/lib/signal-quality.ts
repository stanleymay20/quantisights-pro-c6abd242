import {
  createPayloadHash,
  REAL_TIME_SIGNAL_SCHEMA_VERSION,
  type NormalizedSignal,
} from "@/lib/real-time-signals";

type QualitySeverity = "low" | "medium" | "high" | "critical";

export type SignalFreshnessBand = "fresh" | "warning" | "stale" | "expired" | "invalid" | "future";

export interface SignalQualityInput extends Omit<NormalizedSignal, "schema_version"> {
  schema_version: string;
  provenance?: {
    connector_verified?: boolean;
    payload_hash?: string;
    source_record_id?: string;
    signature_present?: boolean;
  };
  expected_payload_hash?: string;
  required_payload_fields?: string[];
  optional_payload_fields?: string[];
  allowed_payload_enums?: Record<string, string[]>;
  compared_values?: Array<{
    field: string;
    source_a: string;
    value_a: unknown;
    source_b: string;
    value_b: unknown;
  }>;
  duplicate_ids?: string[];
  decision_trigger?: boolean;
  source_criticality?: QualitySeverity;
  risk_level?: QualitySeverity;
  now?: string;
}

export interface SignalQualityResult {
  completeness: number;
  consistency: number;
  freshness: number;
  provenance: number;
  materiality: number;
  integrity: number;
  overall: number;
  explanation: string[];
}

export const SIGNAL_QUALITY_WEIGHTS = {
  completeness: 0.18,
  consistency: 0.2,
  freshness: 0.16,
  provenance: 0.16,
  materiality: 0.14,
  integrity: 0.16,
} as const;

export function calculateSignalQuality(signal: SignalQualityInput): SignalQualityResult {
  const explanation: string[] = [];
  const completeness = scoreCompleteness(signal, explanation);
  const consistency = scoreConsistency(signal, explanation);
  const freshness = scoreFreshness(signal, explanation);
  const provenance = scoreProvenance(signal, explanation);
  const materiality = scoreMateriality(signal, explanation);
  const integrity = scoreIntegrity(signal, explanation);
  const overall = clampScore(
    Math.round(
      completeness * SIGNAL_QUALITY_WEIGHTS.completeness +
        consistency * SIGNAL_QUALITY_WEIGHTS.consistency +
        freshness * SIGNAL_QUALITY_WEIGHTS.freshness +
        provenance * SIGNAL_QUALITY_WEIGHTS.provenance +
        materiality * SIGNAL_QUALITY_WEIGHTS.materiality +
        integrity * SIGNAL_QUALITY_WEIGHTS.integrity,
    ),
  );

  explanation.push(
    `overall scored ${overall} using deterministic weighted average: completeness ${SIGNAL_QUALITY_WEIGHTS.completeness}, consistency ${SIGNAL_QUALITY_WEIGHTS.consistency}, freshness ${SIGNAL_QUALITY_WEIGHTS.freshness}, provenance ${SIGNAL_QUALITY_WEIGHTS.provenance}, materiality ${SIGNAL_QUALITY_WEIGHTS.materiality}, integrity ${SIGNAL_QUALITY_WEIGHTS.integrity}.`,
  );

  return {
    completeness,
    consistency,
    freshness,
    provenance,
    materiality,
    integrity,
    overall,
    explanation,
  };
}

export function classifySignalFreshnessBand(input: { observed_at: string; now?: string }): SignalFreshnessBand {
  const observed = new Date(input.observed_at).getTime();
  const now = new Date(input.now ?? new Date().toISOString()).getTime();
  if (!Number.isFinite(observed) || !Number.isFinite(now)) return "invalid";
  const ageSeconds = (now - observed) / 1000;
  if (ageSeconds < 0) return "future";
  if (ageSeconds <= 300) return "fresh";
  if (ageSeconds <= 1800) return "warning";
  if (ageSeconds <= 86400) return "stale";
  return "expired";
}

function scoreCompleteness(signal: SignalQualityInput, explanation: string[]): number {
  let score = 100;
  const payload = signal.payload ?? {};
  const requiredFields = signal.required_payload_fields ?? [];
  const optionalFields = signal.optional_payload_fields ?? [];

  for (const field of requiredFields) {
    if (!isPopulated(payload[field])) {
      score -= 20;
      explanation.push(`completeness reduced because missing required field ${field}.`);
    }
  }

  for (const field of optionalFields) {
    if (!isPopulated(payload[field])) {
      score -= 5;
      explanation.push(`completeness reduced because missing optional field ${field}.`);
    }
  }

  if (requiredFields.length === 0) {
    score -= 10;
    explanation.push("completeness reduced because no required payload field contract was provided.");
  }

  const finalScore = clampScore(score);
  if (finalScore === 100) explanation.push("completeness scored 100 because all required and optional payload fields are populated.");
  return finalScore;
}

function scoreConsistency(signal: SignalQualityInput, explanation: string[]): number {
  let score = 100;
  const payload = signal.payload ?? {};

  if (signal.schema_version !== REAL_TIME_SIGNAL_SCHEMA_VERSION) {
    score -= 25;
    explanation.push(`consistency reduced because schema mismatch: ${signal.schema_version}.`);
  }

  for (const [field, value] of Object.entries(payload)) {
    if (isNegativeQuantityField(field, value)) {
      score -= 20;
      explanation.push(`consistency reduced because negative quantity ${field}=${value}.`);
    }
  }

  for (const duplicateId of signal.duplicate_ids ?? []) {
    score -= 15;
    explanation.push(`consistency reduced because duplicate id ${duplicateId} was detected.`);
  }

  for (const [field, allowedValues] of Object.entries(signal.allowed_payload_enums ?? {})) {
    const value = payload[field];
    if (typeof value === "string" && !allowedValues.includes(value)) {
      score -= 15;
      explanation.push(`consistency reduced because invalid enum ${field}=${value}.`);
    }
  }

  for (const comparison of signal.compared_values ?? []) {
    if (!Object.is(comparison.value_a, comparison.value_b)) {
      score -= 20;
      explanation.push(
        `consistency reduced because ${comparison.field} conflicts between ${comparison.source_a} and ${comparison.source_b}.`,
      );
    }
  }

  const finalScore = clampScore(score);
  if (finalScore === 100) explanation.push("consistency scored 100 because schema, enums, duplicate IDs, quantities, and compared values are consistent.");
  return finalScore;
}

function scoreFreshness(signal: SignalQualityInput, explanation: string[]): number {
  const band = classifySignalFreshnessBand({ observed_at: signal.observed_at, now: signal.now });
  switch (band) {
    case "fresh":
      explanation.push("freshness scored 100 because signal age is within 0-300 seconds.");
      return 100;
    case "warning":
      explanation.push("freshness reduced because signal age is within warning threshold 301-1800 seconds.");
      return 75;
    case "stale":
      explanation.push("freshness reduced because signal is stale within 1801-86400 seconds.");
      return 35;
    case "expired":
      explanation.push("freshness reduced because signal is expired at more than 86400 seconds old.");
      return 0;
    case "future":
      explanation.push("freshness reduced because signal timestamp is in the future.");
      return 0;
    default:
      explanation.push("freshness reduced because signal timestamp is invalid.");
      return 0;
  }
}

function scoreProvenance(signal: SignalQualityInput, explanation: string[]): number {
  let score = 100;
  if (!signal.provenance?.connector_verified) {
    score -= 35;
    explanation.push("provenance reduced because connector is not verified.");
  }
  if (!isPopulated(signal.provenance?.source_record_id)) {
    score -= 20;
    explanation.push("provenance reduced because source_record_id is missing.");
  }
  if (!isPopulated(signal.provenance?.payload_hash)) {
    score -= 25;
    explanation.push("provenance reduced because payload_hash is missing.");
  }

  const finalScore = clampScore(score);
  if (finalScore === 100) explanation.push("provenance scored 100 because connector is verified and source record hash is present.");
  return finalScore;
}

function scoreMateriality(signal: SignalQualityInput, explanation: string[]): number {
  let score = severityBaseScore(signal.materiality.level);
  const riskLevel = signal.risk_level ?? signal.materiality.level;
  score = Math.max(score, severityBaseScore(riskLevel));
  score = Math.max(score, severityBaseScore(signal.source_criticality ?? "low"));

  if ((signal.materiality.amount ?? 0) >= 500_000) {
    score = Math.max(score, 95);
    explanation.push("materiality increased because business impact is at least 500000.");
  } else if ((signal.materiality.amount ?? 0) >= 50_000) {
    score = Math.max(score, 75);
    explanation.push("materiality increased because business impact is at least 50000.");
  } else if ((signal.materiality.amount ?? 0) > 0) {
    score = Math.max(score, 45);
    explanation.push("materiality limited because business impact is below 50000.");
  }

  if (signal.decision_trigger) {
    score = Math.max(score, 100);
    explanation.push("materiality scored 100 because a decision trigger is present.");
  } else {
    score -= 20;
    explanation.push("materiality reduced because no decision trigger is present.");
  }

  return clampScore(score);
}

function scoreIntegrity(signal: SignalQualityInput, explanation: string[]): number {
  let score = 100;
  const actualHash = createPayloadHash(signal.payload ?? {});
  const expectedHash = signal.expected_payload_hash ?? signal.provenance?.payload_hash;

  if (!expectedHash) {
    score -= 35;
    explanation.push("integrity reduced because no expected payload hash is available.");
  } else if (actualHash !== expectedHash) {
    score -= 60;
    explanation.push("integrity reduced because payload hash does not match.");
  }

  if (!signal.provenance?.connector_verified) {
    score -= 20;
    explanation.push("integrity reduced because provenance is not verified.");
  }

  if (!signal.provenance?.signature_present) {
    score -= 20;
    explanation.push("integrity reduced because signature is missing.");
  }

  const finalScore = clampScore(score);
  if (finalScore === 100) explanation.push("integrity scored 100 because payload hash matches, provenance is verified, and signature is present.");
  return finalScore;
}

function severityBaseScore(severity: QualitySeverity): number {
  switch (severity) {
    case "critical":
      return 90;
    case "high":
      return 75;
    case "medium":
      return 55;
    case "low":
      return 30;
  }
}

function isNegativeQuantityField(field: string, value: unknown): boolean {
  return /quantity|count|amount|hours|units|volume|qty/i.test(field) && typeof value === "number" && value < 0;
}

function isPopulated(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
