// @ts-nocheck
// GA-1: Supplier Risk runtime ingestion path.
//
// This is the ONE existing Supplier Risk ingestion slice that now runs
// through the production RTS-1 / Agent Gateway / Runtime pipeline instead of
// the generic direct-insert path. It looks at the exact same sources
// `auto-create-decisions` looks at (open advisory_instances + decision-grade
// insights) but only claims the subset that is supplier-risk shaped
// (supplier / vendor / delivery). Every other category is untouched and
// continues to flow through `auto-create-decisions` exactly as before.
//
// Flow: Supplier Risk Signal -> Signal Quality -> Contradiction Detection ->
// Verified Fact Promotion -> Decision Candidate Generation -> Decision
// Candidate Handoff -> Agent Gateway -> Runtime Gateway -> Runtime Service ->
// Runtime Queue -> Runtime Persistence -> decision_ledger.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import {
  runSupplierRiskRuntimePipeline,
  type SupplierRiskDecisionLedgerRow,
  type SupplierRiskRuntimePipelineResult,
} from "@/lib/supplier-risk-runtime-pipeline.ts";

type SourceKind = "advisory" | "insight";

interface SupplierRiskSource {
  kind: SourceKind;
  id: string;
  title: string;
  action: string;
  category: string | null;
  priority: string;
  rationale: string | null;
  expected_impact: string | number | null;
  dataset_id: string | null;
  created_at: string | null;
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
    const { organization_id, now: nowOverride } = body;
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

    const now = typeof nowOverride === "string" ? nowOverride : new Date().toISOString();

    const advisories = await fetchOpenAdvisories(serviceSupabase, organization_id);
    const insights = await fetchDecisionGradeInsights(serviceSupabase, organization_id);

    const allSources: SupplierRiskSource[] = [
      ...advisories.map(normalizeAdvisory),
      ...insights.map(normalizeInsight),
    ].filter(isSupplierRiskSource);

    if (allSources.length === 0) {
      return json({ message: "No supplier-risk-shaped advisories or insights to run through the runtime pipeline", created: 0 }, 200, corsHeaders);
    }

    const existing = await fetchExistingDecisionSources(serviceSupabase, organization_id);
    const newSources = allSources.filter((source) => !hasExistingDecision(existing, source));

    if (newSources.length === 0) {
      return json({ message: "All supplier-risk advisories and insights already have decisions", created: 0 }, 200, corsHeaders);
    }

    const results: Array<{ source_id: string; source_kind: SourceKind; status: string; decision_id: string | null }> = [];
    const processedAdvisorySources: SupplierRiskSource[] = [];

    for (const source of newSources) {
      const pipelineResult = await runSupplierRiskPipelineForSource(serviceSupabase, organization_id, source, now, user.id);
      results.push({
        source_id: source.id,
        source_kind: source.kind,
        status: pipelineResult.status,
        decision_id: pipelineResult.decision_id,
      });
      if (pipelineResult.status === "DECISION_LEDGER_READY" && source.kind === "advisory") {
        processedAdvisorySources.push(source);
      }
    }

    if (processedAdvisorySources.length > 0) {
      await serviceSupabase
        .from("advisory_instances")
        .update({ status: "in_progress" })
        .in("id", processedAdvisorySources.map((s) => s.id))
        .eq("status", "open");
    }

    const created = results.filter((r) => r.status === "DECISION_LEDGER_READY").length;

    await serviceSupabase.from("audit_log").insert({
      organization_id,
      actor_id: user.id,
      actor_type: "system",
      action_type: "supplier_risk_runtime_decisions_created",
      resource_type: "decision_ledger",
      payload: {
        count: created,
        examined: newSources.length,
        results,
        source: "supplier_risk_runtime_ingest",
      },
    });

    return json({ created, examined: newSources.length, results }, 200, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("supplier-risk-runtime-ingest error:", message);
    return json({ error: message }, 500, getCorsHeaders(req));
  }
});

async function runSupplierRiskPipelineForSource(
  serviceSupabase: any,
  organizationId: string,
  source: SupplierRiskSource,
  now: string,
  userId: string,
): Promise<{ status: SupplierRiskRuntimePipelineResult["status"]; decision_id: string | null }> {
  const impactAmount = deriveImpactAmount(source);
  const deliveryDelayHours = deriveDeliveryDelayHours(source);
  let persistedDecisionId: string | null = null;

  const result = await runSupplierRiskRuntimePipeline(
    {
      now,
      signal: {
        event_id: `${source.kind}-${source.id}`,
        source_system: source.kind === "advisory" ? "advisory-engine" : "insight-engine",
        connector_id: `supplier-risk-runtime-ingest:${source.kind}`,
        source_record_id: source.id,
        tenant_id: organizationId,
        organization_id: organizationId,
        supplier_id: source.id,
        delivery_delay_hours: deliveryDelayHours,
        impact_amount: impactAmount,
        description: source.rationale ?? source.title,
        // Freshness is evaluated at the moment this business condition is
        // re-observed by the runtime pipeline, not the advisory/insight's
        // original creation time (which can be hours or days old and would
        // otherwise fail the Signal Quality freshness gate).
        observed_at: now,
      },
    },
    {
      persistDecisionRecord: async (record) => {
        await serviceSupabase.from("audit_log").insert({
          organization_id: organizationId,
          actor_id: userId,
          actor_type: "system",
          action_type: "agent_gateway.decision_recorded",
          resource_type: "decision_ledger",
          resource_id: record.decision_id,
          payload: {
            decision_class: record.decision_class,
            approval_state: record.status,
            source_kind: source.kind,
            source_id: source.id,
          },
        });
        return { decision_id: record.decision_id };
      },
      writeAuditEvent: async (event) => {
        const { data, error } = await serviceSupabase
          .from("audit_log")
          .insert({
            organization_id: event.organization_id,
            actor_id: event.actor_id ?? userId,
            actor_type: event.actor_id ? "user" : "system",
            action_type: event.action_type,
            resource_type: event.resource_type,
            resource_id: event.resource_id,
            payload: event.payload,
          })
          .select("id")
          .single();
        if (error) throw new Error(`audit_log insert failed: ${error.message}`);
        return { audit_id: data.id };
      },
      persistDecisionLedgerRow: async (row: SupplierRiskDecisionLedgerRow) => {
        const insertRow = {
          ...row,
          advisory_instance_id: source.kind === "advisory" ? source.id : null,
        };
        const { data, error } = await serviceSupabase
          .from("decision_ledger")
          .insert(insertRow)
          .select("id")
          .single();
        if (error) throw new Error(`decision_ledger insert failed: ${error.message}`);
        persistedDecisionId = data.id;
        return { decision_id: data.id };
      },
    },
  );

  return { status: result.status, decision_id: persistedDecisionId };
}

