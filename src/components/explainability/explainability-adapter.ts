/**
 * explainability-adapter.ts — pure mappers from existing source records into
 * the locked `ExplainabilityRecord` shape.
 *
 * Phase 6 contract:
 *   - No I/O (callers fetch with existing hooks and pass records in).
 *   - No new reasoning; only field projection + light bullet composition
 *     from deterministic source text.
 *   - Returning `null` for a section means "Not Available" at render time.
 */
import type {
  ExplainabilityRecord,
  ExplainabilityRisk,
  ExplainabilityAlternative,
} from "./types";

// ---------- Source row shapes (loose: only the fields we read) ----------

interface AdvisoryRow {
  id: string;
  title: string;
  category?: string | null;
  rationale?: string | null;
  action?: string | null;
  expected_impact?: string | null;
  impact_score?: number | null;
  capped_confidence?: number | null;
  raw_confidence?: number | null;
  confidence_cap_reason?: string | null;
  variance_score?: number | null;
  data_quality_index?: number | null;
  client_evidence_summary?: string | null;
  internal_context_summary?: string | null;
  combined_interpretation?: string | null;
  client_confidence?: number | null;
  enriched_confidence?: number | null;
  confidence_delta?: number | null;
  blending_rule?: string | null;
  source_evidence?: Record<string, unknown> | null;
  playbook_steps?: unknown;
  kpi_affected?: unknown;
  priority?: string | null;
  organization_id?: string;
  dataset_id?: string | null;
}

interface DecisionRow {
  id: string;
  decision_text?: string | null;
  title?: string | null;
  rationale?: string | null;
  decision_status?: string | null;
  capped_confidence?: number | null;
  confidence_at_decision?: number | null;
  confidence_cap_reason?: string | null;
  expected_outcome?: string | null;
  expected_metric?: string | null;
  expected_change?: number | null;
  organization_id?: string;
  dataset_id?: string | null;
}

interface OutcomeRow {
  outcome_status?: string | null;
  accuracy_score?: number | null;
  expected_change?: number | null;
  observed_value_before?: number | null;
  observed_value_after?: number | null;
  expected_metric?: string | null;
  evaluation_window_days?: number | null;
}

interface BriefRow {
  id: string;
  title?: string | null;
  summary?: string | null;
  rationale?: string | null;
  confidence?: number | null;
  expected_impact?: string | null;
  organization_id?: string;
  dataset_id?: string | null;
}

interface BoardroomItemRow {
  id: string;
  title?: string | null;
  summary?: string | null;
  rationale?: string | null;
  confidence?: number | null;
  alternatives?: Array<{ label: string; rationale?: string }> | null;
  risks?: ExplainabilityRisk[] | null;
  expected_impact?: string | null;
  organization_id?: string;
  dataset_id?: string | null;
  evidence?: {
    client_evidence_summary?: string | null;
    internal_context_summary?: string | null;
    combined_interpretation?: string | null;
  } | null;
}

// ---------- Helpers ----------

/** Split rationale text into bullet lines without LLM rewriting. */
const splitBullets = (text: string | null | undefined): string[] | null => {
  if (!text) return null;
  const lines = text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return lines.length > 0 ? lines : null;
};

/** Coerce a JSONB list of steps into Alternatives (label + rationale). */
const toAlternatives = (raw: unknown): ExplainabilityAlternative[] | null => {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const list = raw
    .map((item): ExplainabilityAlternative | null => {
      if (!item) return null;
      if (typeof item === "string") return { label: item };
      if (typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const label =
          (obj.label as string) ||
          (obj.title as string) ||
          (obj.name as string) ||
          (obj.step as string) ||
          null;
        if (!label) return null;
        const rationale =
          (obj.rationale as string) ||
          (obj.description as string) ||
          (obj.detail as string) ||
          undefined;
        return { label, rationale };
      }
      return null;
    })
    .filter((x): x is ExplainabilityAlternative => x !== null);
  return list.length > 0 ? list : null;
};

