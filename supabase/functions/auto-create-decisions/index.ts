// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { getGovernanceProfile } from "../_shared/governance-profile.ts";
import { recordGovernanceUse } from "../_shared/governance-audit.ts";

type SourceKind = "advisory" | "insight";

interface DecisionSource {
  kind: SourceKind;
  id: string;
  title: string;
  action: string;
  category: string | null;
  priority: string;
  confidence: number | null;
  raw_confidence: number | null;
  capped_confidence: number | null;
  confidence_cap_reason: string | null;
  expected_impact: string | number | null;
  rationale: string | null;
  dataset_id: string | null;
  sample_size?: number | null;
  variance_score?: number | null;
  data_quality_index?: number | null;
  created_at?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, corsHeaders);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    ) as any;

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401, corsHeaders);

    const body = await req.json().catch(() => ({}));
    const { organization_id, dataset_id } = body;
    if (!organization_id) return json({ error: "organization_id required" }, 400, corsHeaders);

    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", organization_id)
      .single();

    if (!membership) return json({ error: "Forbidden" }, 403, corsHeaders);

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    ) as any;

    const advisories = await fetchOpenAdvisories(serviceSupabase, organization_id, dataset_id);
    const insights = await fetchDecisionGradeInsights(serviceSupabase, organization_id, dataset_id);

    const advisorySources = advisories.map(normalizeAdvisory);
    const insightSources = insights.map(normalizeInsight);
    // GA-1: supplier-risk-shaped sources are claimed by the dedicated
    // `supplier-risk-runtime-ingest` function, which runs them through the
    // RTS-1 / Agent Gateway / Runtime pipeline instead of this generic
    // direct-insert path. Every other category is unaffected.
    // Phase 5 stopgap: hide low-signal recommendations. Medium/low-priority
    // sources with a quantified impact below €1,000 are suppressed to avoid
    // "€30 critical decision" clutter in the ledger. Critical/high always pass,
    // and rows with no numeric impact estimate are still shown so we don't
    // silently drop qualitative insights.
    const LOW_IMPACT_FLOOR_EUR = 1000;
    const isMateriallyRelevant = (source: DecisionSource) => {
      if (source.priority === "critical" || source.priority === "high") return true;
      const impact = parseImpactEstimate(source.expected_impact);
      if (impact === null) return true;
      return Math.abs(impact) >= LOW_IMPACT_FLOOR_EUR;
    };
    const allSources = [...advisorySources, ...insightSources]
      .filter((source) => !isSupplierRiskSource(source))
      .filter(isMateriallyRelevant);

    if (allSources.length === 0) {
      return json({ message: "No advisories or decision-grade insights to convert", created: 0, advisory_created: 0, insight_created: 0 }, 200, corsHeaders);
    }

    const existing = await fetchExistingDecisionSources(serviceSupabase, organization_id);
    const newSources = allSources.filter((source) => !hasExistingDecision(existing, source));

    if (newSources.length === 0) {
      return json({ message: "All advisories and decision-grade insights already have decisions", created: 0, advisory_created: 0, insight_created: 0 }, 200, corsHeaders);
    }

    const datasetMap = await fetchDatasetMap(serviceSupabase, newSources);
    const decisionRows = newSources.map((source) => buildDecisionRow(source, organization_id, datasetMap));

    const { data: createdDecisions, error: insertError } = await serviceSupabase
      .from("decision_ledger")
      .insert(decisionRows)
      .select("id, advisory_instance_id, decision_origin, source_insight_summary, capped_confidence, predicted_net_impact");

    if (insertError) throw new Error(`Failed to create decisions: ${insertError.message}`);

    await markConvertedAdvisories(serviceSupabase, newSources);
    await createDecisionNotifications(serviceSupabase, organization_id, createdDecisions ?? [], newSources);

    // Phase 9: record governance audit trail for each auto-created decision
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const profile = await getGovernanceProfile(supabaseUrl, serviceKey, organization_id);
      const thresholds = {
        advisory_threshold: profile.advisory_threshold,
        escalation_threshold: profile.escalation_threshold,
        intervention_threshold: profile.intervention_threshold,
        low_impact_floor_eur: LOW_IMPACT_FLOOR_EUR,
      };
      const approvalRules = { governance_model: profile.governance_model };
      await Promise.all((createdDecisions ?? []).map((d: any, idx: number) => {
        const src = newSources[idx];
        return recordGovernanceUse(supabaseUrl, serviceKey, {
          organization_id,
          subject_type: "decision",
          subject_id: d.id,
          profile,
          thresholds_applied: thresholds,
          approval_rules_applied: approvalRules,
          decision_path: {
            source_kind: src?.kind,
            source_id: src?.id,
            priority: src?.priority,
            capped_confidence: d.capped_confidence,
            predicted_net_impact: d.predicted_net_impact,
            gate: "auto_create_decisions",
          },
          engine_version: "auto-create-decisions-v3",
        });
      }));
    } catch (auditErr) {
      console.warn("governance audit write failed:", (auditErr as Error).message);
    }

    const advisoryCreated = newSources.filter((s) => s.kind === "advisory").length;
    const insightCreated = newSources.filter((s) => s.kind === "insight").length;

    await serviceSupabase.from("audit_log").insert({
      organization_id,
      actor_id: user.id,
      actor_type: "system",
      action_type: "auto_decisions_created",
      resource_type: "decision_ledger",
      payload: {
        count: createdDecisions?.length ?? 0,
        advisory_created: advisoryCreated,
        insight_created: insightCreated,
        dataset_id: dataset_id ?? null,
        source: "auto_create_decisions_unified_v3",
      },
    });

    return json({
      created: createdDecisions?.length ?? 0,
      advisory_created: advisoryCreated,
      insight_created: insightCreated,
      decisions: createdDecisions ?? [],
    }, 200, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("auto-create-decisions error:", message);
    return json({ error: message }, 500, getCorsHeaders(req));
  }
});

