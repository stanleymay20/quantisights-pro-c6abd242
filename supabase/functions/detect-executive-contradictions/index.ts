/**
 * Executive Contradiction Resolution Engine.
 * Deterministic only: no LLM and no synthetic values. A clean result is only
 * returned after every required evidence query succeeds.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

const MIN_SAMPLE_PER_SIDE = 3;
const MIN_GAP_PCT = 5;
const CONFIDENCE_CAP = 85;
const METRIC_ROW_LIMIT = 8000;

type Severity = "low" | "medium" | "high" | "critical";

type Side = {
  sourceKey: string;
  label: string;
  datasetId: string | null;
  sourceType: string | null;
  values: number[];
  quality: number[];
  trust: number[];
  lastIngest: number;
};

const RATE_LIKE = /rate|margin|pct|percent|ratio|score|index|churn|accuracy|utilization|nps/i;

function categorize(subject: string, source: string): string {
  const text = `${subject} ${source}`.toLowerCase();
  if (/revenue|finance|cost|margin|price|invoice|cash|ebitda|opex|capex|budget/.test(text)) return "financial";
  if (/inventory|stock|warehouse|sku|quantity|units|fill_rate/.test(text)) return "inventory";
  if (/customer|churn|crm|account|pipeline|lead|deal/.test(text)) return "customer";
  if (/supplier|vendor|procure|purchase|sourcing/.test(text)) return "supplier";
  if (/headcount|attrition|employee|hr|hiring/.test(text)) return "workforce";
  if (/security|incident|vulnerability|cyber/.test(text)) return "cybersecurity";
  if (/compliance|policy|audit|regulat/.test(text)) return "compliance";
  return "operational";
}

function businessFunction(subject: string, source: string): string {
  const text = `${source} ${subject}`.toLowerCase();
  if (/finance|erp|sap|netsuite|gl_|ledger|invoice|revenue_actual|billing/.test(text)) return "Finance";
  if (/sales|crm|salesforce|hubspot|pipeline|bookings|quota/.test(text)) return "Sales";
  if (/ops|operation|production|plant|manufactur|capacity|throughput|oee/.test(text)) return "Operations";
  if (/supply|logistics|warehouse|inventory|procure|vendor/.test(text)) return "Supply Chain";
  if (/marketing|campaign|ga4|adwords|attribution/.test(text)) return "Marketing";
  if (/hr|people|workday|headcount|attrition/.test(text)) return "HR";
  if (/market|external|benchmark|aicis|index/.test(text)) return "External Market";
  return "Unattributed Source";
}

function severityFor(category: string, gapPct: number): Severity {
  if (gapPct >= 25) return "critical";
  if (category === "financial" && gapPct >= 10) return "critical";
  if (gapPct >= 15) return "high";
  if (category === "compliance" || category === "cybersecurity") return "high";
  if (gapPct >= 8) return "medium";
  return "low";
}

function rootCause(category: string, freshnessGapDays: number, sameSourceType: boolean): string {
  if (freshnessGapDays >= 7) return `Update lag: the two sources were last loaded ${Math.round(freshnessGapDays)} days apart, so one side is reporting a stale close.`;
  if (category === "financial") return "Likely revenue-recognition or posting-cutoff difference between the operational system and the financial ledger.";
  if (category === "inventory") return "Likely inventory synchronisation lag or an unposted manual adjustment between systems.";
  if (category === "customer") return "Likely duplicate or differently-scoped customer entities between systems.";
  if (sameSourceType) return "Two loads of the same system type disagree — probable duplicate ingestion or an unreconciled correction.";
  return "Definitional mismatch: the two systems appear to compute this measure over different scopes or filters.";
}

function recommendationFor(severity: Severity, functionA: string, functionB: string, subject: string): string {
  if (severity === "critical") return `Freeze decisions that depend on ${subject} until ${functionA} and ${functionB} agree on a single figure. Require both owners to submit their calculation basis.`;
  if (severity === "high") return `Escalate to a joint ${functionA}/${functionB} reconciliation before this figure is used in any board or approval material.`;
  return `Log for the next data-governance review; annotate ${subject} with both values until reconciled.`;
}

function affectedTypesFor(category: string): string[] {
  switch (category) {
    case "financial": return ["financial_approval", "pricing", "forecasting", "board_reporting"];
    case "inventory": return ["replenishment", "production_planning"];
    case "supplier": return ["procurement", "supplier_switch"];
    case "customer": return ["customer_risk", "account_planning"];
    case "workforce": return ["workforce_planning"];
    case "compliance": return ["governance_review", "approval"];
    default: return ["operational_decision"];
  }
}

function hashKey(...parts: string[]): string {
  const input = parts.join("|");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Contradiction service unavailable" }, 503, corsHeaders);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401, corsHeaders);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    }) as any;
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.id) return json({ error: "Unauthorized" }, 401, corsHeaders);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const organizationId = typeof body.organization_id === "string" ? body.organization_id : null;
    if (!organizationId) return json({ error: "organization_id required" }, 400, corsHeaders);

    const { data: membership, error: membershipError } = await userClient
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (membershipError) throw new Error(`Failed to verify organization membership: ${membershipError.message}`);
    if (!membership) return json({ error: "Forbidden" }, 403, corsHeaders);

    const db = createClient(supabaseUrl, serviceKey) as any;
    const [metricsResult, datasetsResult, forecastsResult, decisionsResult] = await Promise.all([
      db.from("metrics")
        .select("metric_type, value, date, region, segment, source_name, source_type, dataset_id, quality_score, trust_level, ingested_at")
        .eq("organization_id", organizationId)
        .order("date", { ascending: false })
        .limit(METRIC_ROW_LIMIT),
      db.from("datasets")
        .select("id, name, owner_user_id, steward_user_id")
        .eq("organization_id", organizationId),
      db.from("forecast_results")
        .select("id, metric_type, model_used, predictions, mape, dataset_id, generated_at, trend_direction")
        .eq("organization_id", organizationId)
        .order("generated_at", { ascending: false })
        .limit(200),
      db.from("decision_ledger")
        .select("id, decision_type, source_insight_summary")
        .eq("organization_id", organizationId)
        .eq("execution_status", "not_started")
        .eq("is_suppressed", false)
        .limit(500),
    ]);

    for (const [name, result] of [
      ["metrics", metricsResult],
      ["datasets", datasetsResult],
      ["forecasts", forecastsResult],
      ["open decisions", decisionsResult],
    ] as const) {
      if (result.error) throw new Error(`Failed to load ${name} for contradiction analysis: ${result.error.message}`);
    }

    const metrics = metricsResult.data ?? [];
    const datasets = datasetsResult.data ?? [];
    const forecasts = forecastsResult.data ?? [];
    const openDecisions = decisionsResult.data ?? [];

    const datasetMap = new Map<string, any>();
    for (const dataset of datasets) datasetMap.set(dataset.id, dataset);

    if (metrics.length === 0) {
      return json({ status: "insufficient_data", detected: 0, message: "No metrics available for contradiction analysis." }, 200, corsHeaders);
    }

    const groups = new Map<string, { subject: string; month: string; region: string; sides: Map<string, Side> }>();
    for (const row of metrics) {
      if (row.value === null || row.value === undefined || !Number.isFinite(Number(row.value))) continue;
      const month = String(row.date ?? "").slice(0, 7);
      if (!month) continue;
      const region = row.region || "All regions";
      const groupKey = `${row.metric_type}||${month}||${region}`;
      let group = groups.get(groupKey);
      if (!group) {
        group = { subject: row.metric_type, month, region, sides: new Map() };
        groups.set(groupKey, group);
      }
      const dataset = row.dataset_id ? datasetMap.get(row.dataset_id) : null;
      const label = row.source_name || dataset?.name || row.source_type || "Unlabelled source";
      const sourceKey = `${row.dataset_id ?? "no-dataset"}::${label}`;
      let side = group.sides.get(sourceKey);
      if (!side) {
        side = { sourceKey, label, datasetId: row.dataset_id ?? null, sourceType: row.source_type ?? null, values: [], quality: [], trust: [], lastIngest: 0 };
        group.sides.set(sourceKey, side);
      }
      side.values.push(Number(row.value));
      if (typeof row.quality_score === "number") side.quality.push(row.quality_score);
      if (typeof row.trust_level === "number") side.trust.push(row.trust_level);
      const timestamp = row.ingested_at ? Date.parse(row.ingested_at) : 0;
      if (timestamp > side.lastIngest) side.lastIngest = timestamp;
    }

    const detectedAt = new Date().toISOString();
    const candidates: any[] = [];

    for (const group of groups.values()) {
      const sides = [...group.sides.values()].filter((side) => side.values.length >= MIN_SAMPLE_PER_SIDE);
      if (sides.length < 2) continue;
      const useMean = RATE_LIKE.test(group.subject);
      const aggregate = (side: Side) => useMean ? average(side.values) : side.values.reduce((sum, value) => sum + value, 0);

      for (let i = 0; i < sides.length; i++) {
        for (let j = i + 1; j < sides.length; j++) {
          const a = sides[i];
          const b = sides[j];
          const valueA = aggregate(a);
          const valueB = aggregate(b);
          const denominator = Math.max(Math.abs(valueA), Math.abs(valueB));
          if (denominator === 0) continue;
          const gapPct = (Math.abs(valueA - valueB) / denominator) * 100;
          if (gapPct < MIN_GAP_PCT) continue;

          const category = categorize(group.subject, `${a.label} ${b.label}`);
          const severity = severityFor(category, gapPct);
          const functionA = businessFunction(group.subject, a.label);
          const functionB = businessFunction(group.subject, b.label);
          if (functionA === functionB && functionA === "Unattributed Source") continue;

          const qualityScore = average([average(a.quality) || 60, average(b.quality) || 60]);
          const trustScore = average([(average(a.trust) || 3) * 20, (average(b.trust) || 3) * 20]);
          const sampleScore = Math.min(100, (Math.min(a.values.length, b.values.length) / 10) * 100);
          const freshnessGapDays = a.lastIngest && b.lastIngest ? Math.abs(a.lastIngest - b.lastIngest) / 86_400_000 : 0;
          const freshnessScore = Math.max(0, 100 - freshnessGapDays * 5);
          const confidence = Math.min(CONFIDENCE_CAP, Math.round(qualityScore * 0.3 + trustScore * 0.2 + sampleScore * 0.25 + freshnessScore * 0.25));

          const affectedTypes = affectedTypesFor(category);
          const subjectNeedle = String(group.subject).toLowerCase();
          const affectedIds = openDecisions
            .filter((decision: any) => affectedTypes.includes(String(decision.decision_type || "")) || String(decision.source_insight_summary || "").toLowerCase().includes(subjectNeedle))
            .map((decision: any) => decision.id)
            .slice(0, 25);
          const ownerDataset = datasetMap.get(average(a.trust) <= average(b.trust) ? a.datasetId : b.datasetId);

          candidates.push({
            organization_id: organizationId,
            dataset_id: a.datasetId,
            contradiction_key: `metric-${hashKey(group.subject, group.month, group.region, a.sourceKey, b.sourceKey)}`,
            category,
            severity,
            confidence,
            subject: group.subject,
            scope: group.region,
            period_label: group.month,
            function_a: functionA,
            function_b: functionB,
            source_a: a.label,
            source_b: b.label,
            value_a: Number(valueA.toFixed(4)),
            value_b: Number(valueB.toFixed(4)),
            gap_absolute: Number(Math.abs(valueA - valueB).toFixed(4)),
            gap_pct: Number(gapPct.toFixed(2)),
            explanation: `${functionA} (${a.label}) reports ${valueA.toLocaleString()} for ${group.subject} in ${group.month} (${group.region}), while ${functionB} (${b.label}) reports ${valueB.toLocaleString()} — a ${gapPct.toFixed(1)}% gap.`,
            root_cause: rootCause(category, freshnessGapDays, a.sourceType === b.sourceType),
            recommended_action: recommendationFor(severity, functionA, functionB, group.subject),
            blocks_decision: severity === "critical" || severity === "high",
            affected_decision_types: affectedTypes,
            affected_decision_ids: affectedIds,
            evidence: {
              method: useMean ? "period_mean" : "period_sum",
              sample_a: a.values.length,
              sample_b: b.values.length,
              quality_score: Math.round(qualityScore),
              freshness_gap_days: Number(freshnessGapDays.toFixed(1)),
              confidence_basis: "Measured data quality, trust level, sample size and load-freshness alignment. Capped at 85.",
            },
            lineage: { source_a_dataset: a.datasetId, source_b_dataset: b.datasetId, group: `${group.subject}|${group.month}|${group.region}` },
            owner_user_id: ownerDataset?.steward_user_id ?? ownerDataset?.owner_user_id ?? null,
            detected_at: detectedAt,
            last_seen_at: detectedAt,
          });
        }
      }
    }

    const forecastsByMetric = new Map<string, any[]>();
    for (const forecast of forecasts) {
      if (!forecast.metric_type) continue;
      const list = forecastsByMetric.get(forecast.metric_type) ?? [];
      list.push(forecast);
      forecastsByMetric.set(forecast.metric_type, list);
    }
    const finalValue = (forecast: any): number | null => {
      const predictions = Array.isArray(forecast.predictions) ? forecast.predictions : null;
      if (!predictions?.length) return null;
      const last = predictions[predictions.length - 1];
      const value = typeof last === "number" ? last : last?.value ?? last?.predicted ?? last?.yhat;
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    };

    for (const [metricType, forecastList] of forecastsByMetric) {
      const usable = forecastList.filter((forecast) => finalValue(forecast) !== null).slice(0, 6);
      for (let i = 0; i < usable.length; i++) {
        for (let j = i + 1; j < usable.length; j++) {
          const a = usable[i];
          const b = usable[j];
          if (a.model_used === b.model_used && a.dataset_id === b.dataset_id) continue;
          const valueA = finalValue(a)!;
          const valueB = finalValue(b)!;
          const denominator = Math.max(Math.abs(valueA), Math.abs(valueB));
          if (denominator === 0) continue;
          const gapPct = (Math.abs(valueA - valueB) / denominator) * 100;
          if (gapPct < 10) continue;

          const category = categorize(metricType, "forecast");
          const severity = severityFor(category, gapPct);
          const labelA = `${a.model_used || "model"} · ${datasetMap.get(a.dataset_id)?.name || "dataset"}`;
          const labelB = `${b.model_used || "model"} · ${datasetMap.get(b.dataset_id)?.name || "dataset"}`;
          const mapePenalty = Math.max(Number(a.mape ?? 0), Number(b.mape ?? 0));
          const confidence = Math.min(CONFIDENCE_CAP, Math.max(20, Math.round(80 - mapePenalty)));

          candidates.push({
            organization_id: organizationId,
            dataset_id: a.dataset_id ?? null,
            contradiction_key: `forecast-${hashKey(metricType, a.id, b.id)}`,
            category,
            severity,
            confidence,
            subject: `${metricType} forecast`,
            scope: "Forecast horizon",
            period_label: String(a.generated_at || "").slice(0, 10),
            function_a: "Planning",
            function_b: "Planning",
            source_a: labelA,
            source_b: labelB,
            value_a: Number(valueA.toFixed(4)),
            value_b: Number(valueB.toFixed(4)),
            gap_absolute: Number(Math.abs(valueA - valueB).toFixed(4)),
            gap_pct: Number(gapPct.toFixed(2)),
            explanation: `Two active forecasts for ${metricType} end the horizon ${gapPct.toFixed(1)}% apart: ${labelA} projects ${valueA.toLocaleString()}, ${labelB} projects ${valueB.toLocaleString()}.`,
            root_cause: "Divergent forecast baselines — the two runs used different input datasets or model assumptions.",
            recommended_action: `Designate one forecast of record for ${metricType} before it is used in planning or board material; retire or annotate the other.`,
            blocks_decision: severity === "critical",
            affected_decision_types: ["forecasting", "board_reporting"],
            affected_decision_ids: [],
            evidence: {
              method: "forecast_endpoint_comparison",
              mape_a: a.mape ?? null,
              mape_b: b.mape ?? null,
              confidence_basis: "Derived from the worse of the two model MAPE values. Capped at 85.",
            },
            lineage: { forecast_a: a.id, forecast_b: b.id },
            owner_user_id: null,
            detected_at: detectedAt,
            last_seen_at: detectedAt,
          });
        }
      }
    }

    if (candidates.length === 0) {
      return json({ status: "ok", detected: 0, inserted: 0, refreshed: 0, message: "No contradictions detected in verified current evidence." }, 200, corsHeaders);
    }

    const unique = new Map<string, any>();
    for (const candidate of candidates) if (!unique.has(candidate.contradiction_key)) unique.set(candidate.contradiction_key, candidate);
    const list = [...unique.values()];

    const { data: existing, error: existingError } = await db
      .from("executive_contradictions")
      .select("id, contradiction_key, status")
      .eq("organization_id", organizationId)
      .in("contradiction_key", list.map((candidate) => candidate.contradiction_key));
    if (existingError) throw new Error(`Failed to load existing contradictions: ${existingError.message}`);

    const existingMap = new Map<string, { id: string; contradiction_key: string; status: string | null }>(
      (existing ?? []).map((row: { id: string; contradiction_key: string; status: string | null }) => [row.contradiction_key, row] as const),
    );
    const toInsert = list.filter((candidate) => !existingMap.has(candidate.contradiction_key));
    const toRefresh = list.filter((candidate) => existingMap.has(candidate.contradiction_key));

    let inserted = 0;
    if (toInsert.length) {
      const { data: insertedRows, error: insertError } = await db
        .from("executive_contradictions")
        .insert(toInsert)
        .select("id");
      if (insertError) throw new Error(`Failed to persist contradictions: ${insertError.message}`);
      inserted = insertedRows?.length ?? 0;
      if (inserted !== toInsert.length) throw new Error(`Contradiction insert count mismatch: expected ${toInsert.length}, persisted ${inserted}`);
    }

    let refreshed = 0;
    for (const candidate of toRefresh) {
      const row = existingMap.get(candidate.contradiction_key);
      if (!row?.id) throw new Error(`Existing contradiction missing id for ${candidate.contradiction_key}`);
      const { error: refreshError } = await db.from("executive_contradictions")
        .update({
          value_a: candidate.value_a,
          value_b: candidate.value_b,
          gap_absolute: candidate.gap_absolute,
          gap_pct: candidate.gap_pct,
          severity: candidate.severity,
          confidence: candidate.confidence,
          explanation: candidate.explanation,
          evidence: candidate.evidence,
          affected_decision_ids: candidate.affected_decision_ids,
          last_seen_at: detectedAt,
        })
        .eq("id", row.id);
      if (refreshError) throw new Error(`Failed to refresh contradiction ${candidate.contradiction_key}: ${refreshError.message}`);
      refreshed++;
    }

    return json({ status: "ok", detected: list.length, inserted, refreshed, groups_analyzed: groups.size }, 200, corsHeaders);
  } catch (error) {
    console.error("[detect-executive-contradictions]", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500, corsHeaders);
  }
});