import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, CartesianGrid } from "recharts";
import { ArrowRightLeft, AlertTriangle, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { MetricRow } from "@/hooks/useMetrics";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, axisStyle, tooltipStyle, gridStyle, CHART_HEIGHT, CHART_COLORS, CHART_OPACITY } from "@/lib/chart-config";

interface Props {
  metrics: MetricRow[];
  datasetLabel?: string;
}

const EBITDABridgeChart = ({ metrics, datasetLabel }: Props) => {
  const analysis = useMemo(() => {
    const revenue = metrics.filter((d) => d.metric_type === "revenue").reduce((s, d) => s + Number(d.value), 0);
    const cogs = metrics.filter((d) => d.metric_type === "cogs").reduce((s, d) => s + Number(d.value), 0);
    const opex = metrics.filter((d) => d.metric_type === "opex").reduce((s, d) => s + Number(d.value), 0);
    const cost = metrics.filter((d) => d.metric_type === "cost").reduce((s, d) => s + Number(d.value), 0);

    const hasCogs = metrics.some((d) => d.metric_type === "cogs");
    const hasOpex = metrics.some((d) => d.metric_type === "opex");
    const hasCost = metrics.some((d) => d.metric_type === "cost");
    const hasRevenue = revenue > 0;

    if (hasRevenue && hasCogs && hasOpex) {
      const grossProfit = revenue - cogs;
      const ebitda = grossProfit - opex;
      return {
        mode: "full" as const,
        title: "EBITDA Bridge",
        subtitle: "Revenue → EBITDA (from mapped data)",
        steps: [
          { name: "Revenue", value: revenue, bottom: 0, height: revenue, type: "positive" },
          { name: "COGS", value: -cogs, bottom: revenue - cogs, height: cogs, type: "negative" },
          { name: "Gross Profit", value: grossProfit, bottom: 0, height: grossProfit, type: "subtotal" },
          { name: "OpEx", value: -opex, bottom: grossProfit - opex, height: opex, type: "negative" },
          { name: "EBITDA", value: ebitda, bottom: 0, height: Math.abs(ebitda), type: ebitda >= 0 ? "positive" : "negative" },
        ],
      };
    }

    if (hasRevenue && hasCost) {
      const net = revenue - cost;
      return {
        mode: "simplified" as const,
        title: "Revenue vs Total Spend",
        subtitle: "Limited insight — cost data is not categorised",
        steps: [
          { name: "Revenue", value: revenue, bottom: 0, height: revenue, type: "positive" },
          { name: "Total Spend", value: cost, bottom: 0, height: cost, type: "uncertain" },
          { name: "Est. Net", value: Math.abs(net), bottom: 0, height: Math.abs(net), type: net >= 0 ? "subtotal" : "negative" },
        ],
      };
    }

    return { mode: "empty" as const, title: null, subtitle: null, steps: null };
  }, [metrics]);

  const existingTypes = useMemo(() => {
    const types = new Set(metrics.map((m) => m.metric_type));
    return { revenue: types.has("revenue"), cogs: types.has("cogs"), opex: types.has("opex"), cost: types.has("cost") };
  }, [metrics]);

  const colorMap: Record<string, string> = {
    positive: CHART_COLORS.positive,
    subtotal: CHART_COLORS.subtotal,
    negative: CHART_COLORS.negative,
    uncertain: CHART_COLORS.uncertain,
  };

  if (analysis.mode === "empty") {
    return (
      <div className="glass-card p-5 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <ArrowRightLeft className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">EBITDA Bridge</h3>
        </div>
        <div className="py-4 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-5 h-5 text-warning" />
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Insufficient data for EBITDA Bridge</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              This chart shows how revenue converts to profit. To enable it, ensure your data includes revenue and cost breakdowns.
            </p>
          </div>
          <div className="text-left max-w-xs mx-auto space-y-1.5 pt-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Required metric types:</p>
            {[
              { key: "revenue", label: "Revenue", present: existingTypes.revenue },
              { key: "cogs", label: "COGS (Cost of Goods Sold)", present: existingTypes.cogs },
              { key: "opex", label: "OpEx (Operating Expenses)", present: existingTypes.opex },
            ].map((item) => (
              <div key={item.key} className="flex items-center gap-2 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full ${item.present ? "bg-success" : "bg-muted-foreground/30"}`} />
                <span className={item.present ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                <span className={`ml-auto text-[10px] font-medium ${item.present ? "text-success" : "text-muted-foreground/50"}`}>
                  {item.present ? "✓ mapped" : "missing"}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            Alternatively, map <strong>revenue</strong> + <strong>cost</strong> for a simplified view.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 rounded-xl">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{analysis.title}</h3>
        </div>
        {datasetLabel && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[120px]" title={datasetLabel}>{datasetLabel}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-[11px] text-muted-foreground">{analysis.subtitle}</p>
        {analysis.mode === "simplified" && (
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger>
                <Info className="w-3 h-3 text-warning" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                Cost is reported as a single total. To show a full EBITDA bridge, map separate <strong>cogs</strong> and <strong>opex</strong> metric types in your data upload.
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        )}
      </div>
      {analysis.mode === "simplified" && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 mb-3 space-y-1">
          <p className="text-[11px] font-medium text-warning flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 shrink-0" /> Limited profitability insight
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            We cannot assess margin quality because cost data is not categorised (e.g., production, marketing, operations). This view shows only total spend — not true operating margin.
          </p>
          <Link to="/data-upload" className="inline-flex text-[11px] font-semibold text-primary hover:underline mt-0.5">
            Upload cost breakdown to unlock margin analysis →
          </Link>
        </div>
      )}

      {/* Narrative interpretation */}
      {analysis.steps && (() => {
        const net = analysis.steps[analysis.steps.length - 1];
        const rev = analysis.steps[0];
        if (!net || !rev || rev.value === 0) return null;
        const netValue = net.type === "negative" ? -net.value : net.value;
        const marginPct = ((netValue / rev.value) * 100).toFixed(0);
        const isHealthy = netValue > 0 && Number(marginPct) > 20;
        return (
          <p className="text-[11px] text-foreground/80 mb-3 leading-relaxed">
            {isHealthy
              ? `Revenue exceeds total spend by a significant margin, retaining ${marginPct}% as profit — a healthy operating position.`
              : netValue > 0
              ? `Operating margin is ${marginPct}% — thin but positive. Cost optimization could meaningfully improve profitability.`
              : `The business is operating at a loss. Immediate cost review or revenue acceleration is recommended.`}
          </p>
        );
      })()}

      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analysis.steps!} barCategoryGap="20%" margin={{ top: 16, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid {...gridStyle} vertical={false} />
            <XAxis dataKey="name" {...axisStyle} />
            <YAxis {...axisStyle} tickFormatter={(v) => formatCurrency(v)} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatCurrency(Math.abs(v), { compact: false }), "Amount"]} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Bar dataKey="bottom" stackId="bridge" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="height" stackId="bridge" radius={[4, 4, 0, 0]} label={({ x, y, width, index }: { x: number; y: number; width: number; index: number }) => {
              const entry = analysis.steps![index];
              if (!entry) return null;
              return <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10} fill="hsl(var(--foreground))" opacity={0.7}>{formatCurrency(Math.abs(entry.value))}</text>;
            }}>
              {analysis.steps!.map((entry, i) => (
                <Cell
                  key={i}
                  fill={colorMap[entry.type]}
                  fillOpacity={entry.type === "uncertain" ? CHART_OPACITY.uncertain : CHART_OPACITY.full}
                  strokeDasharray={entry.type === "uncertain" ? "4 2" : undefined}
                  stroke={entry.type === "uncertain" ? CHART_COLORS.uncertain : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default EBITDABridgeChart;