async function fetchOpenAdvisories(client: any, organizationId: string, datasetId?: string | null) {
  let query = client
    .from("advisory_instances")
    .select("id, title, action, category, priority, confidence, capped_confidence, raw_confidence, confidence_cap_reason, expected_impact, rationale, kpi_affected, dataset_id, advisory_type, source_evidence, data_quality_index, data_snapshot_date, variance_score, created_at")
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .in("priority", ["critical", "high", "medium"])
    .order("created_at", { ascending: false })
    .limit(25);

  if (datasetId) query = query.eq("dataset_id", datasetId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch advisories: ${error.message}`);
  return data ?? [];
}

async function fetchDecisionGradeInsights(client: any, organizationId: string, datasetId?: string | null) {
  let query = client
    .from("insights")
    .select("id, message, severity, category, confidence_score, raw_confidence, capped_confidence, confidence_cap_reason, sample_size, variance_score, data_quality_index, dataset_id, created_at")
    .eq("organization_id", organizationId)
    .in("severity", ["critical", "high"])
    .order("created_at", { ascending: false })
    .limit(25);

  if (datasetId) query = query.eq("dataset_id", datasetId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch decision-grade insights: ${error.message}`);
  return data ?? [];
}

async function fetchExistingDecisionSources(client: any, organizationId: string) {
  const { data, error } = await client
    .from("decision_ledger")
    .select("advisory_instance_id, explanation_metadata, source_insight_summary")
    .eq("organization_id", organizationId)
    .limit(1000);

  if (error) throw new Error(`Failed to fetch existing decisions: ${error.message}`);
  return data ?? [];
}

function hasExistingDecision(existing: any[], source: DecisionSource) {
  if (source.kind === "advisory") {
    return existing.some((row) => row.advisory_instance_id === source.id);
  }

  return existing.some((row) => {
    const meta = row.explanation_metadata ?? {};
    return meta?.source?.kind === "insight" && meta?.source?.id === source.id;
  });
}

async function fetchDatasetMap(client: any, sources: DecisionSource[]) {
  const datasetIds = [...new Set(sources.map((s) => s.dataset_id).filter(Boolean))];
  if (datasetIds.length === 0) return {};

  const { data } = await client
    .from("datasets")
    .select("id, name, row_count")
    .in("id", datasetIds);

  return Object.fromEntries((data ?? []).map((d: any) => [d.id, { name: d.name, row_count: d.row_count }]));
}

function normalizeAdvisory(a: any): DecisionSource {
  return {
    kind: "advisory",
    id: a.id,
    title: a.title ?? "Advisory requires decision",
    action: a.action ?? a.rationale ?? "Review advisory and choose an executive response.",
    category: a.category ?? a.kpi_affected ?? null,
    priority: normalizePriority(a.priority),
    confidence: toNumber(a.capped_confidence ?? a.confidence),
    raw_confidence: toNumber(a.raw_confidence ?? a.confidence),
    capped_confidence: toNumber(a.capped_confidence),
    confidence_cap_reason: a.confidence_cap_reason ?? null,
    expected_impact: a.expected_impact ?? null,
    rationale: a.rationale ?? null,
    dataset_id: a.dataset_id ?? null,
    variance_score: toNumber(a.variance_score),
    data_quality_index: toNumber(a.data_quality_index),
    created_at: a.created_at ?? null,
  };
}

