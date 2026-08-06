/**
 * Industrial semantic layer.
 *
 * Defines the canonical industrial hierarchy (company → machine), the
 * industrial metric model (OEE and friends) and deterministic evaluation of
 * industrial decision templates.
 *
 * Strict Real Data Only: nothing here synthesizes values. Every derived number
 * is computed from persisted `industrial_metrics` rows. Where there is not
 * enough data, the functions return `null` and the UI must render
 * "Insufficient Data" rather than a fabricated figure.
 */

export const NODE_TYPES = [
  "company",
  "region",
  "site",
  "plant",
  "area",
  "line",
  "cell",
  "machine",
] as const;

export type IndustrialNodeType = (typeof NODE_TYPES)[number];

export const NODE_TYPE_LABEL: Record<IndustrialNodeType, string> = {
  company: "Company",
  region: "Region",
  site: "Site",
  plant: "Plant",
  area: "Area",
  line: "Line",
  cell: "Cell",
  machine: "Machine",
};

export const METRIC_KEYS = [
  "oee",
  "availability",
  "performance",
  "quality",
  "mtbf",
  "mttr",
  "downtime_minutes",
  "yield",
  "scrap_rate",
  "throughput",
  "cycle_time",
  "planned_production",
  "actual_production",
  "inventory",
  "order_backlog",
  "maintenance_events",
  "energy_use",
  "supplier_delay_days",
  "defect_rate",
] as const;

export type IndustrialMetricKey = (typeof METRIC_KEYS)[number];

export type Aggregation = "mean" | "sum" | "last";
export type Direction = "higher_is_better" | "lower_is_better";

export interface MetricDefinition {
  key: IndustrialMetricKey;
  label: string;
  unit: string;
  /** How child nodes roll up into a parent node. */
  aggregation: Aggregation;
  direction: Direction;
  /** Values are expressed 0–1 and rendered as percentages. */
  isRatio: boolean;
  definition: string;
}

export const METRIC_DEFINITIONS: Record<IndustrialMetricKey, MetricDefinition> = {
  oee: {
    key: "oee",
    label: "OEE",
    unit: "%",
    aggregation: "mean",
    direction: "higher_is_better",
    isRatio: true,
    definition: "Overall Equipment Effectiveness = Availability × Performance × Quality.",
  },
  availability: {
    key: "availability",
    label: "Availability",
    unit: "%",
    aggregation: "mean",
    direction: "higher_is_better",
    isRatio: true,
    definition: "Run time divided by planned production time.",
  },
  performance: {
    key: "performance",
    label: "Performance",
    unit: "%",
    aggregation: "mean",
    direction: "higher_is_better",
    isRatio: true,
    definition: "Actual output rate against ideal cycle rate.",
  },
  quality: {
    key: "quality",
    label: "Quality",
    unit: "%",
    aggregation: "mean",
    direction: "higher_is_better",
    isRatio: true,
    definition: "Good units divided by total units produced.",
  },
  mtbf: {
    key: "mtbf",
    label: "MTBF",
    unit: "h",
    aggregation: "mean",
    direction: "higher_is_better",
    isRatio: false,
    definition: "Mean time between failures.",
  },
  mttr: {
    key: "mttr",
    label: "MTTR",
    unit: "h",
    aggregation: "mean",
    direction: "lower_is_better",
    isRatio: false,
    definition: "Mean time to repair.",
  },
  downtime_minutes: {
    key: "downtime_minutes",
    label: "Downtime",
    unit: "min",
    aggregation: "sum",
    direction: "lower_is_better",
    isRatio: false,
    definition: "Unplanned stoppage minutes in the period.",
  },
  yield: {
    key: "yield",
    label: "Yield",
    unit: "%",
    aggregation: "mean",
    direction: "higher_is_better",
    isRatio: true,
    definition: "Conforming output as a share of input material.",
  },
  scrap_rate: {
    key: "scrap_rate",
    label: "Scrap Rate",
    unit: "%",
    aggregation: "mean",
    direction: "lower_is_better",
    isRatio: true,
    definition: "Scrapped units as a share of total production.",
  },
  throughput: {
    key: "throughput",
    label: "Throughput",
    unit: "units",
    aggregation: "sum",
    direction: "higher_is_better",
    isRatio: false,
    definition: "Units produced in the period.",
  },
  cycle_time: {
    key: "cycle_time",
    label: "Cycle Time",
    unit: "s",
    aggregation: "mean",
    direction: "lower_is_better",
    isRatio: false,
    definition: "Average time to produce one unit.",
  },
  planned_production: {
    key: "planned_production",
    label: "Planned Production",
    unit: "units",
    aggregation: "sum",
    direction: "higher_is_better",
    isRatio: false,
    definition: "Production plan for the period.",
  },
  actual_production: {
    key: "actual_production",
    label: "Actual Production",
    unit: "units",
    aggregation: "sum",
    direction: "higher_is_better",
    isRatio: false,
    definition: "Confirmed production for the period.",
  },
  inventory: {
    key: "inventory",
    label: "Inventory",
    unit: "units",
    aggregation: "last",
    direction: "lower_is_better",
    isRatio: false,
    definition: "Stock on hand at period close.",
  },
  order_backlog: {
    key: "order_backlog",
    label: "Order Backlog",
    unit: "orders",
    aggregation: "last",
    direction: "lower_is_better",
    isRatio: false,
    definition: "Open orders not yet fulfilled.",
  },
  maintenance_events: {
    key: "maintenance_events",
    label: "Maintenance Events",
    unit: "events",
    aggregation: "sum",
    direction: "lower_is_better",
    isRatio: false,
    definition: "Corrective and preventive maintenance interventions.",
  },
  energy_use: {
    key: "energy_use",
    label: "Energy Use",
    unit: "kWh",
    aggregation: "sum",
    direction: "lower_is_better",
    isRatio: false,
    definition: "Energy consumed in the period.",
  },
  supplier_delay_days: {
    key: "supplier_delay_days",
    label: "Supplier Delay",
    unit: "days",
    aggregation: "mean",
    direction: "lower_is_better",
    isRatio: false,
    definition: "Average lateness of inbound supplier deliveries.",
  },
  defect_rate: {
    key: "defect_rate",
    label: "Defect Rate",
    unit: "%",
    aggregation: "mean",
    direction: "lower_is_better",
    isRatio: true,
    definition: "Defective units as a share of total production.",
  },
};

/** Headline metrics shown on the plant scorecard, in display order. */
export const HEADLINE_METRICS: IndustrialMetricKey[] = [
  "oee",
  "availability",
  "performance",
  "quality",
  "downtime_minutes",
  "throughput",
  "scrap_rate",
  "mttr",
];

// ── Data shapes ────────────────────────────────────────────────────────────

export interface IndustrialNode {
  id: string;
  organization_id: string;
  parent_id: string | null;
  node_type: IndustrialNodeType;
  name: string;
  external_code: string | null;
  country_code: string | null;
  depth: number;
  is_active: boolean;
}

export interface IndustrialMetricRow {
  id: string;
  node_id: string;
  metric_key: IndustrialMetricKey;
  period_start: string;
  period_end: string;
  granularity: string;
  value: number;
  unit: string | null;
  target_value: number | null;
  data_quality_score: number | null;
  source: string;
}

export interface NodeTreeItem extends IndustrialNode {
  children: NodeTreeItem[];
}

/** Rolled-up value for one metric at one node. */
export interface MetricRollup {
  key: IndustrialMetricKey;
  /** null when there is no observation at or below this node. */
  value: number | null;
  target: number | null;
  /** Number of underlying observations contributing to `value`. */
  sampleSize: number;
  /** Mean of the observations' data-quality scores, null when unscored. */
  dataQuality: number | null;
  /** Change vs the earlier half of the window; null when < 4 observations. */
  deltaPct: number | null;
}

// ── Tree helpers ───────────────────────────────────────────────────────────

export function buildNodeTree(nodes: IndustrialNode[]): NodeTreeItem[] {
  const byId = new Map<string, NodeTreeItem>();
  nodes.forEach((n) => byId.set(n.id, { ...n, children: [] }));

  const roots: NodeTreeItem[] = [];
  byId.forEach((item) => {
    const parent = item.parent_id ? byId.get(item.parent_id) : undefined;
    if (parent) parent.children.push(item);
    else roots.push(item);
  });

  const sortRec = (items: NodeTreeItem[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name));
    items.forEach((i) => sortRec(i.children));
  };
  sortRec(roots);
  return roots;
}

/** All descendant ids of `nodeId`, inclusive of the node itself. */
export function collectSubtreeIds(nodes: IndustrialNode[], nodeId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  nodes.forEach((n) => {
    if (!n.parent_id) return;
    const list = childrenOf.get(n.parent_id) ?? [];
    list.push(n.id);
    childrenOf.set(n.parent_id, list);
  });

  const out: string[] = [];
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop() as string;
    out.push(id);
    (childrenOf.get(id) ?? []).forEach((c) => stack.push(c));
  }
  return out;
}

/** Enterprise → … → node breadcrumb path. */
export function nodeAncestry(nodes: IndustrialNode[], nodeId: string): IndustrialNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: IndustrialNode[] = [];
  let cursor = byId.get(nodeId);
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }
  return chain;
}

// ── Rollups ────────────────────────────────────────────────────────────────

