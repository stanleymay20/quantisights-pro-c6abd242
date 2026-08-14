import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { applyAdaptiveConfidenceWithFetch } from "../_shared/adaptive-confidence.ts";
import type { AdaptiveConfidenceMeta } from "../_shared/adaptive-confidence.ts";
import { enforceDatasetContract } from "../_shared/dataset-contract.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { detectChangepoints, type ChangepointEvidence } from "../_shared/changepoint.ts";
import { inferExpectedOutcomeDirection, type ExpectedOutcomeDirection } from "../_shared/outcome-direction.ts";

interface MetricRow {
  metric_type: string;
  value: number;
  date: string;
  region: string | null;
  segment: string | null;
}

interface MetricStats {
  metric_type: string;
  data_points: number;
  latest_value: number;
  previous_value: number;
  period_change_pct: number;
  mean: number;
  std_dev: number;
  volatility_pct: number;
  slope_normalized_pct: number;
  expected_direction: ExpectedOutcomeDirection;
  trend_direction: "improving" | "declining" | "stable" | "volatile";
  min: number;
  max: number;
  date_range: string;
  segment_shifts: string[];
  structural_breaks: ChangepointEvidence[];
}

type CausalStatus = "not_established" | "supported_by_causal_design";
type EvidenceLevel = "descriptive" | "temporal_break" | "causal";

interface DiagnosticResult {
  metric_type: string;
  diagnosis: string;
  severity: "critical" | "warning" | "info";
  /** Compatibility field: contains a driver hypothesis, never an asserted root cause. */
  root_cause: string;
  /** Compatibility field: contains associated evidence, never asserted causes. */
  causal_factors: string[];
  causal_status: CausalStatus;
  evidence_level: EvidenceLevel;
  structural_breaks: ChangepointEvidence[];
  expected_direction: ExpectedOutcomeDirection;
  trend_direction: "improving" | "declining" | "stable" | "volatile";
  change_pct: number;
  recommendation: string;
  confidence: number;
  raw_confidence: number;
  capped_confidence: number;
  confidence_cap_reason: string;
  sample_size: number;
  data_sufficiency: string;
  variance_score: number | null;
  adaptive_calibration_applied: boolean;
  calibration_model_version: number | null;
  calibration_band_used: string | null;
  calibration_correction_applied_pp: number | null;
  calibration_low_sample_band: boolean;
  confidence_source: string;
}

function applyMeta(meta: AdaptiveConfidenceMeta): Pick<DiagnosticResult,
  "confidence" | "raw_confidence" | "capped_confidence" | "confidence_cap_reason" |
  "sample_size" | "data_sufficiency" | "variance_score" | "adaptive_calibration_applied" |
  "calibration_model_version" | "calibration_band_used" | "calibration_correction_applied_pp" |
  "calibration_low_sample_band" | "confidence_source"
> {
  return {
    confidence: meta.confidence,
    raw_confidence: meta.raw_confidence,
    capped_confidence: meta.capped_confidence,
    confidence_cap_reason: meta.confidence_cap_reason,
    sample_size: meta.sample_size,
    data_sufficiency: meta.data_sufficiency,
    variance_score: meta.variance_score,
    adaptive_calibration_applied: meta.adaptive_calibration_applied,
    calibration_model_version: meta.calibration_model_version,
    calibration_band_used: meta.calibration_band_used,
    calibration_correction_applied_pp: meta.calibration_correction_applied_pp,
    calibration_low_sample_band: meta.calibration_low_sample_band,
    confidence_source: meta.confidence_source,
  };
}

function evidenceLevel(stat: MetricStats | undefined): EvidenceLevel {
  return stat?.structural_breaks?.length ? "temporal_break" : "descriptive";
}

function sanitizeCausalLanguage(value: unknown): string {
  return String(value ?? "")
    .replace(/\broot cause\b/gi, "candidate driver")
    .replace(/\bcaused by\b/gi, "associated with")
    .replace(/\bcauses\b/gi, "is associated with")
    .replace(/\bcausal factor(s)?\b/gi, "associated factor$1")
    .trim();
}

