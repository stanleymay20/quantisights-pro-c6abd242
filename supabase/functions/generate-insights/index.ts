import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyAdaptiveConfidence, fetchCalibrationModel } from "../_shared/adaptive-confidence.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { validateInsightArray } from "../_shared/ai-validation.ts";
import { withRetry } from "../_shared/retry.ts";

// ── Inline industry detection for Edge Function ──
function detectIndustryFromMetrics(metricTypes: string[], segments: string[], regions: string[], datasetName: string) {
  const signals: Array<{ industry: string; subIndustry?: string; patterns: RegExp[]; weight: number }> = [
    { industry: "SaaS", patterns: [/mrr/i, /arr/i, /churn.?rate/i, /ltv/i, /cac/i, /nrr/i, /net.?revenue.?retention/i, /arpu/i, /dau/i, /mau/i, /activation/i, /trial/i, /conversion.?rate/i], weight: 3 },
    { industry: "SaaS", subIndustry: "PLG", patterns: [/product.?qualified/i, /pql/i, /free.?to.?paid/i, /viral/i], weight: 4 },
    { industry: "E-Commerce", patterns: [/gmv/i, /aov/i, /average.?order/i, /cart.?abandon/i, /repeat.?purchase/i, /basket/i, /sku/i, /inventory.?turnover/i, /return.?rate/i], weight: 3 },
    { industry: "Financial Services", patterns: [/aum/i, /assets.?under/i, /nim/i, /net.?interest/i, /loan/i, /deposit/i, /npl/i, /non.?performing/i, /capital.?ratio/i, /tier.?1/i], weight: 3 },
    { industry: "Healthcare", patterns: [/patient/i, /readmission/i, /bed.?occupancy/i, /length.?of.?stay/i, /clinical/i, /mortality/i, /infection.?rate/i], weight: 3 },
    { industry: "Manufacturing", patterns: [/oee/i, /overall.?equipment/i, /yield/i, /defect.?rate/i, /cycle.?time/i, /throughput/i, /scrap/i, /downtime/i, /capacity.?utilization/i], weight: 3 },
    { industry: "Media", patterns: [/cpm/i, /cpc/i, /ctr/i, /impression/i, /reach/i, /engagement.?rate/i, /viewability/i, /roas/i, /ad.?spend/i, /subscriber/i, /watch.?time/i], weight: 3 },
    { industry: "Energy", patterns: [/kwh/i, /mwh/i, /generation/i, /capacity.?factor/i, /emission/i, /carbon/i, /renewable/i], weight: 3 },
    { industry: "Education", patterns: [/enrollment/i, /graduation/i, /student/i, /completion.?rate/i, /course/i, /attendance/i], weight: 3 },
    { industry: "Real Estate", patterns: [/occupancy/i, /rent/i, /noi/i, /cap.?rate/i, /lease/i, /vacancy/i], weight: 3 },
    { industry: "Logistics", patterns: [/on.?time.?delivery/i, /otd/i, /freight/i, /shipment/i, /fill.?rate/i, /transit.?time/i], weight: 3 },
    { industry: "General Business", patterns: [/revenue/i, /cost/i, /profit/i, /margin/i, /expense/i, /ebitda/i, /growth/i], weight: 1 },
  ];

  const scores = new Map<string, { score: number; signals: string[]; subIndustry?: string }>();
  for (const sig of signals) {
    for (const p of sig.patterns) {
      for (const m of metricTypes) {
        if (p.test(m)) {
          const key = sig.subIndustry || sig.industry;
          const ex = scores.get(key) || { score: 0, signals: [], subIndustry: sig.subIndustry };
          ex.score += sig.weight;
          ex.signals.push(m);
          scores.set(key, ex);
        }
      }
    }
  }
  // Check dataset name
  for (const sig of signals) {
    for (const p of sig.patterns) {
      if (p.test(datasetName)) {
        const key = sig.subIndustry || sig.industry;
        const ex = scores.get(key) || { score: 0, signals: [] };
        ex.score += 1;
        scores.set(key, ex);
      }
    }
  }

  let best = "General Business", bestScore = 0, bestSignals: string[] = [], bestSub: string | undefined;
  scores.forEach((d, k) => { if (d.score > bestScore) { bestScore = d.score; best = k; bestSignals = [...new Set(d.signals)]; bestSub = d.subIndustry; } });
  const parent = bestSub ? (signals.find(s => s.subIndustry === best)?.industry || best) : best;
  const confidence = Math.min(95, 30 + bestScore * 10);

  const kpiFrameworks: Record<string, Array<{ metric: string; importance: string; context: string }>> = {
    "SaaS": [
      { metric: "Net Revenue Retention", importance: "critical", context: "NRR >120% = strong expansion; <100% = contraction" },
      { metric: "CAC Payback", importance: "critical", context: "Target <18 months" },
      { metric: "LTV/CAC", importance: "critical", context: "Healthy: 3-5x" },
      { metric: "Gross Margin", importance: "high", context: "Best-in-class SaaS: >80%" },
      { metric: "Monthly Churn", importance: "critical", context: "Enterprise: <1%/month" },
    ],
    "E-Commerce": [
      { metric: "AOV", importance: "critical", context: "Growth through cross-sell is more capital-efficient" },
      { metric: "Cart Abandonment", importance: "high", context: "Industry avg: 70%; optimize below 65%" },
      { metric: "Repeat Purchase Rate", importance: "critical", context: "Target >30%" },
    ],
    "Financial Services": [
      { metric: "Net Interest Margin", importance: "critical", context: "Compressed NIM = rate environment pressure" },
      { metric: "Cost-to-Income", importance: "critical", context: "Best: <50%; above 65% = inefficiency" },
      { metric: "NPL Ratio", importance: "critical", context: "Above 3% requires enhanced risk mgmt" },
    ],
    "Healthcare": [
      { metric: "Readmission Rate", importance: "critical", context: "30-day >15% triggers CMS penalties" },
      { metric: "Bed Occupancy", importance: "high", context: "Optimal: 80-85%; >90% = safety risk" },
    ],
    "Manufacturing": [
      { metric: "OEE", importance: "critical", context: "World-class: >85%; <60% = major opportunity" },
      { metric: "First Pass Yield", importance: "critical", context: "Target >95%" },
    ],
  };

  const analysisFrameworks: Record<string, string> = {
    "SaaS": "ANALYZE USING SaaS FRAMEWORK: Unit Economics (LTV/CAC, payback), Growth Quality (NRR, organic vs paid), Efficiency (Rule of 40, burn multiple), Cohort Retention, Red Flags (rising CAC + flat NRR)",
    "E-Commerce": "ANALYZE USING E-COMMERCE FRAMEWORK: Customer Economics (CAC, AOV, LTV by channel), Funnel (traffic→purchase), Inventory (turnover, sell-through), Channel Mix, Seasonality (compare YoY not sequential)",
    "Financial Services": "ANALYZE USING FINANCIAL FRAMEWORK: Profitability (NIM, fee diversification, cost-to-income), Risk (NPL, provision coverage), Capital (CET1 trajectory), Growth (loan book vs GDP)",
    "Healthcare": "ANALYZE USING HEALTHCARE FRAMEWORK: Clinical Quality (readmission, infection rates), Operational (bed turnover, OR utilization), Financial (revenue per adjusted patient day), Volume trending",
    "Manufacturing": "ANALYZE USING MANUFACTURING FRAMEWORK: Productivity (OEE decomposition), Quality (defect rate, first pass yield), Efficiency (cycle time, capacity utilization), Supply Chain (lead time variability)",
    "General Business": "ANALYZE USING GENERAL FRAMEWORK: Financial Health (revenue growth, margin trend), Efficiency (cost structure, revenue per employee), Growth (concentration risk), Risk (volatility, anomaly root causes)",
  };

  return {
    industry: parent,
    subIndustry: bestSub,
    confidence,
    matchedSignals: bestSignals,
    kpiFramework: kpiFrameworks[parent] || kpiFrameworks["General Business"] || [],
    analysisFramework: analysisFrameworks[parent] || analysisFrameworks["General Business"],
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const log = createLogger("generate-insights", req);

  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceSupabase = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const userId = user.id;
    const body = await req.json();
    const { organization_id, dataset_id, decision_context_id, dry_run } = body;

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), { status: 400, headers: corsHeaders });
    }
    if (!dataset_id) {
      return new Response(JSON.stringify({ error: "dataset_id required by Active Data Contract" }), { status: 400, headers: corsHeaders });
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", userId)
      .eq("organization_id", organization_id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Not a member" }), { status: 403, headers: corsHeaders });
    }


    // serviceSupabase already created above

    // Validate dataset belongs to org
    const { data: dsCheck } = await serviceSupabase
      .from("datasets")
      .select("id")
      .eq("id", dataset_id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (!dsCheck) {
      return new Response(JSON.stringify({ error: "dataset_id does not belong to this organization" }), { status: 403, headers: corsHeaders });
    }

    if (dry_run) {
      return new Response(JSON.stringify({ dry_run: true, status: "PASS", dataset_id, organization_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No subscription gate — insights should work for all tiers
    const { data: metrics } = await supabase
      .from("metrics")
      .select("metric_type, value, date, region, segment")
      .eq("organization_id", organization_id)
      .eq("dataset_id", dataset_id)
      .order("date", { ascending: true });

    if (!metrics || metrics.length === 0) {
      return new Response(JSON.stringify({ message: "No metrics to analyze", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const calModel = await fetchCalibrationModel(supabaseUrl, serviceKey, organization_id);
    const { computeVariance } = await import("../_shared/adaptive-confidence.ts");

    // Group metrics by type with statistical summary
    const metricsByType: Record<string, { values: number[]; dates: string[]; regions: Set<string>; segments: Set<string> }> = {};
    for (const m of metrics) {
      if (!metricsByType[m.metric_type]) {
        metricsByType[m.metric_type] = { values: [], dates: [], regions: new Set(), segments: new Set() };
      }
      metricsByType[m.metric_type].values.push(Number(m.value));
      metricsByType[m.metric_type].dates.push(m.date);
      if (m.region) metricsByType[m.metric_type].regions.add(m.region);
      if (m.segment) metricsByType[m.metric_type].segments.add(m.segment);
    }

    // Build statistical summaries for AI with advanced profiling
    const metricSummaries = Object.entries(metricsByType).map(([type, data]) => {
      const vals = data.values;
      const n = vals.length;
      const mean = vals.reduce((s, v) => s + v, 0) / n;
      const latest = vals[n - 1];
      const earliest = vals[0];
      const changePct = earliest !== 0 ? ((latest - earliest) / Math.abs(earliest)) * 100 : 0;
      const half = Math.floor(n / 2);
      const recentAvg = vals.slice(half).reduce((s, v) => s + v, 0) / vals.slice(half).length;
      const earlyAvg = vals.slice(0, half).length > 0 ? vals.slice(0, half).reduce((s, v) => s + v, 0) / vals.slice(0, half).length : recentAvg;
      const trendPct = earlyAvg !== 0 ? ((recentAvg - earlyAvg) / Math.abs(earlyAvg)) * 100 : 0;
      const volatility = mean !== 0 ? (Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n) / Math.abs(mean)) * 100 : 0;

      // Distribution profiling
      let skewness = 0;
      const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
      if (n >= 3 && std > 0) {
        let skewSum = 0;
        for (let i = 0; i < n; i++) skewSum += ((vals[i] - mean) / std) ** 3;
        skewness = (skewSum * n) / ((n - 1) * (n - 2));
      }
      const isNormal = Math.abs(skewness) < 1;

      // Seasonality detection via autocorrelation
      let seasonalPeriod: number | null = null;
      let seasonalStrength = 0;
      if (n >= 24) {
        for (const period of [4, 7, 12]) {
          if (n < period * 2) continue;
          let num = 0, den = 0;
          for (let i = 0; i < n; i++) {
            den += (vals[i] - mean) ** 2;
            if (i + period < n) num += (vals[i] - mean) * (vals[i + period] - mean);
          }
          const acf = den !== 0 ? num / den : 0;
          if (acf > 0.3 && acf > seasonalStrength) {
            seasonalStrength = acf;
            seasonalPeriod = period;
          }
        }
      }

      // Changepoint detection (simplified CUSUM for edge function)
      let changepointIdx: number | null = null;
      let changepointMagnitude = 0;
      if (n >= 10) {
        let bestStat = 0;
        const globalStd = std > 0 ? std : 1;
        for (let i = 5; i <= n - 5; i++) {
          const leftMean = vals.slice(0, i).reduce((s, v) => s + v, 0) / i;
          const rightMean = vals.slice(i).reduce((s, v) => s + v, 0) / (n - i);
          const stat = Math.abs(leftMean - rightMean) / globalStd * Math.sqrt((i * (n - i)) / n);
          if (stat > bestStat) {
            bestStat = stat;
            changepointIdx = i;
            changepointMagnitude = leftMean !== 0 ? ((rightMean - leftMean) / Math.abs(leftMean)) * 100 : 0;
          }
        }
        const threshold = 1.5 + 0.5 * Math.log(n);
        if (bestStat < threshold) {
          changepointIdx = null;
          changepointMagnitude = 0;
        }
      }

      // IQR for outlier context
      const sorted = [...vals].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(n * 0.25)];
      const q3 = sorted[Math.floor(n * 0.75)];
      const iqr = q3 - q1;
      const outlierCount = iqr > 0 ? vals.filter(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr).length : 0;

      // Iterative min/max to avoid stack overflow on large datasets
      let minVal = vals[0], maxVal = vals[0];
      for (let i = 1; i < n; i++) {
        if (vals[i] < minVal) minVal = vals[i];
        if (vals[i] > maxVal) maxVal = vals[i];
      }

      return {
        metric_type: type,
        data_points: n,
        date_range: `${data.dates[0]} to ${data.dates[n - 1]}`,
        latest_value: Number(latest.toFixed(4)),
        earliest_value: Number(earliest.toFixed(4)),
        total_change_pct: Number(changePct.toFixed(2)),
        recent_trend_pct: Number(trendPct.toFixed(2)),
        mean: Number(mean.toFixed(4)),
        min: Number(minVal.toFixed(4)),
        max: Number(maxVal.toFixed(4)),
        volatility_pct: Number(volatility.toFixed(2)),
        regions: [...data.regions],
        segments: [...data.segments],
        // Advanced profiling
        distribution: isNormal ? "normal" : (skewness > 1 ? "right-skewed" : skewness < -1 ? "left-skewed" : "approximately normal"),
        skewness: Number(skewness.toFixed(3)),
        outlier_count: outlierCount,
        q1: Number(q1.toFixed(4)),
        q3: Number(q3.toFixed(4)),
        seasonality: seasonalPeriod ? { period: seasonalPeriod, strength: Number(seasonalStrength.toFixed(3)) } : null,
        structural_break: changepointIdx ? {
          at_index: changepointIdx,
          at_date: data.dates[changepointIdx] || null,
          magnitude_pct: Number(changepointMagnitude.toFixed(1)),
        } : null,
      };
    });

    // Fetch dataset name for contextual insights
    const { data: dsInfo } = await serviceSupabase
      .from("datasets")
      .select("name")
      .eq("id", dataset_id)
      .maybeSingle();
    const datasetName = dsInfo?.name || "dataset";

    // Fetch decision context if provided
    let contextBlock = "";
    if (decision_context_id) {
      const { data: ctxData } = await serviceSupabase
        .from("decision_contexts")
        .select("name, decision_type, objective, industry, target_metrics")
        .eq("id", decision_context_id)
        .eq("organization_id", organization_id)
        .maybeSingle();
      if (ctxData) {
        contextBlock = `
DECISION CONTEXT:
Name: ${ctxData.name}
Type: ${ctxData.decision_type}
Objective: ${ctxData.objective || "Not specified"}
Industry: ${ctxData.industry || "Not specified"}
Target Metrics: ${JSON.stringify(ctxData.target_metrics || [])}

IMPORTANT: Frame ALL insights through this decision context. Every insight must explain its relevance to the "${ctxData.decision_type}" decision. Prioritize metrics listed in target_metrics.
`;
      }
    }

    // ── INDUSTRY DETECTION ──
    const allMetricTypes = Object.keys(metricsByType);
    const allRegions = [...new Set(metrics.flatMap((m: any) => m.region ? [m.region] : []))];
    const allSegments = [...new Set(metrics.flatMap((m: any) => m.segment ? [m.segment] : []))];
    
    const industryProfile = detectIndustryFromMetrics(allMetricTypes, allSegments, allRegions, datasetName);

    // Use AI with multi-model failover chain to generate contextual insights
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const aiInsights: any[] = [];
    let modelUsed: string | null = null;

    // Model failover chain: primary → secondary → tertiary
    const MODEL_CHAIN = [
      "google/gemini-2.5-flash",
      "openai/gpt-5-mini",
      "google/gemini-2.5-flash-lite",
    ];

    const insightPrompt = `You are an enterprise data intelligence engine producing analyst-grade insights for the ${industryProfile.industry}${industryProfile.subIndustry ? ` (${industryProfile.subIndustry})` : ""} industry. The dataset is called "${datasetName}".

DETECTED INDUSTRY: ${industryProfile.industry} (confidence: ${industryProfile.confidence}%, matched signals: ${industryProfile.matchedSignals.join(", ")})
${contextBlock}

${industryProfile.analysisFramework}

INDUSTRY KPI BENCHMARKS:
${industryProfile.kpiFramework.map(k => `- ${k.metric} [${k.importance}]: ${k.context}`).join("\n")}

METRIC SUMMARIES (with advanced statistical profiling):
${JSON.stringify(metricSummaries, null, 2)}

STATISTICAL CONTEXT:
- Distribution profiles include skewness and outlier counts. Flag non-normal distributions.
- Seasonality fields show detected periodic patterns. Reference these to avoid false trend conclusions.
- Structural breaks (changepoints) indicate regime changes. Split analysis into pre/post periods.
- IQR-based outlier counts quantify data quality concerns.

Generate 8-12 CONTEXTUAL insights following these tiers:
1. CRITICAL FINDINGS (2-3): Structural breaks, regime changes, high-severity anomalies with ROOT-CAUSE HYPOTHESES specific to ${industryProfile.industry}
2. TREND INTELLIGENCE (2-3): Growth/decline with seasonality adjustment, momentum shifts. Compare against industry benchmarks where applicable.
3. SEGMENT/REGION ANALYSIS (2-3): Cross-segment disparities, geographic patterns
4. STATISTICAL WARNINGS (1-2): Distribution issues, outlier concentrations, data quality
5. ACTIONABLE OPPORTUNITIES (1-2): Industry-specific recommendations with success metrics

Each insight MUST:
- Reference the dataset name ("${datasetName}")
- Reference specific metric names and their actual values
- Include date ranges and sample sizes
- Include statistical evidence (p-values, effect sizes, confidence intervals where applicable)
- For anomalies: provide 2-3 industry-specific root-cause hypotheses
- For benchmarking: compare against ${industryProfile.industry} industry standards
${decision_context_id ? "- Reference the decision context and how the finding impacts the stated objective" : ""}

Return ONLY a JSON array:
[
  {
    "message": "In ${datasetName}, [metric_name] [specific observation with values]. [Statistical evidence]. [Industry context: how this compares to ${industryProfile.industry} benchmarks]. [Root-cause hypotheses if anomaly]. [Actionable recommendation with success metric].",
    "severity": "high" | "medium" | "info",
    "category": "trend" | "anomaly" | "risk" | "opportunity" | "segmentation" | "correlation" | "driver" | "seasonality" | "changepoint" | "distribution" | "benchmark",
    "raw_confidence": 55-92
  }
]

Rules:
- NEVER produce generic insights — every sentence must contain a specific number, metric name, or date
- For EVERY anomaly, include 2-3 ${industryProfile.industry}-specific root-cause hypotheses
- Compare metrics against industry benchmarks when data allows
- Include segment/region analysis when segment or region data exists
- Cross-reference metrics: note correlations or divergences between metric types
- If seasonality is detected, warn that sequential period comparison may be misleading
- If structural breaks exist, specify pre/post period statistics separately
- If distribution is non-normal, flag which statistical methods are unreliable
- High severity: declines >10%, volatility >50%, structural breaks >25%, below p25 benchmark
- Medium: 5-10% changes, emerging patterns, segment disparities, seasonality warnings
- Info: positive trends, above p75 benchmark, data quality confirmations
- At least 2 insights must reference specific segments or regions if present
- Confidence should reflect data quality: lower for small samples, skewed data, or single-method signals
- Return ONLY the JSON array`;

    if (LOVABLE_API_KEY) {
      // Try each model in the chain until one succeeds
      for (const model of MODEL_CHAIN) {
        try {
          const aiController = new AbortController();
          const aiTimeout = setTimeout(() => aiController.abort(), 30000);
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            signal: aiController.signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
            },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: insightPrompt }],
            }),
          });

          clearTimeout(aiTimeout);

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const content = aiData.choices?.[0]?.message?.content || "";
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              try {
                const rawParsed = JSON.parse(jsonMatch[0]);
                // Schema validation first
                const schemaValid = validateInsightArray(rawParsed);
                log.info("AI schema validation", { raw: rawParsed.length, valid: schemaValid.length, model });
                
                // POST-GENERATION VALIDATION: reject hallucinated insights
                const knownMetrics = new Set(Object.keys(metricsByType));
                const knownRegions = new Set<string>();
                const knownSegments = new Set<string>();
                Object.values(metricsByType).forEach(d => {
                  d.regions.forEach(r => knownRegions.add(r.toLowerCase()));
                  d.segments.forEach(s => knownSegments.add(s.toLowerCase()));
                });

                for (const insight of schemaValid) {
                  const msg = (insight.message || "").toLowerCase();
                  const refsDataset = msg.includes(datasetName.toLowerCase());
                  const refsMetric = [...knownMetrics].some(m => msg.includes(m.replace(/_/g, " ").toLowerCase()) || msg.includes(m.toLowerCase()));
                  
                  if (refsDataset && refsMetric) {
                    (insight as any)._validated = true;
                    aiInsights.push(insight);
                  } else if (refsMetric && !refsDataset) {
                    insight.message = `In ${datasetName}, ${insight.message}`;
                    (insight as any)._validated = true;
                    (insight as any)._salvaged = true;
                    aiInsights.push(insight);
                  } else {
                    log.warn("Rejected hallucinated insight", { model, snippet: insight.message?.substring(0, 100) });
                  }
                }

                if (aiInsights.length > 0) {
                  modelUsed = model;
                  log.info("AI insights accepted", { model, count: aiInsights.length });
                  break; // Success — exit failover chain
                }
              } catch {
                log.error("Failed to parse AI JSON", { model });
              }
            }
          } else {
            console.warn(`Model ${model} returned ${aiRes.status}, trying next...`);
            await aiRes.text(); // consume body
          }
        } catch (err) {
          console.warn(`Model ${model} failed:`, err instanceof Error ? err.message : "unknown");
          // Continue to next model
        }
      }
    }

    // Fallback: rule-based analysis if AI fails, is unavailable, or all insights rejected
    if (aiInsights.length === 0) {
      for (const [type, data] of Object.entries(metricsByType)) {
        const vals = data.values;
        if (vals.length < 2) continue;
        const m = vals.reduce((s, v) => s + v, 0) / vals.length;
        const latest = vals[vals.length - 1];
        const earliest = vals[0];
        const changePct = earliest !== 0 ? ((latest - earliest) / Math.abs(earliest)) * 100 : 0;
        const volatility = m !== 0 ? (Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length) / Math.abs(m)) * 100 : 0;

        if (changePct < -10) {
          aiInsights.push({
            message: `In ${datasetName}, ${type.replace(/_/g, ' ')} declined ${Math.abs(changePct).toFixed(1)}% over the dataset period (${data.dates[0]} to ${data.dates[data.dates.length - 1]}). Review contributing factors.`,
            severity: "high",
            category: "trend",
            raw_confidence: 80,
          });
        } else if (changePct > 20) {
          aiInsights.push({
            message: `In ${datasetName}, ${type.replace(/_/g, ' ')} grew ${changePct.toFixed(1)}% (${data.dates[0]} to ${data.dates[data.dates.length - 1]}). Strong upward trajectory detected.`,
            severity: "info",
            category: "opportunity",
            raw_confidence: 78,
          });
        }
        if (volatility > 40) {
          aiInsights.push({
            message: `In ${datasetName}, ${type.replace(/_/g, ' ')} shows high volatility (${volatility.toFixed(1)}% CV) across ${vals.length} data points. Monitor for stability risks.`,
            severity: "medium",
            category: "risk",
            raw_confidence: 72,
          });
        }
      }

      if (aiInsights.length === 0) {
        aiInsights.push({
          message: `In ${datasetName}, all ${Object.keys(metricsByType).length} tracked metrics are within normal ranges. Continue monitoring for changes.`,
          severity: "info",
          category: "general",
          raw_confidence: 90,
        });
      }
    }

    // Apply confidence capping + human review flagging
    const insightRows = aiInsights.map((i: any) => {
      const rawConf = i.raw_confidence || 70;
      const sampleSize = metrics.length;
      const meta = applyAdaptiveConfidence({
        rawConfidence: rawConf, sampleSize, calibrationModel: calModel,
      });

      // Flag high-severity insights for human review before C-suite surfacing
      const requiresHumanReview = i.severity === "high" && meta.capped_confidence < 70;

      return {
        organization_id,
        dataset_id,
        decision_context_id: decision_context_id || null,
        message: requiresHumanReview
          ? `[REVIEW REQUIRED] ${i.message}`
          : i.message,
        severity: i.severity || "info",
        category: i.category || "general",
        confidence_score: meta.confidence,
        raw_confidence: meta.raw_confidence,
        capped_confidence: meta.capped_confidence,
        confidence_cap_reason: meta.confidence_cap_reason,
        sample_size: meta.sample_size,
        variance_score: meta.variance_score,
        data_quality_index: 100,
        generation_model: modelUsed || "rule_based_fallback",
      };
    });

    // ATOMIC: Insert new insights FIRST, then clean old ones (prevents data loss on insert failure)
    const { error: insertError } = await serviceSupabase.from("insights").insert(insightRows);
    if (insertError) throw insertError;

    // Only clean old insights AFTER successful insertion
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await serviceSupabase
      .from("insights")
      .delete()
      .eq("organization_id", organization_id)
      .eq("dataset_id", dataset_id)
      .lt("created_at", yesterday);

    return new Response(
      JSON.stringify({ message: "Insights generated", count: insightRows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    log.error("generate-insights failed", { error: err.message });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