function aggregate(values: number[], mode: Aggregation): number | null {
  if (values.length === 0) return null;
  if (mode === "sum") return values.reduce((a, b) => a + b, 0);
  if (mode === "last") return values[values.length - 1];
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Roll a metric up across a node's subtree for the supplied rows.
 * Rows must already be filtered to the reporting window.
 */
export function rollupMetric(
  rows: IndustrialMetricRow[],
  metricKey: IndustrialMetricKey,
  subtreeIds: Set<string>,
): MetricRollup {
  const def = METRIC_DEFINITIONS[metricKey];
  const scoped = rows
    .filter((r) => r.metric_key === metricKey && subtreeIds.has(r.node_id))
    .sort((a, b) => a.period_start.localeCompare(b.period_start));

  if (scoped.length === 0) {
    return { key: metricKey, value: null, target: null, sampleSize: 0, dataQuality: null, deltaPct: null };
  }

  const values = scoped.map((r) => r.value);
  const value = aggregate(values, def.aggregation);

  const targets = scoped.map((r) => r.target_value).filter((t): t is number => t !== null);
  const target = targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : null;

  const qualities = scoped.map((r) => r.data_quality_score).filter((q): q is number => q !== null);
  const dataQuality = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : null;

  // Trend needs a real before/after split — below 4 points we report nothing.
  let deltaPct: number | null = null;
  if (scoped.length >= 4) {
    const mid = Math.floor(scoped.length / 2);
    const earlier = aggregate(values.slice(0, mid), def.aggregation);
    const later = aggregate(values.slice(mid), def.aggregation);
    if (earlier !== null && later !== null && earlier !== 0) {
      deltaPct = ((later - earlier) / Math.abs(earlier)) * 100;
    }
  }

  return { key: metricKey, value, target, sampleSize: scoped.length, dataQuality, deltaPct };
}

export function rollupHeadline(
  rows: IndustrialMetricRow[],
  subtreeIds: Set<string>,
  keys: IndustrialMetricKey[] = HEADLINE_METRICS,
): MetricRollup[] {
  return keys.map((k) => rollupMetric(rows, k, subtreeIds));
}

/**
 * OEE consistency check: when availability, performance and quality all exist,
 * their product must match the reported OEE. A mismatch is a truth conflict the
 * COO needs to see, not something to silently paper over.
 */
export function checkOeeConsistency(rollups: MetricRollup[]): {
  reported: number | null;
  derived: number | null;
  consistent: boolean | null;
} {
  const get = (k: IndustrialMetricKey) => rollups.find((r) => r.key === k)?.value ?? null;
  const a = get("availability");
  const p = get("performance");
  const q = get("quality");
  const reported = get("oee");
  if (a === null || p === null || q === null) return { reported, derived: null, consistent: null };
  const derived = a * p * q;
  if (reported === null) return { reported, derived, consistent: null };
  return { reported, derived, consistent: Math.abs(derived - reported) <= 0.02 };
}

// ── Decision templates ─────────────────────────────────────────────────────

export type TemplateKey =
  | "bottleneck_detection"
  | "maintenance_prioritization"
  | "capacity_risk"
  | "quality_deterioration"
  | "production_plan_variance"
  | "supplier_disruption";

export interface IndustrialDecisionTemplate {
  id: string;
  template_key: TemplateKey;
  title: string;
  description: string | null;
  trigger_metric: IndustrialMetricKey;
  comparator: "lt" | "lte" | "gt" | "gte";
  threshold: number;
  applies_to_node_type: IndustrialNodeType;
  recommended_action: string | null;
  is_active: boolean;
}

export const DEFAULT_TEMPLATES: Omit<IndustrialDecisionTemplate, "id">[] = [
  {
    template_key: "bottleneck_detection",
    title: "Bottleneck detection",
    description: "A line is constraining plant throughput because availability has fallen below the operating floor.",
    trigger_metric: "availability",
    comparator: "lt",
    threshold: 0.85,
    applies_to_node_type: "line",
    recommended_action: "Sequence a constraint review on the affected line before committing additional volume.",
    is_active: true,
  },
  {
    template_key: "maintenance_prioritization",
    title: "Maintenance prioritization",
    description: "Repair time is drifting, so maintenance capacity should be re-sequenced toward the worst asset.",
    trigger_metric: "mttr",
    comparator: "gt",
    threshold: 4,
    applies_to_node_type: "machine",
    recommended_action: "Reprioritize the maintenance backlog toward the assets with the longest repair time.",
    is_active: true,
  },
  {
    template_key: "capacity_risk",
    title: "Capacity risk",
    description: "Effective capacity is eroding across the plant and will not absorb committed demand.",
    trigger_metric: "oee",
    comparator: "lt",
    threshold: 0.65,
    applies_to_node_type: "plant",
    recommended_action: "Re-plan committed volume or release contingency capacity before the next order wave.",
    is_active: true,
  },
  {
    template_key: "quality_deterioration",
    title: "Quality deterioration",
    description: "Scrap is above tolerance and is converting into margin loss downstream.",
    trigger_metric: "scrap_rate",
    comparator: "gt",
    threshold: 0.05,
    applies_to_node_type: "line",
    recommended_action: "Open a containment action and trace the defect back to process or material input.",
    is_active: true,
  },
  {
    template_key: "production_plan_variance",
    title: "Production plan variance",
    description: "Actual output is running behind the approved production plan.",
    trigger_metric: "actual_production",
    comparator: "lt",
    threshold: 0,
    applies_to_node_type: "plant",
    recommended_action: "Escalate the plan gap to S&OP before it reaches the customer commitment.",
    is_active: true,
  },
  {
    template_key: "supplier_disruption",
    title: "Supplier disruption",
    description: "Inbound supply is late enough to threaten the production schedule.",
    trigger_metric: "supplier_delay_days",
    comparator: "gt",
    threshold: 3,
    applies_to_node_type: "site",
    recommended_action: "Qualify an alternate source or rebalance the build sequence around the delayed material.",
    is_active: true,
  },
];

export interface TemplateFinding {
  templateKey: TemplateKey;
  title: string;
  nodeId: string;
  nodeName: string;
  nodeType: IndustrialNodeType;
  metricKey: IndustrialMetricKey;
  observed: number;
  threshold: number;
  comparator: IndustrialDecisionTemplate["comparator"];
  sampleSize: number;
  /** 0–0.85. Capped: industrial rules are advisory, never certainty. */
  confidence: number;
  severity: "low" | "medium" | "high";
  explanation: string;
  recommendedAction: string | null;
}

function compare(value: number, comparator: string, threshold: number): boolean {
  switch (comparator) {
    case "lt": return value < threshold;
    case "lte": return value <= threshold;
    case "gt": return value > threshold;
    case "gte": return value >= threshold;
    default: return false;
  }
}

const MIN_OBSERVATIONS = 3;
const CONFIDENCE_CAP = 0.85;

/**
 * Evaluate templates deterministically against rolled-up metric values.
 * Nodes with fewer than three observations are skipped — an industrial call
 * cannot rest on one or two readings.
 */
export function evaluateTemplates(
  templates: IndustrialDecisionTemplate[],
  nodes: IndustrialNode[],
  rows: IndustrialMetricRow[],
): TemplateFinding[] {
  const findings: TemplateFinding[] = [];

  for (const template of templates) {
    if (!template.is_active) continue;
    const candidates = nodes.filter(
      (n) => n.is_active && n.node_type === template.applies_to_node_type,
    );

    for (const node of candidates) {
      const subtree = new Set(collectSubtreeIds(nodes, node.id));

      // Plan variance compares two metrics rather than a fixed threshold.
      if (template.template_key === "production_plan_variance") {
        const actual = rollupMetric(rows, "actual_production", subtree);
        const planned = rollupMetric(rows, "planned_production", subtree);
        if (
          actual.value === null || planned.value === null || planned.value === 0 ||
          actual.sampleSize < MIN_OBSERVATIONS
        ) continue;
        const variancePct = ((actual.value - planned.value) / planned.value) * 100;
        if (variancePct >= -2) continue;
        findings.push(buildFinding(template, node, "actual_production", actual.value, planned.value, actual, {
          explanation:
            `Actual production ${Math.round(actual.value).toLocaleString()} vs plan ` +
            `${Math.round(planned.value).toLocaleString()} — variance ${variancePct.toFixed(1)}% ` +
            `across ${actual.sampleSize} periods.`,
          severityScore: Math.abs(variancePct) / 20,
        }));
        continue;
      }

      const rollup = rollupMetric(rows, template.trigger_metric, subtree);
      if (rollup.value === null || rollup.sampleSize < MIN_OBSERVATIONS) continue;
      if (!compare(rollup.value, template.comparator, template.threshold)) continue;

      const def = METRIC_DEFINITIONS[template.trigger_metric];
      const breach = template.threshold === 0
        ? 1
        : Math.abs(rollup.value - template.threshold) / Math.abs(template.threshold);

      findings.push(buildFinding(template, node, template.trigger_metric, rollup.value, template.threshold, rollup, {
        explanation:
          `${def.label}: ${formatMetricValue(rollup.value, def)} against threshold ` +
          `${formatMetricValue(template.threshold, def)} over ${rollup.sampleSize} periods.`,
        severityScore: breach,
      }));
    }
  }

  return findings.sort((a, b) => b.confidence - a.confidence);
}

function buildFinding(
  template: IndustrialDecisionTemplate,
  node: IndustrialNode,
  metricKey: IndustrialMetricKey,
  observed: number,
  threshold: number,
  rollup: MetricRollup,
  extra: { explanation: string; severityScore: number },
): TemplateFinding {
  // Confidence rises with evidence volume and data quality, and is capped.
  const volumeFactor = Math.min(1, rollup.sampleSize / 12);
  const qualityFactor = rollup.dataQuality ?? 0.7;
  const confidence = Math.min(CONFIDENCE_CAP, 0.4 + 0.35 * volumeFactor + 0.25 * qualityFactor * volumeFactor);

  const severity: TemplateFinding["severity"] =
    extra.severityScore >= 0.35 ? "high" : extra.severityScore >= 0.15 ? "medium" : "low";

  return {
    templateKey: template.template_key,
    title: template.title,
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.node_type,
    metricKey,
    observed,
    threshold,
    comparator: template.comparator,
    sampleSize: rollup.sampleSize,
    confidence: Number(confidence.toFixed(2)),
    severity,
    explanation: extra.explanation,
    recommendedAction: template.recommended_action,
  };
}

// ── Formatting ─────────────────────────────────────────────────────────────

export function formatMetricValue(value: number | null, def: MetricDefinition): string {
  if (value === null || !Number.isFinite(value)) return "Insufficient Data";
  if (def.isRatio) return `${(value * 100).toFixed(1)}%`;
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits })} ${def.unit}`.trim();
}

/** Is a delta an improvement, given the metric's direction? */
export function isImprovement(def: MetricDefinition, deltaPct: number): boolean {
  return def.direction === "higher_is_better" ? deltaPct > 0 : deltaPct < 0;
}
