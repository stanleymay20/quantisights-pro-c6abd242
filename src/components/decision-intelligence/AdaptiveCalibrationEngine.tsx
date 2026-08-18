import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { Brain, Zap, TrendingDown, TrendingUp, Minus, RefreshCw, Sparkles, AlertTriangle, ShieldCheck } from "lucide-react";
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
  evidence_regime?: "prospective_only" | "legacy_mixed";
  prospective_decisions_count?: number;
  excluded_decisions_count?: number;
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
      const { data, error: fnErr } = await invokeWithRetry<{
        model?: CalibrationModel;
        insufficient_data?: boolean;
        message?: string;
        excluded_nonprospective_count?: number;
      }>("adaptive-calibration", {
        body: { organization_id: orgId },
      });
      if (fnErr) throw fnErr;
      if (data?.model) {
        setModel(data.model);
      } else if (data?.insufficient_data) {
        const excluded = data.excluded_nonprospective_count
          ? ` ${data.excluded_nonprospective_count} retrospective/legacy decisions were excluded.`
          : "";
        setError((data.message || "Insufficient prospective evidence") + excluded);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to compute calibration model");
    }
    setComputing(false);
  };

  const isProspective = model?.evidence_regime === "prospective_only";
  const chartData = model
    ? Object.entries(model.band_corrections || {})
        .map(([band, correction]) => ({
          band,
          correction: Number(correction),
          samples: Number(model.band_sample_sizes?.[band] || 0),
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
              {model && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border uppercase tracking-wider ${
                  isProspective
                    ? "text-emerald-400 border-emerald-400/25 bg-emerald-400/5"
                    : "text-warning border-warning/25 bg-warning/5"
                }`}>
                  {isProspective ? "Prospective only" : "Legacy / diagnostic"}
                </span>
              )}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              {isProspective
                ? "Prospective outcome calibration eligible for future confidence correction"
                : "Historical calibration remains diagnostic until prospective evidence is sufficient"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {model && (
            <span className="text-[10px] text-muted-foreground font-mono">
              v{model.model_version} · {model.success_metric === "prediction_accuracy_score" ? "accuracy" : "legacy"}-based
            </span>
          )}
          <button
            onClick={recompute}
            disabled={computing || completedCount < 5}
            className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${computing ? "animate-spin" : ""}`} />
            {computing ? "Evaluating…" : "Recalibrate"}
          </button>
        </div>
      </div>

      {!model && !loading && (
        <div className="py-8 text-center">
          <Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            {completedCount < 5
              ? `Need at least ${5 - completedCount} more completed decisions with outcomes before checking prospective eligibility`
              : "Ready to evaluate prospective calibration evidence"}
          </p>
          <p className="text-[10px] text-muted-foreground/60">
            Only outcomes committed prospectively within the governed decision window may train or certify confidence correction. Historical and backfilled outcomes remain diagnostic only.
          </p>
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {model && !loading && (
        <div className="space-y-4 mt-4">
          {!isProspective && (
            <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-semibold text-warning">Not active for confidence correction.</span>{" "}
                This model predates prospective provenance enforcement. Its historical score and band corrections may be inspected for diagnostics, but they are excluded from certification and executive confidence adjustment.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-muted/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {isProspective ? "Prospective Score" : "Historical Score"}
              </p>
              <p
                className={`text-2xl font-bold tracking-tight ${
                  !isProspective
                    ? "text-muted-foreground"
                    : model.overall_calibration_score >= 80
                    ? "text-emerald-400"
                    : model.overall_calibration_score >= 60
                    ? "text-warning"
                    : "text-destructive"
                }`}
              >
                {model.overall_calibration_score}
              </p>
              {!isProspective && <p className="text-[9px] text-warning mt-0.5">Not certification eligible</p>}
            </div>
            <div className="bg-muted/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Bias Direction
              </p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <BiasIcon className={`w-4 h-4 ${isProspective ? biasColor : "text-muted-foreground"}`} />
                <p className={`text-sm font-semibold capitalize ${isProspective ? biasColor : "text-muted-foreground"}`}>
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
                {isProspective ? "Eligible Decisions" : "Legacy Excluded"}
              </p>
              <p className="text-2xl font-bold tracking-tight">
                {isProspective
                  ? model.prospective_decisions_count ?? model.total_decisions_analyzed
                  : model.excluded_decisions_count ?? model.total_decisions_analyzed}
              </p>
            </div>
          </div>

          {isProspective ? (
            <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <p className="text-[11px] text-emerald-400/90">
                <span className="font-semibold">Eligible:</span> This model was trained only on prospectively committed outcomes and may supply learned confidence corrections to consumers that enforce the prospective-only gate.
              </p>
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-warning/5 border border-warning/15 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-warning shrink-0" />
              <p className="text-[11px] text-warning/90">
                <span className="font-semibold">Diagnostic only:</span> corrections shown below are not eligible for production confidence adjustment.
              </p>
            </div>
          )}

          {chartData.length > 0 && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Band corrections — negative = overconfident, positive = underconfident.
                {!isProspective && <span className="text-warning ml-1">Historical diagnostic view only.</span>}
                {chartData.some((d) => d.isLowSample) && (
                  <span className="text-warning ml-1">
                    <AlertTriangle className="w-3 h-3 inline" /> Striped bars = low-sample bands
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
                      label={{ value: "Confidence Band", position: "bottom", fontSize: 10, fill: "hsl(var(--muted-foreground))", offset: 5 }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      label={{ value: "Correction (pp)", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
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
                              Correction: <span className="font-mono font-bold">{d.correction > 0 ? "+" : ""}{d.correction}pp</span>
                            </p>
                            <p className="text-muted-foreground">{d.samples} decisions</p>
                            {!isProspective && <p className="text-warning mt-1">Not active — historical diagnostic only</p>}
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
                          fillOpacity={!isProspective ? 0.25 : entry.isLowSample ? 0.4 : 0.8}
                          strokeDasharray={entry.isLowSample || !isProspective ? "4 2" : undefined}
                          stroke={entry.isLowSample || !isProspective ? "hsl(var(--warning, 38 92% 50%))" : undefined}
                          strokeWidth={entry.isLowSample || !isProspective ? 1 : 0}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {model.ai_narrative && isProspective && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="flex items-start gap-2">
                <Brain className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-foreground/80 leading-relaxed">{model.ai_narrative}</p>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="border-t border-border/20 pt-3 flex flex-wrap gap-x-4 gap-y-1">
            <p className="text-[10px] text-muted-foreground/50">
              Evidence regime: <span className="font-mono text-muted-foreground/70">{model.evidence_regime || "legacy_mixed"}</span>
            </p>
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

          <div className="border-t border-border/20 pt-3">
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              <span className="font-semibold text-muted-foreground">How it learns:</span>{" "}
              The engine compares predicted confidence against direction-aware outcome accuracy by confidence band. Only outcomes whose tracking was committed prospectively within the governed decision window are eligible to train and certify correction factors; historical or backfilled outcomes are excluded from production calibration.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdaptiveCalibrationEngine;