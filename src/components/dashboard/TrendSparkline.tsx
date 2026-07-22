import { useMemo } from "react";

interface TrendSparklineProps {
  /** Array of numeric values (oldest → newest) */
  data: number[];
  /** Width in px */
  width?: number;
  /** Height in px */
  height?: number;
  /** Stroke color (CSS) */
  color?: string;
  /** Show a dot on the last point */
  showEndDot?: boolean;
}

/**
 * Lightweight SVG sparkline — no external dependencies.
 * Used inside evidence panels to show metric trends at a glance.
 */
const TrendSparkline = ({
  data,
  width = 120,
  height = 32,
  color = "hsl(var(--primary))",
  showEndDot = true,
}: TrendSparklineProps) => {
  const path = useMemo(() => {
    if (data.length < 2) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 4;
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;

    const points = data.map((v, i) => ({
      x: padding + (i / (data.length - 1)) * innerW,
      y: padding + innerH - ((v - min) / range) * innerH,
    }));

    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  }, [data, width, height]);

  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 4;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const lastX = padding + innerW;
  const lastY = padding + innerH - ((data[data.length - 1] - min) / range) * innerH;

  // Determine trend color
  const trend = data[data.length - 1] - data[0];
  const strokeColor = trend > 0 ? "hsl(var(--success))" : trend < 0 ? "hsl(var(--destructive))" : color;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <path d={path} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {showEndDot && (
        <circle cx={lastX} cy={lastY} r={2.5} fill={strokeColor} />
      )}
    </svg>
  );
};

export default TrendSparkline;
