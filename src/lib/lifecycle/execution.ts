/**
 * Post-decision execution — plan creation, outcome tracking, async tasks
 */
import { supabase } from "@/integrations/supabase/client";
import { captureError } from "@/lib/sentry";
import { writeAuditLog } from "./audit";
import { checkEvaluability } from "./evaluability";
import type { EvaluabilityResult } from "./evaluability";

interface PostApprovalParams {
  decisionId: string;
  organizationId: string;
  userId: string | null;
  recommendedAction: string;
  confidence: number | null;
  datasetId?: string | null;
  expectedMetric?: string | null;
  evaluationWindowDays?: number;
  suggestedOwner?: string | null;
  /** Pre-computed evaluability — if provided, skips redundant RPC call */
  evaluability?: EvaluabilityResult | null;
}

/**
 * Run after a decision is approved — creates:
 * 1. Audit log entry
 * 2. Execution plan
 * 3. Decision outcome (for learning loop)
 * 4. Async embedding + prediction (non-blocking)
 */
export async function onDecisionApproved(params: PostApprovalParams) {
  const {
    decisionId, organizationId, userId, recommendedAction, confidence,
    datasetId, expectedMetric, evaluationWindowDays = 30, suggestedOwner, evaluability: precomputedEval,
  } = params;

  // 0. Evaluability gate — run pre-check (reuse if already provided)
  let evalResult: EvaluabilityResult;
  try {
    evalResult = precomputedEval ?? await checkEvaluability(organizationId, datasetId ?? null, expectedMetric ?? null);
  } catch {
    evalResult = { status: "NOT_MEASURABLE", score: 0, maxScore: 3, hasDataset: false, hasMetric: false, dataPoints: 0, distinctDates: 0, resolvedDatasetId: null, resolvedMetric: null, reasons: ["Evaluability check failed"], suggestions: [] };
  }

  // 1. Audit log — includes evaluability metadata
  await writeAuditLog({
    organization_id: organizationId,
    actor_id: userId,
    action_type: "decision_approved",
    resource_type: "decision",
    resource_id: decisionId,
    payload: {
      recommended_action: recommendedAction,
      confidence_at_decision: confidence,
      dataset_id: datasetId ?? null,
      evaluability_status: evalResult.status,
      evaluability_score: evalResult.score,
      evaluability_reasons: evalResult.reasons,
    },
  });

  // 2. Execution plan
  try {
    await supabase.from("execution_plans").insert({
      decision_id: decisionId,
      organization_id: organizationId,
      action_title: recommendedAction.substring(0, 200),
      action_description: `Execution plan for: ${recommendedAction}`,
      owner_user_id: userId,
      priority: "medium",
      status: "pending",
      trigger_type: "manual",
      trigger_config: {
        suggested_owner: suggestedOwner ?? null,
        evaluation_window_days: evaluationWindowDays,
      },
    });
  } catch (err) {
    console.error("[lifecycle] Failed to create execution plan:", err);
    captureError(err instanceof Error ? err : new Error("Execution plan creation failed"), { decisionId, context: "onDecisionApproved" });
  }

  // 3. Decision outcome — GATED by evaluability
  if (evalResult.status !== "NOT_MEASURABLE") {
    try {
      const resolvedMetric = evalResult.resolvedMetric ?? expectedMetric ?? "unknown";
      const resolvedDataset = evalResult.resolvedDatasetId ?? datasetId ?? null;

      await supabase.from("decision_outcomes").insert({
        decision_id: decisionId,
        organization_id: organizationId,
        dataset_id: resolvedDataset,
        expected_metric: resolvedMetric,
        expected_direction: "increase",
        evaluation_window_days: evaluationWindowDays,
      });
    } catch (err) {
      console.error("[lifecycle] Failed to create decision outcome:", err);
      captureError(err instanceof Error ? err : new Error("Decision outcome creation failed"), { decisionId, context: "onDecisionApproved" });
    }
  } else {
    console.warn(`[lifecycle] Outcome scheduling blocked for decision ${decisionId}: ${evalResult.reasons.join("; ")}`);
  }

  // 4. Non-blocking async tasks
  try {
    supabase.functions.invoke("embed-decisions", {
      body: { organization_id: organizationId, mode: "specific", entity_ids: [decisionId] },
    }).catch((err) => {
      console.warn("[lifecycle] Embedding invocation failed:", err);
      captureError(err instanceof Error ? err : new Error("embed-decisions invocation failed"), { decisionId, context: "post-approval-embedding" });
    });

    supabase.functions.invoke("predict-outcome", {
      body: { organization_id: organizationId, decision_id: decisionId },
    }).catch((err) => {
      console.warn("[lifecycle] Prediction invocation failed:", err);
      captureError(err instanceof Error ? err : new Error("predict-outcome invocation failed"), { decisionId, context: "post-approval-prediction" });
    });
  } catch (err) {
    console.warn("[lifecycle] Non-critical post-approval task failed:", err);
    captureError(err instanceof Error ? err : new Error("Post-approval tasks failed"), { decisionId, context: "post-approval-async" });
  }
}

/** Log a decision dismissal to audit trail */
export async function onDecisionDismissed(params: {
  decisionId: string;
  organizationId: string;
  userId: string | null;
  reason: string;
  recommendedAction: string;
}) {
  await writeAuditLog({
    organization_id: params.organizationId,
    actor_id: params.userId,
    action_type: "decision_dismissed",
    resource_type: "decision",
    resource_id: params.decisionId,
    payload: {
      reason: params.reason,
      recommended_action: params.recommendedAction,
    },
  });
}

/** Log execution status change */
export async function onExecutionStatusChanged(params: {
  decisionId: string;
  organizationId: string;
  userId: string | null;
  newStatus: string;
}) {
  await writeAuditLog({
    organization_id: params.organizationId,
    actor_id: params.userId,
    action_type: `execution_${params.newStatus}`,
    resource_type: "decision",
    resource_id: params.decisionId,
    payload: { new_status: params.newStatus },
  });
}