const severityFromPriority = (
  priority?: string | null,
): ExplainabilityRisk["severity"] | undefined => {
  if (!priority) return undefined;
  const p = priority.toLowerCase();
  if (p === "critical" || p === "high") return "high";
  if (p === "medium" || p === "moderate") return "moderate";
  if (p === "low") return "low";
  return undefined;
};

// ---------- Adapters ----------

export const fromAdvisory = (a: AdvisoryRow): ExplainabilityRecord => {
  const why = splitBullets(a.rationale) ?? (a.action ? [a.action] : null);

  const dualLayer =
    a.client_evidence_summary ||
    a.internal_context_summary ||
    a.combined_interpretation
      ? {
          client_evidence_summary: a.client_evidence_summary ?? null,
          internal_context_summary: a.internal_context_summary ?? null,
          combined_interpretation: a.combined_interpretation ?? null,
          client_confidence: a.client_confidence ?? null,
          enriched_confidence: a.enriched_confidence ?? null,
          confidence_delta: a.confidence_delta ?? null,
          blending_rule: a.blending_rule ?? null,
        }
      : null;

  const sources: { label: string; value: string }[] = [];
  if (a.category) sources.push({ label: "Category", value: a.category });
  if (a.data_quality_index != null)
    sources.push({ label: "Data Quality Index", value: `${a.data_quality_index}/100` });
  if (a.variance_score != null)
    sources.push({ label: "Variance", value: a.variance_score.toFixed(2) });

  const confidenceValue =
    a.capped_confidence ?? a.enriched_confidence ?? a.raw_confidence ?? null;

  const risks: ExplainabilityRisk[] = [];
  const sev = severityFromPriority(a.priority);
  if (sev) risks.push({ label: `Priority: ${a.priority}`, severity: sev });
  if (a.variance_score != null && a.variance_score > 1.5)
    risks.push({ label: "Elevated variance in source data", severity: "moderate" });
  if (a.data_quality_index != null && a.data_quality_index < 60)
    risks.push({ label: "Low data quality index", severity: "high" });

  return {
    source: { kind: "advisory", id: a.id, title: a.title },
    why,
    evidence:
      dualLayer || sources.length > 0
        ? { dualLayer, sources: sources.length ? sources : undefined }
        : null,
    confidence:
      confidenceValue != null
        ? {
            value: confidenceValue,
            meta: {
              raw_confidence: a.raw_confidence ?? undefined,
              capped_confidence: a.capped_confidence ?? undefined,
              confidence_cap_reason: a.confidence_cap_reason ?? undefined,
              variance_score: a.variance_score ?? null,
            },
            iq: a.organization_id
              ? { orgId: a.organization_id, datasetId: a.dataset_id ?? null }
              : null,
          }
        : null,
    alternatives: toAlternatives(a.playbook_steps),
    risks: risks.length > 0 ? risks : null,
    expectedImpact:
      a.expected_impact || a.impact_score != null
        ? {
            summary: a.expected_impact ?? null,
            projectedChange:
              a.impact_score != null
                ? { metric: "Impact Score", delta: a.impact_score, unit: "/100" }
                : null,
          }
        : null,
  };
};

export const fromDecision = (d: DecisionRow): ExplainabilityRecord => {
  const why = splitBullets(d.rationale);
  const confidenceValue = d.capped_confidence ?? d.confidence_at_decision ?? null;

  const sources: { label: string; value: string }[] = [];
  if (d.decision_status) sources.push({ label: "Status", value: d.decision_status });
  if (d.expected_metric) sources.push({ label: "Metric", value: d.expected_metric });

  return {
    source: {
      kind: "decision",
      id: d.id,
      title: d.title ?? d.decision_text ?? "Decision",
    },
    why,
    evidence: sources.length > 0 ? { sources } : null,
    confidence:
      confidenceValue != null
        ? {
            value: confidenceValue,
            meta: {
              capped_confidence: d.capped_confidence ?? undefined,
              confidence_cap_reason: d.confidence_cap_reason ?? undefined,
            },
            iq: d.organization_id
              ? { orgId: d.organization_id, datasetId: d.dataset_id ?? null }
              : null,
          }
        : null,
    alternatives: null, // Decision ledger has no structured alternatives column → Not Available
    risks: null,
    expectedImpact:
      d.expected_outcome || d.expected_change != null
        ? {
            summary: d.expected_outcome ?? null,
            projectedChange:
              d.expected_metric && d.expected_change != null
                ? { metric: d.expected_metric, delta: d.expected_change }
                : null,
          }
        : null,
  };
};

