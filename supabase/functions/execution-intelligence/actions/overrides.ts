/**
 * Bounded module: Executive Overrides & Governance
 * Handles executive_override, get_overrides, retention_cleanup
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ActionContext, ActionResult } from "./types.ts";
import { isValidUUID, isValidString } from "../../_shared/input-validation.ts";

export async function executeOverride(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { plan_id: ovPlanId, override_type, reason: ovReason, changes } = ctx.body;
  if (!isValidUUID(ovPlanId as string)) return { data: { error: "plan_id required" }, status: 400 };
  if (!isValidString(override_type as string, 30)) return { data: { error: "override_type required" }, status: 400 };
  if (!isValidString(ovReason as string, 500)) return { data: { error: "reason required" }, status: 400 };

  const validTypes = ["force_reassign", "force_cancel", "extend_deadline", "escalate", "mark_blocked"];
  if (!validTypes.includes(override_type as string)) {
    return { data: { error: `Invalid override_type. Must be: ${validTypes.join(", ")}` }, status: 400 };
  }

  // ENFORCED: Server-side elevated role check
  const { data: hasElevated } = await supabase.rpc("exec_require_elevated_role", {
    _user_id: ctx.userId,
    _org_id: ctx.orgId,
  });
  if (!hasElevated) {
    return { data: { error: "Executive overrides require owner or admin role. This action has been denied and logged." }, status: 403 };
  }

  // ENFORCED: Server-side step-up auth verification
  const { data: stepUpValid } = await supabase.rpc("exec_verify_step_up_auth", {
    _user_id: ctx.userId,
    _org_id: ctx.orgId,
    _validity_minutes: 5,
  });
  if (!stepUpValid) {
    return { data: { error: "Step-up re-authentication required. Please re-enter your password before performing executive overrides." }, status: 403 };
  }

  const { data: result } = await supabase.rpc("exec_log_override", {
    _plan_id: ovPlanId,
    _org_id: ctx.orgId,
    _actor_id: ctx.userId,
    _override_type: override_type,
    _reason: ovReason,
    _changes: changes || {},
  });

  if (result && !result.success) return { data: result, status: 400 };
  return { data: result };
}

export async function getOverrides(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { plan_id: ovFilterPlanId } = ctx.body;
  let query = supabase
    .from("execution_overrides")
    .select("*")
    .eq("organization_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (ovFilterPlanId && isValidUUID(ovFilterPlanId as string)) {
    query = query.eq("execution_plan_id", ovFilterPlanId as string);
  }

  const { data } = await query.limit(50);
  return { data: data || [] };
}

export async function retentionCleanup(ctx: ActionContext, supabase: SupabaseClient): Promise<ActionResult> {
  const { data: hasRole } = await supabase.rpc("exec_require_elevated_role", {
    _user_id: ctx.userId, _org_id: ctx.orgId,
  });
  if (!hasRole) return { data: { error: "Admin role required for retention cleanup" }, status: 403 };

  // ENFORCED: Step-up auth required for destructive retention cleanup
  const { data: stepUpValid } = await supabase.rpc("exec_verify_step_up_auth", {
    _user_id: ctx.userId,
    _org_id: ctx.orgId,
    _validity_minutes: 5,
  });
  if (!stepUpValid) {
    return { data: { error: "Step-up re-authentication required for retention cleanup." }, status: 403 };
  }

  const retainEvents = Math.max(30, Number(ctx.body.events_retain_days) || 180);
  const retainPredictions = Math.max(30, Number(ctx.body.predictions_retain_days) || 90);
  const retainScores = Math.max(90, Number(ctx.body.scores_retain_days) || 365);
  const retainRunLog = Math.max(30, Number(ctx.body.run_log_retain_days) || 90);

  const { data: result } = await supabase.rpc("exec_cleanup_old_data", {
    _events_retain_days: retainEvents,
    _predictions_retain_days: retainPredictions,
    _scores_retain_days: retainScores,
    _run_log_retain_days: retainRunLog,
  });

  await supabase.from("audit_log").insert({
    organization_id: ctx.orgId,
    actor_id: ctx.userId,
    actor_type: "user",
    action_type: "execution_retention_cleanup",
    resource_type: "execution_data",
    payload: { ...result, retain_days: { events: retainEvents, predictions: retainPredictions, scores: retainScores, run_log: retainRunLog } },
  });

  return { data: result || {} };
}
