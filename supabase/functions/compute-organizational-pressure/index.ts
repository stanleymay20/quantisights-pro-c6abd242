// compute-organizational-pressure
// Deterministic organizational pressure snapshot derived from real Quantivis tables.
// No LLM, no synthetic data, no fabricated edges. If no inputs exist, returns zero-input status.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type AnyRec = Record<string, any>;
type Dim =
  | "operational_pressure"
  | "strategic_pressure"
  | "supply_chain_pressure"
  | "regulatory_pressure"
  | "execution_pressure"
  | "cyber_pressure"
  | "geopolitical_pressure";

const ALL_DIMS: Dim[] = [
  "operational_pressure",
  "strategic_pressure",
  "supply_chain_pressure",
  "regulatory_pressure",
  "execution_pressure",
  "cyber_pressure",
  "geopolitical_pressure",
];

const HALF_LIFE_HOURS = 14 * 24;     // recency decay (slower so older demo signals still register)
const LOOKBACK_HOURS = 60 * 24;      // 60 days
const ACCEL_LOOKBACK_HOURS = 24;     // pressure_acceleration window

function clamp(n: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }
function avg(xs: number[]) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function sum(xs: number[]) { return xs.reduce((a, b) => a + b, 0); }
function recencyWeight(tsIso: string | null | undefined, nowMs: number): number {
  if (!tsIso) return 0.3;
  const ageH = Math.max(0, (nowMs - new Date(tsIso).getTime()) / 3600_000);
  return Math.pow(0.5, ageH / HALF_LIFE_HOURS);
}
function severityWeight(s?: string | null): number {
  switch ((s || "").toLowerCase()) {
    case "critical": case "immediate": return 95;
    case "high": case "urgent": return 78;
    case "elevated": return 60;
    case "medium": case "moderate": case "normal": return 45;
    case "low": return 22;
    default: return 35;
  }
}

// Deterministic domain → dimension mapping. Unknown domains contribute to operational only.
function classifyDimensions(text: string, domain?: string | null): Dim[] {
  const blob = `${domain ?? ""} ${text ?? ""}`.toLowerCase();
  const dims = new Set<Dim>();
  if (/cyber|breach|ransomware|intrusion|malware|csirt|vuln/.test(blob)) dims.add("cyber_pressure");
  if (/supply|logistic|vendor|fulfillment|inventory|procure|shipment/.test(blob)) dims.add("supply_chain_pressure");
  if (/regulat|compliance|legal|gdpr|dsgvo|policy|audit|sanction|tax/.test(blob)) dims.add("regulatory_pressure");
  if (/geopol|tariff|war|election|embargo/.test(blob)) dims.add("geopolitical_pressure");
  if (/execution|delivery|delay|missed|blocker|sla|backlog|incident|outage/.test(blob)) dims.add("execution_pressure");
  if (/strategy|market|competit|portfolio|forecast|revenue|growth|churn/.test(blob)) dims.add("strategic_pressure");
  if (!dims.size) dims.add("operational_pressure");
  return [...dims];
}

interface Contribution {
  source_table: string;
  source_id: string;
  weight: number;        // 0..1 recency
  intensity: number;     // 0..100 severity-like
  dims: Dim[];
  ts: string | null;
}

function pushContrib(
  buf: Contribution[],
  source_table: string,
  source_id: string,
  intensity: number,
  ts: string | null,
  text: string,
  domain?: string | null,
  nowMs: number = Date.now(),
) {
  const w = recencyWeight(ts, nowMs);
  if (w <= 0) return;
  buf.push({
    source_table, source_id,
    weight: w,
    intensity: clamp(intensity),
    dims: classifyDimensions(text, domain),
    ts,
  });
}

