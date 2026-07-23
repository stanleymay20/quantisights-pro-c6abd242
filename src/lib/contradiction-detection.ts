import { z } from "zod";

import {
  ContradictionRecordSchema,
  createPayloadHash,
  type NormalizedSignal,
} from "@/lib/real-time-signals";
import { classifySignalFreshnessBand } from "@/lib/signal-quality";

export type ContradictionCategory =
  | "financial"
  | "inventory"
  | "customer"
  | "supplier"
  | "cybersecurity"
  | "compliance"
  | "identity"
  | "operational";

export type ContradictionSeverity = "low" | "medium" | "high" | "critical";

export interface ContradictionDetectionSignal extends Omit<NormalizedSignal, "schema_version"> {
  schema_version: string;
  provenance?: {
    source_record_id?: string;
    payload_hash?: string;
  };
  source_reliability?: number;
  historical_source_accuracy?: number;
}

export const ExtendedContradictionRecordSchema = ContradictionRecordSchema.extend({
  confidence: z.number().finite().min(0).max(100),
  possible_causes: z.array(z.string().min(1)),
  recommended_action: z.string().min(1),
  explanation: z.string().min(1),
  decision_impact: z.object({
    blocks_decision: z.boolean(),
    affected_decision_types: z.array(z.string().min(1)),
    rationale: z.string().min(1),
  }),
  resolution: z.object({
    status: z.enum(["open", "investigating", "resolved", "accepted"]),
    resolved_by: z.string().min(1).optional(),
    resolved_at: z.string().datetime({ offset: true }).optional(),
    resolution_note: z.string().min(1).optional(),
  }),
  category: z.enum([
    "financial",
    "inventory",
    "customer",
    "supplier",
    "cybersecurity",
    "compliance",
    "identity",
    "operational",
  ]),
  lineage: z.object({
    raw_events: z.array(z.string().min(1)),
    signals: z.array(z.string().min(1)),
    verified_facts: z.array(z.string().min(1)).optional(),
  }),
});

export type ExtendedContradictionRecord = z.infer<typeof ExtendedContradictionRecordSchema>;

export function detectContradictions(
  signals: ContradictionDetectionSignal[],
  options: { now?: string } = {},
): ExtendedContradictionRecord[] {
  const sortedSignals = [...signals].sort((a, b) => stableSignalKey(a).localeCompare(stableSignalKey(b)));
  const contradictions: ExtendedContradictionRecord[] = [];

  for (let i = 0; i < sortedSignals.length; i += 1) {
    for (let j = i + 1; j < sortedSignals.length; j += 1) {
      const a = sortedSignals[i];
      const b = sortedSignals[j];
      contradictions.push(...detectBoundaryContradictions(a, b, options));
      contradictions.push(...detectMissingEvidenceContradictions(a, b, options));
      contradictions.push(...detectDuplicateSourceRecordContradictions(a, b, options));
      contradictions.push(...detectPayloadValueContradictions(a, b, options));
      contradictions.push(...detectFreshnessContradictions(a, b, options));
    }
  }

  return dedupeContradictions(contradictions).sort((a, b) => a.contradiction_id.localeCompare(b.contradiction_id));
}

function detectBoundaryContradictions(
  a: ContradictionDetectionSignal,
  b: ContradictionDetectionSignal,
  options: { now?: string },
): ExtendedContradictionRecord[] {
  if (a.tenant_id === b.tenant_id && a.organization_id === b.organization_id) return [];
  return [
    buildRecord({
      a,
      b,
      field: "tenant_organization_boundary",
      value_a: `${a.tenant_id}/${a.organization_id}`,
      value_b: `${b.tenant_id}/${b.organization_id}`,
      severity: "critical",
      category: "identity",
      confidence: calculateConfidence(a, b, "tenant_organization_boundary", options),
      possible_causes: ["Cross-tenant data mix", "Incorrect organization routing", "Connector authorization boundary failure"],
      recommended_action: "Block decision processing and investigate tenant and organization boundary configuration.",
      explanation: "Critical identity contradiction detected because the compared signals belong to different tenant or organization boundaries.",
      blocksDecision: true,
      affectedDecisionTypes: ["all"],
      rationale: "Cross-tenant or cross-organization evidence must never influence an enterprise decision.",
      options,
    }),
  ];
}