async function fetchOpenAdvisories(client: any, organizationId: string) {
  const { data, error } = await client
    .from("advisory_instances")
    .select("id, title, action, category, priority, rationale, kpi_affected, expected_impact, dataset_id, created_at")
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .in("priority", ["critical", "high", "medium"])
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) throw new Error(`Failed to fetch advisories: ${error.message}`);
  return data ?? [];
}

async function fetchDecisionGradeInsights(client: any, organizationId: string) {
  const { data, error } = await client
    .from("insights")
    .select("id, message, severity, category, dataset_id, created_at")
    .eq("organization_id", organizationId)
    .in("severity", ["critical", "high"])
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) throw new Error(`Failed to fetch decision-grade insights: ${error.message}`);
  return data ?? [];
}

async function fetchExistingDecisionSources(client: any, organizationId: string) {
  const { data, error } = await client
    .from("decision_ledger")
    .select("advisory_instance_id, explanation_metadata")
    .eq("organization_id", organizationId)
    .limit(1000);

  if (error) throw new Error(`Failed to fetch existing decisions: ${error.message}`);
  return data ?? [];
}

function hasExistingDecision(existing: any[], source: SupplierRiskSource) {
  if (source.kind === "advisory") {
    return existing.some((row) => row.advisory_instance_id === source.id);
  }
  return existing.some((row) => {
    const meta = row.explanation_metadata ?? {};
    return meta?.source?.kind === "insight" && meta?.source?.id === source.id;
  });
}

function normalizeAdvisory(a: any): SupplierRiskSource {
  return {
    kind: "advisory",
    id: a.id,
    title: a.title ?? "Advisory requires decision",
    action: a.action ?? a.rationale ?? "Review advisory and choose an executive response.",
    category: a.category ?? a.kpi_affected ?? null,
    priority: normalizePriority(a.priority),
    rationale: a.rationale ?? null,
    expected_impact: a.expected_impact ?? null,
    dataset_id: a.dataset_id ?? null,
    created_at: a.created_at ?? null,
  };
}

function normalizeInsight(i: any): SupplierRiskSource {
  return {
    kind: "insight",
    id: i.id,
    title: i.message ? String(i.message).slice(0, 96) : "Supplier risk insight requires executive decision",
    action: "Review supplier risk insight and choose an executive response.",
    category: i.category ?? null,
    priority: normalizePriority(i.severity),
    rationale: i.message ?? null,
    expected_impact: null,
    dataset_id: i.dataset_id ?? null,
    created_at: i.created_at ?? null,
  };
}

/**
 * The single existing Supplier Risk ingestion classifier. This is the exact
 * text family used by `deriveDecisionType` in
 * `src/lib/decision-candidate-generation.ts` (supplier/delivery/vendor) so a
 * source claimed here always lands on the `supplier_risk_mitigation`
 * decision type once it reaches Decision Candidate Generation.
 */
export function isSupplierRiskSource(source: Pick<SupplierRiskSource, "category" | "title" | "rationale">): boolean {
  const text = `${source.category ?? ""} ${source.title} ${source.rationale ?? ""}`.toLowerCase();
  return /supplier|vendor|delivery/.test(text);
}

function deriveImpactAmount(source: SupplierRiskSource): number {
  const parsed = parseImpactEstimate(source.expected_impact);
  if (typeof parsed === "number" && parsed > 0) return parsed;
  switch (source.priority) {
    case "critical":
      return 2_500_000;
    case "high":
      return 750_000;
    case "medium":
      return 250_000;
    default:
      return 100_000;
  }
}

function deriveDeliveryDelayHours(source: SupplierRiskSource): number {
  switch (source.priority) {
    case "critical":
      return 72;
    case "high":
      return 48;
    case "medium":
      return 24;
    default:
      return 12;
  }
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

function normalizePriority(value: unknown) {
  const v = String(value ?? "medium").toLowerCase();
  if (v === "critical") return "critical";
  if (v === "high") return "high";
  if (v === "low") return "low";
  return "medium";
}

function json(payload: unknown, status: number, corsHeaders: HeadersInit) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
