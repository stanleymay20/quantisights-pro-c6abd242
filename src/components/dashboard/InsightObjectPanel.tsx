/**
 * InsightObjectPanel — Canonical Insight Object display (Book Ch.3)
 * 
 * Shows the structured Insight Object: metricName, currentValue,
 * expectedValue, deviationMagnitude, deviationScore, severityLevel,
 * detectionModel, modelParameters.
 */

import { useState } from "react";
import {
  ChevronDown, ChevronUp, Activity, TrendingUp, AlertTriangle,
  Cpu, BarChart3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface InsightObject {
  insightID?: string;
  timestampUTC?: string;
  metricName?: string;
  currentValue?: number;
  expectedValue?: number;
  deviationMagnitude?: number;
  deviationScore?: number;
  severityLevel?: "INFO" | "WARNING" | "CRITICAL";
  detectionModel?: string;
  modelParameters?: Record<string, number>;
  labels?: string[];
}

interface Props {
  insightObject: InsightObject | null | undefined;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "text-destructive border-destructive/30 bg-destructive/10",
  WARNING: "text-warning border-warning/30 bg-warning/10",
  INFO: "text-sky-400 border-sky-400/30 bg-sky-400/10",
};

const InsightObjectPanel = ({ insightObject }: Props) => {
  const [expanded, setExpanded] = useState(false);

  if (!insightObject) return null;

  const io = insightObject;
  const severity = io.severityLevel ?? "INFO";

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden bg-card/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="font-medium text-foreground">Insight Object</span>
          {io.metricName && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {io.metricName}
            </Badge>
          )}
          {severity && (
            <Badge className={`text-[9px] ${SEVERITY_COLORS[severity] ?? ""}`}>
              {severity}
            </Badge>
          )}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/20 pt-3">
          {/* Value comparison */}
          {(io.currentValue != null || io.expectedValue != null) && (
            <div className="flex items-center gap-6">
              {io.currentValue != null && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Current</div>
                  <div className="text-lg font-bold font-mono text-foreground">{io.currentValue.toFixed(2)}</div>
                </div>
              )}
              {io.expectedValue != null && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Expected (EWMA)</div>
                  <div className="text-lg font-bold font-mono text-muted-foreground">{io.expectedValue.toFixed(2)}</div>
                </div>
              )}
              {io.deviationMagnitude != null && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Deviation</div>
                  <div className={`text-lg font-bold font-mono ${io.deviationMagnitude > 0 ? "text-emerald-400" : "text-destructive"}`}>
                    {io.deviationMagnitude > 0 ? "+" : ""}{io.deviationMagnitude.toFixed(4)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Z-Score bar */}
          {io.deviationScore != null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />
                  Z-Score (Deviation Score)
                </span>
                <span className={`text-sm font-bold font-mono ${
                  Math.abs(io.deviationScore) >= 3 ? "text-destructive" :
                  Math.abs(io.deviationScore) >= 2 ? "text-warning" : "text-emerald-400"
                }`}>
                  {io.deviationScore > 0 ? "+" : ""}{io.deviationScore.toFixed(2)}σ
                </span>
              </div>
              {/* Visual Z-score bar */}
              <div className="h-2 bg-muted/30 rounded-full overflow-hidden relative">
                <div className="absolute inset-y-0 left-1/2 w-px bg-border/50" />
                <div
                  className={`absolute inset-y-0 rounded-full ${
                    Math.abs(io.deviationScore) >= 3 ? "bg-destructive" :
                    Math.abs(io.deviationScore) >= 2 ? "bg-warning" : "bg-emerald-400"
                  }`}
                  style={{
                    left: io.deviationScore >= 0 ? "50%" : `${Math.max(50 + io.deviationScore * 10, 0)}%`,
                    width: `${Math.min(Math.abs(io.deviationScore) * 10, 50)}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground/50 font-mono">
                <span>-5σ</span>
                <span>0</span>
                <span>+5σ</span>
              </div>
            </div>
          )}

          {/* Detection Model */}
          {io.detectionModel && (
            <div className="flex items-center gap-2">
              <Cpu className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Detection Model:</span>
              <Badge variant="outline" className="text-[10px] font-mono">{io.detectionModel}</Badge>
            </div>
          )}

          {/* Model Parameters */}
          {io.modelParameters && Object.keys(io.modelParameters).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(io.modelParameters).map(([key, val]) => (
                <span key={key} className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">
                  {key}={typeof val === "number" ? val.toFixed(val < 1 ? 2 : 0) : val}
                </span>
              ))}
            </div>
          )}

          {/* Labels */}
          {io.labels && io.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {io.labels.map((label, i) => (
                <Badge key={i} variant="secondary" className="text-[9px]">{label}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InsightObjectPanel;
