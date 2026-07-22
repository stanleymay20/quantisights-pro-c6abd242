/**
 * Data Trust Score — Phase 8
 *
 * Aggregates ingestion + governance signals into a single trust grade
 * (A+ … D). The grade summarizes health, drift, schema stability, PII
 * posture, anomaly count, and lineage completeness.
 */

import type { DatasetDiagnostics } from "../data-upload-utils";
import type { DriftReport } from "../schema-evolution";
import type { AnomalyDetectionResult } from "./anomaly-detector";

export type TrustGrade = "A+" | "A" | "B" | "C" | "D";

export interface TrustScore {
  grade: TrustGrade;
  score: number; // 0..100
  components: {
    health: number;
    schemaStability: number;
    drift: number;
    pii: number;
    anomalies: number;
    lineage: number;
  };
  rationale: string[];
}

export interface TrustScoreInput {
  diagnostics: DatasetDiagnostics | null;
  drift: DriftReport | null;
  anomalies: AnomalyDetectionResult | null;
  hasLineage: boolean;
}

function gradeFor(score: number): TrustGrade {
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

export function computeTrustScore(input: TrustScoreInput): TrustScore {
  const rationale: string[] = [];

  const health = input.diagnostics?.healthScore ?? 50;
  const schemaStability = Math.round((input.diagnostics?.schemaConfidence ?? 0.5) * 100);

  let drift = 100;
  if (input.drift) {
    if (!input.drift.backwardCompatible) {
      drift = 40;
      rationale.push("Schema drift contains breaking changes.");
    } else if (input.drift.totalChanges > 0) {
      drift = Math.max(60, 100 - input.drift.totalChanges * 5);
      rationale.push(`${input.drift.totalChanges} non-breaking schema change(s).`);
    }
  }

  let pii = 100;
  const piiLevel = input.diagnostics?.piiRisk?.level;
  if (piiLevel === "high") {
    pii = 50;
    rationale.push("High PII exposure detected — review before publish.");
  } else if (piiLevel === "low") {
    pii = 80;
  }

  let anomalies = 100;
  if (input.anomalies) {
    const high = input.anomalies.anomalies.filter((a) => a.severity === "high" || a.severity === "critical").length;
    const med = input.anomalies.anomalies.filter((a) => a.severity === "medium").length;
    anomalies = Math.max(30, 100 - high * 15 - med * 5);
    if (high > 0) rationale.push(`${high} high-severity anomaly signal(s).`);
  }

  const lineage = input.hasLineage ? 100 : 60;
  if (!input.hasLineage) rationale.push("Lineage record not yet persisted.");

  // Weighted composite
  const score = Math.round(
    health * 0.30 +
      schemaStability * 0.15 +
      drift * 0.15 +
      pii * 0.15 +
      anomalies * 0.15 +
      lineage * 0.10,
  );

  if (rationale.length === 0) rationale.push("All trust dimensions within enterprise tolerance.");

  return {
    grade: gradeFor(score),
    score,
    components: { health, schemaStability, drift, pii, anomalies, lineage },
    rationale,
  };
}