async function gatherForOrg(sb: any, orgId: string) {
  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString();
  const inputs_by_source: Record<string, number> = {};
  const contribs: Contribution[] = [];
  const now = Date.now();

  // decision_ledger: pending/in-progress decisions with low confidence increase pressure
  const dl = await sb.from("decision_ledger")
    .select("id,decision_type,decision_status,execution_status,recommended_action,chosen_action,confidence_at_decision,decided_at,created_at")
    .eq("organization_id", orgId).gte("created_at", sinceIso).limit(500);
  for (const r of (dl.data ?? [])) {
    const status = (r.decision_status || "").toLowerCase();
    const exec = (r.execution_status || "").toLowerCase();
    if (["resolved", "completed", "rejected", "withdrawn"].includes(status)) continue;
    const conf = Number(r.confidence_at_decision ?? 50);
    const overdue = exec === "in_progress" || exec === "blocked" ? 15 : 0;
    const intensity = clamp(60 - conf * 0.4 + overdue + (status === "pending" ? 20 : 0));
    const text = `${r.decision_type ?? ""} ${r.recommended_action ?? ""} ${r.chosen_action ?? ""}`;
    pushContrib(contribs, "decision_ledger", r.id, intensity, r.decided_at ?? r.created_at, text, r.decision_type, now);
  }
  inputs_by_source.decision_ledger = (dl.data ?? []).length;

  // insights: severity drives pressure; confidence_score modulates
  const ins = await sb.from("insights")
    .select("id,message,severity,category,confidence_score,created_at")
    .eq("organization_id", orgId).gte("created_at", sinceIso).limit(800);
  if (ins.error) console.error("[pressure] insights query error:", ins.error);
  console.log(`[pressure] insights since=${sinceIso} returned=${(ins.data ?? []).length}`);
  for (const r of (ins.data ?? [])) {
    const sw = severityWeight(r.severity);
    const confMod = Number(r.confidence_score ?? 60) / 100;
    const intensity = clamp(sw * (0.6 + 0.4 * confMod));
    pushContrib(contribs, "insights", r.id, intensity, r.created_at, `${r.message ?? ""}`, r.category, now);
  }
  inputs_by_source.insights = (ins.data ?? []).length;

  // advisory_instances
  const adv = await sb.from("advisory_instances")
    .select("id,title,category,priority,advisory_type,impact_score,confidence,status,created_at")
    .eq("organization_id", orgId).gte("created_at", sinceIso).limit(500);
  for (const r of (adv.data ?? [])) {
    const status = (r.status || "").toLowerCase();
    if (["resolved", "dismissed"].includes(status)) continue;
    const sw = severityWeight(r.priority);
    const impact = Number(r.impact_score ?? 0);
    const conf = Number(r.confidence ?? 60) / 100;
    const intensity = clamp(Math.max(sw, impact) * (0.55 + 0.45 * conf));
    const text = `${r.title ?? ""} ${r.advisory_type ?? ""}`;
    pushContrib(contribs, "advisory_instances", r.id, intensity, r.created_at, text, r.category, now);
  }
  inputs_by_source.advisory_instances = (adv.data ?? []).length;

  // executive_interventions: open + sla-overdue
  const inv = await sb.from("executive_interventions")
    .select("id,title,summary,intervention_type,severity,decision_pressure_score,intervention_priority_score,status,sla_due_at,created_at")
    .eq("organization_id", orgId).gte("created_at", sinceIso).limit(500);
  for (const r of (inv.data ?? [])) {
    if ((r.status || "").toLowerCase() === "resolved") continue;
    const sw = severityWeight(r.severity);
    const base = Number(r.intervention_priority_score ?? r.decision_pressure_score ?? sw);
    const overdue = r.sla_due_at && new Date(r.sla_due_at).getTime() < Date.now() ? 20 : 0;
    const text = `${r.title ?? ""} ${r.summary ?? ""}`;
    pushContrib(contribs, "executive_interventions", r.id, clamp(base + overdue), r.created_at, text, r.intervention_type, now);
  }
  inputs_by_source.executive_interventions = (inv.data ?? []).length;

  // connector_dq_scores: low confidence/freshness adds operational pressure
  const dq = await sb.from("connector_dq_scores")
    .select("id,stream_key,confidence_score,freshness_score,anomaly_score,computed_at")
    .eq("organization_id", orgId).gte("computed_at", sinceIso).limit(500);
  for (const r of (dq.data ?? [])) {
    const conf = Number(r.confidence_score ?? 1);
    const fresh = Number(r.freshness_score ?? 1);
    const anom = Number(r.anomaly_score ?? 0);
    // Low scores -> high pressure. Scores are 0..1.
    const intensity = clamp((1 - Math.min(conf, fresh)) * 70 + anom * 30);
    if (intensity < 10) continue;
    pushContrib(contribs, "connector_dq_scores", r.id, intensity, r.computed_at, `${r.stream_key ?? ""} data quality`, "operational", Date.now());
  }
  inputs_by_source.connector_dq_scores = (dq.data ?? []).length;

  // narrative_conflicts: unresolved conflicts add strategic + execution pressure
  const nc = await sb.from("narrative_conflicts")
    .select("id,severity,conflict_type,affected_dimensions,resolution_status,detected_at")
    .eq("organization_id", orgId).gte("detected_at", sinceIso).limit(200);
  for (const r of (nc.data ?? [])) {
    if ((r.resolution_status || "").toLowerCase() === "resolved") continue;
    const intensity = severityWeight(r.severity);
    const text = `conflict ${r.conflict_type ?? ""} ${(r.affected_dimensions ?? []).join(" ")}`;
    pushContrib(contribs, "narrative_conflicts", r.id, intensity, r.detected_at, text, "strategic", Date.now());
  }
  inputs_by_source.narrative_conflicts = (nc.data ?? []).length;

  // aicis_intelligence_items: external signals
  const ai = await sb.from("aicis_intelligence_items")
    .select("id,title,summary,domain,severity,global_criticality_score,ingested_at")
    .eq("organization_id", orgId).gte("ingested_at", sinceIso).limit(500);
  for (const r of (ai.data ?? [])) {
    const intensity = clamp(Number(r.global_criticality_score ?? severityWeight(r.severity)));
    pushContrib(contribs, "aicis_intelligence_items", r.id, intensity, r.ingested_at, `${r.title ?? ""} ${r.summary ?? ""}`, r.domain, Date.now());
  }
  inputs_by_source.aicis_intelligence_items = (ai.data ?? []).length;

  return { contribs, inputs_by_source };
}