function detectMissingEvidenceContradictions(
  a: ContradictionDetectionSignal,
  b: ContradictionDetectionSignal,
  options: { now?: string },
): ExtendedContradictionRecord[] {
  const records: ExtendedContradictionRecord[] = [];
  for (const signal of [a, b]) {
    if (signal.evidence_references.length > 0) continue;
    const other = signal.signal_id === a.signal_id ? b : a;
    records.push(
      buildRecord({
        a: signal,
        b: other,
        field: "evidence_references",
        value_a: [],
        value_b: other.evidence_references,
        severity: "medium",
        category: "compliance",
        confidence: calculateConfidence(signal, other, "evidence_references", options),
        possible_causes: ["Evidence attachment failed", "Manual signal created without citation", "Connector emitted incomplete provenance"],
        recommended_action: "Do not promote this signal to a verified fact until evidence references are attached.",
        explanation: "Evidence contradiction detected because one signal lacks supporting evidence references.",
        blocksDecision: true,
        affectedDecisionTypes: ["governance_review", "approval"],
        rationale: "Evidence-free signals cannot support governed decisions.",
        options,
      }),
    );
  }
  return records;
}

function detectDuplicateSourceRecordContradictions(
  a: ContradictionDetectionSignal,
  b: ContradictionDetectionSignal,
  options: { now?: string },
): ExtendedContradictionRecord[] {
  if (a.source_system !== b.source_system) return [];
  if (!a.provenance?.source_record_id || a.provenance.source_record_id !== b.provenance?.source_record_id) return [];
  const hashA = a.provenance.payload_hash ?? createPayloadHash(a.payload);
  const hashB = b.provenance.payload_hash ?? createPayloadHash(b.payload);
  if (hashA === hashB) return [];

  return [
    buildRecord({
      a,
      b,
      field: "provenance.payload_hash",
      value_a: hashA,
      value_b: hashB,
      severity: "high",
      category: "operational",
      confidence: calculateConfidence(a, b, "provenance.payload_hash", options),
      possible_causes: ["Replay with changed payload", "Late source-system correction", "Connector deduplication failure"],
      recommended_action: "Hold downstream decisions until the duplicate source record is reconciled.",
      explanation: "Duplicate source record contradiction detected because the same source record produced different payload hashes.",
      blocksDecision: true,
      affectedDecisionTypes: ["all"],
      rationale: "A duplicated source record with changed payload undermines audit lineage.",
      options,
    }),
  ];
}

function detectPayloadValueContradictions(
  a: ContradictionDetectionSignal,
  b: ContradictionDetectionSignal,
  options: { now?: string },
): ExtendedContradictionRecord[] {
  if (!sameBoundary(a, b)) return [];
  const records: ExtendedContradictionRecord[] = [];
  const sharedFields = Object.keys(a.payload).filter((field) => Object.prototype.hasOwnProperty.call(b.payload, field));
  for (const field of sharedFields.sort()) {
    const valueA = a.payload[field];
    const valueB = b.payload[field];
    if (Object.is(valueA, valueB)) continue;
    if (!isComparableValue(valueA) || !isComparableValue(valueB)) continue;

    const category = categorizeField(field, a, b);
    const severity = determineSeverity(field, valueA, valueB, category, a, b);
    records.push(
      buildRecord({
        a,
        b,
        field,
        value_a: valueA,
        value_b: valueB,
        severity,
        category,
        confidence: calculateConfidence(a, b, field, options),
        possible_causes: possibleCausesFor(category),
        recommended_action: recommendedActionFor(category, severity),
        explanation: `${category} contradiction detected for ${field}: ${a.source_system} reported ${String(valueA)} while ${b.source_system} reported ${String(valueB)}.`,
        blocksDecision: shouldBlockDecision(category, severity),
        affectedDecisionTypes: affectedDecisionTypesFor(category),
        rationale: decisionRationaleFor(category, severity),
        options,
      }),
    );
  }
  return records;
}

function detectFreshnessContradictions(
  a: ContradictionDetectionSignal,
  b: ContradictionDetectionSignal,
  options: { now?: string },
): ExtendedContradictionRecord[] {
  if (!sameBoundary(a, b)) return [];
  const bandA = classifySignalFreshnessBand({ observed_at: a.observed_at, now: options.now });
  const bandB = classifySignalFreshnessBand({ observed_at: b.observed_at, now: options.now });
  if (bandA === bandB) return [];
  if (![bandA, bandB].includes("stale") && ![bandA, bandB].includes("expired")) return [];

  return [
    buildRecord({
      a,
      b,
      field: "observed_at",
      value_a: a.observed_at,
      value_b: b.observed_at,
      severity: "low",
      category: "operational",
      confidence: calculateConfidence(a, b, "observed_at", options),
      possible_causes: ["Delayed replication", "Batch extract lag", "Late-arriving enterprise event"],
      recommended_action: "Treat stale-source conflicts as investigation items and avoid promoting stale values without corroboration.",
      explanation: `Freshness contradiction detected because ${a.source_system} is ${bandA} while ${b.source_system} is ${bandB}.`,
      blocksDecision: false,
      affectedDecisionTypes: ["data_quality_review"],
      rationale: "Freshness mismatch should be reviewed, but it does not automatically block every decision without a conflicting material value.",
      options,
    }),
  ];
}

