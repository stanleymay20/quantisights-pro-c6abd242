// @ts-nocheck
/**
 * Bounded module: Scoring Engine
 * Handles compute_scores, get_scores, get_score_trend, explain_score_change
 */
// deno-lint-ignore-file no-explicit-any
type SupabaseClient = any;
import { ActionContext, ActionResult } from "./types.ts";
import { isValidUUID } from "../../_shared/input-validation.ts";

const FORMULA_V1 = "score = successRate*40 + (1-failureRate)*25 + max(0,1-avgDelay/14)*20 + reliabilityRate*15";
const MODEL_VERSION = 3;

export async function computeScores(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { orgId } = ctx;
  const runId = crypto.randomUUID();
  const { data: plans } = await supabase
    .from("execution_plans")
    .select("id, status, deadline, owner_user_id, decision_id, created_at, updated_at")
    .eq("organization_id", orgId)
    .limit(1000);

  if (!plans || plans.length === 0) {
    return { data: { scores: [], run_id: runId }, logMeta: { runType: "compute_scores", runId, processed: 0, created: 0 } };
  }

  const now = new Date();
  const completed = plans.filter(p => p.status === "completed");
  const failed = plans.filter(p => p.status === "failed");
  const cancelled = plans.filter(p => p.status === "cancelled");
  const total = plans.length;

  const successRate = total > 0 ? completed.length / total : 0;
  const failureRate = total > 0 ? failed.length / total : 0;
  const reliabilityRate = total > 0 ? (completed.length + failed.length + cancelled.length) / total : 0;

  const completedWithDeadline = completed.filter(p => p.deadline);
  let avgDelay = 0;
  if (completedWithDeadline.length > 0) {
    const totalDelay = completedWithDeadline.reduce((sum, p) => {
      const deadline = new Date(p.deadline!);
      const completedAt = new Date(p.updated_at);
      return sum + Math.max(0, (completedAt.getTime() - deadline.getTime()) / 86400000);
    }, 0);
    avgDelay = totalDelay / completedWithDeadline.length;
  }

  const score = Math.round(
    (successRate * 40 + (1 - failureRate) * 25 + Math.max(0, 1 - avgDelay / 14) * 20 + reliabilityRate * 15)
  );

  const scoreExplanation = {
    success_component: Math.round(successRate * 40 * 100) / 100,
    failure_avoidance_component: Math.round((1 - failureRate) * 25 * 100) / 100,
    timeliness_component: Math.round(Math.max(0, 1 - avgDelay / 14) * 20 * 100) / 100,
    reliability_component: Math.round(reliabilityRate * 15 * 100) / 100,
    breakdown: { completed: completed.length, failed: failed.length, cancelled: cancelled.length, pending: total - completed.length - failed.length - cancelled.length },
  };

  const orgScore = {
    organization_id: orgId,
    scope_type: "organization",
    scope_id: orgId,
    score: Math.min(100, Math.max(0, score)),
    reliability_rate: Math.round(reliabilityRate * 100),
    avg_delay_days: Math.round(avgDelay * 10) / 10,
    success_rate: Math.round(successRate * 100),
    failure_rate: Math.round(failureRate * 100),
    plans_evaluated: total,
    scoring_model_version: MODEL_VERSION,
    computed_at: now.toISOString(),
    formula_snapshot: FORMULA_V1,
    computed_by: "system",
    source_window_days: 90,
    score_explanation: scoreExplanation,
  };

  // Per-user scores
  const userMap = new Map<string, typeof plans>();
  for (const p of plans) {
    if (!p.owner_user_id) continue;
    const arr = userMap.get(p.owner_user_id) || [];
    arr.push(p);
    userMap.set(p.owner_user_id, arr);
  }

  const userScores: Array<Record<string, unknown>> = [];
  for (const [uid, userPlans] of userMap) {
    const uCompleted = userPlans.filter(p => p.status === "completed").length;
    const uFailed = userPlans.filter(p => p.status === "failed").length;
    const uTotal = userPlans.length;
    const uSuccessRate = uTotal > 0 ? uCompleted / uTotal : 0;
    const uFailureRate = uTotal > 0 ? uFailed / uTotal : 0;
    const uScore = Math.round(uSuccessRate * 50 + (1 - uFailureRate) * 30 + 20);

    userScores.push({
      organization_id: orgId,
      scope_type: "user",
      scope_id: uid,
      score: Math.min(100, Math.max(0, uScore)),
      success_rate: Math.round(uSuccessRate * 100),
      failure_rate: Math.round(uFailureRate * 100),
      plans_evaluated: uTotal,
      scoring_model_version: MODEL_VERSION,
      computed_at: now.toISOString(),
      formula_snapshot: "score = successRate*50 + (1-failureRate)*30 + 20",
      computed_by: "system",
      source_window_days: 90,
      score_explanation: {
        success_component: Math.round(uSuccessRate * 50 * 100) / 100,
        failure_avoidance_component: Math.round((1 - uFailureRate) * 30 * 100) / 100,
        base: 20,
      },
    });
  }

  const allScores = [orgScore, ...userScores];
  const { data: scoreResult } = await supabase.rpc("exec_compute_scores_idempotent", {
    _org_id: orgId,
    _scores: JSON.stringify(allScores),
    _cooldown_minutes: 5,
  });

  const inserted = scoreResult?.inserted ?? allScores.length;
  const skippedDupes = scoreResult?.skipped_duplicates ?? 0;

  return {
    data: { org_score: orgScore, user_scores: userScores, run_id: runId, inserted, skipped_duplicates: skippedDupes },
    logMeta: { runType: "compute_scores", runId, processed: total, created: inserted, meta: { skipped_duplicates: skippedDupes } },
  };
}