function aggregate(contribs: Contribution[]): { dims: Record<Dim, number>; overall: number; refs: AnyRec[] } {
  const dimAcc: Record<string, { wSum: number; weight: number }> = {};
  for (const d of ALL_DIMS) dimAcc[d] = { wSum: 0, weight: 0 };
  for (const c of contribs) {
    const perDim = c.intensity * c.weight;
    for (const d of c.dims) {
      dimAcc[d].wSum += perDim;
      dimAcc[d].weight += c.weight;
    }
  }
  const dims: Record<string, number> = {};
  for (const d of ALL_DIMS) {
    dims[d] = clamp(dimAcc[d].weight > 0 ? dimAcc[d].wSum / dimAcc[d].weight : 0);
  }
  // Overall = weighted avg of contributing dim scores (skip dims with zero weight)
  const active = ALL_DIMS.filter((d) => dimAcc[d].weight > 0);
  const overall = active.length ? clamp(avg(active.map((d) => dims[d]))) : 0;
  const refs = contribs.map((c) => ({
    source_table: c.source_table, source_id: c.source_id,
    weight: +c.weight.toFixed(3), intensity: +c.intensity.toFixed(1), dims: c.dims, ts: c.ts,
  }));
  return { dims: dims as Record<Dim, number>, overall, refs };
}

async function snapshotForOrg(sb: any, orgId: string) {
  const t0 = Date.now();
  const { contribs, inputs_by_source } = await gatherForOrg(sb, orgId);
  const inputs_total = sum(Object.values(inputs_by_source));

  if (!contribs.length) {
    return {
      organization_id: orgId,
      status: "zero_input",
      inputs_total,
      inputs_by_source,
      contributions: 0,
      reason: "No real signals in lookback window; pressure not invented.",
      latency_ms: Date.now() - t0,
    };
  }

  const { dims, overall, refs } = aggregate(contribs);

  // Velocity: recent (last 24h) contribution rate vs lookback rate (deterministic).
  const nowMs = Date.now();
  const recent = contribs.filter((c) => c.ts && nowMs - new Date(c.ts!).getTime() <= 24 * 3600_000);
  const recentLoad = sum(recent.map((c) => c.intensity * c.weight));
  const overallLoad = sum(contribs.map((c) => c.intensity * c.weight));
  const expected24 = overallLoad * (24 / LOOKBACK_HOURS);
  const velocity = clamp((expected24 > 0 ? (recentLoad / Math.max(expected24, 1)) - 1 : 0) * 50 + 50);

  // Acceleration: compare to previous snapshot's velocity
  const { data: prevSnap } = await sb.from("organizational_pressure_models")
    .select("pressure_velocity,pressure_score,snapshot_at")
    .eq("organization_id", orgId).order("snapshot_at", { ascending: false }).limit(1).maybeSingle();
  const prevVel = Number(prevSnap?.pressure_velocity ?? velocity);
  const accel = +(velocity - prevVel).toFixed(2);
  const stabilization = clamp(100 - overall - Math.abs(accel) * 2);

  // Contributing cluster IDs (for foreign-key style traceability) — pulled from contributing narrative clusters if any
  const { data: clusters } = await sb.from("intelligence_fusion_clusters")
    .select("id").eq("organization_id", orgId).eq("status", "active").limit(200);
  const contributing_cluster_ids = (clusters ?? []).map((c: AnyRec) => c.id);

  const breakdown = {
    dimensions: dims,
    inputs_by_source,
    inputs_total,
    contributions: contribs.length,
    recent_24h_contributions: recent.length,
    recent_load: +recentLoad.toFixed(2),
    overall_load: +overallLoad.toFixed(2),
    half_life_hours: HALF_LIFE_HOURS,
    lookback_hours: LOOKBACK_HOURS,
    signal_refs: refs.slice(0, 200),
    prior_velocity: prevVel,
  };

  const insertRow: AnyRec = {
    organization_id: orgId,
    pressure_score: +overall.toFixed(2),
    pressure_velocity: +velocity.toFixed(2),
    pressure_acceleration: accel,
    stabilization_indicator: +stabilization.toFixed(2),
    operational_pressure: +dims.operational_pressure.toFixed(2),
    strategic_pressure: +dims.strategic_pressure.toFixed(2),
    geopolitical_pressure: +dims.geopolitical_pressure.toFixed(2),
    cyber_pressure: +dims.cyber_pressure.toFixed(2),
    supply_chain_pressure: +dims.supply_chain_pressure.toFixed(2),
    regulatory_pressure: +dims.regulatory_pressure.toFixed(2),
    execution_pressure: +dims.execution_pressure.toFixed(2),
    breakdown,
    contributing_cluster_ids,
  };
  const { error: insErr } = await sb.from("organizational_pressure_models").insert(insertRow);
  if (insErr) throw insErr;

  return {
    organization_id: orgId,
    status: "ok",
    inputs_total,
    inputs_by_source,
    contributions: contribs.length,
    pressure_score: insertRow.pressure_score,
    pressure_velocity: insertRow.pressure_velocity,
    pressure_acceleration: insertRow.pressure_acceleration,
    stabilization_indicator: insertRow.stabilization_indicator,
    dimensions: dims,
    latency_ms: Date.now() - t0,
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const requestedOrgId: string | undefined = body?.organization_id;

    // Auth: cron secret can run all-tenant sweep; user JWT must scope to their own org.
    const guard = await requireCronOrOrgMember(req, requestedOrgId);
    if (!guard.ok) return guard.response;

    let orgIds: string[] = [];
    if (requestedOrgId) {
      orgIds = [requestedOrgId];
    } else {
      // Only cron callers may fan out across all organizations.
      if (guard.via !== "cron") {
        return new Response(JSON.stringify({ error: "organization_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data } = await sb.from("organizations").select("id").limit(500);
      orgIds = (data ?? []).map((o: AnyRec) => o.id);
    }
    const results: AnyRec[] = [];
    for (const id of orgIds) {
      try { results.push(await snapshotForOrg(sb, id)); }
      catch (e) { results.push({ organization_id: id, error: String(e) }); }
    }
    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