function buildRecord(input: {
  a: ContradictionDetectionSignal;
  b: ContradictionDetectionSignal;
  field: string;
  value_a: unknown;
  value_b: unknown;
  severity: ContradictionSeverity;
  category: ContradictionCategory;
  confidence: number;
  possible_causes: string[];
  recommended_action: string;
  explanation: string;
  blocksDecision: boolean;
  affectedDecisionTypes: string[];
  rationale: string;
  options: { now?: string };
}): ExtendedContradictionRecord {
  const detectedAt = input.options.now ?? new Date().toISOString();
  return {
    contradiction_id: deriveContradictionId(input.a, input.b, input.field),
    source_a: input.a.source_system,
    source_b: input.b.source_system,
    field: input.field,
    value_a: input.value_a,
    value_b: input.value_b,
    severity: input.severity,
    detected_at: detectedAt,
    evidence_references: [...new Set([...input.a.evidence_references, ...input.b.evidence_references])].sort(),
    confidence: input.confidence,
    possible_causes: input.possible_causes,
    recommended_action: input.recommended_action,
    explanation: input.explanation,
    decision_impact: {
      blocks_decision: input.blocksDecision,
      affected_decision_types: input.affectedDecisionTypes,
      rationale: input.rationale,
    },
    resolution: {
      status: "open",
    },
    category: input.category,
    lineage: {
      raw_events: [input.a.raw_event_id, input.b.raw_event_id].sort(),
      signals: [input.a.signal_id, input.b.signal_id].sort(),
    },
  };
}

function calculateConfidence(
  a: ContradictionDetectionSignal,
  b: ContradictionDetectionSignal,
  field: string,
  options: { now?: string },
): number {
  const reliability = average([a.source_reliability ?? 70, b.source_reliability ?? 70]);
  const historicalAccuracy = average([a.historical_source_accuracy ?? 70, b.historical_source_accuracy ?? 70]);
  const evidenceCompleteness = average([
    a.evidence_references.length > 0 ? 100 : 30,
    b.evidence_references.length > 0 ? 100 : 30,
  ]);
  const freshness = average([
    freshnessScore(classifySignalFreshnessBand({ observed_at: a.observed_at, now: options.now })),
    freshnessScore(classifySignalFreshnessBand({ observed_at: b.observed_at, now: options.now })),
  ]);
  const fieldCriticality = fieldCriticalityScore(field, categorizeField(field, a, b));
  const magnitude = contradictionMagnitudeScore(a.payload[field], b.payload[field]);
  return clampScore(
    reliability * 0.2 +
      freshness * 0.15 +
      evidenceCompleteness * 0.18 +
      historicalAccuracy * 0.17 +
      fieldCriticality * 0.15 +
      magnitude * 0.15,
  );
}

function determineSeverity(
  field: string,
  valueA: unknown,
  valueB: unknown,
  category: ContradictionCategory,
  a: ContradictionDetectionSignal,
  b: ContradictionDetectionSignal,
): ContradictionSeverity {
  if (isRegulatedField(field) || isHighValue(a) || isHighValue(b) || category === "financial") return "critical";
  if (category === "inventory" && contradictionMagnitudeScore(valueA, valueB) >= 70) return "high";
  if (category === "compliance" || category === "cybersecurity") return "critical";
  if (category === "supplier" || category === "customer" || category === "operational") return "medium";
  return "low";
}

function categorizeField(
  field: string,
  a: ContradictionDetectionSignal,
  b: ContradictionDetectionSignal,
): ContradictionCategory {
  const text = `${field} ${a.signal_type} ${b.signal_type}`.toLowerCase();
  if (/tenant|organization|identity|user|account/.test(text)) return "identity";
  if (/revenue|finance|amount|cost|margin|price|currency|invoice/.test(text)) return "financial";
  if (/inventory|stock|warehouse|sku|quantity|count/.test(text)) return "inventory";
  if (/customer|account|crm/.test(text)) return "customer";
  if (/supplier|vendor|purchase_order|po-/.test(text)) return "supplier";
  if (/security|siem|cyber|incident|vulnerability/.test(text)) return "cybersecurity";
  if (/regulated|compliance|policy|audit|evidence/.test(text)) return "compliance";
  return "operational";
}

