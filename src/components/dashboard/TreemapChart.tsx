import { useMemo } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { LayoutGrid } from "lucide-react";
import { MetricRow } from "@/hooks/useMetrics";

interface TreemapChartProps {
  metrics: MetricRow[];
}

const COLORS = [
  "hsl(199, 89%, 48%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(217, 91%, 60%)",
  "hsl(0, 72%, 51%)",
  "hsl(262, 83%, 58%)",
  "hsl(24, 95%, 53%)",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomContent = (props: any) => {
  const { x, y, width, height, name, value, index } = props;
  if (width < 30 || height < 20) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4}
        fill={COLORS[index % COLORS.length]} fillOpacity={0.85}
        stroke="hsl(var(--background))" strokeWidth={2} />
      {width > 50 && height > 30 && (
        <>
          <text x={x + 8} y={y + 16} fontSize={11} fontWeight={600} fill="white">{name}</text>
          <text x={x + 8} y={y + 30} fontSize={9} fill="rgba(255,255,255,0.8)">
            €{value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value.toLocaleString()}
          </text>
        </>
      )}
    </g>
  );
};

const TreemapChart = ({ metrics }: TreemapChartProps) => {
  const data = useMemo(() => {
    // Group revenue by segment or metric_type
    const groups: Record<string, number> = {};
    metrics
      .filter(m => m.metric_type === "revenue")
      .forEach(m => {
        const key = m.segment || m.region || "General";
        groups[key] = (groups[key] || 0) + Number(m.value);
      });

    return Object.entries(groups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [metrics]);

  if (data.length === 0) {
    return (
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <LayoutGrid className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revenue Treemap</h3>
        </div>
        <p className="text-xs text-muted-foreground">Upload segmented revenue data to view hierarchical breakdown.</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center gap-2 mb-1">
        <LayoutGrid className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revenue Treemap</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">Proportional breakdown by segment</p>

      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="value"
            nameKey="name"
            content={<CustomContent />}
          >
            <Tooltip
              formatter={(value: number) => [`€${value.toLocaleString()}`, "Revenue"]}
              contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TreemapChart;