function normalizeInsight(i: any): DecisionSource {
  const title = titleFromInsight(i);
  return {
    kind: "insight",
    id: i.id,
    title,
    action: recommendationFromInsight(i),
    category: i.category ?? null,
    priority: normalizePriority(i.severity),
    confidence: toNumber(i.capped_confidence ?? i.confidence_score),
    raw_confidence: toNumber(i.raw_confidence ?? i.confidence_score),
    capped_confidence: toNumber(i.capped_confidence),
    confidence_cap_reason: i.confidence_cap_reason ?? null,
    expected_impact: estimateInsightImpact(i),
    rationale: i.message ?? null,
    dataset_id: i.dataset_id ?? null,
    sample_size: toNumber(i.sample_size),
    variance_score: toNumber(i.variance_score),
    data_quality_index: toNumber(i.data_quality_index),
    created_at: i.created_at ?? null,
  };
}

function buildDecisionRow(source: DecisionSource, organizationId: string, datasetMap: Record<string, any>) {
  const dsInfo = source.dataset_id ? datasetMap[source.dataset_id] : null;
  const expectedImpact = parseImpactEstimate(source.expected_impact);
  const recencyDays = source.created_at
    ? Math.max(0, Math.floor((Date.now() - new Date(source.created_at).getTime()) / 86400000))
    : 0;

  return {
    organization_id: organizationId,
    advisory_instance_id: source.kind === "advisory" ? source.id : null,
    decision_type: source.category ?? "strategic",
    recommended_action: `${source.title}: ${source.action}`,
    decision_status: "pending",
    execution_status: "not_started",
    raw_confidence: source.raw_confidence,
    capped_confidence: source.capped_confidence,
    confidence_at_decision: source.capped_confidence ?? source.confidence,
    confidence_cap_reason: source.confidence_cap_reason,
    predicted_net_impact: expectedImpact,
    notes: source.rationale,
    decision_origin: source.kind === "advisory" ? "ai_generated" : "insight_generated",
    source_insight_summary: source.title,
    recommendation_logic_type: source.kind === "advisory" ? "advisory_conversion" : "insight_severity_bridge",
    // Every decision this pipeline creates already has real supporting
    // evidence (the source advisory/insight, backed by dsInfo/source_data
    // below) — this must never be an empty array. An empty evidence_sources
    // array makes trust-adapter.ts's evidenceStatus() report "missing"
    // (it short-circuits before ever looking at explanation_metadata.source_data),
    // which permanently disables the executive Approve action with no UI
    // path to recover, since evidence is populated at creation time, not
    // edited by a human.
    evidence_sources: [{
      source_type: source.kind === "advisory" ? "advisory" : "insight",
      source_name: dsInfo?.name ?? (source.kind === "advisory" ? "Advisory engine" : "Insight engine"),
      source_id: source.id,
      contribution_weight: 1.0,
      confidence: source.capped_confidence ?? source.confidence ?? source.raw_confidence ?? 60,
      recency_days: recencyDays,
    }],
    explanation_metadata: {
      source: {
        kind: source.kind,
        id: source.id,
        created_at: source.created_at,
      },
      source_data: {
        dataset_name: dsInfo?.name ?? "Unknown dataset",
        dataset_id: source.dataset_id,
        rows_analyzed: dsInfo?.row_count ?? source.sample_size ?? null,
        key_metrics: source.category ? [source.category] : [],
      },
      triggering_insight: {
        description: source.rationale ?? source.title,
        metric_name: source.category,
        severity: source.priority,
        variance_score: source.variance_score ?? null,
      },
      reasoning: {
        what_happened: source.title,
        why_it_matters: buildWhyItMatters(source),
        why_this_recommendation: source.action,
      },
      expected_impact: {
        range: source.expected_impact,
        parsed_value: expectedImpact,
        basis: source.kind === "insight" ? "Severity and metric-driven estimate from raw insight" : "Advisory expected impact / rule output",
      },
      confidence_explanation: {
        score: source.capped_confidence ?? source.confidence,
        capped: source.raw_confidence != null && source.capped_confidence != null && source.raw_confidence !== source.capped_confidence,
        cap_reason: source.confidence_cap_reason,
      },
      evidence_classification: source.kind === "insight" ? "OBSERVED_SIGNAL_TO_DECISION" : "ADVISORY_TO_DECISION",
      limitations: [
        source.kind === "insight"
          ? "Created directly from a high-severity insight because no advisory decision existed yet. Requires executive review before execution."
          : "Created from an advisory instance. Requires executive review before execution.",
      ],
    },
  };
}

async function markConvertedAdvisories(client: any, sources: DecisionSource[]) {
  const advisoryIds = sources.filter((s) => s.kind === "advisory").map((s) => s.id);
  if (advisoryIds.length === 0) return;

  await client
    .from("advisory_instances")
    .update({ status: "in_progress" })
    .in("id", advisoryIds)
    .eq("status", "open");
}