function driverHypothesis(value: unknown, stat: MetricStats | undefined): string {
  const sanitized = sanitizeCausalLanguage(value)
    .replace(/^driver hypothesis\s*\(causality not established\)\s*:\s*/i, "")
    .replace(/^driver hypothesis\s*:\s*/i, "")
    .replace(/^candidate driver\s*:\s*/i, "")
    .trim();
  const fallback = stat
    ? `Observed slope ${stat.slope_normalized_pct.toFixed(1)}%, desired direction ${stat.expected_direction}, volatility ${stat.volatility_pct.toFixed(0)}%, and ${stat.structural_breaks.length} detected structural break(s).`
    : "Available evidence is descriptive only.";
  return `Driver hypothesis (causality not established): ${sanitized || fallback}`;
}

function associatedEvidence(values: unknown, stat: MetricStats | undefined): string[] {
  const raw = Array.isArray(values) ? values : [];
  const factors = raw
    .map(value => sanitizeCausalLanguage(value)
      .replace(/^associated evidence\s*\(not causal\)\s*:\s*/i, "")
      .trim())
    .filter(Boolean)
    .map(value => `Associated evidence (not causal): ${value}`);

  if (factors.length > 0) return factors;
  if (!stat) return ["Associated evidence (not causal): insufficient statistical detail"];

  return [
    `Associated evidence (not causal): ${stat.trend_direction} trend relative to desired ${stat.expected_direction} direction over ${stat.data_points} observations`,
    `Associated evidence (not causal): ${stat.volatility_pct.toFixed(0)}% coefficient of variation`,
    ...stat.segment_shifts.slice(0, 3).map(shift => `Associated evidence (not causal): segment shift ${shift}`),
  ];
}

function classifyTrend(
  metricType: string,
  slopeNormalizedPct: number,
  volatilityPct: number,
): { expectedDirection: ExpectedOutcomeDirection; trendDirection: MetricStats["trend_direction"] } {
  const expectedDirection = inferExpectedOutcomeDirection(metricType);
  if (volatilityPct > 30) return { expectedDirection, trendDirection: "volatile" };
  if (Math.abs(slopeNormalizedPct) <= 5) return { expectedDirection, trendDirection: "stable" };

  const movingInDesiredDirection = expectedDirection === "decrease"
    ? slopeNormalizedPct < -5
    : slopeNormalizedPct > 5;

  return {
    expectedDirection,
    trendDirection: movingInDesiredDirection ? "improving" : "declining",
  };
}

