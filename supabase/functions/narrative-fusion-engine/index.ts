// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type AnyRec = Record<string, any>;

const STALE_HOURS = 72;
const DORMANT_HOURS = 168; // 7 days w/ no evidence delta -> dormant
const MAX_CLUSTERS_PER_ORG = 25;

// ============ utilities ============
function norm(s?: string | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}
function tokens(s?: string | null): Set<string> {
  return new Set(norm(s).split(" ").filter((w) => w.length > 3));
}
function clamp(n: number, min = 0, max = 100): number { return Math.max(min, Math.min(max, n)); }
function avg(arr: number[]): number { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}
function stdev(arr: number[]): number { return Math.sqrt(variance(arr)); }

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============ types ============
type SignalSource = "item" | "intervention" | "advisory" | "insight" | "advisory_instance";
interface InputSignal {
  source: SignalSource;
  source_table: string;
  id: string;
  title: string;
  text: string;
  domain?: string | null;
  geography?: string[];
  entities?: string[];
  severity?: string | null;
  pressure?: number;
  velocity?: number;
  ts: string;
}

function severityWeight(s?: string | null): number {
  switch ((s || "").toLowerCase()) {
    case "critical": return 95;
    case "high": return 75;
    case "elevated": return 55;
    case "medium": case "moderate": return 40;
    case "low": return 20;
    default: return 30;
  }
}

function clusterSignature(domains: string[], geos: string[], type: string): string {
  return [type, [...domains].sort().join("|"), [...geos].sort().join("|")].join("::");
}

// ============ Edit 1: Narrative Ontology (deterministic) ============
function classifyNarrativeClass(domains: string[], text: string): string {
  const blob = (domains.join(" ") + " " + text).toLowerCase();
  if (/supply|logistic|vendor|fulfillment|inventory/.test(blob)) return "supply_chain_disruption";
  if (/customer|churn|retention|concentration|pipeline/.test(blob)) return "customer_concentration";
  if (/execution|delivery|delay|missed|blocker/.test(blob)) return "execution_breakdown";
  if (/governance|policy|compliance|regulator|audit|risk/.test(blob)) return "governance_risk";
  if (/forecast|revenue|deteriorat|miss|variance/.test(blob)) return "forecast_deterioration";
  if (/cyber|breach|incident|outage/.test(blob)) return "operational_incident";
  if (/cost|margin|opex|spend/.test(blob)) return "financial_pressure";
  if (/strategy|market|competit/.test(blob)) return "strategic_shift";
  return "operational_signal";
}

function classifyScope(geos: string[], entities: string[], domains: string[]): string {
  const dimCount = domains.length;
  if (geos.length >= 3 || dimCount >= 3) return "enterprise_wide";
  if (geos.length === 1 && dimCount <= 2) return "localized";
  if (entities.length >= 5) return "multi_entity";
  return "departmental";
}

function classifySeverity(pressure: number, acceleration: number): string {
  if (pressure >= 80 || acceleration >= 8) return "critical";
  if (pressure >= 60 || acceleration >= 4) return "high";
  if (pressure >= 40) return "elevated";
  if (pressure >= 25) return "moderate";
  return "low";
}

function domainMix(domains: string[]): AnyRec {
  const counts: AnyRec = {};
  for (const d of domains) counts[d] = (counts[d] ?? 0) + 1;
  const total = domains.length || 1;
  for (const k of Object.keys(counts)) counts[k] = +(counts[k] / total).toFixed(3);
  return counts;
}

// ============ Edit 2: Stability / Volatility ============
function computeStability(history: { pressure_score: number; generated_at: string }[]): { stability: number; volatility: number } {
  if (history.length < 2) return { stability: 50, volatility: 0 };
  const pressures = history.map((h) => Number(h.pressure_score ?? 0));
  const sd = stdev(pressures);
  // volatility 0-100 based on stdev relative to scale
  const volatility = clamp(sd * 2);
  // stability is the inverse, but boosted by run length
  const runBoost = Math.min(20, history.length * 2);
  const stability = clamp(100 - volatility + runBoost - 10);
  return { stability, volatility };
}