async function createDecisionNotifications(client: any, organizationId: string, decisions: any[], sources: DecisionSource[]) {
  if (!decisions.length) return;

  const sourceByIndex = sources;
  const rows = decisions.map((decision, index) => {
    const source = sourceByIndex[index];
    return {
      organization_id: organizationId,
      event_type: "decision_created",
      entity_type: "decision_ledger",
      entity_id: decision.id,
      severity: source?.priority ?? "high",
      title: "New executive decision required",
      message: source?.title ?? "A new decision requires review.",
      metadata: {
        source_kind: source?.kind,
        source_id: source?.id,
        decision_id: decision.id,
      },
    };
  });

  // Notification/event tables vary between environments. Try best-effort writes only.
  try {
    await client.from("notification_events").insert(rows);
  } catch (_) {
    try {
      await client.from("auth_events").insert(rows.map((r) => ({
        organization_id: r.organization_id,
        event_type: r.event_type,
        metadata: r.metadata,
      })));
    } catch (_) {
      // Ignore: decision creation is the system of record.
    }
  }
}

function titleFromInsight(i: any) {
  if (i.category) return `${humanize(i.category)} requires executive decision`;
  if (i.message) return String(i.message).slice(0, 96);
  return "Critical insight requires executive decision";
}

function recommendationFromInsight(i: any) {
  const category = String(i.category ?? "").toLowerCase();
  const message = String(i.message ?? "").toLowerCase();

  if (category.includes("inventory")) return "Review replenishment, slow-moving stock, and supplier timing before the next procurement cycle.";
  if (category.includes("marketing")) return "Review campaign-level ROI and enforce spend controls before approving additional marketing budget.";
  if (category.includes("margin") || message.includes("margin")) return "Run a product-line margin review and protect the highest-gross-profit channels.";
  if (category.includes("revenue") || message.includes("revenue")) return "Review revenue drivers against cost movement and prioritize profitable growth actions.";
  if (category.includes("cost") || message.includes("cost")) return "Run a cost-driver review and negotiate priority supplier or operating-cost actions.";
  if (category.includes("cash") || category.includes("receivable") || category.includes("payable")) return "Review working-capital timing and align purchasing, collections, and supplier payments.";

  return "Assign an owner to investigate root cause, confirm expected impact, and approve or reject the recommended response.";
}

function estimateInsightImpact(i: any) {
  const category = String(i.category ?? "").toLowerCase();
  const severity = String(i.severity ?? "").toLowerCase();
  const variance = Math.abs(Number(i.variance_score ?? 0));
  const severityBase = severity === "critical" ? 50000 : 25000;
  const varianceLift = Number.isFinite(variance) ? Math.min(75000, variance * 1000) : 0;

  if (category.includes("revenue")) return severityBase + 35000 + varianceLift;
  if (category.includes("margin")) return severityBase + 25000 + varianceLift;
  if (category.includes("inventory")) return severityBase + 15000 + varianceLift;
  if (category.includes("marketing")) return severityBase + 12000 + varianceLift;
  if (category.includes("cost")) return severityBase + 18000 + varianceLift;
  return severityBase + varianceLift;
}

function buildWhyItMatters(source: DecisionSource) {
  const impact = parseImpactEstimate(source.expected_impact);
  const impactPhrase = impact ? `Estimated financial exposure is about €${Math.round(impact).toLocaleString("en-GB")}.` : "The issue may affect operating performance if ignored.";
  return `${source.priority.toUpperCase()} ${source.kind} signal. ${impactPhrase} Executive review is required to move from intelligence to action.`;
}

/**
 * GA-1: matches the classifier in `supplier-risk-runtime-ingest/index.ts`.
 * Sources matching this are claimed by the runtime pipeline function and
 * must not be double-processed here.
 */
function isSupplierRiskSource(source: Pick<DecisionSource, "category" | "title" | "rationale">): boolean {
  const text = `${source.category ?? ""} ${source.title} ${source.rationale ?? ""}`.toLowerCase();
  return /supplier|vendor|delivery/.test(text);
}

function normalizePriority(value: unknown) {
  const v = String(value ?? "medium").toLowerCase();
  if (v === "critical") return "critical";
  if (v === "high") return "high";
  if (v === "low") return "low";
  return "medium";
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseImpactEstimate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const text = String(value);
  const matches = text.match(/-?\d+(?:[,.]\d+)?/g);
  if (!matches?.length) return null;
  const nums = matches.map((m) => Number(m.replace(/,/g, ""))).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function json(payload: unknown, status: number, corsHeaders: HeadersInit) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
