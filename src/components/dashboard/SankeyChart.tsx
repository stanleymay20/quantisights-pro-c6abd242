import { useMemo } from "react";
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from "recharts";
import { GitBranch } from "lucide-react";
import { MetricRow } from "@/hooks/useMetrics";

interface SankeyChartProps {
  metrics: MetricRow[];
}

const COLORS = [
  "hsl(199, 89%, 48%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(217, 91%, 60%)",
  "hsl(0, 72%, 51%)",
  "hsl(262, 83%, 58%)",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomNode = (props: any) => {
  const { x, y, width, height, index, payload } = props;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={COLORS[index % COLORS.length]} fillOpacity={0.85} radius={[2, 2, 2, 2]} />
      {height > 15 && (
        <text x={x + width + 6} y={y + height / 2} fontSize={10} fill="hsl(var(--foreground))" dominantBaseline="middle">
          {payload.name}
        </text>
      )}
    </Layer>
  );
};

const SankeyChart = ({ metrics }: SankeyChartProps) => {
  const sankeyData = useMemo(() => {
    const totalRevenue = metrics.filter(m => m.metric_type === "revenue").reduce((s, m) => s + Number(m.value), 0);
    const totalCost = metrics.filter(m => m.metric_type === "cost").reduce((s, m) => s + Number(m.value), 0);
    const totalCustomers = metrics.filter(m => m.metric_type === "customers").reduce((s, m) => s + Number(m.value), 0);

    if (totalRevenue === 0) return null;

    // Build flow: Revenue → segments → cost/profit
    const segments = metrics
      .filter(m => m.metric_type === "revenue" && m.segment)
      .reduce<Record<string, number>>((acc, m) => {
        acc[m.segment!] = (acc[m.segment!] || 0) + Number(m.value);
        return acc;
      }, {});

    const segNames = Object.keys(segments);
    if (segNames.length === 0) {
      // Fallback: simple Revenue → Cost, Profit flow
      const costAmount = totalCost > 0 ? Math.min(totalCost, totalRevenue * 0.7) : totalRevenue * 0.6;
      const profit = totalRevenue - costAmount;

      return {
        nodes: [{ name: "Revenue" }, { name: "Cost" }, { name: "Profit" }],
        links: [
          { source: 0, target: 1, value: Math.round(costAmount) },
          { source: 0, target: 2, value: Math.round(profit) },
        ],
      };
    }

    const nodes = [
      { name: "Total Revenue" },
      ...segNames.map(s => ({ name: s })),
      { name: "COGS" },
      { name: "Gross Profit" },
    ];

    const links = [
      ...segNames.map((s, i) => ({
        source: 0,
        target: i + 1,
        value: Math.round(segments[s]),
      })),
      ...segNames.map((_, i) => ({
        source: i + 1,
        target: segNames.length + 1,
        value: Math.round(segments[segNames[i]] * 0.6),
      })),
      ...segNames.map((_, i) => ({
        source: i + 1,
        target: segNames.length + 2,
        value: Math.round(segments[segNames[i]] * 0.4),
      })),
    ];

    return { nodes, links };
  }, [metrics]);

  if (!sankeyData) {
    return (
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revenue Flow</h3>
        </div>
        <p className="text-xs text-muted-foreground">Upload revenue data to visualize flow attribution.</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center gap-2 mb-1">
        <GitBranch className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revenue Flow</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">Sankey flow from revenue to cost allocation</p>

      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            node={<CustomNode />}
            link={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.15 }}
            nodePadding={20}
            margin={{ left: 0, right: 80, top: 10, bottom: 10 }}
          >
            <Tooltip
              contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              formatter={(value: number) => [`€${value.toLocaleString()}`, "Flow"]}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SankeyChart;
