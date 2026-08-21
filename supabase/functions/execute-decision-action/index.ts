import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { isValidUUID, isValidString, isValidEnum, validateCreatePlan, validationErrorResponse } from "../_shared/input-validation.ts";
import {
  claimExecutionReceipt,
  completeExecutionReceipt,
  validateIdempotencyKey,
  type ExecutionReceipt,
} from "./idempotency.ts";
import {
  classifyHttpOutcome,
  dispatchWithBoundedRateLimitRetries,
} from "./retry-policy.ts";

/** Require owner/admin role for sensitive execution actions */
async function requirePrivilegedRole(
  supabase: any,
  userId: string,
  organizationId: string,
  corsHdrs: Record<string, string>,
  allowedRoles: string[] = ["owner", "admin"]
): Promise<Response | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .single();

  if (!data || !allowedRoles.includes(data.role)) {
    return new Response(JSON.stringify({ error: "Insufficient permissions. Requires: " + allowedRoles.join(", ") }), {
      status: 403,
      headers: { ...corsHdrs, "Content-Type": "application/json" },
    });
  }
  return null;
}

/**
 * Fail closed before any outbound side effect.
 *
 * The database lifecycle gate only allows a decision to become `executable`
 * after all required approval-chain stages are satisfied. Because this Edge
 * Function uses the service role, it must explicitly preserve the same tenant
 * and governance boundary before calling an external system.
 */