// ============ Edit 6: Confidence Decomposition ============
function decomposeConfidence(input: {
  signalCount: number;
  domainConsistency: number; // 0-1
  sourceDiversity: number; // 0-1
  historicalReliability: number; // 0-1 from memory
  stability: number; // 0-100
}): AnyRec {
  const data_quality_confidence = clamp(40 + input.signalCount * 3);
  const evidence_volume_confidence = clamp(20 + Math.min(70, input.signalCount * 5));
  const cross_source_consistency = clamp(input.sourceDiversity * 100);
  const historical_reliability = clamp(input.historicalReliability * 100);
  const model_stability = clamp(input.stability);
  const composite = clamp(
    data_quality_confidence * 0.25 +
    evidence_volume_confidence * 0.25 +
    cross_source_consistency * 0.20 +
    historical_reliability * 0.15 +
    model_stability * 0.15,
  );
  return {
    data_quality_confidence: +data_quality_confidence.toFixed(1),
    evidence_volume_confidence: +evidence_volume_confidence.toFixed(1),
    cross_source_consistency: +cross_source_consistency.toFixed(1),
    historical_reliability: +historical_reliability.toFixed(1),
    model_stability: +model_stability.toFixed(1),
    composite: +composite.toFixed(1),
  };
}

// ============ Edit 7: Audit log helper ============
async function auditEvent(sb: any, ev: {
  organization_id: string;
  cluster_id?: string | null;
  cluster_signature?: string | null;
  event_type: string;
  prior_state?: AnyRec;
  new_state?: AnyRec;
  reason?: string;
}) {
  try {
    await sb.from("narrative_audit_log").insert({
      organization_id: ev.organization_id,
      cluster_id: ev.cluster_id ?? null,
      cluster_signature: ev.cluster_signature ?? null,
      event_type: ev.event_type,
      prior_state: ev.prior_state ?? {},
      new_state: ev.new_state ?? {},
      reason: ev.reason ?? null,
      actor: "system",
    });
  } catch (e) { console.error("audit log fail", e); }
}

async function suppressionEvent(sb: any, ev: {
  organization_id: string;
  cluster_signature?: string | null;
  candidate_snapshot: AnyRec;
  suppression_reason: string;
  suppression_details?: AnyRec;
}) {
  try {
    await sb.from("narrative_suppression_log").insert({
      organization_id: ev.organization_id,
      cluster_signature: ev.cluster_signature ?? null,
      candidate_snapshot: ev.candidate_snapshot,
      suppression_reason: ev.suppression_reason,
      suppression_details: ev.suppression_details ?? {},
    });
  } catch (e) { console.error("suppression log fail", e); }
}

