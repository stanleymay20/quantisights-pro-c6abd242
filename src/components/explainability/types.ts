/**
 * Explainability types — shared shape for the locked Phase 6 contract.
 *
 * See `.lovable/phase-6-explainability-contract.md` for the full contract.
 * Adapters in `explainability-adapter.ts` produce `ExplainabilityRecord`
 * values from existing source records (advisory, decision, etc.) and
 * `ExplainabilityPanel` renders them. No business logic lives here.
 */
import type { DualLayerEvidence } from "@/components/dashboard/DualLayerEvidencePanel";
import type { ConfidenceObject } from "@/components/ConfidenceBadge";

export type ExplainabilitySourceKind =
  | "advisory"
  | "decision"
  | "boardroom"
  | "brief"
  | "outcome";

export interface ExplainabilityEvidenceRow {
  label: string;
  value: string;
}

export interface ExplainabilityAlternative {
  label: string;
  rationale?: string;
}

export interface ExplainabilityRisk {
  label: string;
  severity?: "low" | "moderate" | "high";
}

export interface ExplainabilityImpact {
  summary?: string | null;
  projectedChange?: {
    metric: string;
    delta: number;
    unit?: string;
  } | null;
}

export interface ExplainabilityConfidence {
  /** 0–100, already capped at source. Null when no confidence is recorded. */
  value: number | null;
  meta?: ConfidenceObject | null;
  /** When present, the panel renders the IQ score badge for the dataset. */
  iq?: { orgId: string; datasetId?: string | null } | null;
}

export interface ExplainabilityEvidence {
  dualLayer?: DualLayerEvidence | null;
  sources?: ExplainabilityEvidenceRow[];
}

export interface ExplainabilityRecord {
  source: {
    kind: ExplainabilitySourceKind;
    id: string;
    title: string;
  };
  why: string[] | null;
  evidence: ExplainabilityEvidence | null;
  confidence: ExplainabilityConfidence | null;
  alternatives: ExplainabilityAlternative[] | null;
  risks: ExplainabilityRisk[] | null;
  expectedImpact: ExplainabilityImpact | null;
}

/**
 * True when a value should render its section body. Per contract §2, empty
 * arrays count as missing.
 */
export const hasExplainabilityContent = (v: unknown): boolean => {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") {
    // Treat objects with all-null/all-empty values as missing.
    const obj = v as Record<string, unknown>;
    return Object.values(obj).some((x) => {
      if (x == null) return false;
      if (Array.isArray(x)) return x.length > 0;
      if (typeof x === "string") return x.trim().length > 0;
      return true;
    });
  }
  if (typeof v === "string") return v.trim().length > 0;
  return true;
};
