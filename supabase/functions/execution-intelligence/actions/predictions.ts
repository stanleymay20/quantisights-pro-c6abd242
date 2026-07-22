/**
 * Bounded module: Prediction Engine
 * Handles predict_risks, get_predictions, get_prediction_history
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ActionContext, ActionResult } from "./types.ts";
import { isValidUUID } from "../../_shared/input-validation.ts";

const MODEL_VERSION = 3;

export async function predictRisks(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { orgId } = ctx;
  const runId = crypto.randomUUID();
  const { data: activePlans } = await supabase
    .from("execution_plans")
    .select("id, status, deadline, owner_user_id, priority, action_title, created_at, trigger_config, blocked_by_plan_id, is_critical_path")
    .eq("organization_id", orgId)
    .in("status", ["pending", "in_progress"])
    .limit(200);

  if (!activePlans || activePlans.length === 0) {
    return { data: { predictions: [], total: 0, run_id: runId }, logMeta: { runType: "predict_risks", runId, processed: 0, created: 0 } };
  }

  const { data: historicalPlans } = await supabase
    .from("execution_plans")
    .select("status, deadline, priority, created_at, updated_at, owner_user_id")
    .eq("organization_id", orgId)
    .in("status", ["completed", "failed"])
    .limit(500);

  const histByPriority: Record<string, { total: number; failed: number; avgDays: number }> = {};
  const histByOwner: Record<string, { total: number; failed: number }> = {};

  for (const hp of historicalPlans || []) {
    const pe = histByPriority[hp.priority] || { total: 0, failed: 0, avgDays: 0 };
    pe.total++;
    if (hp.status === "failed") pe.failed++;
    if (hp.deadline && hp.updated_at) {
      const days = (new Date(hp.updated_at).getTime() - new Date(hp.created_at).getTime()) / 86400000;
      pe.avgDays = (pe.avgDays * (pe.total - 1) + days) / pe.total;
    }
    histByPriority[hp.priority] = pe;

    if (hp.owner_user_id) {
      const oe = histByOwner[hp.owner_user_id] || { total: 0, failed: 0 };
      oe.total++;
      if (hp.status === "failed") oe.failed++;
      histByOwner[hp.owner_user_id] = oe;
    }
  }

  const now = new Date();
  const predictions: Array<Record<string, unknown>> = [];

  for (const plan of activePlans) {
    const riskFactors: Array<{ factor: string; weight: number }> = [];
    let riskScore = 0;

    if (plan.deadline) {
      const daysToDeadline = (new Date(plan.deadline).getTime() - now.getTime()) / 86400000;
      if (daysToDeadline < 0) {
        const w = Math.min(40, 25 + Math.abs(Math.round(daysToDeadline)));
        riskScore += w;
        riskFactors.push({ factor: `Overdue by ${Math.abs(Math.round(daysToDeadline))} days`, weight: w });
      } else if (daysToDeadline < 2) {
        riskScore += 20;
        riskFactors.push({ factor: "Deadline imminent (< 2 days)", weight: 20 });
      }
    } else {
      riskScore += 10;
      riskFactors.push({ factor: "No deadline set", weight: 10 });
    }

    const hist = histByPriority[plan.priority];
    if (hist && hist.total >= 3) {
      const failRate = hist.failed / hist.total;
      const w = Math.round(failRate * 25);
      if (w > 5) {
        riskScore += w;
        riskFactors.push({ factor: `Historical ${plan.priority} failure rate: ${Math.round(failRate * 100)}%`, weight: w });
      }
    }

    if (plan.owner_user_id && histByOwner[plan.owner_user_id]) {
      const ow = histByOwner[plan.owner_user_id];
      if (ow.total >= 3) {
        const ownerFailRate = ow.failed / ow.total;
        const w = Math.round(ownerFailRate * 15);
        if (w > 3) {
          riskScore += w;
          riskFactors.push({ factor: `Owner historical failure rate: ${Math.round(ownerFailRate * 100)}%`, weight: w });
        }
      }
    }

    if (!plan.owner_user_id) {
      riskScore += 15;
      riskFactors.push({ factor: "No owner assigned", weight: 15 });
    }

    const ageDays = (now.getTime() - new Date(plan.created_at).getTime()) / 86400000;
    if (ageDays > 14 && plan.status === "pending") {
      riskScore += 20;
      riskFactors.push({ factor: `Pending for ${Math.round(ageDays)} days without starting`, weight: 20 });
    } else if (ageDays > 7 && plan.status === "pending") {
      riskScore += 10;
      riskFactors.push({ factor: `Pending for ${Math.round(ageDays)} days`, weight: 10 });
    }

    if (plan.priority === "critical") {
      riskScore = Math.min(100, Math.round(riskScore * 1.2));
      riskFactors.push({ factor: "Critical priority amplifier (+20%)", weight: 5 });
    }

    if (plan.blocked_by_plan_id) {
      riskScore += 15;
      riskFactors.push({ factor: "Blocked by upstream dependency", weight: 15 });
    }

    riskScore = Math.min(100, Math.max(0, riskScore));

    let predictedOutcome = "on_track";
    let recommendation = "No action needed — plan is progressing normally.";
    let delayPredicted = 0;

    if (riskScore >= 70) {
      predictedOutcome = "likely_failure";
      recommendation = "Immediate intervention required. Consider reassignment, scope reduction, or executive escalation.";
      delayPredicted = Math.round(ageDays * 0.5 + 7);
    } else if (riskScore >= 50) {
      predictedOutcome = "at_risk";
      recommendation = "Review plan with owner. Consider additional resources or deadline extension.";
      delayPredicted = Math.round(ageDays * 0.3 + 3);
    } else if (riskScore >= 30) {
      predictedOutcome = "delayed";
      recommendation = "Monitor closely. Minor adjustments may prevent escalation.";
      delayPredicted = Math.round(ageDays * 0.15 + 1);
    }

    predictions.push({
      execution_plan_id: plan.id,
      risk_score: riskScore,
      predicted_outcome: predictedOutcome,
      delay_days_predicted: delayPredicted,
      risk_factors: riskFactors,
      recommendation,
      model_version: MODEL_VERSION,
      feature_summary: {
        factors_count: riskFactors.length,
        top_factor: riskFactors.length > 0 ? riskFactors.sort((a, b) => b.weight - a.weight)[0].factor : null,
        is_blocked: !!plan.blocked_by_plan_id,
        is_critical_path: plan.is_critical_path,
      },
    });
  }

  const planIds = activePlans.map(p => p.id);
  const { data: supersedeResult } = await supabase.rpc("exec_supersede_predictions", {
    _plan_ids: planIds,
    _org_id: orgId,
    _new_run_id: runId,
    _predictions: JSON.stringify(predictions),
  });

  return {
    data: { predictions, total: predictions.length, run_id: runId, superseded: supersedeResult?.superseded || 0 },
    logMeta: { runType: "predict_risks", runId, processed: activePlans.length, created: supersedeResult?.inserted || predictions.length },
  };
}

export async function getPredictions(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { include_history, plan_id: filterPlanId } = ctx.body;
  let query = supabase
    .from("execution_predictions")
    .select("*, execution_plans(action_title, status, priority, deadline, owner_user_id)")
    .eq("organization_id", ctx.orgId);

  if (filterPlanId && isValidUUID(filterPlanId as string)) {
    query = query.eq("execution_plan_id", filterPlanId as string);
  } else if (!include_history) {
    query = query.eq("is_active", true);
  }

  query = query.order("risk_score", { ascending: false }).limit(include_history ? 200 : 100);
  const { data } = await query;
  return { data: data || [] };
}

export async function getPredictionHistory(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { plan_id: histPlanId } = ctx.body;
  if (!isValidUUID(histPlanId as string)) return { data: { error: "plan_id required" }, status: 400 };

  const { data } = await supabase
    .from("execution_predictions")
    .select("risk_score, predicted_outcome, risk_factors, recommendation, model_version, is_active, generated_at, superseded_at, feature_summary, run_id")
    .eq("execution_plan_id", histPlanId as string)
    .eq("organization_id", ctx.orgId)
    .order("generated_at", { ascending: false })
    .limit(50);

  return { data: data || [] };
}