function possibleCausesFor(category: ContradictionCategory): string[] {
  switch (category) {
    case "inventory":
      return ["Inventory synchronization lag", "Delayed replication", "Manual adjustment pending"];
    case "financial":
      return ["Finance posting delay", "Revenue recognition adjustment pending", "ERP reconciliation lag"];
    case "compliance":
      return ["Policy classification mismatch", "Incomplete compliance evidence", "Manual governance override pending"];
    case "identity":
      return ["Tenant boundary mismatch", "Incorrect organization mapping", "Identity synchronization error"];
    default:
      return ["Source synchronization issue", "Late-arriving event", "Manual update pending"];
  }
}

function recommendedActionFor(category: ContradictionCategory, severity: ContradictionSeverity): string {
  if (category === "inventory" && (severity === "high" || severity === "critical")) {
    return "Do not generate replenishment or production-planning decision until contradiction is resolved.";
  }
  if (severity === "critical") return "Block decision processing until the contradiction is investigated and resolved.";
  if (severity === "high") return "Require governance review before using this signal in a decision.";
  return "Record contradiction for review before fact promotion.";
}

function shouldBlockDecision(category: ContradictionCategory, severity: ContradictionSeverity): boolean {
  return severity === "critical" || severity === "high" || category === "compliance" || category === "identity";
}

function affectedDecisionTypesFor(category: ContradictionCategory): string[] {
  switch (category) {
    case "inventory":
      return ["replenishment", "production_planning"];
    case "financial":
      return ["financial_approval", "pricing", "forecasting"];
    case "supplier":
      return ["supplier_switch", "procurement"];
    case "customer":
      return ["customer_risk", "account_planning"];
    case "cybersecurity":
      return ["incident_response", "risk_acceptance"];
    case "compliance":
      return ["governance_review", "approval"];
    case "identity":
      return ["all"];
    default:
      return ["operational_decision"];
  }
}

function decisionRationaleFor(category: ContradictionCategory, severity: ContradictionSeverity): string {
  if (category === "inventory") return "Inventory inconsistency exceeds enterprise tolerance for replenishment or production planning.";
  if (severity === "critical") return "Critical contradiction can materially affect governed enterprise decisions.";
  if (severity === "high") return "High-severity contradiction requires review before decision execution.";
  return "Contradiction should be reviewed before verified fact promotion.";
}

function deriveContradictionId(a: ContradictionDetectionSignal, b: ContradictionDetectionSignal, field: string): string {
  return `contradiction-${stableHash([a.signal_id, b.signal_id].sort().join("|"), field)}`;
}

function stableHash(...values: unknown[]): string {
  const input = values.map((value) => JSON.stringify(value)).join("|");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableSignalKey(signal: ContradictionDetectionSignal): string {
  return `${signal.tenant_id}:${signal.organization_id}:${signal.source_system}:${signal.signal_id}`;
}

function sameBoundary(a: ContradictionDetectionSignal, b: ContradictionDetectionSignal): boolean {
  return a.tenant_id === b.tenant_id && a.organization_id === b.organization_id;
}

function isComparableValue(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isHighValue(signal: ContradictionDetectionSignal): boolean {
  return signal.materiality.level === "critical" || (signal.materiality.amount ?? 0) >= 1_000_000;
}

function isRegulatedField(field: string): boolean {
  return /regulated|compliance|policy|audit|revenue_recognition|safety/.test(field);
}

function freshnessScore(band: string): number {
  switch (band) {
    case "fresh":
      return 100;
    case "warning":
      return 75;
    case "stale":
      return 35;
    default:
      return 0;
  }
}

function fieldCriticalityScore(field: string, category: ContradictionCategory): number {
  if (category === "identity" || category === "financial" || category === "compliance" || isRegulatedField(field)) return 100;
  if (category === "inventory" || category === "cybersecurity") return 85;
  if (category === "supplier" || category === "customer") return 70;
  return 55;
}

function contradictionMagnitudeScore(valueA: unknown, valueB: unknown): number {
  if (typeof valueA !== "number" || typeof valueB !== "number") return Object.is(valueA, valueB) ? 0 : 65;
  const denominator = Math.max(Math.abs(valueA), Math.abs(valueB), 1);
  const ratio = Math.abs(valueA - valueB) / denominator;
  return clampScore(ratio * 100 + 40);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function dedupeContradictions(records: ExtendedContradictionRecord[]): ExtendedContradictionRecord[] {
  const seen = new Map<string, ExtendedContradictionRecord>();
  for (const record of records) {
    seen.set(record.contradiction_id, record);
  }
  return [...seen.values()];
}
