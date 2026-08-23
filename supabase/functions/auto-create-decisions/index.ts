import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { getGovernanceProfile } from "../_shared/governance-profile.ts";
import { recordGovernanceUse } from "../_shared/governance-audit.ts";

type SourceKind = "advisory" | "insight";
type ServiceClient = ReturnType<typeof createClient<any>>;

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

const LOW_IMPACT_FLOOR_EUR = 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Decision creation service unavailable" }, 503, corsHeaders);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401, corsHeaders);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.id) return json({ error: "Unauthorized" }, 401, corsHeaders);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const organizationId = typeof body.organization_id === "string" ? body.organization_id : null;
    const datasetId = typeof body.dataset_id === "string" ? body.dataset_id : null;
    if (!organizationId) return json({ error: "organization_id required" }, 400, corsHeaders);

    const { data: membership, error: membershipError } = await userClient
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (membershipError) throw new Error(`Failed to verify organization membership: ${membershipError.message}`);
    if (!membership) return json({ error: "Forbidden" }, 403, corsHeaders);

    const service = createClient(supabaseUrl, serviceKey);
    if (datasetId) {
      const { data: dataset, error: datasetError } = await service
        .from("datasets")
        .select("id")
        .eq("id", datasetId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (datasetError) throw new Error(`Failed to verify dataset: ${datasetError.message}`);
      if (!dataset) return json({ error: "dataset_id does not belong to this organization" }, 403, corsHeaders);
    }

    // Resolve governance before creating decisions so we never create a batch
    // that cannot even be attributed to the active governance profile.
    const governanceProfile = await getGovernanceProfile(supabaseUrl, serviceKey, organizationId);
    const governanceThresholds = {
      advisory_threshold: governanceProfile.advisory_threshold,
      escalation_threshold: governanceProfile.escalation_threshold,
      intervention_threshold: governanceProfile.intervention_threshold,
      low_impact_floor_eur: LOW_IMPACT_FLOOR_EUR,
    };
    const approvalRules = { governance_model: governanceProfile.governance_model };

    const advisories = await fetchOpenAdvisories(service, organizationId, datasetId);
    const insights = await fetchDecisionGradeInsights(service, organizationId, datasetId);
    const allSources = [
      ...advisories.map(normalizeAdvisory),
      ...insights.map(normalizeInsight),
    ].filter((source) => !isSupplierRiskSource(source)).filter(isMateriallyRelevant);

    if (allSources.length === 0) {
      return json({ status: "completed", message: "No advisories or decision-grade insights to convert", created: 0, advisory_created: 0, insight_created: 0 }, 200, corsHeaders);
    }

    const existing = await fetchExistingDecisionSources(service, organizationId);
    const candidateSources = allSources.filter((source) => !hasExistingDecision(existing, source));
    if (candidateSources.length === 0) {
      return json({ status: "completed", message: "All advisories and decision-grade insights already have decisions", created: 0, advisory_created: 0, insight_created: 0 }, 200, corsHeaders);
    }

    const datasetMap = await fetchDatasetMap(service, organizationId, candidateSources);
    const createdDecisions: Array<Record<string, unknown>> = [];
    const createdSources: DecisionSource[] = [];
    let concurrentSkips = 0;

    // Insert per source. The DB unique key on organization_id +
    // source_idempotency_key is the race-safe authority; the pre-read above is
    // only an optimization.
    for (const source of candidateSources) {
      const row = buildDecisionRow(source, organizationId, datasetMap);
      const { data, error } = await service
        .from("decision_ledger")
        .insert(row)
        .select("id, advisory_instance_id, decision_origin, source_insight_summary, capped_confidence, predicted_net_impact")
        .single();
      if (error) {
        if (error.code === "23505") {
          concurrentSkips++;
          continue;
        }
        throw new Error(`Failed to create decision for ${source.kind}:${source.id}: ${error.message}`);
      }
      if (!data?.id) throw new Error(`Decision insert returned no id for ${source.kind}:${source.id}`);
      createdDecisions.push(data as Record<string, unknown>);
      createdSources.push(source);
    }

    if (createdDecisions.length === 0) {
      return json({
        status: "completed",
        message: "Concurrent or prior run already created all candidate decisions",
        created: 0,
        skipped_existing: concurrentSkips,
        advisory_created: 0,
        insight_created: 0,
      }, 200, corsHeaders);
    }

    await markConvertedAdvisories(service, organizationId, createdSources);
    const warnings = await createDecisionNotifications(service, organizationId, createdDecisions, createdSources);

    for (let index = 0; index < createdDecisions.length; index++) {
      const decision = createdDecisions[index];
      const source = createdSources[index];
      try {
        await recordGovernanceUse(supabaseUrl, serviceKey, {
          organization_id: organizationId,
          subject_type: "decision",
          subject_id: String(decision.id),
          profile: governanceProfile,
          thresholds_applied: governanceThresholds,
          approval_rules_applied: approvalRules,
          decision_path: {
            source_kind: source.kind,
            source_id: source.id,
            priority: source.priority,
            capped_confidence: decision.capped_confidence,
            predicted_net_impact: decision.predicted_net_impact,
            gate: "auto_create_decisions",
          },
          engine_version: "auto-create-decisions-v4",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Governance audit missing for decision ${decision.id}: ${message}`);
        const { error: pendingAuditError } = await service.from("audit_log").insert({
          organization_id: organizationId,
          actor_id: user.id,
          actor_type: "system",
          action_type: "governance_audit_write_failed",
          resource_type: "decision_ledger",
          resource_id: decision.id,
          payload: { source_kind: source.kind, source_id: source.id, error: message },
        });
        if (pendingAuditError) warnings.push(`Failed to record governance-audit gap for ${decision.id}: ${pendingAuditError.message}`);
      }
    }

    const advisoryCreated = createdSources.filter((source) => source.kind === "advisory").length;
    const insightCreated = createdSources.filter((source) => source.kind === "insight").length;
    const { error: auditError } = await service.from("audit_log").insert({
      organization_id: organizationId,
      actor_id: user.id,
      actor_type: "system",
      action_type: "auto_decisions_created",
      resource_type: "decision_ledger",
      payload: {
        count: createdDecisions.length,
        advisory_created: advisoryCreated,
        insight_created: insightCreated,
        dataset_id: datasetId,
        skipped_concurrent: concurrentSkips,
        warnings,
        source: "auto_create_decisions_unified_v4",
      },
    });
    if (auditError) warnings.push(`Decision batch audit failed: ${auditError.message}`);

    return json({
      status: warnings.length ? "partial" : "completed",
      created: createdDecisions.length,
      skipped_existing: concurrentSkips,
      advisory_created: advisoryCreated,
      insight_created: insightCreated,
      warnings,
      decisions: createdDecisions,
    }, 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("auto-create-decisions error:", message);
    return json({ error: message }, 500, getCorsHeaders(req));
  }
});

function isMateriallyRelevant(source: DecisionSource): boolean {
  if (source.priority === "critical" || source.priority === "high") return true;
  const impact = parseImpactEstimate(source.expected_impact);
  return impact === null || Math.abs(impact) >= LOW_IMPACT_FLOOR_EUR;
}

async function fetchOpenAdvisories(client: ServiceClient, organizationId: string, datasetId?: string | null) {
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

async function fetchDecisionGradeInsights(client: ServiceClient, organizationId: string, datasetId?: string | null) {
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

async function fetchExistingDecisionSources(client: ServiceClient, organizationId: string) {
  const { data, error } = await client
    .from("decision_ledger")
    .select("advisory_instance_id, explanation_metadata, source_idempotency_key")
    .eq("organization_id", organizationId)
    .limit(2000);
  if (error) throw new Error(`Failed to fetch existing decisions: ${error.message}`);
  return data ?? [];
}

function hasExistingDecision(existing: Array<Record<string, unknown>>, source: DecisionSource) {
  const key = sourceKey(source);
  return existing.some((row) => {
    if (row.source_idempotency_key === key) return true;
    if (source.kind === "advisory" && row.advisory_instance_id === source.id) return true;
    const metadata = isRecord(row.explanation_metadata) ? row.explanation_metadata : {};
    const sourceMeta = isRecord(metadata.source) ? metadata.source : {};
    return sourceMeta.kind === source.kind && sourceMeta.id === source.id;
  });
}

async function fetchDatasetMap(client: ServiceClient, organizationId: string, sources: DecisionSource[]) {
  const datasetIds = [...new Set(sources.map((source) => source.dataset_id).filter((id): id is string => Boolean(id)))];
  if (datasetIds.length === 0) return {};
  const { data, error } = await client
    .from("datasets")
    .select("id, name, row_count")
    .eq("organization_id", organizationId)
    .in("id", datasetIds);
  if (error) throw new Error(`Failed to load decision source datasets: ${error.message}`);
  return Object.fromEntries((data ?? []).map((dataset) => [dataset.id, { name: dataset.name, row_count: dataset.row_count }]));
}

function normalizeAdvisory(advisory: Record<string, unknown>): DecisionSource {
  return {
    kind: "advisory",
    id: String(advisory.id),
    title: typeof advisory.title === "string" ? advisory.title : "Advisory requires decision",
    action: typeof advisory.action === "string" ? advisory.action : typeof advisory.rationale === "string" ? advisory.rationale : "Review advisory and choose an executive response.",
    category: typeof advisory.category === "string" ? advisory.category : typeof advisory.kpi_affected === "string" ? advisory.kpi_affected : null,
    priority: normalizePriority(advisory.priority),
    confidence: toNumber(advisory.capped_confidence ?? advisory.confidence),
    raw_confidence: toNumber(advisory.raw_confidence ?? advisory.confidence),
    capped_confidence: toNumber(advisory.capped_confidence),
    confidence_cap_reason: typeof advisory.confidence_cap_reason === "string" ? advisory.confidence_cap_reason : null,
    expected_impact: typeof advisory.expected_impact === "string" || typeof advisory.expected_impact === "number" ? advisory.expected_impact : null,
    rationale: typeof advisory.rationale === "string" ? advisory.rationale : null,
    dataset_id: typeof advisory.dataset_id === "string" ? advisory.dataset_id : null,
    variance_score: toNumber(advisory.variance_score),
    data_quality_index: toNumber(advisory.data_quality_index),
    created_at: typeof advisory.created_at === "string" ? advisory.created_at : null,
  };
}

function normalizeInsight(insight: Record<string, unknown>): DecisionSource {
  return {
    kind: "insight",
    id: String(insight.id),
    title: titleFromInsight(insight),
    action: recommendationFromInsight(insight),
    category: typeof insight.category === "string" ? insight.category : null,
    priority: normalizePriority(insight.severity),
    confidence: toNumber(insight.capped_confidence ?? insight.confidence_score),
    raw_confidence: toNumber(insight.raw_confidence ?? insight.confidence_score),
    capped_confidence: toNumber(insight.capped_confidence),
    confidence_cap_reason: typeof insight.confidence_cap_reason === "string" ? insight.confidence_cap_reason : null,
    expected_impact: null,
    rationale: typeof insight.message === "string" ? insight.message : null,
    dataset_id: typeof insight.dataset_id === "string" ? insight.dataset_id : null,
    sample_size: toNumber(insight.sample_size),
    variance_score: toNumber(insight.variance_score),
    data_quality_index: toNumber(insight.data_quality_index),
    created_at: typeof insight.created_at === "string" ? insight.created_at : null,
  };
}

function buildDecisionRow(source: DecisionSource, organizationId: string, datasetMap: Record<string, { name?: string; row_count?: number | null }>) {
  const dataset = source.dataset_id ? datasetMap[source.dataset_id] : null;
  const expectedImpact = parseImpactEstimate(source.expected_impact);
  const recencyDays = source.created_at && Number.isFinite(new Date(source.created_at).getTime())
    ? Math.max(0, Math.floor((Date.now() - new Date(source.created_at).getTime()) / 86_400_000))
    : null;

  return {
    organization_id: organizationId,
    source_idempotency_key: sourceKey(source),
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
    evidence_sources: [{
      source_type: source.kind,
      source_name: dataset?.name ?? (source.kind === "advisory" ? "Advisory engine" : "Insight engine"),
      source_id: source.id,
      contribution_weight: 1,
      confidence: source.capped_confidence ?? source.confidence ?? source.raw_confidence,
      recency_days: recencyDays,
    }],
    explanation_metadata: {
      source: { kind: source.kind, id: source.id, created_at: source.created_at },
      source_data: {
        dataset_name: dataset?.name ?? null,
        dataset_id: source.dataset_id,
        rows_analyzed: dataset?.row_count ?? source.sample_size ?? null,
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
        basis: source.kind === "insight" ? "No evidence-backed monetary impact model was available for this insight" : "Advisory expected impact / rule output",
      },
      confidence_explanation: {
        score: source.capped_confidence ?? source.confidence,
        capped: source.raw_confidence != null && source.capped_confidence != null && source.raw_confidence !== source.capped_confidence,
        cap_reason: source.confidence_cap_reason,
      },
      evidence_classification: source.kind === "insight" ? "OBSERVED_SIGNAL_TO_DECISION" : "ADVISORY_TO_DECISION",
      limitations: [source.kind === "insight"
        ? "Created from a high-severity insight. Requires executive review before execution."
        : "Created from an advisory instance. Requires executive review before execution."],
    },
  };
}

async function markConvertedAdvisories(client: ServiceClient, organizationId: string, sources: DecisionSource[]) {
  const ids = sources.filter((source) => source.kind === "advisory").map((source) => source.id);
  if (!ids.length) return;
  const { error } = await client
    .from("advisory_instances")
    .update({ status: "in_progress" })
    .eq("organization_id", organizationId)
    .in("id", ids)
    .eq("status", "open");
  if (error) throw new Error(`Failed to mark converted advisories in progress: ${error.message}`);
}

async function createDecisionNotifications(client: ServiceClient, organizationId: string, decisions: Array<Record<string, unknown>>, sources: DecisionSource[]) {
  if (!decisions.length) return [] as string[];
  const rows = decisions.map((decision, index) => ({
    organization_id: organizationId,
    event_type: "decision_created",
    entity_type: "decision_ledger",
    entity_id: decision.id,
    severity: sources[index]?.priority ?? "high",
    title: "New executive decision required",
    message: sources[index]?.title ?? "A new decision requires review.",
    metadata: { source_kind: sources[index]?.kind, source_id: sources[index]?.id, decision_id: decision.id },
  }));

  const { error } = await client.from("notification_events").insert(rows);
  if (!error) return [];
  const { error: fallbackError } = await client.from("auth_events").insert(rows.map((row) => ({
    organization_id: row.organization_id,
    event_type: row.event_type,
    metadata: row.metadata,
  })));
  return fallbackError
    ? [`Decision notifications failed: ${error.message}; fallback failed: ${fallbackError.message}`]
    : [`Primary notification event write failed; fallback auth event was persisted: ${error.message}`];
}

function sourceKey(source: DecisionSource) {
  return `${source.kind}:${source.id}`;
}

function titleFromInsight(insight: Record<string, unknown>) {
  if (typeof insight.category === "string" && insight.category) return `${humanize(insight.category)} requires executive decision`;
  if (typeof insight.message === "string" && insight.message) return insight.message.slice(0, 96);
  return "Critical insight requires executive decision";
}

function recommendationFromInsight(insight: Record<string, unknown>) {
  const category = String(insight.category ?? "").toLowerCase();
  const message = String(insight.message ?? "").toLowerCase();
  if (category.includes("inventory")) return "Review replenishment, slow-moving stock, and supplier timing before the next procurement cycle.";
  if (category.includes("marketing")) return "Review campaign-level ROI and enforce spend controls before approving additional marketing budget.";
  if (category.includes("margin") || message.includes("margin")) return "Run a product-line margin review and protect the highest-gross-profit channels.";
  if (category.includes("revenue") || message.includes("revenue")) return "Review revenue drivers against cost movement and prioritize profitable growth actions.";
  if (category.includes("cost") || message.includes("cost")) return "Run a cost-driver review and negotiate priority supplier or operating-cost actions.";
  if (category.includes("cash") || category.includes("receivable") || category.includes("payable")) return "Review working-capital timing and align purchasing, collections, and supplier payments.";
  return "Assign an owner to investigate root cause, confirm expected impact, and approve or reject the recommended response.";
}

function buildWhyItMatters(source: DecisionSource) {
  const impact = parseImpactEstimate(source.expected_impact);
  const impactPhrase = impact !== null
    ? `Evidence/modelled financial exposure is about €${Math.round(impact).toLocaleString("en-GB")}.`
    : "No evidence-backed monetary exposure has been established.";
  return `${source.priority.toUpperCase()} ${source.kind} signal. ${impactPhrase} Executive review is required to move from intelligence to action.`;
}

function isSupplierRiskSource(source: Pick<DecisionSource, "category" | "title" | "rationale">): boolean {
  return /supplier|vendor|delivery/.test(`${source.category ?? ""} ${source.title} ${source.rationale ?? ""}`.toLowerCase());
}

function normalizePriority(value: unknown) {
  const normalized = String(value ?? "medium").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "low") return "low";
  return "medium";
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseImpactEstimate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const matches = String(value).match(/-?\d+(?:[,.]\d+)?/g);
  if (!matches?.length) return null;
  const numbers = matches.map((match) => Number(match.replace(/,/g, ""))).filter(Number.isFinite);
  if (!numbers.length) return null;
  return numbers.reduce((sum, number) => sum + number, 0) / numbers.length;
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function json(payload: unknown, status: number, corsHeaders: HeadersInit) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