/** Compute pure statistics and temporal structural-break evidence for each metric. */
function computeStats(metrics: MetricRow[]): { stats: MetricStats[]; skippedMetrics: string[] } {
  const grouped: Record<string, MetricRow[]> = {};
  for (const metric of metrics) {
    if (!grouped[metric.metric_type]) grouped[metric.metric_type] = [];
    grouped[metric.metric_type].push(metric);
  }

  const results: MetricStats[] = [];
  const skippedMetrics: string[] = [];

  for (const [type, rows] of Object.entries(grouped)) {
    if (rows.length < 2) {
      skippedMetrics.push(type);
      continue;
    }

    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const values = sorted.map(row => Number(row.value));
    const dates = sorted.map(row => row.date);
    const n = values.length;
    const latest = values[n - 1];
    const previous = values[n - 2];
    const changePct = previous !== 0 ? ((latest - previous) / Math.abs(previous)) * 100 : 0;

    const mean = values.reduce((sum, value) => sum + value, 0) / n;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    const volatility = mean !== 0 ? (stdDev / Math.abs(mean)) * 100 : 0;

    const xMean = (n - 1) / 2;
    let numerator = 0;
    let denominator = 0;
    for (let index = 0; index < n; index++) {
      numerator += (index - xMean) * (values[index] - mean);
      denominator += (index - xMean) ** 2;
    }
    const slope = denominator !== 0 ? numerator / denominator : 0;
    const slopeNorm = mean !== 0 ? (slope / Math.abs(mean)) * 100 : 0;
    const { expectedDirection, trendDirection } = classifyTrend(type, slopeNorm, volatility);

    const segmentBreakdown: Record<string, number[]> = {};
    for (const row of sorted) {
      const segment = row.segment || row.region || "overall";
      if (!segmentBreakdown[segment]) segmentBreakdown[segment] = [];
      segmentBreakdown[segment].push(Number(row.value));
    }

    const segmentShifts: string[] = [];
    for (const [segment, segmentValues] of Object.entries(segmentBreakdown)) {
      if (segmentValues.length < 2 || segment === "overall") continue;
      const segmentChange = segmentValues[segmentValues.length - 1] - segmentValues[0];
      const segmentChangePct = segmentValues[0] !== 0
        ? (segmentChange / Math.abs(segmentValues[0])) * 100
        : 0;
      if (Math.abs(segmentChangePct) > 10) {
        segmentShifts.push(`${segment}: ${segmentChangePct > 0 ? "+" : ""}${segmentChangePct.toFixed(1)}%`);
      }
    }

    results.push({
      metric_type: type,
      data_points: n,
      latest_value: Number(latest.toFixed(4)),
      previous_value: Number(previous.toFixed(4)),
      period_change_pct: Number(changePct.toFixed(2)),
      mean: Number(mean.toFixed(4)),
      std_dev: Number(stdDev.toFixed(4)),
      volatility_pct: Number(volatility.toFixed(2)),
      slope_normalized_pct: Number(slopeNorm.toFixed(2)),
      expected_direction: expectedDirection,
      trend_direction: trendDirection,
      min: Number(values.reduce((a, b) => a < b ? a : b, values[0]).toFixed(4)),
      max: Number(values.reduce((a, b) => a > b ? a : b, values[0]).toFixed(4)),
      date_range: `${sorted[0].date} to ${sorted[n - 1].date}`,
      segment_shifts: segmentShifts,
      structural_breaks: detectChangepoints(values, dates),
    });
  }

  return { stats: results, skippedMetrics };
}