// ============ gather inputs (extended: native Quantivis signals included) ============
async function gatherInputs(sb: any, orgId: string, lookbackHours = 60 * 24): Promise<{ signals: InputSignal[]; counts: Record<string, number> }> {
  const since = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
  const [items, intvs, advs, insightsRes, advInstRes] = await Promise.all([
    sb.from("aicis_intelligence_items").select("id,title,summary,domain,geography,entities,severity,global_criticality_score,ingested_at").eq("organization_id", orgId).gte("ingested_at", since).limit(500),
    sb.from("executive_interventions").select("id,title,summary,intervention_type,severity,decision_pressure_score,intervention_priority_score,created_at,status").eq("organization_id", orgId).neq("status", "resolved").gte("created_at", since).limit(300),
    sb.from("intelligence_advisories").select("id,title,summary,domain,severity,created_at").eq("organization_id", orgId).gte("created_at", since).limit(300),
    sb.from("insights").select("id,message,severity,category,confidence_score,created_at").eq("organization_id", orgId).gte("created_at", since).limit(800),
    sb.from("advisory_instances").select("id,title,category,priority,advisory_type,impact_score,confidence,status,created_at").eq("organization_id", orgId).gte("created_at", since).limit(500),
  ]);
  const counts = {
    aicis_intelligence_items: (items.data ?? []).length,
    executive_interventions: (intvs.data ?? []).length,
    intelligence_advisories: (advs.data ?? []).length,
    insights: (insightsRes.data ?? []).length,
    advisory_instances: (advInstRes.data ?? []).length,
  };
  const out: InputSignal[] = [];
  const seen = new Set<string>();
  const push = (s: InputSignal) => {
    const key = `${s.source_table}::${s.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  for (const r of (items.data ?? [])) {
    push({
      source: "item", source_table: "aicis_intelligence_items", id: r.id, title: r.title ?? "Intelligence item",
      text: `${r.title ?? ""} ${r.summary ?? ""}`,
      domain: r.domain, geography: r.geography ?? [],
      entities: (r.entities ?? []).map((e: any) => typeof e === "string" ? e : e?.name).filter(Boolean),
      severity: r.severity, pressure: Number(r.global_criticality_score ?? severityWeight(r.severity)),
      ts: r.ingested_at,
    });
  }
  for (const r of (intvs.data ?? [])) {
    push({
      source: "intervention", source_table: "executive_interventions", id: r.id, title: r.title,
      text: `${r.title} ${r.summary ?? ""}`,
      domain: r.intervention_type, geography: [], entities: [],
      severity: r.severity, pressure: Number(r.intervention_priority_score ?? r.decision_pressure_score ?? severityWeight(r.severity)),
      ts: r.created_at,
    });
  }
  for (const r of (advs.data ?? [])) {
    push({
      source: "advisory", source_table: "intelligence_advisories", id: r.id, title: r.title ?? "Advisory",
      text: `${r.title ?? ""} ${r.summary ?? ""}`,
      domain: r.domain, geography: [], entities: [],
      severity: r.severity, pressure: severityWeight(r.severity),
      ts: r.created_at,
    });
  }
  // Native Quantivis: insights
  for (const r of (insightsRes.data ?? [])) {
    const conf = Number(r.confidence_score ?? 60);
    push({
      source: "insight", source_table: "insights", id: r.id,
      title: (r.message ?? "Insight").slice(0, 120),
      text: `${r.message ?? ""}`,
      domain: r.category, geography: [], entities: [],
      severity: r.severity,
      pressure: clamp(severityWeight(r.severity) * (0.6 + 0.4 * (conf / 100))),
      ts: r.created_at,
    });
  }
  // Native Quantivis: advisory_instances
  for (const r of (advInstRes.data ?? [])) {
    if (["resolved", "dismissed"].includes((r.status || "").toLowerCase())) continue;
    const conf = Number(r.confidence ?? 60);
    const sw = severityWeight(r.priority);
    const impact = Number(r.impact_score ?? 0);
    push({
      source: "advisory_instance", source_table: "advisory_instances", id: r.id,
      title: r.title ?? "Advisory",
      text: `${r.title ?? ""} ${r.advisory_type ?? ""}`,
      domain: r.category, geography: [], entities: [],
      severity: r.priority,
      pressure: clamp(Math.max(sw, impact) * (0.55 + 0.45 * (conf / 100))),
      ts: r.created_at,
    });
  }
  console.log(`[narrative-fusion] org=${orgId} input_counts=${JSON.stringify(counts)} total=${out.length}`);
  return { signals: out, counts };
}

function clusterize(signals: InputSignal[]): InputSignal[][] {
  const groups: InputSignal[][] = [];
  const tokSets = signals.map((s) => tokens(s.text));
  const used = new Set<number>();
  for (let i = 0; i < signals.length; i++) {
    if (used.has(i)) continue;
    const g: number[] = [i];
    used.add(i);
    for (let j = i + 1; j < signals.length; j++) {
      if (used.has(j)) continue;
      const a = signals[i], b = signals[j];
      const domMatch = !!a.domain && a.domain === b.domain ? 1 : 0;
      const geoOverlap = jaccard(new Set(a.geography ?? []), new Set(b.geography ?? []));
      const entOverlap = jaccard(new Set(a.entities ?? []), new Set(b.entities ?? []));
      const txt = jaccard(tokSets[i], tokSets[j]);
      const dt = Math.abs(new Date(a.ts).getTime() - new Date(b.ts).getTime()) / (3600 * 1000);
      const temporal = dt < 48 ? 1 : dt < 168 ? 0.5 : 0;
      const score = txt * 0.5 + entOverlap * 0.2 + geoOverlap * 0.15 + domMatch * 0.1 + temporal * 0.05;
      if (score >= 0.35) { g.push(j); used.add(j); }
    }
    groups.push(g.map((k) => signals[k]));
  }
  return groups;
}

function buildNarrative(c: {
  title: string;
  domains: string[];
  geographies: string[];
  entities: string[];
  signals: InputSignal[];
  pressure: number;
  velocity: number;
  trend: string;
}): string {
  const parts: string[] = [];
  const dom = c.domains.slice(0, 3).join(", ") || "multiple domains";
  const geo = c.geographies.slice(0, 3).join(", ");
  const trendVerb = c.trend === "rising" ? "Escalating" : c.trend === "falling" ? "Easing" : "Sustained";
  parts.push(`${trendVerb} pressure in ${dom}${geo ? ` across ${geo}` : ""}.`);
  const itemCount = c.signals.filter((s) => s.source === "item").length;
  const intvCount = c.signals.filter((s) => s.source === "intervention").length;
  const advCount = c.signals.filter((s) => s.source === "advisory").length;
  const insCount = c.signals.filter((s) => s.source === "insight").length;
  const aiCount = c.signals.filter((s) => s.source === "advisory_instance").length;
  parts.push(`Fused from ${itemCount} intelligence items, ${intvCount} interventions, ${advCount} advisories, ${insCount} insights, ${aiCount} advisory instances.`);
  if (c.entities.length) parts.push(`Affecting ${c.entities.slice(0, 3).join(", ")}.`);
  parts.push(`Pressure: ${Math.round(c.pressure)} / Velocity: ${c.velocity.toFixed(1)}.`);
  return parts.join(" ");
}

function pressureBuckets(clusters: { domain?: string | null; pressure: number }[]): AnyRec {
  const buckets: Record<string, number[]> = {
    operational: [], strategic: [], geopolitical: [], cyber: [],
    supply_chain: [], regulatory: [], execution: [],
  };
  for (const c of clusters) {
    const d = (c.domain || "").toLowerCase();
    if (/cyber|security|breach/.test(d)) buckets.cyber.push(c.pressure);
    else if (/supply|logistic|vendor/.test(d)) buckets.supply_chain.push(c.pressure);
    else if (/regulat|compliance|legal|tax|policy/.test(d)) buckets.regulatory.push(c.pressure);
    else if (/geopol|sanction|war|tariff/.test(d)) buckets.geopolitical.push(c.pressure);
    else if (/execution|delivery|delay|operations/.test(d)) buckets.execution.push(c.pressure);
    else if (/strategy|market|competit|portfolio/.test(d)) buckets.strategic.push(c.pressure);
    else buckets.operational.push(c.pressure);
  }
  const out: AnyRec = {};
  for (const k of Object.keys(buckets)) out[`${k}_pressure`] = clamp(avg(buckets[k]));
  return out;
}

// ============ Edit 3: Conflict Detection ============
async function detectConflicts(sb: any, orgId: string, activeClusters: AnyRec[]) {
  // Pairwise comparison: same dimension/entity overlap but divergent trend/severity
  for (let i = 0; i < activeClusters.length; i++) {
    for (let j = i + 1; j < activeClusters.length; j++) {
      const a = activeClusters[i], b = activeClusters[j];
      const entOverlap = jaccard(new Set(a.affected_entities ?? []), new Set(b.affected_entities ?? []));
      const domOverlap = jaccard(new Set(a.affected_domains ?? []), new Set(b.affected_domains ?? []));
      if (entOverlap < 0.3 && domOverlap < 0.3) continue;
      const trendDivergent = (a.trend_direction === "rising" && b.trend_direction === "falling") ||
                             (a.trend_direction === "falling" && b.trend_direction === "rising");
      const severityGap = Math.abs(Number(a.pressure_score) - Number(b.pressure_score));
      if (!trendDivergent && severityGap < 30) continue;

      const severity = severityGap >= 50 ? "critical" : severityGap >= 30 ? "high" : "medium";
      const affectedDims = Array.from(new Set([...(a.affected_domains ?? []), ...(b.affected_domains ?? [])]));

      try {
        const { error } = await sb.from("narrative_conflicts").insert({
          organization_id: orgId,
          narrative_a_id: a.id,
          narrative_b_id: b.id,
          conflict_type: trendDivergent ? "trend_divergence" : "severity_divergence",
          severity,
          affected_dimensions: affectedDims,
          evidence_disagreement: {
            a_trend: a.trend_direction, b_trend: b.trend_direction,
            a_pressure: a.pressure_score, b_pressure: b.pressure_score,
            entity_overlap: +entOverlap.toFixed(2),
            domain_overlap: +domOverlap.toFixed(2),
          },
        });
        if (!error) {
          await auditEvent(sb, {
            organization_id: orgId,
            cluster_id: a.id,
            event_type: "conflict_detected",
            new_state: { conflict_with: b.id, severity, type: trendDivergent ? "trend_divergence" : "severity_divergence" },
          });
        }
      } catch (_) { /* unique index swallows duplicates */ }
    }
  }
}

// ============ Edit 5: Attention Budget Enforcement ============
async function enforceBudgets(sb: any, orgId: string, budget: AnyRec, today: string) {
  // Demote lowest-pressure active clusters above ops cap to dormant.
  const { data: actives } = await sb
    .from("intelligence_fusion_clusters")
    .select("id,pressure_score,narrative_scope,updated_at")
    .eq("organization_id", orgId).eq("status", "active")
    .order("pressure_score", { ascending: false });
  const all = (actives ?? []) as AnyRec[];
  const opsCap = Number(budget?.max_active_ops_narratives ?? 10);
  if (all.length > opsCap) {
    const toDemote = all.slice(opsCap);
    const ids = toDemote.map((c) => c.id);
    await sb.from("intelligence_fusion_clusters").update({ status: "dormant" }).in("id", ids);
    for (const c of toDemote) {
      await auditEvent(sb, {
        organization_id: orgId, cluster_id: c.id,
        event_type: "budget_capped",
        prior_state: { status: "active" }, new_state: { status: "dormant" },
        reason: `ops_budget_${opsCap}`,
      });
    }
  }
  // Cap daily new narratives
  const dayStart = new Date(today + "T00:00:00.000Z").toISOString();
  const { count: createdToday } = await sb
    .from("intelligence_fusion_clusters")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("first_seen_at", dayStart);
  return {
    ops_cap_enforced: all.length > opsCap,
    created_today: createdToday ?? 0,
    daily_cap: Number(budget?.max_daily_new_narratives ?? 3),
  };
}

// ============ Main per-org pipeline ============
async function fuseForOrg(sb: any, orgId: string): Promise<AnyRec> {
  const t0 = Date.now();
  const { signals, counts: input_counts } = await gatherInputs(sb, orgId);
  if (!signals.length) {
    return { organization_id: orgId, inputs_count: 0, input_counts, clusters_count: 0, message: "no signals" };
  }

  // Load budget config
  const { data: budgetRow } = await sb
    .from("attention_budget_config").select("*").eq("organization_id", orgId).maybeSingle();
  const budget = budgetRow ?? {
    max_active_exec_narratives: 5, max_active_ops_narratives: 10,
    max_daily_new_narratives: 3, min_confidence_to_publish: 40,
    min_pressure_to_publish: 30, fatigue_demotion_threshold: 3,
  };

  // Load memory for historical reliability
  const { data: memRows } = await sb
    .from("narrative_memory").select("cluster_signature,narrative_effectiveness_score,false_positive,led_to_decision")
    .eq("organization_id", orgId).limit(500);
  const memBySig = new Map<string, AnyRec[]>();
  for (const m of (memRows ?? [])) {
    if (!m.cluster_signature) continue;
    const arr = memBySig.get(m.cluster_signature) ?? [];
    arr.push(m);
    memBySig.set(m.cluster_signature, arr);
  }

  const groups = clusterize(signals);

  const { data: existing } = await sb
    .from("intelligence_fusion_clusters")
    .select("id,cluster_signature,supporting_item_ids,supporting_intervention_ids,supporting_advisory_ids,pressure_score,generated_at,version,first_seen_at,confidence_breakdown")
    .eq("organization_id", orgId).eq("status", "active");
  const existingBySig = new Map<string, AnyRec>();
  for (const e of (existing ?? [])) if (e.cluster_signature) existingBySig.set(e.cluster_signature, e);

  let duplicates = 0;
  let suppressed = 0;
  const newRows: AnyRec[] = [];
  const writtenSigs = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);

  for (const grp of groups) {
    if (grp.length < 2) continue;
    const domains = Array.from(new Set(grp.map((g) => g.domain).filter(Boolean))) as string[];
    const geographies = Array.from(new Set(grp.flatMap((g) => g.geography ?? [])));
    const entities = Array.from(new Set(grp.flatMap((g) => g.entities ?? []))).slice(0, 25);
    const type = domains[0] || "operational";

    const pressures = grp.map((g) => g.pressure ?? severityWeight(g.severity));
    const pressure = clamp(avg(pressures) + Math.min(20, grp.length * 1.5));
    const tsSorted = grp.map((g) => new Date(g.ts).getTime()).sort((a, b) => a - b);
    const span = (tsSorted[tsSorted.length - 1] - tsSorted[0]) / (3600 * 1000) || 1;
    const velocity = +(grp.length / Math.max(span / 24, 0.5)).toFixed(2);
    const trend = velocity > 1.5 ? "rising" : velocity < 0.4 ? "falling" : "stable";

    const blob = grp.map((g) => g.text).join(" ");
    const narrative_class = classifyNarrativeClass(domains, blob);
    const narrative_scope = classifyScope(geographies, entities, domains);
    const narrative_severity = classifySeverity(pressure, velocity);
    const narrative_domain_mix = domainMix(domains);

    const signature = clusterSignature(domains, geographies, type);
    if (writtenSigs.has(signature)) { duplicates++; continue; }
    writtenSigs.add(signature);

    const prior = existingBySig.get(signature);

    // ---- Stability/volatility from history ----
    let history: AnyRec[] = [];
    if (prior) {
      const { data: hist } = await sb
        .from("intelligence_fusion_clusters")
        .select("pressure_score,generated_at")
        .eq("organization_id", orgId).eq("cluster_signature", signature)
        .order("generated_at", { ascending: false }).limit(10);
      history = hist ?? [];
    }
    history = [...history, { pressure_score: pressure, generated_at: new Date().toISOString() }];
    const { stability, volatility } = computeStability(history);

    // ---- Historical reliability from memory ----
    const memArr = memBySig.get(signature) ?? [];
    const memEff = memArr.length ? avg(memArr.map((m) => Number(m.narrative_effectiveness_score ?? 0))) / 100 : 0.5;
    const fpRate = memArr.length ? memArr.filter((m) => m.false_positive).length / memArr.length : 0;
    const historicalReliability = clamp((memEff - fpRate) * 100, 0, 100) / 100;

    // ---- Confidence decomposition ----
    const sourceTypes = new Set(grp.map((g) => g.source));
    const sourceDiversity = sourceTypes.size / 3;
    const domainConsistency = domains.length === 1 ? 1 : 1 / domains.length;
    const confidence_breakdown = decomposeConfidence({
      signalCount: grp.length,
      domainConsistency,
      sourceDiversity,
      historicalReliability,
      stability,
    });
    const confidence = confidence_breakdown.composite;

    // ---- Budget thresholds (Edit 5) ----
    if (confidence < Number(budget.min_confidence_to_publish) || pressure < Number(budget.min_pressure_to_publish)) {
      suppressed++;
      await suppressionEvent(sb, {
        organization_id: orgId,
        cluster_signature: signature,
        candidate_snapshot: { pressure, confidence, narrative_class, signal_count: grp.length },
        suppression_reason: "below_confidence_threshold",
        suppression_details: {
          min_conf: budget.min_confidence_to_publish, min_pressure: budget.min_pressure_to_publish,
        },
      });
      continue;
    }

    const narrative = buildNarrative({
      title: `${type} pressure`, domains, geographies, entities, signals: grp, pressure, velocity, trend,
    });
    const title = `${type.charAt(0).toUpperCase() + type.slice(1)} pressure cluster${geographies.length ? ` — ${geographies[0]}` : ""}`;

    const supporting_item_ids = grp.filter((g) => g.source === "item").map((g) => g.id);
    const supporting_intervention_ids = grp.filter((g) => g.source === "intervention").map((g) => g.id);
    const supporting_advisory_ids = grp.filter((g) => g.source === "advisory").map((g) => g.id);

    const evidence_hash = await sha256(JSON.stringify({
      sig: signature, items: supporting_item_ids.sort(), intv: supporting_intervention_ids.sort(),
      adv: supporting_advisory_ids.sort(), p: Math.round(pressure), v: velocity,
    }));

    const row: AnyRec = {
      organization_id: orgId,
      cluster_type: type,
      title,
      canonical_summary: narrative.split(".").slice(0, 2).join(".") + ".",
      narrative,
      supporting_item_ids,
      supporting_intervention_ids,
      supporting_advisory_ids,
      affected_domains: domains,
      affected_geographies: geographies,
      affected_entities: entities,
      trend_direction: trend,
      escalation_velocity: velocity,
      narrative_strength: clamp(grp.length * 8 + pressure * 0.4),
      confidence_score: confidence,
      pressure_score: pressure,
      status: "active",
      cluster_signature: signature,
      generated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + STALE_HOURS * 3600 * 1000).toISOString(),
      // ---- Phase 5D enrichments ----
      narrative_class,
      narrative_scope,
      narrative_severity,
      narrative_domain_mix,
      stability_score: stability,
      volatility_score: volatility,
      confidence_breakdown,
      evidence_hash,
      llm_rendered: false,
    };

    if (prior) {
      duplicates++;
      const priorConf = prior.confidence_breakdown ?? {};
      const newVersion = (Number(prior.version) || 1) + 1;
      await sb.from("intelligence_fusion_clusters").update({
        ...row,
        version: newVersion,
        first_seen_at: prior.first_seen_at,
      }).eq("id", prior.id);
      await auditEvent(sb, {
        organization_id: orgId, cluster_id: prior.id, cluster_signature: signature,
        event_type: "version_bumped",
        prior_state: { version: prior.version, pressure: prior.pressure_score, confidence_breakdown: priorConf },
        new_state: { version: newVersion, pressure, confidence_breakdown },
        reason: "evidence_refresh",
      });
      const oldComp = Number(priorConf?.composite ?? 0);
      if (Math.abs(oldComp - confidence) >= 10) {
        await auditEvent(sb, {
          organization_id: orgId, cluster_id: prior.id, cluster_signature: signature,
          event_type: "confidence_changed",
          prior_state: { composite: oldComp }, new_state: { composite: confidence },
        });
      }
    } else {
      newRows.push(row);
    }
  }

  // Daily new-narrative cap (Edit 5)
  const dailyCap = Number(budget.max_daily_new_narratives ?? 3);
  const ranked = newRows.sort((a, b) => b.pressure_score - a.pressure_score);
  const accepted = ranked.slice(0, Math.min(dailyCap, MAX_CLUSTERS_PER_ORG));
  const overflow = ranked.slice(accepted.length);
  for (const o of overflow) {
    await suppressionEvent(sb, {
      organization_id: orgId,
      cluster_signature: o.cluster_signature,
      candidate_snapshot: { pressure: o.pressure_score, class: o.narrative_class },
      suppression_reason: "budget_exceeded",
      suppression_details: { daily_cap: dailyCap },
    });
  }
  if (accepted.length) {
    const { data: inserted } = await sb.from("intelligence_fusion_clusters").insert(accepted).select("id,cluster_signature,confidence_breakdown,pressure_score");
    for (const r of (inserted ?? [])) {
      await auditEvent(sb, {
        organization_id: orgId, cluster_id: r.id, cluster_signature: r.cluster_signature,
        event_type: "generated",
        new_state: { pressure: r.pressure_score, confidence_breakdown: r.confidence_breakdown },
      });
    }
  }

  // Expire stale, dormant ones with no evidence delta (Edit 4)
  const staleCutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000).toISOString();
  const dormantCutoff = new Date(Date.now() - DORMANT_HOURS * 3600 * 1000).toISOString();
  const { data: toExpire } = await sb
    .from("intelligence_fusion_clusters").select("id,cluster_signature")
    .eq("organization_id", orgId).eq("status", "active").lt("generated_at", staleCutoff);
  if ((toExpire ?? []).length) {
    await sb.from("intelligence_fusion_clusters").update({ status: "expired" })
      .in("id", (toExpire ?? []).map((r: AnyRec) => r.id));
    for (const r of (toExpire ?? [])) {
      await auditEvent(sb, {
        organization_id: orgId, cluster_id: r.id, cluster_signature: r.cluster_signature,
        event_type: "expired", reason: `stale_${STALE_HOURS}h`,
      });
    }
  }
  const { data: toDormant } = await sb
    .from("intelligence_fusion_clusters").select("id,cluster_signature")
    .eq("organization_id", orgId).eq("status", "active").lt("updated_at", dormantCutoff);
  if ((toDormant ?? []).length) {
    await sb.from("intelligence_fusion_clusters").update({ status: "dormant" })
      .in("id", (toDormant ?? []).map((r: AnyRec) => r.id));
    for (const r of (toDormant ?? [])) {
      await auditEvent(sb, {
        organization_id: orgId, cluster_id: r.id, cluster_signature: r.cluster_signature,
        event_type: "dormant", reason: `no_evidence_delta_${DORMANT_HOURS}h`,
      });
    }
  }

  // Enforce budgets
  const budgetResult = await enforceBudgets(sb, orgId, budget, today);

  // Pressure model snapshot
  const { data: activeClusters } = await sb
    .from("intelligence_fusion_clusters")
    .select("id,affected_domains,affected_entities,pressure_score,escalation_velocity,trend_direction")
    .eq("organization_id", orgId).eq("status", "active");
  const flat = (activeClusters ?? []).map((c: AnyRec) => ({
    domain: (c.affected_domains ?? [])[0] ?? null,
    pressure: Number(c.pressure_score ?? 0),
    velocity: Number(c.escalation_velocity ?? 0),
  }));
  const buckets = pressureBuckets(flat);
  const overall = clamp(avg(flat.map((c: AnyRec) => c.pressure)));
  const velocity = avg(flat.map((c: AnyRec) => c.velocity));
  const { data: prevSnap } = await sb
    .from("organizational_pressure_models")
    .select("pressure_score,pressure_velocity,snapshot_at")
    .eq("organization_id", orgId).order("snapshot_at", { ascending: false }).limit(1).maybeSingle();
  const prevVel = Number(prevSnap?.pressure_velocity ?? 0);
  const accel = +(velocity - prevVel).toFixed(2);
  const stabilization = clamp(100 - overall - Math.abs(accel) * 5);

  await sb.from("organizational_pressure_models").insert({
    organization_id: orgId,
    pressure_score: overall,
    pressure_velocity: velocity,
    pressure_acceleration: accel,
    stabilization_indicator: stabilization,
    breakdown: buckets,
    contributing_cluster_ids: (activeClusters ?? []).map((c: AnyRec) => c.id),
    ...buckets,
  });

  // Detect conflicts (Edit 3)
  await detectConflicts(sb, orgId, (activeClusters ?? []) as AnyRec[]);

  // Observability
  const latency = Date.now() - t0;
  const inputs = signals.length;
  const clustersCount = (activeClusters ?? []).length;
  const compression = inputs > 0 ? +(clustersCount / inputs).toFixed(3) : 0;
  const memArr2 = memRows ?? [];
  const conv = memArr2.length ? (memArr2.filter((m: AnyRec) => m.led_to_decision).length / memArr2.length) * 100 : 0;
  const ignored = memArr2.length ? (memArr2.filter((m: AnyRec) => (m as AnyRec).ignored).length / memArr2.length) * 100 : 0;
  const effective = memArr2.length ? (memArr2.filter((m: AnyRec) => (m as AnyRec).outcome_effective === true).length / memArr2.length) * 100 : 0;

  await sb.from("fusion_observability").upsert({
    organization_id: orgId,
    day: today,
    inputs_count: inputs,
    clusters_count: clustersCount,
    compression_ratio: compression,
    duplicates_suppressed: duplicates + suppressed,
    avg_generation_latency_ms: latency,
    narrative_to_decision_conversion_pct: +conv.toFixed(2),
    ignored_narrative_pct: +ignored.toFixed(2),
    narrative_resolution_effectiveness_pct: +effective.toFixed(2),
    metadata: { budget: budgetResult, accepted_new: accepted.length, suppressed_overflow: overflow.length },
  }, { onConflict: "organization_id,day" });

  return {
    organization_id: orgId,
    inputs_count: inputs,
    input_counts,
    clusters_count: clustersCount,
    new_narratives: accepted.length,
    suppressed: suppressed + overflow.length,
    duplicates_merged: duplicates,
    pressure_score: overall,
    latency_ms: latency,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    let orgIds: string[] = [];
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.organization_id) orgIds = [body.organization_id];
    }
    if (!orgIds.length) {
      const { data } = await sb.from("organizations").select("id").limit(500);
      orgIds = (data ?? []).map((o: AnyRec) => o.id);
    }
    const results: AnyRec[] = [];
    for (const id of orgIds) {
      try { results.push(await fuseForOrg(sb, id)); }
      catch (e) { results.push({ organization_id: id, error: String(e) }); }
    }
    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("narrative-fusion-engine error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