async function requireExecutablePlan(
  supabase: any,
  planId: unknown,
  organizationId: string,
  userId: string,
  actionName: string,
  corsHdrs: Record<string, string>,
): Promise<{ plan?: { id: string; decision_id: string; status: string }; response?: Response }> {
  if (!isValidUUID(planId)) {
    return {
      response: new Response(JSON.stringify({ error: "plan_id must be a valid UUID" }), {
        status: 400,
        headers: { ...corsHdrs, "Content-Type": "application/json" },
      }),
    };
  }

  const { data: plan, error: planError } = await supabase
    .from("execution_plans")
    .select("id, decision_id, status")
    .eq("id", planId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (planError || !plan) {
    return {
      response: new Response(JSON.stringify({ error: "Execution plan not found" }), {
        status: 404,
        headers: { ...corsHdrs, "Content-Type": "application/json" },
      }),
    };
  }

  if (!["pending", "in_progress"].includes(plan.status)) {
    await supabase.from("execution_events").insert({
      execution_plan_id: plan.id,
      organization_id: organizationId,
      event_type: "outbound_action_blocked",
      actor_id: userId,
      metadata: { action: actionName, reason: "plan_not_active", plan_status: plan.status },
    });

    return {
      response: new Response(JSON.stringify({
        error: `Execution plan is ${plan.status}; outbound actions require pending or in_progress status`,
      }), {
        status: 409,
        headers: { ...corsHdrs, "Content-Type": "application/json" },
      }),
    };
  }

  const { data: decision, error: decisionError } = await supabase
    .from("decision_ledger")
    .select("id, decision_status")
    .eq("id", plan.decision_id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (decisionError || !decision) {
    await supabase.from("execution_events").insert({
      execution_plan_id: plan.id,
      organization_id: organizationId,
      event_type: "outbound_action_blocked",
      actor_id: userId,
      metadata: { action: actionName, reason: "parent_decision_not_found" },
    });

    return {
      response: new Response(JSON.stringify({ error: "Parent decision not found in organization" }), {
        status: 409,
        headers: { ...corsHdrs, "Content-Type": "application/json" },
      }),
    };
  }

  if (decision.decision_status !== "executable") {
    await supabase.from("execution_events").insert({
      execution_plan_id: plan.id,
      organization_id: organizationId,
      event_type: "outbound_action_blocked",
      actor_id: userId,
      metadata: {
        action: actionName,
        reason: "decision_not_executable",
        decision_status: decision.decision_status,
      },
    });

    await supabase.from("audit_log").insert({
      organization_id: organizationId,
      actor_id: userId,
      actor_type: "user",
      action_type: "outbound_execution_blocked",
      resource_type: "execution_plan",
      resource_id: plan.id,
      payload: {
        action: actionName,
        reason: "decision_not_executable",
        decision_id: plan.decision_id,
        decision_status: decision.decision_status,
      },
    });

    return {
      response: new Response(JSON.stringify({
        error: "Decision is not executable. Required approvals and governance gates must complete before outbound execution.",
        decision_status: decision.decision_status,
      }), {
        status: 409,
        headers: { ...corsHdrs, "Content-Type": "application/json" },
      }),
    };
  }

  return { plan };
}

function replayReceiptResponse(receipt: ExecutionReceipt, corsHdrs: Record<string, string>): Response {
  if (receipt.status === "succeeded") {
    return new Response(JSON.stringify({
      success: true,
      idempotent_replay: true,
      execution_status: receipt.status,
      status_code: receipt.response_status,
      data: receipt.response_metadata,
    }), {
      status: 200,
      headers: { ...corsHdrs, "Content-Type": "application/json" },
    });
  }

  if (receipt.status === "claimed") {
    return new Response(JSON.stringify({
      success: false,
      idempotent_replay: true,
      execution_status: receipt.status,
      message: "This outbound execution intent is already in progress; duplicate dispatch was suppressed.",
    }), {
      status: 202,
      headers: { ...corsHdrs, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    success: false,
    idempotent_replay: true,
    execution_status: receipt.status,
    status_code: receipt.response_status,
    error: receipt.status === "uncertain"
      ? "The previous outbound attempt has an uncertain result. Reconcile the external system before issuing a new execution intent."
      : (receipt.error_message || "The previous outbound attempt failed. Issue a new intent only after reviewing the recorded result."),
    data: receipt.response_metadata,
  }), {
    status: 409,
    headers: { ...corsHdrs, "Content-Type": "application/json" },
  });
}

async function logIdempotentSuppression(
  supabase: any,
  organizationId: string,
  planId: string,
  userId: string,
  actionType: string,
  receipt: ExecutionReceipt,
) {
  await supabase.from("execution_events").insert({
    execution_plan_id: planId,
    organization_id: organizationId,
    event_type: "outbound_action_duplicate_suppressed",
    actor_id: userId,
    metadata: {
      action: actionType,
      idempotency_key: receipt.idempotency_key,
      receipt_status: receipt.status,
      receipt_id: receipt.id,
    },
  });
}

async function logIdempotencyConflict(
  supabase: any,
  organizationId: string,
  planId: string,
  userId: string,
  actionType: string,
  idempotencyKey: string,
  receipt: ExecutionReceipt,
) {
  await supabase.from("audit_log").insert({
    organization_id: organizationId,
    actor_id: userId,
    actor_type: "user",
    action_type: "outbound_execution_idempotency_conflict",
    resource_type: "execution_plan",
    resource_id: planId,
    payload: {
      action: actionType,
      idempotency_key: idempotencyKey,
      existing_receipt_id: receipt.id,
      existing_action_type: receipt.action_type,
      existing_execution_plan_id: receipt.execution_plan_id,
    },
  });
}

/** Validate webhook URL against org-approved destinations */
async function validateWebhookUrl(
  supabase: any,
  organizationId: string,
  url: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const blocked = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^0\./,
      /^169\.254\./,
      /^\[::1\]$/,
      /^metadata\.google/,
      /^169\.254\.169\.254/,
    ];

    if (blocked.some(r => r.test(hostname))) {
      return { allowed: false, reason: "Internal/private addresses are not allowed" };
    }

    if (parsed.protocol !== "https:") {
      return { allowed: false, reason: "Only HTTPS webhook URLs are allowed" };
    }
  } catch {
    return { allowed: false, reason: "Invalid URL format" };
  }

  const { data: configs } = await supabase
    .from("connector_configs")
    .select("host")
    .eq("organization_id", organizationId)
    .eq("connector_type", "webhook");

  if (!configs || configs.length === 0) {
    return { allowed: false, reason: "No approved webhook destinations configured for this organization" };
  }

  const allowedHosts = configs.map((c: any) => c.host?.toLowerCase()).filter(Boolean);
  const parsedHost = new URL(url).hostname.toLowerCase();
  if (!allowedHosts.some((h: string) => parsedHost === h || parsedHost.endsWith("." + h))) {
    return { allowed: false, reason: `Domain not in approved webhook destinations. Approved: ${allowedHosts.join(", ")}` };
  }

  return { allowed: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;
  const userId = auth.userId;

  const body = await req.json();
  const { action, organization_id, decision_id, ...params } = body;

  if (!isValidUUID(organization_id)) {
    return new Response(JSON.stringify({ error: "organization_id must be a valid UUID" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!isValidString(action, 50)) {
    return new Response(JSON.stringify({ error: "action is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const isMember = await verifyOrgMembership(userId, organization_id);
  if (!isMember) {
    return new Response(JSON.stringify({ error: "Not a member of this organization" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    switch (action) {
      case "create_plan": {
        const validated = validateCreatePlan({ ...params, decision_id });
        if (!validated.success) {
          return validationErrorResponse(validated.errors!, corsHeaders);
        }
        const { action_title, action_description, owner_user_id, priority, deadline, trigger_type, trigger_config } = validated.data!;

        const { data: plan, error } = await supabase
          .from("execution_plans")
          .insert({
            decision_id: validated.data!.decision_id,
            organization_id,
            action_title,
            action_description,
            owner_user_id: owner_user_id || userId,
            priority,
            deadline,
            trigger_type,
            trigger_config,
            status: "pending",
          })
          .select()
          .single();

        if (error) throw error;

        await supabase.from("execution_events").insert({
          execution_plan_id: plan.id,
          organization_id,
          event_type: "plan_created",
          actor_id: userId,
          metadata: { action_title: plan.action_title, priority },
        });

        await supabase.from("audit_log").insert({
          organization_id,
          actor_id: userId,
          actor_type: "user",
          action_type: "execution_plan_created",
          resource_type: "execution_plan",
          resource_id: plan.id,
          payload: { decision_id, action_title: plan.action_title },
        });

        return new Response(JSON.stringify(plan), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_plan_status": {
        const { plan_id, status, notes } = params;
        if (!plan_id || !status) {
          return new Response(JSON.stringify({ error: "plan_id and status required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const validStatuses = ["pending", "in_progress", "completed", "failed", "cancelled"];
        if (!validStatuses.includes(status)) {
          return new Response(JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: currentPlan, error: fetchErr } = await supabase
          .from("execution_plans")
          .select("status, decision_id")
          .eq("id", plan_id)
          .eq("organization_id", organization_id)
          .single();

        if (fetchErr || !currentPlan) {
          return new Response(JSON.stringify({ error: "Plan not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const previousStatus = currentPlan.status;
        const { data: updatedPlan, error } = await supabase
          .from("execution_plans")
          .update({ status })
          .eq("id", plan_id)
          .eq("organization_id", organization_id)
          .select()
          .single();

        if (error) throw error;

        await supabase.from("execution_events").insert({
          execution_plan_id: plan_id,
          organization_id,
          event_type: `status_${status}`,
          actor_id: userId,
          metadata: { previous_status: previousStatus, new_status: status, notes: notes ? String(notes).slice(0, 1000) : null },
        });

        await supabase.from("audit_log").insert({
          organization_id,
          actor_id: userId,
          actor_type: "user",
          action_type: "execution_plan_status_changed",
          resource_type: "execution_plan",
          resource_id: plan_id,
          payload: { previous_status: previousStatus, new_status: status, notes: notes ? String(notes).slice(0, 1000) : null },
        });

        const { data: allPlans } = await supabase
          .from("execution_plans")
          .select("status")
          .eq("decision_id", currentPlan.decision_id)
          .eq("organization_id", organization_id);

        if (allPlans && allPlans.length > 0) {
          const allDone = allPlans.every((p: any) => p.status === "completed" || p.status === "cancelled");
          const anyInProgress = allPlans.some((p: any) => p.status === "in_progress");
          const anyFailed = allPlans.some((p: any) => p.status === "failed");

          let newExecStatus = "not_started";
          if (allDone) newExecStatus = "completed";
          else if (anyFailed) newExecStatus = "blocked";
          else if (anyInProgress) newExecStatus = "in_progress";

          await supabase
            .from("decision_ledger")
            .update({
              execution_status: newExecStatus,
              ...(newExecStatus === "in_progress" ? { execution_started_at: new Date().toISOString() } : {}),
              ...(newExecStatus === "completed" ? { execution_completed_at: new Date().toISOString() } : {}),
            })
            .eq("id", currentPlan.decision_id);
        }

        return new Response(JSON.stringify(updatedPlan), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "trigger_webhook": {
        const { plan_id, webhook_url, payload, idempotency_key } = params;
        if (!plan_id || !webhook_url) {
          return new Response(JSON.stringify({ error: "plan_id and webhook_url required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!validateIdempotencyKey(idempotency_key)) {
          return new Response(JSON.stringify({ error: "A valid idempotency_key (16-200 safe characters) is required for outbound execution" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const roleCheck = await requirePrivilegedRole(supabase, userId, organization_id, corsHeaders, ["owner", "admin"]);
        if (roleCheck) return roleCheck;

        const executionGate = await requireExecutablePlan(
          supabase,
          plan_id,
          organization_id,
          userId,
          "trigger_webhook",
          corsHeaders,
        );
        if (executionGate.response) return executionGate.response;
        const plan = executionGate.plan!;

        const validation = await validateWebhookUrl(supabase, organization_id, webhook_url);
        if (!validation.allowed) {
          await supabase.from("execution_events").insert({
            execution_plan_id: plan_id,
            organization_id,
            event_type: "webhook_blocked",
            actor_id: userId,
            metadata: { webhook_url, reason: validation.reason },
          });
          return new Response(JSON.stringify({ error: `Webhook blocked: ${validation.reason}` }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const claim = await claimExecutionReceipt(supabase, {
          organizationId: organization_id,
          executionPlanId: plan.id,
          decisionId: plan.decision_id,
          actionType: "trigger_webhook",
          idempotencyKey: idempotency_key,
          initiatedBy: userId,
          request: {
            action: "trigger_webhook",
            plan_id: plan.id,
            webhook_url,
            payload: payload || {},
          },
        });

        if (claim.kind === "conflict") {
          await logIdempotencyConflict(supabase, organization_id, plan.id, userId, "trigger_webhook", idempotency_key, claim.receipt);
          return new Response(JSON.stringify({ error: "idempotency_key is already bound to a different execution intent" }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (claim.kind === "replay") {
          await logIdempotentSuppression(supabase, organization_id, plan.id, userId, "trigger_webhook", claim.receipt);
          return replayReceiptResponse(claim.receipt, corsHeaders);
        }

        const receipt = claim.receipt;

        try {
          const dispatch = await dispatchWithBoundedRateLimitRetries({
            supabase,
            receiptId: receipt.id,
            executionPlanId: plan.id,
            organizationId: organization_id,
            actorId: userId,
            actionType: "trigger_webhook",
            request: async () => {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 15000);
              try {
                return await fetch(webhook_url, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": idempotency_key,
                  },
                  body: JSON.stringify(payload || {}),
                  signal: controller.signal,
                });
              } finally {
                clearTimeout(timeout);
              }
            },
          });

          const webhookResp = dispatch.response;
          const outcome = classifyHttpOutcome(webhookResp.status);
          const success = outcome === "success";
          const uncertain = outcome === "uncertain";
          const finalStatus = success ? "succeeded" : uncertain ? "uncertain" : "failed";

          await completeExecutionReceipt(supabase, receipt.id, finalStatus, {
            responseStatus: webhookResp.status,
            responseMetadata: {
              webhook_url,
              status_code: webhookResp.status,
              success,
              uncertain,
              attempts: dispatch.attempts,
              retry_exhausted: dispatch.retryExhausted,
            },
            errorMessage: success ? null : uncertain
              ? `Webhook outcome is uncertain after HTTP ${webhookResp.status}; external reconciliation required`
              : `Webhook returned HTTP ${webhookResp.status}`,
          });

          await supabase.from("execution_events").insert({
            execution_plan_id: plan_id,
            organization_id,
            event_type: success ? "webhook_success" : uncertain ? "webhook_uncertain" : "webhook_failed",
            actor_id: userId,
            metadata: {
              webhook_url,
              status_code: webhookResp.status,
              success,
              uncertain,
              receipt_id: receipt.id,
              attempts: dispatch.attempts,
              retry_exhausted: dispatch.retryExhausted,
            },
          });

          await supabase.from("audit_log").insert({
            organization_id,
            actor_id: userId,
            actor_type: "user",
            action_type: uncertain ? "webhook_outcome_uncertain" : "webhook_triggered",
            resource_type: "execution_plan",
            resource_id: plan_id,
            payload: {
              webhook_url,
              status_code: webhookResp.status,
              success,
              uncertain,
              receipt_id: receipt.id,
              attempts: dispatch.attempts,
              retry_exhausted: dispatch.retryExhausted,
            },
          });

          return new Response(JSON.stringify({
            success,
            uncertain,
            status_code: webhookResp.status,
            receipt_id: receipt.id,
            attempts: dispatch.attempts,
            retry_exhausted: dispatch.retryExhausted,
          }), {
            status: uncertain ? 502 : 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (e) {
          const message = (e as Error).message;
          await completeExecutionReceipt(supabase, receipt.id, "uncertain", {
            errorMessage: message,
            responseMetadata: { webhook_url, uncertain: true },
          }).catch((receiptError) => console.error("Failed to mark webhook receipt uncertain:", receiptError));

          await supabase.from("execution_events").insert({
            execution_plan_id: plan_id,
            organization_id,
            event_type: "webhook_uncertain",
            actor_id: userId,
            metadata: { webhook_url, error: message, receipt_id: receipt.id },
          });
          return new Response(JSON.stringify({ success: false, uncertain: true, receipt_id: receipt.id, error: message }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      case "notify_slack": {
        const { plan_id, channel, message, idempotency_key } = params;

        if (!plan_id) {
          return new Response(JSON.stringify({ error: "plan_id is required for governed Slack execution" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!validateIdempotencyKey(idempotency_key)) {
          return new Response(JSON.stringify({ error: "A valid idempotency_key (16-200 safe characters) is required for outbound execution" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const roleCheck = await requirePrivilegedRole(supabase, userId, organization_id, corsHeaders, ["owner", "admin"]);
        if (roleCheck) return roleCheck;

        const executionGate = await requireExecutablePlan(
          supabase,
          plan_id,
          organization_id,
          userId,
          "notify_slack",
          corsHeaders,
        );
        if (executionGate.response) return executionGate.response;
        const plan = executionGate.plan!;

        if (!channel || typeof channel !== "string" || !channel.trim()) {
          return new Response(JSON.stringify({ error: "Slack channel is required. No default channel allowed." }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!message || typeof message !== "string" || !message.trim()) {
          return new Response(JSON.stringify({ error: "Message content is required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");

        if (!LOVABLE_API_KEY || !SLACK_API_KEY) {
          return new Response(JSON.stringify({ error: "Slack not configured for this organization" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const normalizedChannel = channel.trim();
        const normalizedMessage = message.trim().slice(0, 4000);
        const claim = await claimExecutionReceipt(supabase, {
          organizationId: organization_id,
          executionPlanId: plan.id,
          decisionId: plan.decision_id,
          actionType: "notify_slack",
          idempotencyKey: idempotency_key,
          initiatedBy: userId,
          request: {
            action: "notify_slack",
            plan_id: plan.id,
            channel: normalizedChannel,
            message: normalizedMessage,
          },
        });

        if (claim.kind === "conflict") {
          await logIdempotencyConflict(supabase, organization_id, plan.id, userId, "notify_slack", idempotency_key, claim.receipt);
          return new Response(JSON.stringify({ error: "idempotency_key is already bound to a different execution intent" }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (claim.kind === "replay") {
          await logIdempotentSuppression(supabase, organization_id, plan.id, userId, "notify_slack", claim.receipt);
          return replayReceiptResponse(claim.receipt, corsHeaders);
        }

        const receipt = claim.receipt;
        const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

        try {
          const dispatch = await dispatchWithBoundedRateLimitRetries({
            supabase,
            receiptId: receipt.id,
            executionPlanId: plan.id,
            organizationId: organization_id,
            actorId: userId,
            actionType: "notify_slack",
            request: async () => {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 15000);
              try {
                return await fetch(`${GATEWAY_URL}/chat.postMessage`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${LOVABLE_API_KEY}`,
                    "X-Connection-Api-Key": SLACK_API_KEY,
                    "Content-Type": "application/json",
                    "Idempotency-Key": idempotency_key,
                  },
                  body: JSON.stringify({
                    channel: normalizedChannel,
                    text: normalizedMessage,
                  }),
                  signal: controller.signal,
                });
              } finally {
                clearTimeout(timeout);
              }
            },
          });

          const resp = dispatch.response;
          let data: Record<string, unknown> = {};
          try {
            data = await resp.json();
          } catch {
            data = { parse_error: true };
          }

          const httpOutcome = classifyHttpOutcome(resp.status);
          const uncertain = httpOutcome === "uncertain";
          const success = httpOutcome === "success" && data?.ok !== false;
          const finalStatus = success ? "succeeded" : uncertain ? "uncertain" : "failed";

          await completeExecutionReceipt(supabase, receipt.id, finalStatus, {
            responseStatus: resp.status,
            responseMetadata: {
              channel: normalizedChannel,
              success,
              uncertain,
              response_ok: data?.ok ?? null,
              attempts: dispatch.attempts,
              retry_exhausted: dispatch.retryExhausted,
            },
            errorMessage: success ? null : uncertain
              ? `Slack outcome is uncertain after HTTP ${resp.status}; external reconciliation required`
              : `Slack gateway returned HTTP ${resp.status}`,
          });

          await supabase.from("execution_events").insert({
            execution_plan_id: plan_id,
            organization_id,
            event_type: success ? "slack_sent" : uncertain ? "slack_uncertain" : "slack_failed",
            actor_id: userId,
            metadata: {
              channel: normalizedChannel,
              success,
              uncertain,
              response_ok: data?.ok,
              receipt_id: receipt.id,
              attempts: dispatch.attempts,
              retry_exhausted: dispatch.retryExhausted,
            },
          });

          await supabase.from("audit_log").insert({
            organization_id,
            actor_id: userId,
            actor_type: "user",
            action_type: uncertain ? "slack_outcome_uncertain" : "slack_notification_sent",
            resource_type: "execution_plan",
            resource_id: plan_id,
            payload: {
              channel: normalizedChannel,
              success,
              uncertain,
              receipt_id: receipt.id,
              attempts: dispatch.attempts,
              retry_exhausted: dispatch.retryExhausted,
            },
          });

          return new Response(JSON.stringify({
            success,
            uncertain,
            data,
            receipt_id: receipt.id,
            attempts: dispatch.attempts,
            retry_exhausted: dispatch.retryExhausted,
          }), {
            status: uncertain ? 502 : 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (e) {
          const message = (e as Error).message;
          await completeExecutionReceipt(supabase, receipt.id, "uncertain", {
            errorMessage: message,
            responseMetadata: { channel: normalizedChannel, uncertain: true },
          }).catch((receiptError) => console.error("Failed to mark Slack receipt uncertain:", receiptError));

          await supabase.from("execution_events").insert({
            execution_plan_id: plan_id,
            organization_id,
            event_type: "slack_uncertain",
            actor_id: userId,
            metadata: { channel: normalizedChannel, error: message, receipt_id: receipt.id },
          });

          return new Response(JSON.stringify({ success: false, uncertain: true, receipt_id: receipt.id, error: message }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      case "get_timeline": {
        if (!decision_id) {
          return new Response(JSON.stringify({ error: "decision_id required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: plans } = await supabase
          .from("execution_plans")
          .select("*")
          .eq("decision_id", decision_id)
          .eq("organization_id", organization_id)
          .order("created_at", { ascending: true });

        const planIds = (plans || []).map((p: any) => p.id);
        let events: any[] = [];
        if (planIds.length > 0) {
          const { data: evts } = await supabase
            .from("execution_events")
            .select("*")
            .in("execution_plan_id", planIds)
            .eq("organization_id", organization_id)
            .order("created_at", { ascending: true });
          events = evts || [];
        }

        return new Response(JSON.stringify({ plans: plans || [], events }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    console.error("execute-decision-action error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
