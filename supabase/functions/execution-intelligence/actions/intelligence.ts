/**
 * Bounded module: Intelligence Queries
 * Handles engine_health, command_summary, operational_metrics, infer_blockers,
 * get_dependency_graph, forensic_trace
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ActionContext, ActionResult } from "./types.ts";
import { isValidUUID } from "../../_shared/input-validation.ts";

export async function engineHealth(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { data: recentRuns } = await supabase
    .from("execution_run_log")
    .select("run_type, status, duration_ms, items_processed, items_created, started_at, error_message")
    .eq("organization_id", ctx.orgId)
    .order("started_at", { ascending: false })
    .limit(20);

  const runs = recentRuns || [];
  const byType: Record<string, { latest: string; status: string; avg_duration: number; runs: number; errors: number }> = {};

  for (const r of runs) {
    const entry = byType[r.run_type] || { latest: "", status: "unknown", avg_duration: 0, runs: 0, errors: 0 };
    if (!entry.latest || r.started_at > entry.latest) {
      entry.latest = r.started_at;
      entry.status = r.status;
    }
    entry.runs++;
    entry.avg_duration = (entry.avg_duration * (entry.runs - 1) + (r.duration_ms || 0)) / entry.runs;
    if (r.status === "failed") entry.errors++;
    byType[r.run_type] = entry;
  }

  return {
    data: {
      engines: byType,
      recent_runs: runs.slice(0, 10),
      overall_health: Object.values(byType).some(e => e.errors > 0) ? "degraded" : "healthy",
    },
  };
}

export async function commandSummary(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const runId = crypto.randomUUID();
  const [
    { data: scores },
    { data: preds },
    { data: openInterventions },
    { data: activePlans },
    { data: recentOverrides },
    { data: recentRuns },
  ] = await Promise.all([
    supabase.from("execution_scores")
      .select("*").eq("organization_id", ctx.orgId).eq("scope_type", "organization")
      .order("computed_at", { ascending: false }).limit(1),
    supabase.from("execution_predictions")
      .select("risk_score, predicted_outcome, execution_plan_id")
      .eq("organization_id", ctx.orgId).eq("is_active", true)
      .order("risk_score", { ascending: false }).limit(200),
    supabase.from("execution_interventions")
      .select("id, intervention_type, resolved")
      .eq("organization_id", ctx.orgId).eq("resolved", false).limit(50),
    supabase.from("execution_plans")
      .select("id, status, priority, decision_id, blocked_by_plan_id, is_critical_path")
      .eq("organization_id", ctx.orgId).in("status", ["pending", "in_progress", "blocked"]).limit(500),
    supabase.from("execution_overrides")
      .select("id, override_type, created_at")
      .eq("organization_id", ctx.orgId).order("created_at", { ascending: false }).limit(5),
    supabase.from("execution_run_log")
      .select("run_type, status, started_at, duration_ms")
      .eq("organization_id", ctx.orgId).order("started_at", { ascending: false }).limit(5),
  ]);

  const orgScore = scores?.[0] || null;
  const predictions = preds || [];
  const atRiskCount = predictions.filter(p => p.predicted_outcome === "at_risk" || p.predicted_outcome === "likely_failure").length;
  const active = activePlans || [];
  const criticalPlans = active.filter(p => p.priority === "critical").length;
  const blockedPlans = active.filter(p => p.blocked_by_plan_id).length;

  const decisionGroups = new Map<string, number>();
  for (const p of active) {
    decisionGroups.set(p.decision_id, (decisionGroups.get(p.decision_id) || 0) + 1);
  }
  const multiPlanDecisions = Array.from(decisionGroups.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([decisionId, count]) => ({ decision_id: decisionId, plan_count: count }));

  return {
    data: {
      org_score: orgScore,
      at_risk_plans: atRiskCount,
      open_interventions: (openInterventions || []).length,
      critical_active: criticalPlans,
      blocked_active: blockedPlans,
      total_active: active.length,
      multi_plan_decisions: multiPlanDecisions,
      risk_distribution: {
        likely_failure: predictions.filter(p => p.predicted_outcome === "likely_failure").length,
        at_risk: predictions.filter(p => p.predicted_outcome === "at_risk").length,
        delayed: predictions.filter(p => p.predicted_outcome === "delayed").length,
        on_track: predictions.filter(p => p.predicted_outcome === "on_track").length,
      },
      recent_overrides: recentOverrides || [],
      last_runs: recentRuns || [],
      generated_at: new Date().toISOString(),
      correlation_id: ctx.correlationId,
    },
    logMeta: { runType: "command_summary", runId, processed: active.length, created: 0 },
  };
}

export async function operationalMetrics(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { data: metrics } = await supabase.rpc("exec_operational_metrics", { _org_id: ctx.orgId });
  return { data: metrics || {} };
}

export async function inferBlockers(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const inferLimit = Math.min(Number(ctx.body.limit) || 100, 500);
  const { data: blockers } = await supabase.rpc("exec_infer_blockers", { _org_id: ctx.orgId, _limit: inferLimit });
  const results = blockers || [];
  return {
    data: {
      inferred_blockers: results,
      total: results.length,
      capped: results.length >= inferLimit,
      limit_applied: inferLimit,
      note: "Automatically inferred dependencies based on decision grouping, creation order, and deadline alignment.",
    },
  };
}

export async function getDependencyGraph(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { data: plans } = await supabase
    .from("execution_plans")
    .select("id, action_title, status, priority, deadline, owner_user_id, decision_id, blocked_by_plan_id, unlocks_plan_ids, dependency_type, is_critical_path")
    .eq("organization_id", ctx.orgId)
    .in("status", ["pending", "in_progress", "blocked"])
    .limit(200);

  if (!plans || plans.length === 0) return { data: { graph: [], blocked_chains: [], critical_path: [] } };

  const blocked = plans.filter(p => p.blocked_by_plan_id);
  const criticalPath = plans.filter(p => p.is_critical_path);

  const planMap = new Map(plans.map(p => [p.id, p]));
  const blockedChains: Array<{ chain: string[]; depth: number }> = [];

  for (const plan of blocked) {
    const chain: string[] = [plan.id];
    let current = plan.blocked_by_plan_id;
    let depth = 0;
    while (current && depth < 10) {
      chain.unshift(current);
      const upstream = planMap.get(current);
      current = upstream?.blocked_by_plan_id || null;
      depth++;
    }
    if (chain.length > 1) {
      blockedChains.push({ chain, depth: chain.length });
    }
  }

  return {
    data: {
      graph: plans,
      blocked_chains: blockedChains.sort((a, b) => b.depth - a.depth),
      critical_path: criticalPath,
      stats: {
        total: plans.length,
        blocked: blocked.length,
        critical: criticalPath.length,
        with_dependencies: plans.filter(p => p.blocked_by_plan_id || (p.unlocks_plan_ids && p.unlocks_plan_ids.length > 0)).length,
      },
    },
  };
}

export async function forensicTrace(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { plan_id: tracePlanId } = ctx.body;
  if (!isValidUUID(tracePlanId as string)) return { data: { error: "plan_id required" }, status: 400 };

  const [
    { data: plan },
    { data: events },
    { data: interventions },
    { data: predictions },
    { data: scores },
    { data: overrides },
  ] = await Promise.all([
    supabase.from("execution_plans")
      .select("*")
      .eq("id", tracePlanId as string).eq("organization_id", ctx.orgId).single(),
    supabase.from("execution_events")
      .select("*").eq("execution_plan_id", tracePlanId as string).eq("organization_id", ctx.orgId)
      .order("created_at", { ascending: true }).limit(100),
    supabase.from("execution_interventions")
      .select("*").eq("execution_plan_id", tracePlanId as string).eq("organization_id", ctx.orgId)
      .order("created_at", { ascending: true }).limit(50),
    supabase.from("execution_predictions")
      .select("risk_score, predicted_outcome, model_version, is_active, generated_at, superseded_at, risk_factors, feature_summary")
      .eq("execution_plan_id", tracePlanId as string).eq("organization_id", ctx.orgId)
      .order("generated_at", { ascending: false }).limit(20),
    supabase.from("execution_scores")
      .select("score, computed_at, score_explanation")
      .eq("organization_id", ctx.orgId).eq("scope_type", "organization")
      .order("computed_at", { ascending: false }).limit(5),
    supabase.from("execution_overrides")
      .select("*").eq("execution_plan_id", tracePlanId as string).eq("organization_id", ctx.orgId)
      .order("created_at", { ascending: true }).limit(20),
  ]);

  return {
    data: {
      plan: plan || null,
      timeline: {
        events: events || [],
        interventions: interventions || [],
        overrides: overrides || [],
      },
      predictions: predictions || [],
      org_score_snapshots: scores || [],
      lineage: {
        total_events: (events || []).length,
        total_interventions: (interventions || []).length,
        total_predictions: (predictions || []).length,
        total_overrides: (overrides || []).length,
      },
    },
  };
}
