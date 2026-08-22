/**
 * Bounded module: Scoring Engine
 * Handles compute_scores, get_scores, get_score_trend, explain_score_change.
 * Score computation is only valid when its source reads and persistence succeed.
 */
// deno-lint-ignore-file no-explicit-any
type SupabaseClient = any;
import { ActionContext, ActionResult } from "./types.ts";
import { isValidUUID } from "../../_shared/input-validation.ts";

const FORMULA_V1 = "score = successRate*40 + (1-failureRate)*25 + max(0,1-avgDelay/14)*20 + reliabilityRate*15";
const MODEL_VERSION = 3;

type ExecutionPlan = {
  id: string;
  status: string;
  deadline: string | null;
  owner_user_id: string | null;
  decision_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function computeScores(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { orgId } = ctx;
  const runId = crypto.randomUUID();
  const { data: planRows, error: planError } = await supabase
    .from("execution_plans")
    .select("id, status, deadline, owner_user_id, decision_id, created_at, updated_at")
    .eq("organization_id", orgId)
    .limit(1000);
  if (planError) throw new Error(`Failed to load execution plans: ${planError.message}`);

  const plans = (planRows ?? []) as ExecutionPlan[];
  if (plans.length === 0) {
    return { data: { scores: [], run_id: runId }, logMeta: { runType: "compute_scores", runId, processed: 0, created: 0 } };
  }

  const now = new Date();
  const completed = plans.filter((plan) => plan.status === "completed");
  const failed = plans.filter((plan) => plan.status === "failed");
  const cancelled = plans.filter((plan) => plan.status === "cancelled");
  const total = plans.length;

  const successRate = completed.length / total;
  const failureRate = failed.length / total;
  const reliabilityRate = (completed.length + failed.length + cancelled.length) / total;

  const completedWithDeadline = completed.filter((plan) => plan.deadline);
  let avgDelay = 0;
  if (completedWithDeadline.length > 0) {
    const delays = completedWithDeadline.map((plan) => {
      const deadline = new Date(plan.deadline as string).getTime();
      const completedAt = new Date(plan.updated_at).getTime();
      if (!Number.isFinite(deadline) || !Number.isFinite(completedAt)) return null;
      return Math.max(0, (completedAt - deadline) / 86_400_000);
    }).filter((value): value is number => value !== null);
    if (delays.length > 0) avgDelay = delays.reduce((sum, value) => sum + value, 0) / delays.length;
  }

  const score = Math.round(
    successRate * 40 +
    (1 - failureRate) * 25 +
    Math.max(0, 1 - avgDelay / 14) * 20 +
    reliabilityRate * 15,
  );

  const scoreExplanation = {
    success_component: Math.round(successRate * 40 * 100) / 100,
    failure_avoidance_component: Math.round((1 - failureRate) * 25 * 100) / 100,
    timeliness_component: Math.round(Math.max(0, 1 - avgDelay / 14) * 20 * 100) / 100,
    reliability_component: Math.round(reliabilityRate * 15 * 100) / 100,
    breakdown: {
      completed: completed.length,
      failed: failed.length,
      cancelled: cancelled.length,
      pending: total - completed.length - failed.length - cancelled.length,
    },
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

  const userMap = new Map<string, ExecutionPlan[]>();
  for (const plan of plans) {
    if (!plan.owner_user_id) continue;
    const current = userMap.get(plan.owner_user_id) ?? [];
    current.push(plan);
    userMap.set(plan.owner_user_id, current);
  }

  const userScores: Array<Record<string, unknown>> = [];
  for (const [userId, userPlans] of userMap) {
    const completedCount = userPlans.filter((plan) => plan.status === "completed").length;
    const failedCount = userPlans.filter((plan) => plan.status === "failed").length;
    const userTotal = userPlans.length;
    const userSuccessRate = completedCount / userTotal;
    const userFailureRate = failedCount / userTotal;
    const userScore = Math.round(userSuccessRate * 50 + (1 - userFailureRate) * 30 + 20);

    userScores.push({
      organization_id: orgId,
      scope_type: "user",
      scope_id: userId,
      score: Math.min(100, Math.max(0, userScore)),
      success_rate: Math.round(userSuccessRate * 100),
      failure_rate: Math.round(userFailureRate * 100),
      plans_evaluated: userTotal,
      scoring_model_version: MODEL_VERSION,
      computed_at: now.toISOString(),
      formula_snapshot: "score = successRate*50 + (1-failureRate)*30 + 20",
      computed_by: "system",
      source_window_days: 90,
      score_explanation: {
        success_component: Math.round(userSuccessRate * 50 * 100) / 100,
        failure_avoidance_component: Math.round((1 - userFailureRate) * 30 * 100) / 100,
        base: 20,
      },
    });
  }

  const allScores = [orgScore, ...userScores];
  const { data: scoreResult, error: scoreError } = await supabase.rpc("exec_compute_scores_idempotent", {
    _org_id: orgId,
    _scores: JSON.stringify(allScores),
    _cooldown_minutes: 5,
  });
  if (scoreError) throw new Error(`Failed to persist execution scores: ${scoreError.message}`);
  if (!scoreResult || typeof scoreResult !== "object") {
    throw new Error("Execution score persistence returned no result");
  }

  const inserted = Number(scoreResult.inserted ?? 0);
  const skippedDuplicates = Number(scoreResult.skipped_duplicates ?? 0);
  if (!Number.isFinite(inserted) || !Number.isFinite(skippedDuplicates)) {
    throw new Error("Execution score persistence returned invalid counters");
  }

  return {
    data: { org_score: orgScore, user_scores: userScores, run_id: runId, inserted, skipped_duplicates: skippedDuplicates },
    logMeta: { runType: "compute_scores", runId, processed: total, created: inserted, meta: { skipped_duplicates: skippedDuplicates } },
  };
}

export async function getScores(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { scope_type, include_history } = ctx.body;

  if (!include_history) {
    let query = supabase
      .from("execution_scores")
      .select("*")
      .eq("organization_id", ctx.orgId)
      .order("computed_at", { ascending: false });
    if (scope_type) query = query.eq("scope_type", String(scope_type));
    const { data, error } = await query.limit(50);
    if (error) throw new Error(`Failed to load execution scores: ${error.message}`);

    const latestByScope = new Map<string, Record<string, unknown>>();
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const key = `${String(row.scope_type)}:${String(row.scope_id)}`;
      if (!latestByScope.has(key)) latestByScope.set(key, row);
    }
    return { data: [...latestByScope.values()] };
  }

  let query = supabase
    .from("execution_scores")
    .select("*")
    .eq("organization_id", ctx.orgId)
    .order("computed_at", { ascending: false });
  if (scope_type) query = query.eq("scope_type", String(scope_type));
  const { data, error } = await query.limit(100);
  if (error) throw new Error(`Failed to load execution score history: ${error.message}`);
  return { data: data ?? [] };
}

export async function getScoreTrend(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { scope_type: scopeType, scope_id: scopeId, limit: trendLimit } = ctx.body;
  if (!scopeType || typeof scopeId !== "string" || !isValidUUID(scopeId)) {
    return { data: { error: "scope_type and valid scope_id required" }, status: 400 };
  }
  const requestedLimit = Number(trendLimit ?? 30);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(1, Math.floor(requestedLimit)), 100) : 30;

  const { data, error } = await supabase
    .from("execution_scores")
    .select("score, success_rate, failure_rate, avg_delay_days, plans_evaluated, computed_at, score_explanation, scoring_model_version")
    .eq("organization_id", ctx.orgId)
    .eq("scope_type", String(scopeType))
    .eq("scope_id", scopeId)
    .order("computed_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load execution score trend: ${error.message}`);

  return { data: data ?? [] };
}

export async function explainScoreChange(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { scope_type: scopeType, scope_id: scopeId } = ctx.body;
  if (!scopeType || typeof scopeId !== "string" || !isValidUUID(scopeId)) {
    return { data: { error: "scope_type and valid scope_id required" }, status: 400 };
  }

  const { data: recentScores, error } = await supabase
    .from("execution_scores")
    .select("score, score_explanation, computed_at, scoring_model_version")
    .eq("organization_id", ctx.orgId)
    .eq("scope_type", String(scopeType))
    .eq("scope_id", scopeId)
    .order("computed_at", { ascending: false })
    .limit(2);
  if (error) throw new Error(`Failed to explain execution score change: ${error.message}`);

  if (!recentScores || recentScores.length < 2) {
    return { data: { explanation: "Not enough score history to compare", current: recentScores?.[0] ?? null, previous: null } };
  }

  const [current, previous] = recentScores;
  const currentScore = Number(current.score);
  const previousScore = Number(previous.score);
  if (!Number.isFinite(currentScore) || !Number.isFinite(previousScore)) throw new Error("Execution score history contains invalid scores");
  const delta = currentScore - previousScore;
  const currentExplanation = current.score_explanation as Record<string, unknown> | null;
  const previousExplanation = previous.score_explanation as Record<string, unknown> | null;

  const componentDeltas: Record<string, number> = {};
  if (currentExplanation && previousExplanation) {
    for (const key of Object.keys(currentExplanation)) {
      const currentValue = currentExplanation[key];
      const previousValue = previousExplanation[key];
      if (typeof currentValue === "number" && typeof previousValue === "number") {
        componentDeltas[key] = Math.round((currentValue - previousValue) * 100) / 100;
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
