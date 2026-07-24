/**
 * AnnotatedChart — inline "so what" annotations for recharts (Storytelling
 * with Data, Ch. 6). Instead of describing the takeaway in a caption, we
 * draw it directly on the plot: a reference line at the meaningful value,
 * an optional band, and a short label right where the eye lands.
 *
 * Consumers pass a fully-composed recharts tree via `children` and a small
 * declarative `annotations` prop. We inject <ReferenceLine> / <ReferenceArea>
 * elements alongside the user's chart so nothing about the underlying
 * dataset or shape changes.
 *
 * Example:
 *   <AnnotatedChart
 *     title="Cash runway"
 *     takeaway="Runway drops below 6 months in Q3 without action."
 *     annotations={[
 *       { kind: "y", value: 6, label: "6-mo floor", tone: "danger" },
 *       { kind: "x", value: "2026-Q3", label: "Breach point", tone: "warning" },
 *     ]}
 *   >
 *     <ResponsiveContainer>...</ResponsiveContainer>
 *   </AnnotatedChart>
 */
import { ReactNode } from "react";
import { ReferenceArea, ReferenceLine } from "recharts";

export type AnnotationTone = "neutral" | "primary" | "warning" | "danger" | "success";

export type ChartAnnotation =
  | {
      kind: "y" | "x";
      value: number | string;
      label?: string;
      tone?: AnnotationTone;
    }
  | {
      kind: "band";
      axis: "x" | "y";
      from: number | string;
      to: number | string;
      label?: string;
      tone?: AnnotationTone;
    };

const TONE_COLOR: Record<AnnotationTone, string> = {
  neutral: "hsl(var(--muted-foreground))",
  primary: "hsl(var(--primary))",
  warning: "hsl(var(--warning))",
  danger: "hsl(var(--destructive))",
  success: "hsl(var(--success))",
};

/**
 * Build recharts <ReferenceLine>/<ReferenceArea> children from annotation
 * descriptors. Callers spread the result inside their own chart:
 *
 *   <LineChart>...
 *     {buildAnnotationElements(annotations)}
 *   </LineChart>
 */
export function buildAnnotationElements(
  annotations: ChartAnnotation[] = [],
): ReactNode[] {
  return annotations.map((ann, idx) => {
    const tone = TONE_COLOR[ann.tone ?? "primary"];
    if (ann.kind === "band") {
      const areaProps =
        ann.axis === "x"
          ? { x1: ann.from, x2: ann.to }
          : { y1: ann.from, y2: ann.to };
      return (
        <ReferenceArea
          key={`ann-${idx}`}
          {...areaProps}
          fill={tone}
          fillOpacity={0.08}
          stroke={tone}
          strokeOpacity={0.35}
          strokeDasharray="3 3"
          label={
            ann.label
              ? {
                  value: ann.label,
                  position: "insideTopRight",
                  fill: tone,
                  fontSize: 11,
                  fontWeight: 600,
                }
              : undefined
          }
          ifOverflow="extendDomain"
        />
      );
    }
    const lineProps = ann.kind === "y" ? { y: ann.value } : { x: ann.value };
    return (
      <ReferenceLine
        key={`ann-${idx}`}
        {...lineProps}
        stroke={tone}
        strokeDasharray="4 3"
        strokeWidth={1.5}
        label={
          ann.label
            ? {
                value: ann.label,
                position: ann.kind === "y" ? "insideTopRight" : "insideTop",
                fill: tone,
                fontSize: 11,
                fontWeight: 600,
              }
            : undefined
        }
      />
    );
  });
}

export interface AnnotatedChartProps {
  /** Short chart title (aligned to the y-axis) */
  title: string;
  /** The one-sentence "so what" — surfaced above the chart in the accent color */
  takeaway?: string;
  /** Optional supporting sub-caption (source, methodology, timeframe) */
  caption?: string;
  /** Tone for the takeaway accent (defaults to primary) */
  tone?: AnnotationTone;
  /**
   * Reference lines / bands to draw inside the chart. Consumers must call
   * {@link buildAnnotationElements} inside their chart tree using the
   * annotations they pass here (recharts requires ReferenceLine to be a
   * direct child of the chart component).
   */
  children: ReactNode;
  className?: string;
}

export function AnnotatedChart({
  title,
  takeaway,
  caption,
  tone = "primary",
  children,
  className = "",
}: AnnotatedChartProps) {
  const accent = TONE_COLOR[tone];
  return (
    <figure
      className={`rounded-xl border border-border/40 bg-card/30 p-5 print:break-inside-avoid ${className}`}
    >
      <figcaption className="mb-4 space-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </h3>
        {takeaway ? (
          <p
            className="text-sm font-semibold leading-snug"
            style={{ color: accent }}
          >
            {takeaway}
          </p>
        ) : null}
      </figcaption>
      {children}
      {caption ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          {caption}
        </p>
      ) : null}
    </figure>
  );
}

export default AnnotatedChart;