export async function getScores(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { scope_type, include_history } = ctx.body;

  if (!include_history) {
    // Use server-side dedup: DISTINCT ON equivalent via ordered limit + client dedup on minimal set
    let query = supabase
      .from("execution_scores")
      .select("*")
      .eq("organization_id", ctx.orgId)
      .order("computed_at", { ascending: false });

    if (scope_type) query = query.eq("scope_type", scope_type as string);
    const { data } = await query.limit(50);

    // Deduplicate: keep only latest per scope_type:scope_id
    const latestByScope = new Map<string, (typeof data extends Array<infer T> ? T : never)>();
    for (const row of data || []) {
      const key = `${row.scope_type}:${row.scope_id}`;
      if (!latestByScope.has(key)) latestByScope.set(key, row);
    }
    return { data: Array.from(latestByScope.values()) };
  }

  let query = supabase
    .from("execution_scores")
    .select("*")
    .eq("organization_id", ctx.orgId)
    .order("computed_at", { ascending: false });

  if (scope_type) query = query.eq("scope_type", scope_type as string);
  const { data } = await query.limit(100);
  return { data: data || [] };
}

export async function getScoreTrend(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { scope_type: st, scope_id: si, limit: trendLimit } = ctx.body;
  if (!st || !isValidUUID(si as string)) return { data: { error: "scope_type and scope_id required" }, status: 400 };

  const { data } = await supabase
    .from("execution_scores")
    .select("score, success_rate, failure_rate, avg_delay_days, plans_evaluated, computed_at, score_explanation, scoring_model_version")
    .eq("organization_id", ctx.orgId)
    .eq("scope_type", st as string)
    .eq("scope_id", si as string)
    .order("computed_at", { ascending: false })
    .limit(Math.min((trendLimit as number) || 30, 100));

  return { data: data || [] };
}

export async function explainScoreChange(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { scope_type: est, scope_id: esi } = ctx.body;
  if (!est || !isValidUUID(esi as string)) return { data: { error: "scope_type and scope_id required" }, status: 400 };

  const { data: recentScores } = await supabase
    .from("execution_scores")
    .select("score, score_explanation, computed_at, scoring_model_version")
    .eq("organization_id", ctx.orgId)
    .eq("scope_type", est as string)
    .eq("scope_id", esi as string)
    .order("computed_at", { ascending: false })
    .limit(2);

  if (!recentScores || recentScores.length < 2) {
    return { data: { explanation: "Not enough score history to compare", current: recentScores?.[0] || null, previous: null } };
  }

  const [current, previous] = recentScores;
  const delta = current.score - previous.score;
  const curExp = current.score_explanation as Record<string, number> | null;
  const prevExp = previous.score_explanation as Record<string, number> | null;

  const componentDeltas: Record<string, number> = {};
  if (curExp && prevExp) {
    for (const key of Object.keys(curExp)) {
      if (typeof curExp[key] === "number" && typeof prevExp[key] === "number") {
        componentDeltas[key] = Math.round((curExp[key] - prevExp[key]) * 100) / 100;
      }
    }
  }

  return {
    data: {
      score_delta: delta,
      current,
      previous,
      component_deltas: componentDeltas,
      direction: delta > 0 ? "improved" : delta < 0 ? "declined" : "unchanged",
    },
  };
}
