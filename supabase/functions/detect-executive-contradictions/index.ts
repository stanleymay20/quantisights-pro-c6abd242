// @ts-nocheck
/**
 * Executive Contradiction Resolution Engine
 * ------------------------------------------------------------------
 * Detects real disagreements between business functions on the SAME
 * number, for the SAME period, in the SAME scope — using only data that
 * actually exists in the tenant's warehouse (metrics + forecast_results).
 *
 * Deterministic only. No LLM. No synthetic values. Confidence is capped
 * at 85 and is derived from measured data quality, sample size and
 * freshness — never invented.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

const MIN_SAMPLE_PER_SIDE = 3;
const MIN_GAP_PCT = 5;
const CONFIDENCE_CAP = 85;
const METRIC_ROW_LIMIT = 8000;

type Severity = "low" | "medium" | "high" | "critical";

const RATE_LIKE = /rate|margin|pct|percent|ratio|score|index|churn|accuracy|utilization|nps/i;

function categorize(subject: string, source: string): string {
  const t = `${subject} ${source}`.toLowerCase();
  if (/revenue|finance|cost|margin|price|invoice|cash|ebitda|opex|capex|budget/.test(t)) return "financial";
  if (/inventory|stock|warehouse|sku|quantity|units|fill_rate/.test(t)) return "inventory";
  if (/customer|churn|crm|account|pipeline|lead|deal/.test(t)) return "customer";
  if (/supplier|vendor|procure|purchase|sourcing/.test(t)) return "supplier";
  if (/headcount|attrition|employee|hr|hiring/.test(t)) return "workforce";
  if (/security|incident|vulnerability|cyber/.test(t)) return "cybersecurity";
  if (/compliance|policy|audit|regulat/.test(t)) return "compliance";
  return "operational";
}

function businessFunction(subject: string, source: string): string {
  const t = `${source} ${subject}`.toLowerCase();
  if (/finance|erp|sap|netsuite|gl_|ledger|invoice|revenue_actual|billing/.test(t)) return "Finance";
  if (/sales|crm|salesforce|hubspot|pipeline|bookings|quota/.test(t)) return "Sales";
  if (/ops|operation|production|plant|manufactur|capacity|throughput|oee/.test(t)) return "Operations";
  if (/supply|logistics|warehouse|inventory|procure|vendor/.test(t)) return "Supply Chain";
  if (/marketing|campaign|ga4|adwords|attribution/.test(t)) return "Marketing";
  if (/hr|people|workday|headcount|attrition/.test(t)) return "HR";
  if (/market|external|benchmark|aicis|index/.test(t)) return "External Market";
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
  if (freshnessGapDays >= 7) {
    return `Update lag: the two sources were last loaded ${Math.round(freshnessGapDays)} days apart, so one side is reporting a stale close.`;
  }
  if (category === "financial") return "Likely revenue-recognition or posting-cutoff difference between the operational system and the financial ledger.";
  if (category === "inventory") return "Likely inventory synchronisation lag or an unposted manual adjustment between systems.";
  if (category === "customer") return "Likely duplicate or differently-scoped customer entities between systems.";
  if (sameSourceType) return "Two loads of the same system type disagree — probable duplicate ingestion or an unreconciled correction.";
  return "Definitional mismatch: the two systems appear to compute this measure over different scopes or filters.";
}

function recommendationFor(severity: Severity, functionA: string, functionB: string, subject: string): string {
  if (severity === "critical") {
    return `Freeze decisions that depend on ${subject} until ${functionA} and ${functionB} agree on a single figure. Require both owners to submit their calculation basis.`;
  }
  if (severity === "high") {
    return `Escalate to a joint ${functionA}/${functionB} reconciliation before this figure is used in any board or approval material.`;
  }
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
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401, corsHeaders);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    ) as any;

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401, corsHeaders);

    const body = await req.json().catch(() => ({}));
    const organizationId = body?.organization_id;
    if (!organizationId || typeof organizationId !== "string") {
      return json({ error: "organization_id required" }, 400, corsHeaders);
    }

    const { data: membership } = await userClient
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!membership) return json({ error: "Forbidden" }, 403, corsHeaders);

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    ) as any;

    // ── Load real evidence ────────────────────────────────────────────
    const [{ data: metrics }, { data: datasets }, { data: forecasts }, { data: openDecisions }] = await Promise.all([
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

    const dsMap = new Map<string, any>();
    for (const d of datasets || []) dsMap.set(d.id, d);

    const rows = metrics || [];
    if (rows.length === 0) {
      return json({ status: "insufficient_data", detected: 0, message: "No metrics available for contradiction analysis." }, 200, corsHeaders);
    }

    // ── Group: metric_type | month | region ───────────────────────────
    interface Side {
      sourceKey: string;
      label: string;
      datasetId: string | null;
      sourceType: string | null;
      values: number[];
      quality: number[];
      trust: number[];
      lastIngest: number;
    }
    const groups = new Map<string, { subject: string; month: string; region: string; sides: Map<string, Side> }>();

    for (const r of rows) {
      if (r.value === null || r.value === undefined || !isFinite(Number(r.value))) continue;
      const month = String(r.date ?? "").slice(0, 7);
      if (!month) continue;
      const region = r.region || "All regions";
      const gKey = `${r.metric_type}||${month}||${region}`;
      let g = groups.get(gKey);
      if (!g) {
        g = { subject: r.metric_type, month, region, sides: new Map() };
        groups.set(gKey, g);
      }
      const ds = r.dataset_id ? dsMap.get(r.dataset_id) : null;
      const label = r.source_name || ds?.name || r.source_type || "Unlabelled source";
      const sourceKey = `${r.dataset_id ?? "no-dataset"}::${label}`;
      let side = g.sides.get(sourceKey);
      if (!side) {
        side = { sourceKey, label, datasetId: r.dataset_id ?? null, sourceType: r.source_type ?? null, values: [], quality: [], trust: [], lastIngest: 0 };
        g.sides.set(sourceKey, side);
      }
      side.values.push(Number(r.value));
      if (typeof r.quality_score === "number") side.quality.push(r.quality_score);
      if (typeof r.trust_level === "number") side.trust.push(r.trust_level);
      const ts = r.ingested_at ? Date.parse(r.ingested_at) : 0;
      if (ts > side.lastIngest) side.lastIngest = ts;
    }

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const detectedAt = new Date().toISOString();
    const candidates: any[] = [];

    for (const g of groups.values()) {
      const sides = [...g.sides.values()].filter((s) => s.values.length >= MIN_SAMPLE_PER_SIDE);
      if (sides.length < 2) continue;
      const useMean = RATE_LIKE.test(g.subject);
      const agg = (s: Side) => (useMean ? avg(s.values) : s.values.reduce((a, b) => a + b, 0));

      for (let i = 0; i < sides.length; i += 1) {
        for (let j = i + 1; j < sides.length; j += 1) {
          const a = sides[i], b = sides[j];
          const va = agg(a), vb = agg(b);
          const denom = Math.max(Math.abs(va), Math.abs(vb));
          if (denom === 0) continue;
          const gapPct = (Math.abs(va - vb) / denom) * 100;
          if (gapPct < MIN_GAP_PCT) continue;

          const category = categorize(g.subject, `${a.label} ${b.label}`);
          const severity = severityFor(category, gapPct);
          const fnA = businessFunction(g.subject, a.label);
          const fnB = businessFunction(g.subject, b.label);
          if (fnA === fnB && fnA === "Unattributed Source") continue;

          // Confidence: measured quality, sample size, freshness alignment. Capped.
          const qualityScore = avg([avg(a.quality) || 60, avg(b.quality) || 60]);
          const trustScore = avg([(avg(a.trust) || 3) * 20, (avg(b.trust) || 3) * 20]);
          const sampleScore = Math.min(100, (Math.min(a.values.length, b.values.length) / 10) * 100);
          const freshnessGapDays = a.lastIngest && b.lastIngest ? Math.abs(a.lastIngest - b.lastIngest) / 86400000 : 0;
          const freshnessScore = Math.max(0, 100 - freshnessGapDays * 5);
          const confidence = Math.min(
            CONFIDENCE_CAP,
            Math.round(qualityScore * 0.3 + trustScore * 0.2 + sampleScore * 0.25 + freshnessScore * 0.25),
          );

          const affectedTypes = affectedTypesFor(category);
          const subjectNeedle = String(g.subject).toLowerCase();
          const affectedIds = (openDecisions || [])
            .filter((d: any) =>
              affectedTypes.includes(String(d.decision_type || "")) ||
              String(d.source_insight_summary || "").toLowerCase().includes(subjectNeedle))
            .map((d: any) => d.id)
            .slice(0, 25);

          const ownerDs = dsMap.get(avg(a.trust) <= avg(b.trust) ? a.datasetId : b.datasetId);

          candidates.push({
            organization_id: organizationId,
            dataset_id: a.datasetId,
            contradiction_key: `metric-${hashKey(g.subject, g.month, g.region, a.sourceKey, b.sourceKey)}`,
            category,
            severity,
            confidence,
            subject: g.subject,
            scope: g.region,
            period_label: g.month,
            function_a: fnA,
            function_b: fnB,
            source_a: a.label,
            source_b: b.label,
            value_a: Number(va.toFixed(4)),
            value_b: Number(vb.toFixed(4)),
            gap_absolute: Number(Math.abs(va - vb).toFixed(4)),
            gap_pct: Number(gapPct.toFixed(2)),
            explanation: `${fnA} (${a.label}) reports ${va.toLocaleString()} for ${g.subject} in ${g.month} (${g.region}), while ${fnB} (${b.label}) reports ${vb.toLocaleString()} — a ${gapPct.toFixed(1)}% gap.`,
            root_cause: rootCause(category, freshnessGapDays, a.sourceType === b.sourceType),
            recommended_action: recommendationFor(severity, fnA, fnB, g.subject),
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
            lineage: { source_a_dataset: a.datasetId, source_b_dataset: b.datasetId, group: `${g.subject}|${g.month}|${g.region}` },
            owner_user_id: ownerDs?.steward_user_id ?? ownerDs?.owner_user_id ?? null,
            detected_at: detectedAt,
            last_seen_at: detectedAt,
          });
        }
      }
    }

    // ── Conflicting forecasts on the same measure ─────────────────────
    const byMetric = new Map<string, any[]>();
    for (const f of forecasts || []) {
      if (!f.metric_type) continue;
      const list = byMetric.get(f.metric_type) || [];
      list.push(f);
      byMetric.set(f.metric_type, list);
    }
    const finalValue = (f: any): number | null => {
      const p = Array.isArray(f.predictions) ? f.predictions : null;
      if (!p || p.length === 0) return null;
      const last = p[p.length - 1];
      const v = typeof last === "number" ? last : (last?.value ?? last?.predicted ?? last?.yhat);
      return typeof v === "number" && isFinite(v) ? v : null;
    };

    for (const [metricType, list] of byMetric.entries()) {
      const usable = list.filter((f) => finalValue(f) !== null).slice(0, 6);
      for (let i = 0; i < usable.length; i += 1) {
        for (let j = i + 1; j < usable.length; j += 1) {
          const a = usable[i], b = usable[j];
          if (a.model_used === b.model_used && a.dataset_id === b.dataset_id) continue;
          const va = finalValue(a)!, vb = finalValue(b)!;
          const denom = Math.max(Math.abs(va), Math.abs(vb));
          if (denom === 0) continue;
          const gapPct = (Math.abs(va - vb) / denom) * 100;
          if (gapPct < 10) continue;

          const category = categorize(metricType, "forecast");
          const severity = severityFor(category, gapPct);
          const labelA = `${a.model_used || "model"} · ${dsMap.get(a.dataset_id)?.name || "dataset"}`;
          const labelB = `${b.model_used || "model"} · ${dsMap.get(b.dataset_id)?.name || "dataset"}`;
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
            value_a: Number(va.toFixed(4)),
            value_b: Number(vb.toFixed(4)),
            gap_absolute: Number(Math.abs(va - vb).toFixed(4)),
            gap_pct: Number(gapPct.toFixed(2)),
            explanation: `Two active forecasts for ${metricType} end the horizon ${gapPct.toFixed(1)}% apart: ${labelA} projects ${va.toLocaleString()}, ${labelB} projects ${vb.toLocaleString()}.`,
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
      return json({ status: "ok", detected: 0, inserted: 0, refreshed: 0, message: "No contradictions detected in current evidence." }, 200, corsHeaders);
    }

    // Deduplicate by key within this run
    const unique = new Map<string, any>();
    for (const c of candidates) if (!unique.has(c.contradiction_key)) unique.set(c.contradiction_key, c);
    const list = [...unique.values()];

    const { data: existing } = await db
      .from("executive_contradictions")
      .select("id, contradiction_key, status")
      .eq("organization_id", organizationId)
      .in("contradiction_key", list.map((c) => c.contradiction_key));

    const existingMap = new Map((existing || []).map((e: any) => [e.contradiction_key, e]));
    const toInsert = list.filter((c) => !existingMap.has(c.contradiction_key));
    const toRefresh = list.filter((c) => existingMap.has(c.contradiction_key));

    let inserted = 0;
    if (toInsert.length) {
      const { error, count } = await db
        .from("executive_contradictions")
        .insert(toInsert, { count: "exact" });
      if (error) throw error;
      inserted = count ?? toInsert.length;
    }

    // Refresh live figures without touching human resolution state
    for (const c of toRefresh) {
      const row = existingMap.get(c.contradiction_key);
      await db.from("executive_contradictions")
        .update({
          value_a: c.value_a, value_b: c.value_b,
          gap_absolute: c.gap_absolute, gap_pct: c.gap_pct,
          severity: c.severity, confidence: c.confidence,
          explanation: c.explanation, evidence: c.evidence,
          affected_decision_ids: c.affected_decision_ids,
          last_seen_at: detectedAt,
        })
        .eq("id", row.id);
    }

    return json({
      status: "ok",
      detected: list.length,
      inserted,
      refreshed: toRefresh.length,
      groups_analyzed: groups.size,
    }, 200, corsHeaders);
  } catch (err) {
    console.error("[detect-executive-contradictions]", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500, corsHeaders);
  }
});