/** Paginated fetch: retrieves all metric rows for the selected dataset. */
async function fetchAllMetrics(
  supabaseUrl: string,
  serviceKey: string,
  organizationId: string,
  datasetId: string,
): Promise<MetricRow[]> {
  const PAGE_SIZE = 1000;
  const all: MetricRow[] = [];
  let offset = 0;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  while (true) {
    const url = `${supabaseUrl}/rest/v1/metrics?organization_id=eq.${organizationId}&dataset_id=eq.${datasetId}&order=date.asc&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, { headers });
    const page: MetricRow[] = await response.json();
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

/**
 * Generate diagnostic interpretation from computed evidence.
 * The model is explicitly prohibited from asserting causality because this
 * pipeline supplies descriptive/time-series evidence, not a causal design.
 */
async function generateAIDiagnostics(
  stats: MetricStats[],
  contextBlock = "",
  datasetName = "dataset",
): Promise<any[]> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey || stats.length === 0) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: `You are an enterprise statistical diagnostic engine analyzing the dataset "${datasetName}".

EPISTEMIC RULE: The supplied evidence is descriptive and temporal. It does NOT establish causality. Never claim that a factor caused a metric movement, never state a root cause as fact, and never convert temporal order, slope, volatility, segment divergence, or a changepoint into causal proof. A structural break means the statistical regime changed; it does not identify why.
${contextBlock}
METRIC STATISTICS (computed from real data):
${JSON.stringify(stats, null, 2)}

For EACH metric return ONLY a JSON array using this compatibility schema:
[
  {
    "metric_type": "exact metric_type from input",
    "diagnosis": "1-2 sentence description referencing actual values and statistics",
    "severity": "critical" | "warning" | "info",
    "root_cause": "Driver hypothesis only. Begin with 'Driver hypothesis (causality not established):' and describe what should be investigated, not what caused the outcome.",
    "causal_factors": ["Associated evidence only; each item must avoid causal language and cite slope, volatility, segment shifts, or structural breaks"],
    "trend_direction": "COPY the computed trend_direction from the matching metric statistics exactly; do not reinterpret it",
    "change_pct": <number from period_change_pct>,
    "recommendation": "Actionable next step to investigate/monitor the pattern without assuming causality",
    "raw_confidence": <60-90 based on data quality>
  }
]

Rules:
- Be domain-agnostic.
- Reference ACTUAL values, percentages, dates, changepoints, expected_direction, and data-point counts from the supplied statistics.
- trend_direction is already direction-aware: for lower-is-better metrics such as churn/cost/risk, a negative slope may correctly be labeled improving. Preserve it exactly.
- Critical: |period_change_pct| > 10%, volatility > 40%, or material structural instability.
- Warning: |period_change_pct| 5-10%, volatility 25-40%, or an emerging structural break.
- Info: otherwise stable/low-volatility evidence.
- A changepoint is temporal structural-break evidence only, never causal evidence.
- Do NOT use phrases such as 'caused by', 'root cause is', 'led to', or 'resulted from' unless explicitly negating causality.
- recommendation must investigate candidate drivers, validate competing explanations, or monitor the metric.
- raw_confidence: <12 pts max 60, <30 pts max 75, 30+ pts max 90.
- Do NOT invent data.
- Every diagnosis must reference dataset "${datasetName}" and specific observed values.
- Return ONLY the JSON array.`,
        }],
      }),
    });

    clearTimeout(timeout);
    if (!response.ok) return [];

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    try {
      return JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("AI returned malformed JSON, falling back to rule engine:", parseError);
      return [];
    }
  } catch (error) {
    clearTimeout(timeout);
    console.error("AI diagnostic generation error:", error);
    return [];
  }
}

/** Rule-based fallback — statistical evidence only, never causal attribution. */
function fallbackDiagnostics(stats: MetricStats[]): any[] {
  return stats.map(stat => {
    let severity: "critical" | "warning" | "info" = "info";
    if (Math.abs(stat.period_change_pct) > 10 || stat.volatility_pct > 40 || stat.structural_breaks.some(point => point.significance >= 0.7)) {
      severity = "critical";
    } else if (Math.abs(stat.period_change_pct) > 5 || stat.volatility_pct > 25 || stat.structural_breaks.length > 0) {
      severity = "warning";
    }

    const breakSummary = stat.structural_breaks.length > 0
      ? ` Structural break evidence: ${stat.structural_breaks.map(point => `${point.date ?? `index ${point.index}`} (${point.magnitude_pct > 0 ? "+" : ""}${point.magnitude_pct.toFixed(1)}%)`).join(", ")}.`
      : " No statistically material structural break was detected by the changepoint routine.";

    let recommendation: string;
    if (severity === "critical") {
      recommendation = `Investigate candidate drivers of ${stat.metric_type.replace(/_/g, " ")} immediately. Compare events and interventions around detected break dates, test competing explanations, and do not treat temporal proximity as causal proof.`;
    } else if (severity === "warning") {
      recommendation = `Monitor ${stat.metric_type.replace(/_/g, " ")} closely and investigate candidate drivers around segment shifts or structural-break dates before committing to an intervention.`;
    } else {
      recommendation = `${stat.metric_type.replace(/_/g, " ")} is ${stat.trend_direction} relative to its desired ${stat.expected_direction} direction under the current descriptive checks. Continue monitoring and escalate only if new break or variance evidence appears.`;
    }

    return {
      metric_type: stat.metric_type,
      diagnosis: `${stat.metric_type.replace(/_/g, " ")} changed ${stat.period_change_pct > 0 ? "+" : ""}${stat.period_change_pct.toFixed(1)}% (latest: ${stat.latest_value}, mean: ${stat.mean.toFixed(2)}). Trend is ${stat.trend_direction} relative to desired direction ${stat.expected_direction}, with ${stat.volatility_pct.toFixed(0)}% volatility across ${stat.data_points} observations.${breakSummary}`,
      severity,
      root_cause: `Driver hypothesis (causality not established): The observed pattern is statistically associated with a ${stat.slope_normalized_pct.toFixed(1)}% normalized slope, desired direction ${stat.expected_direction}, ${stat.volatility_pct.toFixed(0)}% volatility${stat.segment_shifts.length > 0 ? `, and segment divergence (${stat.segment_shifts.join(", ")})` : ""}. These features identify where to investigate; they do not identify a cause.`,
      causal_factors: associatedEvidence([], stat),
      expected_direction: stat.expected_direction,
      trend_direction: stat.trend_direction,
      change_pct: stat.period_change_pct,
      recommendation,
      raw_confidence: Math.min(50 + Math.min((stat.data_points - 2) * 2, 20) + (stat.volatility_pct < 15 ? 10 : stat.volatility_pct < 30 ? 5 : 0), 85),
    };
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const auth = await authenticateRequest(req);
  const corsHeaders = getCorsHeaders(req);
  if (auth.response) return auth.response;

  try {
    const body = await req.json();
    const { organization_id, dataset_id, decision_context_id, dry_run } = body;
    if (!organization_id) throw new Error("organization_id required");

    const isMember = await verifyOrgMembership(auth.userId, organization_id);
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!dataset_id) throw new Error("dataset_id required by Active Data Contract");

    const contract = await enforceDatasetContract(
      { organization_id, dataset_id, dry_run },
      {
        from: (table: string) => {
          const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
          return {
            select: (columns: string) => ({
              eq: (column: string, value: string) => ({
                eq: (secondColumn: string, secondValue: string) => ({
                  maybeSingle: async () => {
                    const url = `${supabaseUrl}/rest/v1/${table}?select=${columns}&${column}=eq.${value}&${secondColumn}=eq.${secondValue}&limit=1`;
                    const response = await fetch(url, { headers });
                    const rows = await response.json();
                    return { data: rows?.[0] || null, error: null };
                  },
                }),
              }),
            }),
          };
        },
      },
    );

    if (contract.response) return contract.response;

    const [metrics, datasetResponse] = await Promise.all([
      fetchAllMetrics(supabaseUrl, serviceKey, organization_id, dataset_id),
      fetch(
        `${supabaseUrl}/rest/v1/datasets?id=eq.${dataset_id}&organization_id=eq.${organization_id}&select=name&limit=1`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      ),
    ]);
    const datasetRows = await datasetResponse.json();
    const datasetName = datasetRows?.[0]?.name || "dataset";

    if (!metrics || metrics.length < 2) {
      return new Response(JSON.stringify({
        diagnostics: [],
        analyzed_metrics: metrics?.length || 0,
        message: "Insufficient data for diagnosis (minimum 2 data points required)",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { stats, skippedMetrics } = computeStats(metrics);

    let contextBlock = "";
    if (decision_context_id) {
      const contextResponse = await fetch(
        `${supabaseUrl}/rest/v1/decision_contexts?id=eq.${decision_context_id}&organization_id=eq.${organization_id}&select=name,decision_type,objective,industry,target_metrics`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      );
      const contextRows = await contextResponse.json();
      if (contextRows?.[0]) {
        const context = contextRows[0];
        contextBlock = `
DECISION CONTEXT:
Name: ${context.name}
Type: ${context.decision_type}
Objective: ${context.objective || "Not specified"}
Industry: ${context.industry || "Not specified"}

Frame diagnoses through this context, but do not let business context upgrade statistical evidence into causal evidence.
`;
      }
    }

    let interpretedResults = await generateAIDiagnostics(stats, contextBlock, datasetName);

    if (interpretedResults.length === 0) {
      interpretedResults = fallbackDiagnostics(stats);
    } else {
      const interpretedMetricTypes = new Set(interpretedResults.map((result: any) => result.metric_type));
      const missingStats = stats.filter(stat => !interpretedMetricTypes.has(stat.metric_type));
      if (missingStats.length > 0) interpretedResults.push(...fallbackDiagnostics(missingStats));
    }

    const diagnosticPromises = interpretedResults.map(async interpreted => {
      const matchingStat = stats.find(stat => stat.metric_type === interpreted.metric_type);
      const sampleSize = matchingStat?.data_points || 2;
      const volatility = matchingStat?.volatility_pct || 0;
      const structuralBreaks = matchingStat?.structural_breaks ?? [];
      const level = evidenceLevel(matchingStat);
      const expectedDirection = matchingStat?.expected_direction ?? inferExpectedOutcomeDirection(interpreted.metric_type);
      const computedTrend = matchingStat?.trend_direction ?? "stable";

      if (sampleSize < 8) {
        const meta = await applyAdaptiveConfidenceWithFetch(
          { rawConfidence: 0, sampleSize },
          supabaseUrl,
          serviceKey,
          organization_id,
        );
        return {
          metric_type: interpreted.metric_type,
          diagnosis: `Insufficient data (${sampleSize} points). Minimum 8 required for credible diagnostic interpretation.`,
          severity: "info" as const,
          root_cause: "Driver hypothesis unavailable: causality is not established and data depth is insufficient for a credible statistical driver hypothesis.",
          causal_factors: [`Associated evidence (not causal): only ${sampleSize} data points available`],
          causal_status: "not_established" as const,
          evidence_level: "descriptive" as const,
          structural_breaks: structuralBreaks,
          expected_direction: expectedDirection,
          trend_direction: computedTrend,
          change_pct: Number((matchingStat?.period_change_pct || 0).toFixed(1)),
          recommendation: "Collect more historical data before using this metric for diagnostic decision support.",
          ...applyMeta(meta),
        } as DiagnosticResult;
      }

      const meta = await applyAdaptiveConfidenceWithFetch(
        { rawConfidence: interpreted.raw_confidence || 60, sampleSize, variance: volatility },
        supabaseUrl,
        serviceKey,
        organization_id,
      );

      const normalizedChangePct = Number((matchingStat?.period_change_pct ?? interpreted.change_pct ?? 0).toFixed(1));

      return {
        metric_type: interpreted.metric_type,
        diagnosis: interpreted.diagnosis || "",
        severity: interpreted.severity || "info",
        root_cause: driverHypothesis(interpreted.root_cause, matchingStat),
        causal_factors: associatedEvidence(interpreted.causal_factors, matchingStat),
        causal_status: "not_established" as const,
        evidence_level: level,
        structural_breaks: structuralBreaks,
        expected_direction: expectedDirection,
        // Computed direction-aware trend is authoritative; the LLM cannot override it.
        trend_direction: computedTrend,
        change_pct: normalizedChangePct,
        recommendation: sanitizeCausalLanguage(interpreted.recommendation || "Investigate candidate drivers and validate competing explanations."),
        ...applyMeta(meta),
      } as DiagnosticResult;
    });

    const diagnostics = await Promise.all(diagnosticPromises);

    diagnostics.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    return new Response(JSON.stringify({
      diagnostics,
      analyzed_metrics: metrics.length,
      metric_types_analyzed: stats.map(stat => stat.metric_type),
      skipped_metrics: skippedMetrics,
      adaptive_calibration_applied: diagnostics.some(diagnostic => diagnostic.adaptive_calibration_applied),
      causal_status: "not_established",
      diagnostic_method: "descriptive statistics + KPI-direction-aware regression trend + segment shifts + deterministic changepoint detection",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
