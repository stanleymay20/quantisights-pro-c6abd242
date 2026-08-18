import type { DecisionRoomDecision } from "@/lib/executive-decision-room";

export type DecisionVisualKind =
  | "simple_text"
  | "line"
  | "horizontal_bar"
  | "vertical_bar"
  | "stacked_bar"
  | "waterfall"
  | "slopegraph"
  | "scatter"
  | "heatmap"
  | "comparison_table"
  | "forecast_band"
  | "actual_vs_expected"
  | "none";

export type DecisionAnalyticalIntent =
  | "summarize"
  | "trend"
  | "compare"
  | "rank"
  | "variance"
  | "relationship"
  | "composition"
  | "forecast"
  | "outcome";

export type DecisionActionIntent =
  | "understand"
  | "choose"
  | "approve"
  | "intervene"
  | "monitor"
  | "investigate"
  | "allocate";

export interface DecisionOutcomeEvidence {
  expected_metric: string;
  expected_change: number | null;
  expected_direction?: string | null;
  observed_metric: string | null;
  observed_value_before: number | null;
  observed_value_after: number | null;
  outcome_status?: string | null;
}

export interface DecisionVisualDatum {
  label: string;
  value: number;
  displayValue: string;
  source: string;
  unit?: string | null;
}

export interface DecisionVisualRejection {
  kind: DecisionVisualKind;
  reason: string;
}

export interface DecisionVisualizationSelection {
  kind: DecisionVisualKind;
  score: number;
  title: string;
  takeaway: string;
  reasons: string[];
  rejected: DecisionVisualRejection[];
  data: DecisionVisualDatum[];
  provenance: string[];
  analyticalIntent: DecisionAnalyticalIntent;
  actionIntent: DecisionActionIntent;
  unavailableReason?: string;
}

type DecisionWithLedgerExpectation = DecisionRoomDecision & {
  expected_value_at_decision?: number | null;
};

type StructuredAlternative = {
  label?: unknown;
  name?: unknown;
  value?: unknown;
  expected_value?: unknown;
  impact?: unknown;
  unit?: unknown;
};

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);

const formatPercent = (value: number) => `${Math.round(value)}%`;

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value);

function sameMetric(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!nonEmpty(a) || !nonEmpty(b)) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function deriveActionIntent(decision: DecisionRoomDecision): DecisionActionIntent {
  if (decision.decision_status === "pending") return "approve";
  if (decision.decision_status === "approved" && decision.execution_status === "not_started") return "intervene";
  if (decision.execution_status && decision.execution_status !== "not_started") return "monitor";
  return "understand";
}

function buildLedgerOutcomeComparison(decision: DecisionRoomDecision): DecisionVisualDatum[] | null {
  const ledger = decision as DecisionWithLedgerExpectation;
  if (!finiteNumber(ledger.expected_value_at_decision) || !finiteNumber(decision.actual_value)) return null;

  return [
    {
      label: "Expected value",
      value: ledger.expected_value_at_decision,
      displayValue: formatNumber(ledger.expected_value_at_decision),
      source: "decision_ledger.expected_value_at_decision",
      unit: null,
    },
    {
      label: "Actual value",
      value: decision.actual_value,
      displayValue: formatNumber(decision.actual_value),
      source: "decision_ledger.actual_value",
      unit: null,
    },
  ];
}

function buildOutcomeComparison(
  outcome: DecisionOutcomeEvidence | null | undefined,
): DecisionVisualDatum[] | null {
  if (!outcome) return null;
  if (!sameMetric(outcome.expected_metric, outcome.observed_metric)) return null;
  if (
    outcome.expected_change == null ||
    outcome.observed_value_before == null ||
    outcome.observed_value_after == null
  ) {
    return null;
  }

  const observedChange = outcome.observed_value_after - outcome.observed_value_before;
  const metric = outcome.expected_metric;
  return [
    {
      label: "Expected change",
      value: outcome.expected_change,
      displayValue: formatNumber(outcome.expected_change),
      source: "decision_outcomes.expected_change",
      unit: metric,
    },
    {
      label: "Observed change",
      value: observedChange,
      displayValue: formatNumber(observedChange),
      source: "decision_outcomes.observed_value_after - observed_value_before",
      unit: metric,
    },
  ];
}

function buildStructuredAlternatives(decision: DecisionRoomDecision): DecisionVisualDatum[] {
  const metadata = (decision.explanation_metadata ?? {}) as Record<string, unknown>;
  const raw = metadata.alternatives_considered ?? metadata.alternatives;
  if (!Array.isArray(raw)) return [];

  const items: DecisionVisualDatum[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const alternative = entry as StructuredAlternative;
    const label = nonEmpty(alternative.label)
      ? alternative.label
      : nonEmpty(alternative.name)
        ? alternative.name
        : null;
    const numeric = finiteNumber(alternative.value)
      ? alternative.value
      : finiteNumber(alternative.expected_value)
        ? alternative.expected_value
        : finiteNumber(alternative.impact)
          ? alternative.impact
          : null;
    if (!label || numeric == null) return;
    const unit = nonEmpty(alternative.unit) ? alternative.unit : null;
    items.push({
      label,
      value: numeric,
      displayValue: unit === "EUR" ? formatMoney(numeric) : unit === "%" ? formatPercent(numeric) : formatNumber(numeric),
      source: `decision_ledger.explanation_metadata.alternatives[${index}]`,
      unit,
    });
  });
  return items;
}

function buildDecisionScalars(decision: DecisionRoomDecision): DecisionVisualDatum[] {
  const data: DecisionVisualDatum[] = [];

  if (decision.predicted_net_impact != null) {
    data.push({
      label: "Predicted net impact",
      value: decision.predicted_net_impact,
      displayValue: formatMoney(decision.predicted_net_impact),
      source: "decision_ledger.predicted_net_impact",
      unit: "EUR",
    });
  }

  if (decision.predicted_roi_probability != null) {
    data.push({
      label: "ROI probability",
      value: decision.predicted_roi_probability,
      displayValue: formatPercent(decision.predicted_roi_probability),
      source: "decision_ledger.predicted_roi_probability",
      unit: "%",
    });
  }

  return data.slice(0, 2);
}

const unsupportedRejections = (): DecisionVisualRejection[] => [
  {
    kind: "line",
    reason: "No ordered time-series points are stored on this decision; a narrative time range is not enough to draw a line.",
  },
  {
    kind: "waterfall",
    reason: "No stored starting value, signed contribution components, and ending value are available.",
  },
  {
    kind: "slopegraph",
    reason: "No stored paired before/after values across categories are available.",
  },
  {
    kind: "scatter",
    reason: "No paired observations for two quantitative variables are stored.",
  },
  {
    kind: "heatmap",
    reason: "No matrix or grid of recorded values is stored.",
  },
  {
    kind: "forecast_band",
    reason: "No structured forecast points and uncertainty intervals are stored.",
  },
];

export function selectDecisionVisualization(
  decision: DecisionRoomDecision,
  outcome?: DecisionOutcomeEvidence | null,
): DecisionVisualizationSelection {
  const actionIntent = deriveActionIntent(decision);
  const ledgerOutcomeData = buildLedgerOutcomeComparison(decision);
  const outcomeData = ledgerOutcomeData ?? buildOutcomeComparison(outcome);

  if (outcomeData) {
    const fromLedger = Boolean(ledgerOutcomeData);
    return {
      kind: "actual_vs_expected",
      score: 0.99,
      title: "Expected vs observed outcome",
      takeaway: fromLedger
        ? "Compare the value recorded at decision time with the actual measured value on the same decision."
        : "Compare the recorded expected change with the measured change for the same metric.",
      reasons: [
        fromLedger
          ? "The decision ledger contains both the decision-time expected value and the actual measured value."
          : "A measured outcome exists for the same metric used in the original expectation.",
        "Both values are structured numeric records, so no number is inferred from narrative text.",
        "Outcome comparison is more decision-relevant than showing isolated KPI cards after execution.",
      ],
      rejected: [
        {
          kind: "simple_text",
          reason: "Two directly comparable values are available, so a visual comparison communicates the gap more quickly.",
        },
        ...unsupportedRejections(),
      ],
      data: outcomeData,
      provenance: fromLedger
        ? ["decision_ledger.expected_value_at_decision", "decision_ledger.actual_value"]
        : [
            "decision_outcomes.expected_metric",
            "decision_outcomes.expected_change",
            "decision_outcomes.observed_metric",
            "decision_outcomes.observed_value_before",
            "decision_outcomes.observed_value_after",
          ],
      analyticalIntent: "outcome",
      actionIntent,
    };
  }

  const alternatives = buildStructuredAlternatives(decision);
  if (alternatives.length >= 2) {
    const horizontal = alternatives.length <= 12;
    return {
      kind: horizontal ? "horizontal_bar" : "comparison_table",
      score: horizontal ? 0.97 : 0.94,
      title: "Compare recorded decision options",
      takeaway: `Compare ${alternatives.length} structured alternatives using the same recorded measure.`,
      reasons: [
        `${alternatives.length} alternatives contain structured numeric values rather than narrative-only descriptions.`,
        horizontal
          ? "A horizontal bar chart supports quick category comparison and remains readable when option labels are longer."
          : "A comparison table avoids overcrowding when many options are present.",
        "The visual uses only values stored with the alternatives; it does not estimate missing option metrics.",
      ],
      rejected: [
        {
          kind: "line",
          reason: "The alternatives are categories, not an ordered time series.",
        },
        {
          kind: "actual_vs_expected",
          reason: "No complete expected-versus-observed outcome pair is recorded yet.",
        },
        ...unsupportedRejections().filter((item) => item.kind !== "line"),
      ],
      data: alternatives,
      provenance: alternatives.map((item) => item.source),
      analyticalIntent: "compare",
      actionIntent: decision.decision_status === "pending" ? "choose" : actionIntent,
    };
  }

  const scalars = buildDecisionScalars(decision);
  if (scalars.length > 0) {
    return {
      kind: "simple_text",
      score: 0.96,
      title: "Decision-critical numbers",
      takeaway:
        scalars.length === 1
          ? `${scalars[0].label}: ${scalars[0].displayValue}`
          : `${scalars[0].label}: ${scalars[0].displayValue} · ${scalars[1].label}: ${scalars[1].displayValue}`,
      reasons: [
        `${scalars.length} decision-critical numeric ${scalars.length === 1 ? "value is" : "values are"} stored.`,
        "A chart would add visual machinery without adding meaning when only one or two unrelated headline values need attention.",
        "The engine therefore keeps the numbers prominent and preserves their source fields.",
      ],
      rejected: [
        {
          kind: "actual_vs_expected",
          reason: outcome
            ? "The expected and observed outcome records are incomplete or refer to different metrics."
            : "No complete decision-time expected-versus-actual pair or measured outcome record is available yet.",
        },
        {
          kind: "horizontal_bar",
          reason: "No two-or-more structured alternative category-value pairs are stored.",
        },
        ...unsupportedRejections(),
      ],
      data: scalars,
      provenance: scalars.map((item) => item.source),
      analyticalIntent: "summarize",
      actionIntent,
    };
  }

  return {
    kind: "none",
    score: 1,
    title: "Decision visual unavailable",
    takeaway: "There is not enough structured quantitative evidence to render an honest decision visual.",
    reasons: [
      "Quantivis will not parse numbers out of narrative summaries to manufacture a chart.",
      "A visualization becomes available when the decision stores compatible structured values, comparable alternatives, a genuine series, or a measured outcome.",
    ],
    rejected: [
      {
        kind: "simple_text",
        reason: "No decision-critical scalar metric is stored in a supported numeric field.",
      },
      {
        kind: "actual_vs_expected",
        reason: "No complete expected-versus-observed outcome record is available.",
      },
      {
        kind: "horizontal_bar",
        reason: "No structured comparable alternative values are stored.",
      },
      ...unsupportedRejections(),
    ],
    data: [],
    provenance: [],
    analyticalIntent: "summarize",
    actionIntent,
    unavailableReason: "Visualization unavailable — insufficient recorded evidence.",
  };
}

export const AUTO_SELECTED_VISUAL_KINDS: readonly DecisionVisualKind[] = [
  "simple_text",
  "horizontal_bar",
  "comparison_table",
  "actual_vs_expected",
  "none",
];

export const NEVER_AUTO_SELECT_VISUALS = ["pie", "donut", "3d"] as const;