export const fromOutcome = (
  o: OutcomeRow,
  d: DecisionRow,
): ExplainabilityRecord => {
  const why: string[] = [];
  if (o.outcome_status) why.push(`Outcome status: ${o.outcome_status}`);
  if (o.accuracy_score != null)
    why.push(`Accuracy vs prediction: ${o.accuracy_score.toFixed(0)}%`);
  if (
    o.observed_value_before != null &&
    o.observed_value_after != null
  )
    why.push(
      `Observed change: ${o.observed_value_before} → ${o.observed_value_after}`,
    );

  const sources: { label: string; value: string }[] = [];
  if (o.expected_metric)
    sources.push({ label: "Metric", value: o.expected_metric });
  if (o.evaluation_window_days != null)
    sources.push({
      label: "Window",
      value: `${o.evaluation_window_days} days`,
    });

  return {
    source: {
      kind: "outcome",
      id: d.id,
      title: d.title ?? d.decision_text ?? "Outcome",
    },
    why: why.length > 0 ? why : null,
    evidence: sources.length > 0 ? { sources } : null,
    confidence:
      o.accuracy_score != null
        ? { value: Math.min(85, o.accuracy_score) }
        : null,
    alternatives: null,
    risks: null,
    expectedImpact:
      o.expected_change != null && o.expected_metric
        ? {
            summary: null,
            projectedChange: {
              metric: o.expected_metric,
              delta: o.expected_change,
            },
          }
        : null,
  };
};

export const fromExecutiveBrief = (b: BriefRow): ExplainabilityRecord => {
  const why = splitBullets(b.rationale ?? b.summary);

  return {
    source: { kind: "brief", id: b.id, title: b.title ?? "Executive Brief" },
    why,
    evidence: null,
    confidence:
      b.confidence != null
        ? {
            value: b.confidence,
            iq: b.organization_id
              ? { orgId: b.organization_id, datasetId: b.dataset_id ?? null }
              : null,
          }
        : null,
    alternatives: null,
    risks: null,
    expectedImpact: b.expected_impact ? { summary: b.expected_impact } : null,
  };
};

export const fromBoardroomItem = (
  item: BoardroomItemRow,
): ExplainabilityRecord => {
  const why = splitBullets(item.rationale ?? item.summary);

  const dualLayer = item.evidence
    ? {
        client_evidence_summary: item.evidence.client_evidence_summary ?? null,
        internal_context_summary: item.evidence.internal_context_summary ?? null,
        combined_interpretation: item.evidence.combined_interpretation ?? null,
      }
    : null;

  return {
    source: {
      kind: "boardroom",
      id: item.id,
      title: item.title ?? "Boardroom Item",
    },
    why,
    evidence: dualLayer ? { dualLayer } : null,
    confidence:
      item.confidence != null
        ? {
            value: item.confidence,
            iq: item.organization_id
              ? { orgId: item.organization_id, datasetId: item.dataset_id ?? null }
              : null,
          }
        : null,
    alternatives: item.alternatives && item.alternatives.length > 0 ? item.alternatives : null,
    risks: item.risks && item.risks.length > 0 ? item.risks : null,
    expectedImpact: item.expected_impact ? { summary: item.expected_impact } : null,
  };
};
