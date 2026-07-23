import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { Brain, Zap, TrendingDown, TrendingUp, Minus, RefreshCw, Sparkles, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";

interface Props {
  orgId: string | null;
  decisions: Array<{ confidence?: number; outcome_measured_at?: string | null; outcome_success?: boolean | null; created_at: string; [key: string]: unknown }>;
}

interface CalibrationModel {
  band_corrections: Record<string, number>;
  band_sample_sizes: Record<string, number>;
  overall_calibration_score: number;
  overall_bias_direction: string;
  total_decisions_analyzed: number;
  model_version: number;
  confidence_bands_count: number;
  mean_absolute_error: number;
  ai_narrative: string | null;
  computed_at?: string;
  success_metric?: string;
  window_start?: string;
  window_end?: string;
  window_decisions_count?: number;
  low_sample_bands?: string[];
}

const AdaptiveCalibrationEngine = ({ orgId, decisions }: Props) => {
  const [model, setModel] = useState<CalibrationModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    const fetchModel = async () => {
      setLoading(true);
      const { data, error: fetchErr } = await supabase
        .from("calibration_models")
        .select("*")
        .eq("organization_id", orgId)
        .order("computed_at", { ascending: false })
        .limit(1);

      if (!fetchErr && data && data.length > 0) {
        setModel(data[0] as unknown as CalibrationModel);
      }
      setLoading(false);
    };
    fetchModel();
  }, [orgId]);

  const recompute = async () => {
    if (!orgId) return;
    setComputing(true);
    setError(null);
    try {
      const { data, error: fnErr } = await invokeWithRetry<{ model?: CalibrationModel; insufficient_data?: boolean; message?: string }>("adaptive-calibration", {
        body: { organization_id: orgId },
      });
      if (fnErr) throw fnErr;
      if (data?.model) {
        setModel(data.model);
      } else if (data?.insufficient_data) {
        setError(data.message || "Insufficient data");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to compute calibration model");
    }
    setComputing(false);
  };

  const chartData = model
    ? Object.entries(model.band_corrections)
        .map(([band, correction]) => ({
          band,
          correction: Number(correction),
          samples: Number(model.band_sample_sizes[band] || 0),
          label: band.replace("-", "–") + "%",
          isLowSample: (model.low_sample_bands || []).includes(band),
        }))
        .sort((a, b) => parseInt(a.band) - parseInt(b.band))
    : [];

  const completedCount = decisions.filter(
    (d) => d.execution_status === "completed" && (d.prediction_accuracy_score != null || d.outcome_delta != null)
  ).length;

  const BiasIcon =
    model?.overall_bias_direction === "overconfident"
      ? TrendingDown
      : model?.overall_bias_direction === "underconfident"
      ? TrendingUp
      : Minus;

  const biasColor =
    model?.overall_bias_direction === "overconfident"
      ? "text-destructive"
      : model?.overall_bias_direction === "underconfident"
      ? "text-warning"
      : "text-emerald-400";

  if (!orgId) return null;

  return (
    <div className="glass-card p-6 rounded-xl col-span-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Brain className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              Adaptive Calibration Engine
              <span className="text-[9px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                ADI
              </span>
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Self-improving confidence correction — applied to all future predictions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {model && (
            <span className="text-[10px] text-muted-foreground font-mono">
              v{model.model_version} · {model.success_metric === "prediction_accuracy_score" ? "accuracy" : "delta"}-based
            </span>
          )}
          <button
            onClick={recompute}
            disabled={computing || completedCount < 5}
            className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${computing ? "animate-spin" : ""}`} />
            {computing ? "Learning…" : "Recalibrate"}
          </button>
        </div>
      </div>

      {/* Insufficient data state */}
      {!model && !loading && (
        <div className="py-8 text-center">
          <Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            {completedCount < 5
              ? `Need ${5 - completedCount} more completed decisions with outcomes`
              : "Ready to learn — click Recalibrate to build your first model"}
          </p>
          <p className="text-[10px] text-muted-foreground/60">
            The engine analyzes prediction accuracy across confidence bands and computes personalized correction factors that are applied to all future intelligence outputs.
          </p>
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Model display */}
      {model && !loading && (
        <div className="space-y-4 mt-4">
          {/* Score + Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-muted/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Calibration Score
              </p>
              <p
                className={`text-2xl font-bold tracking-tight ${
                  model.overall_calibration_score >= 80
                    ? "text-emerald-400"
                    : model.overall_calibration_score >= 60
                    ? "text-warning"
                    : "text-destructive"
                }`}
              >
                {model.overall_calibration_score}
              </p>
            </div>
            <div className="bg-muted/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Bias Direction
              </p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <BiasIcon className={`w-4 h-4 ${biasColor}`} />
                <p className={`text-sm font-semibold capitalize ${biasColor}`}>
                  {model.overall_bias_direction}
                </p>
              </div>
            </div>
            <div className="bg-muted/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Mean Abs Error
              </p>
              <p className="text-2xl font-bold tracking-tight font-mono">
                {model.mean_absolute_error}%
              </p>
            </div>
            <div className="bg-muted/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Decisions Learned
              </p>
              <p className="text-2xl font-bold tracking-tight">
                {model.total_decisions_analyzed}
              </p>
            </div>
          </div>

          {/* Active correction notice */}
          <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <p className="text-[11px] text-emerald-400/90">
              <span className="font-semibold">Active:</span> These corrections are being applied to all advisory, simulation, and diagnostic confidence outputs via the epistemic pipeline.
            </p>
          </div>

          {/* Correction chart */}
          {chartData.length > 0 && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Band corrections — negative = overconfident, positive = underconfident.
                {chartData.some((d) => d.isLowSample) && (
                  <span className="text-warning ml-1">
                    <AlertTriangle className="w-3 h-3 inline" /> Striped bars = low-sample bands (dampened 50%)
                  </span>
                )}
              </p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      label={{
                        value: "Confidence Band",
                        position: "bottom",
                        fontSize: 10,
                        fill: "hsl(var(--muted-foreground))",
                        offset: 5,
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      label={{
                        value: "Correction (pp)",
                        angle: -90,
                        position: "insideLeft",
                        fontSize: 10,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border p-2 rounded-lg shadow-lg text-xs">
                            <p className="font-semibold">{d.label} band</p>
                            <p>
                              Correction:{" "}
                              <span className="font-mono font-bold">
                                {d.correction > 0 ? "+" : ""}
                                {d.correction}pp
                              </span>
                              {d.isLowSample && (
                                <span className="text-warning ml-1">(dampened 50%)</span>
                              )}
                            </p>
                            <p className="text-muted-foreground">{d.samples} decisions</p>
                            <p className="text-muted-foreground mt-1">
                              {d.correction < -3
                                ? "⚠ Overconfident — engine reduces future predictions"
                                : d.correction > 3
                                ? "↑ Underconfident — engine boosts future predictions"
                                : "✓ Well-calibrated — no correction needed"}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="correction" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={
                            entry.correction < -5
                              ? "hsl(var(--destructive))"
                              : entry.correction < -2
                              ? "hsl(var(--warning, 38 92% 50%))"
                              : entry.correction > 3
                              ? "hsl(160 60% 45%)"
                              : "hsl(var(--primary))"
                          }
                          fillOpacity={entry.isLowSample ? 0.4 : 0.8}
                          strokeDasharray={entry.isLowSample ? "4 2" : undefined}
                          stroke={entry.isLowSample ? "hsl(var(--warning, 38 92% 50%))" : undefined}
                          strokeWidth={entry.isLowSample ? 1 : 0}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* AI Narrative */}
          {model.ai_narrative && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="flex items-start gap-2">
                <Brain className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-foreground/80 leading-relaxed">
                  {model.ai_narrative}
                </p>
              </div>
            </div>
          )}

          {/* Model metadata */}
          <div className="border-t border-border/20 pt-3 flex flex-wrap gap-x-4 gap-y-1">
            <p className="text-[10px] text-muted-foreground/50">
              Success metric: <span className="font-mono text-muted-foreground/70">{model.success_metric || "prediction_accuracy_score"}</span>
            </p>
            {model.window_start && model.window_end && (
              <p className="text-[10px] text-muted-foreground/50">
                Window: <span className="font-mono text-muted-foreground/70">
                  {new Date(model.window_start).toLocaleDateString()} – {new Date(model.window_end).toLocaleDateString()}
                </span>
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/50">
              Smoothing: <span className="font-mono text-muted-foreground/70">Beta(1,1)</span>
            </p>
          </div>

          {/* How it works */}
          <div className="border-t border-border/20 pt-3">
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              <span className="font-semibold text-muted-foreground">How it learns:</span>{" "}
              Each completed decision trains the model. The engine compares predicted confidence against actual success rates per band, computes Beta-smoothed correction factors, and feeds them into the epistemic pipeline. Future advisory, simulation, and diagnostic outputs are automatically adjusted — the system literally improves its reliability as you decide.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdaptiveCalibrationEngine;
