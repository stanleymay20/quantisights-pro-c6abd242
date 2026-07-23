import { memo, useMemo, forwardRef } from "react";
import { TrendingUp, TrendingDown, Minus, BarChart3, Activity } from "lucide-react";
import type { MetricTypeSummary } from "@/hooks/useMetrics";

interface KPICardsProps {
  topMetrics?: MetricTypeSummary[];
  revenue?: number;
  customers?: number;
  costRate?: number;
  churnRate?: number;
  previousRevenue?: number;
  previousCustomers?: number;
  previousCostRate?: number;
  previousChurnRate?: number;
}

/** Metrics where "up" is bad — used for trend color inversion */
const INVERSE_METRICS = new Set([
  "cost", "costs", "churn", "churn_rate", "attrition", "turnover",
  "expense", "expenses", "burn", "burn_rate", "debt", "risk",
  "error", "errors", "defects", "incidents", "downtime",
  "cost_rate", "cost_of_revenue", "operating_cost",
]);

function isInverseMetric(slug: string): boolean {
  const lower = slug.toLowerCase();
  if (INVERSE_METRICS.has(lower)) return true;
  // Check if any inverse keyword is a substring (e.g., "monthly_churn" → inverse)
  for (const inv of INVERSE_METRICS) {
    if (lower.includes(inv)) return true;
  }
  return false;
}

function deriveTrend(current: number, previous: number | undefined | null): "up" | "down" | "flat" | null {
  if (previous == null || previous === 0) return null;
  const changePct = ((current - previous) / Math.abs(previous)) * 100;
  return Math.abs(changePct) < 1 ? "flat" : changePct > 0 ? "up" : "down";
}

function formatMetricName(slug: string): string {
  return slug
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Pct\b/, "%")
    .replace(/Per\b/, "/");
}

function formatValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

function computeChangePct(current: number, previous: number | null): number | null {
  if (previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Tiny inline sparkline rendered from REAL data points via SVG */
const MiniSparkline = ({ trend, dataPoints, inverse }: { trend: "up" | "down" | "flat" | null; dataPoints?: number[]; inverse?: boolean }) => {
  const points = useMemo(() => {
    if (!dataPoints || dataPoints.length < 2) return null;
    const w = 64;
    const h = 24;
    const pad = 2;
    const usable = h - pad * 2;
    let min = dataPoints[0], max = dataPoints[0];
    for (let i = 1; i < dataPoints.length; i++) {
      if (dataPoints[i] < min) min = dataPoints[i];
      if (dataPoints[i] > max) max = dataPoints[i];
    }
    const range = max - min || 1;

    const sampled = dataPoints.length > 12
      ? Array.from({ length: 12 }, (_, i) => dataPoints[Math.round(i * (dataPoints.length - 1) / 11)])
      : dataPoints;

    return sampled
      .map((v, i) => {
        const x = (i / (sampled.length - 1)) * w;
        const y = pad + usable - ((v - min) / range) * usable;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [dataPoints]);

  if (!points) return null;

  // For inverse metrics, flip the color: up = bad (red), down = good (green)
  const effectiveSentiment = inverse
    ? (trend === "up" ? "negative" : trend === "down" ? "positive" : "neutral")
    : (trend === "up" ? "positive" : trend === "down" ? "negative" : "neutral");

  const color = effectiveSentiment === "positive"
    ? "hsl(var(--success, 142 71% 45%))"
    : effectiveSentiment === "negative"
    ? "hsl(var(--destructive))"
    : "hsl(var(--muted-foreground))";

  return (
    <svg width="64" height="24" viewBox="0 0 64 24" className="shrink-0 opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const TrendBadge = ({ trend, changePct, inverse }: { trend: "up" | "down" | "flat" | null; changePct: number | null; inverse?: boolean }) => {
  if (!trend || changePct == null) return null;

  // For inverse metrics, flip sentiment: up = bad, down = good
  const sentiment = inverse
    ? (trend === "up" ? "negative" : trend === "down" ? "positive" : "neutral")
    : (trend === "up" ? "positive" : trend === "down" ? "negative" : "neutral");

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold leading-none ${
        sentiment === "positive"
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : sentiment === "negative"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {trend === "up" ? (
        <TrendingUp className="w-2.5 h-2.5" />
      ) : trend === "down" ? (
        <TrendingDown className="w-2.5 h-2.5" />
      ) : (
        <Minus className="w-2.5 h-2.5" />
      )}
      {Math.abs(changePct).toFixed(1)}%
    </span>
  );
};

const KPICards = memo(forwardRef<HTMLDivElement, KPICardsProps>(({
  topMetrics,
  revenue,
  customers,
  costRate,
  churnRate,
  previousRevenue,
  previousCustomers,
  previousCostRate,
  previousChurnRate,
}, ref) => {
  const cards = useMemo(() => {
    if (topMetrics && topMetrics.length > 0) {
      return topMetrics.slice(0, 4).map((m) => ({
        label: formatMetricName(m.metricType),
        slug: m.metricType,
        value: formatValue(m.total),
        latest: formatValue(m.latest),
        trend: m.trend,
        changePct: computeChangePct(m.total, m.previousTotal),
        count: m.count,
        dataPoints: m.values,
        inverse: isInverseMetric(m.metricType),
      }));
    }

    // Legacy fallback — still uses dynamic metric names from the data
    // (only shown if topMetrics is empty, which means useMetrics found no data)
    return [];
  }, [topMetrics]);

  if (cards.length === 0) return null;

  return (
    <div
      ref={ref}
      className={`grid gap-4 ${
        cards.length >= 4
          ? "grid-cols-2 lg:grid-cols-4"
          : cards.length === 3
          ? "grid-cols-1 sm:grid-cols-3"
          : cards.length === 2
          ? "grid-cols-2"
          : "grid-cols-1"
      }`}
    >
      {cards.map((card, i) => {
        const trendGradient = card.inverse
          ? (card.trend === "up"
            ? "bg-destructive/15"
            : card.trend === "down"
            ? "bg-emerald-500/15"
            : "bg-primary/10")
          : (card.trend === "up"
            ? "bg-emerald-500/15"
            : card.trend === "down"
            ? "bg-destructive/15"
            : "bg-primary/10");

        return (
          <div
            key={card.label}
            className="group relative overflow-hidden rounded-xl border border-border/40 bg-card/70 backdrop-blur-sm p-4 transition-all duration-200 hover:border-primary/20 hover:shadow-md hover:shadow-primary/5"
          >
            {/* Subtle gradient accent top bar — polarity-aware */}
            <div className={`absolute top-0 left-0 right-0 h-[2px] ${trendGradient}`} />

            <div className="flex items-start justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium truncate max-w-[70%]">
                {card.label}
              </span>
              <TrendBadge trend={card.trend} changePct={card.changePct} inverse={card.inverse} />
            </div>

            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="text-2xl font-bold tracking-tight leading-none mb-1">
                  {card.value}
                </p>
                {card.latest && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Latest: <span className="font-medium text-foreground/70">{card.latest}</span>
                  </p>
                )}
                {card.count != null && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Activity className="w-2.5 h-2.5" />
                    {card.count.toLocaleString()} points
                  </p>
                )}
              </div>
              <MiniSparkline trend={card.trend} dataPoints={card.dataPoints} inverse={card.inverse} />
            </div>
          </div>
        );
      })}
    </div>
  );
}));

KPICards.displayName = "KPICards";

export default KPICards;
