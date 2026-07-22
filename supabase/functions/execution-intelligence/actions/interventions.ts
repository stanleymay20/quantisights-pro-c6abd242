/**
 * Bounded module: Intervention Engine
 * Handles scan_interventions, resolve_intervention, reassign_plan, get_interventions
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ActionContext, ActionResult } from "./types.ts";

export async function scanInterventions(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { orgId } = ctx;
  const runId = crypto.randomUUID();
  const { data: plans } = await supabase
    .from("execution_plans")
    .select("id, status, deadline, owner_user_id, decision_id, priority, action_title, created_at")
    .eq("organization_id", orgId)
    .in("status", ["pending", "in_progress"])
    .limit(500);

  if (!plans || plans.length === 0) {
    return { data: { interventions_created: 0, skipped: 0, scanned: 0, run_id: runId, correlation_id: ctx.correlationId }, logMeta: { runType: "scan_interventions", runId, processed: 0, created: 0 } };
  }

  const planIds = plans.map(p => p.id);

  const { data: existingInterventions } = await supabase
    .from("execution_interventions")
    .select("execution_plan_id")
    .in("execution_plan_id", planIds)
    .eq("resolved", false);

  const plansWithOpenIntervention = new Set(
    (existingInterventions || []).map(i => i.execution_plan_id)
  );

  const inProgressIds = plans.filter(p => p.status === "in_progress").map(p => p.id);
  const latestEventByPlan = new Map<string, { at: string; count: number }>();

  if (inProgressIds.length > 0) {
    const { data: eventAgg } = await supabase.rpc("exec_get_latest_events_by_plan", {
      _plan_ids: inProgressIds,
      _org_id: orgId,
    });
    for (const row of eventAgg || []) {
      latestEventByPlan.set(row.execution_plan_id, {
        at: row.latest_event_at,
        count: Number(row.event_count),
      });
    }
  }

  const now = new Date();
  const interventions: Array<Record<string, unknown>> = [];

  for (const plan of plans) {
    if (plansWithOpenIntervention.has(plan.id)) continue;

    if (plan.deadline && new Date(plan.deadline) < now) {
      const daysOverdue = Math.floor((now.getTime() - new Date(plan.deadline).getTime()) / 86400000);
      let type = "escalation";
      let reason = `Plan "${plan.action_title}" is ${daysOverdue} day(s) overdue`;
      let corrective = "Review and either extend deadline or reassign ownership";

      if (daysOverdue > 7) {
        type = "auto_cancel";
        reason = `Plan "${plan.action_title}" is critically overdue (${daysOverdue} days)`;
        corrective = "Consider cancelling or escalating to executive sponsor";
      } else if (daysOverdue > 3) {
        type = "reassignment";
        reason = `Plan "${plan.action_title}" overdue by ${daysOverdue} days — reassignment recommended`;
        corrective = "Reassign to available team member or escalate";
      }

      interventions.push({
        execution_plan_id: plan.id,
        intervention_type: type,
        trigger_reason: reason,
        previous_owner: plan.owner_user_id,
        corrective_action: corrective,
        auto_triggered: true,
      });
      continue;
    }

    if (plan.status === "in_progress") {
      const eventInfo = latestEventByPlan.get(plan.id);
      if (!eventInfo) {
        const ageDays = Math.floor((now.getTime() - new Date(plan.created_at).getTime()) / 86400000);
        if (ageDays > 3) {
          interventions.push({
            execution_plan_id: plan.id,
            intervention_type: "escalation",
            trigger_reason: `In-progress plan "${plan.action_title}" has ZERO recorded events over ${ageDays} days`,
            previous_owner: plan.owner_user_id,
            corrective_action: "Verify plan is actually being worked on. Consider reassignment.",
            auto_triggered: true,
          });
        }
      } else {
        const daysSinceActivity = Math.floor((now.getTime() - new Date(eventInfo.at).getTime()) / 86400000);
        if (daysSinceActivity > 7) {
          interventions.push({
            execution_plan_id: plan.id,
            intervention_type: "reassignment",
            trigger_reason: `No activity for ${daysSinceActivity} days on "${plan.action_title}" (${eventInfo.count} total events)`,
            previous_owner: plan.owner_user_id,
            corrective_action: "Reassign or escalate — extended inactivity indicates blocking issues",
            auto_triggered: true,
          });
        } else if (daysSinceActivity > 5) {
          interventions.push({
            execution_plan_id: plan.id,
            intervention_type: "escalation",
            trigger_reason: `No activity for ${daysSinceActivity} days on in-progress plan "${plan.action_title}"`,
            previous_owner: plan.owner_user_id,
            corrective_action: "Check with owner for blockers or reassign",
            auto_triggered: true,
          });
        }
      }
    }
  }

  let created = 0;
  let skipped = 0;
  if (interventions.length > 0) {
    const { data: result } = await supabase.rpc("exec_create_interventions_atomic", {
      _interventions: JSON.stringify(interventions),
      _org_id: orgId,
    });
    created = result?.created || 0;
    skipped = result?.skipped || 0;
  }

  return {
    data: { interventions_created: created, skipped, scanned: plans.length, run_id: runId, correlation_id: ctx.correlationId },
    logMeta: { runType: "scan_interventions", runId, processed: plans.length, created, meta: { skipped } },
  };
}

export async function resolveIntervention(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { intervention_id } = ctx.body;
  const { data: result } = await supabase.rpc("exec_resolve_intervention_atomic", {
    _intervention_id: intervention_id,
    _org_id: ctx.orgId,
    _actor_id: ctx.userId,
  });
  if (result && !result.success) return { data: result, status: 400 };
  return { data: result };
}

export async function reassignPlan(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { plan_id, new_owner_id, reason } = ctx.body;
  const { data: result } = await supabase.rpc("exec_reassign_plan_atomic", {
    _plan_id: plan_id,
    _org_id: ctx.orgId,
    _new_owner_id: new_owner_id,
    _actor_id: ctx.userId,
    _reason: (reason as string) || "Manual reassignment",
  });
  if (result && !result.success) return { data: result, status: 404 };
  return { data: result };
}

export async function getInterventions(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { data } = await supabase
    .from("execution_interventions")
    .select("*, execution_plans(action_title, status, priority, deadline)")
    .eq("organization_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(50);
  return { data: data || [] };
}
