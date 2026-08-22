import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createSafeChannel } from "@/lib/realtime-channel";
import { useToast } from "@/hooks/use-toast";
import { getVerifiedAuth, authHeaders } from "@/lib/auth-helpers";
import { invokeWithRetry } from "@/lib/edge-function-retry";

export interface ExecutionPlan {
  id: string;
  decision_id: string;
  organization_id: string;
  action_title: string;
  action_description: string | null;
  owner_user_id: string | null;
  priority: string;
  deadline: string | null;
  status: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ExecutionEvent {
  id: string;
  execution_plan_id: string;
  organization_id: string;
  event_type: string;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ExecutionReceipt {
  id: string;
  execution_plan_id: string;
  decision_id: string;
  action_type: string;
  status: "claimed" | "succeeded" | "failed" | "uncertain";
  response_status: number | null;
  response_metadata: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  reconciled_at: string | null;
  reconciled_by: string | null;
  reconciliation_note: string | null;
  external_reference: string | null;
  attempt_count: number;
  max_attempts: number;
  last_attempt_at: string | null;
  last_retry_reason: string | null;
  retry_exhausted_at: string | null;
}

export interface ExecutionCompensationRequest {
  id: string;
  execution_plan_id: string;
  decision_id: string;
  original_receipt_id: string;
  compensation_type: string;
  status: "requested" | "approved" | "rejected" | "executing" | "succeeded" | "failed" | "uncertain";
  reason: string;
  compensation_config: Record<string, unknown>;
  evidence: Record<string, unknown>;
  requested_by: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  completed_at: string | null;
  external_reference: string | null;
}

export const useExecutionPlans = (organizationId: string | null, decisionId: string | null) => {
  const { toast } = useToast();
  const [plans, setPlans] = useState<ExecutionPlan[]>([]);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [receipts, setReceipts] = useState<ExecutionReceipt[]>([]);
  const [compensationRequests, setCompensationRequests] = useState<ExecutionCompensationRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearEvidence = useCallback(() => {
    setPlans([]);
    setEvents([]);
    setReceipts([]);
    setCompensationRequests([]);
  }, []);

  const requireAuth = useCallback(async () => {
    const auth = await getVerifiedAuth();
    if (auth) return auth;
    toast({ title: "Authentication required", description: "Your session could not be verified. Please sign in again.", variant: "destructive" });
    return null;
  }, [toast]);

  const fetchTimeline = useCallback(async () => {
    if (!organizationId || !decisionId) {
      clearEvidence();
      setError(null);
      setLoading(false);
      return;
    }

    // Clear previous decision/org evidence before loading the next verified
    // context. Stale execution state must never bridge tenants or decisions.
    clearEvidence();
    setError(null);
    setLoading(true);
    try {
      const auth = await getVerifiedAuth();
      if (!auth) throw new Error("Authentication could not be verified.");

      const { data, error: timelineError } = await invokeWithRetry<{ plans: ExecutionPlan[]; events: ExecutionEvent[] }>(
        "execute-decision-action",
        {
          body: { action: "get_timeline", organization_id: organizationId, decision_id: decisionId },
          headers: authHeaders(auth),
        },
      );

      if (timelineError) throw timelineError;
      if (!data || !Array.isArray(data.plans) || !Array.isArray(data.events)) {
        throw new Error("Execution timeline service returned an incomplete evidence payload.");
      }

      // Service-role-only execution records are exposed through tenant-checking
      // RPC projections. These are part of execution truth, so either projection
      // being unavailable degrades the whole timeline rather than becoming [].
      const [receiptResult, compensationResult] = await Promise.all([
        (supabase as any).rpc("list_execution_action_receipts", {
          p_organization_id: organizationId,
          p_decision_id: decisionId,
        }),
        (supabase as any).rpc("list_execution_compensation_requests", {
          p_organization_id: organizationId,
          p_decision_id: decisionId,
        }),
      ]);

      if (receiptResult.error) {
        throw new Error(`Execution receipts unavailable: ${receiptResult.error.message}`);
      }
      if (compensationResult.error) {
        throw new Error(`Compensation evidence unavailable: ${compensationResult.error.message}`);
      }
      if (!Array.isArray(receiptResult.data) || !Array.isArray(compensationResult.data)) {
        throw new Error("Execution evidence projections returned an invalid payload.");
      }

      setPlans(data.plans);
      setEvents(data.events);
      setReceipts(receiptResult.data as ExecutionReceipt[]);
      setCompensationRequests(compensationResult.data as ExecutionCompensationRequest[]);
      setError(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Execution evidence could not be verified.";
      console.error("Failed to fetch execution evidence:", e);
      clearEvidence();
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [organizationId, decisionId, clearEvidence]);

  useEffect(() => {
    void fetchTimeline();
  }, [fetchTimeline]);

  useEffect(() => {
    if (!organizationId || !decisionId) return;
    return createSafeChannel(`exec-plans-${organizationId}-${decisionId}`, (channel) =>
      channel.on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "execution_plans",
        filter: `decision_id=eq.${decisionId}`,
      }, () => {
        void fetchTimeline();
      })
      .subscribe()
    );
  }, [organizationId, decisionId, fetchTimeline]);

  const createPlan = useCallback(async (params: {
    action_title: string;
    action_description?: string;
    priority?: string;
    deadline?: string;
    trigger_type?: string;
    trigger_config?: Record<string, unknown>;
  }) => {
    if (!organizationId || !decisionId) return null;
    const auth = await requireAuth();
    if (!auth) return null;

    const { data, error: createError } = await invokeWithRetry("execute-decision-action", {
      body: {
        action: "create_plan",
        organization_id: organizationId,
        decision_id: decisionId,
        ...params,
      },
      headers: authHeaders(auth),
    });

    if (createError || !data) {
      toast({ title: "Failed to create action", description: createError?.message ?? "Execution service returned no creation confirmation.", variant: "destructive" });
      return null;
    }
    toast({ title: "Execution action created" });
    await fetchTimeline();
    return data;
  }, [organizationId, decisionId, toast, fetchTimeline, requireAuth]);

  const updatePlanStatus = useCallback(async (planId: string, status: string, notes?: string) => {
    if (!organizationId) return;
    const auth = await requireAuth();
    if (!auth) return;

    const previousPlans = plans;
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, status } : p));

    const { error: updateError } = await invokeWithRetry("execute-decision-action", {
      body: {
        action: "update_plan_status",
        organization_id: organizationId,
        plan_id: planId,
        status,
        notes,
      },
      headers: authHeaders(auth),
    });

    if (updateError) {
      setPlans(previousPlans);
      toast({ title: "Failed to update status", description: updateError.message, variant: "destructive" });
    } else {
      toast({ title: `Action marked as ${status}` });
      await fetchTimeline();
    }
  }, [organizationId, plans, toast, fetchTimeline, requireAuth]);

  const triggerWebhook = useCallback(async (planId: string, webhookUrl: string, payload?: Record<string, unknown>) => {
    if (!organizationId) return;
    const auth = await requireAuth();
    if (!auth) return;

    const idempotencyKey = crypto.randomUUID();

    const { data, error: webhookError } = await invokeWithRetry("execute-decision-action", {
      body: {
        action: "trigger_webhook",
        organization_id: organizationId,
        plan_id: planId,
        webhook_url: webhookUrl,
        payload,
        idempotency_key: idempotencyKey,
      },
      headers: authHeaders(auth),
    });

    if (webhookError || !(data as Record<string, unknown> | null)?.success) {
      toast({ title: "Webhook failed", description: webhookError?.message ?? "No successful execution receipt was returned.", variant: "destructive" });
    } else {
      toast({ title: "Webhook triggered successfully" });
    }
    await fetchTimeline();
  }, [organizationId, toast, fetchTimeline, requireAuth]);

  const notifySlack = useCallback(async (planId: string, channel: string, message: string) => {
    if (!organizationId) return;
    const auth = await requireAuth();
    if (!auth) return;

    const idempotencyKey = crypto.randomUUID();

    const { data, error: slackError } = await invokeWithRetry("execute-decision-action", {
      body: {
        action: "notify_slack",
        organization_id: organizationId,
        plan_id: planId,
        channel,
        message,
        idempotency_key: idempotencyKey,
      },
      headers: authHeaders(auth),
    });

    if (slackError || !(data as Record<string, unknown> | null)?.success) {
      toast({ title: "Slack notification failed", description: slackError?.message ?? "No successful execution receipt was returned.", variant: "destructive" });
    } else {
      toast({ title: "Slack notification sent" });
    }
    await fetchTimeline();
  }, [organizationId, toast, fetchTimeline, requireAuth]);

  const reconcileReceipt = useCallback(async (
    receiptId: string,
    resolution: "succeeded" | "failed",
    note: string,
    externalReference?: string,
  ) => {
    if (!organizationId) return null;
    const auth = await requireAuth();
    if (!auth) return null;

    const normalizedNote = note.trim();
    if (normalizedNote.length < 10) {
      toast({
        title: "Reconciliation evidence required",
        description: "Describe the external evidence in at least 10 characters.",
        variant: "destructive",
      });
      return null;
    }

    const { data, error: reconcileError } = await (supabase as any).rpc(
      "reconcile_execution_action_receipt",
      {
        p_organization_id: organizationId,
        p_receipt_id: receiptId,
        p_resolution: resolution,
        p_note: normalizedNote,
        p_external_reference: externalReference?.trim() || null,
      },
    );

    if (reconcileError || !data) {
      toast({ title: "Reconciliation failed", description: reconcileError?.message ?? "No reconciliation confirmation was returned.", variant: "destructive" });
      return null;
    }

    toast({ title: `Execution receipt reconciled as ${resolution}` });
    await fetchTimeline();
    return data;
  }, [organizationId, toast, fetchTimeline, requireAuth]);

  const requestCompensation = useCallback(async (params: {
    receiptId: string;
    reason: string;
    webhookUrl: string;
    payload: Record<string, unknown>;
    evidence?: Record<string, unknown>;
  }) => {
    if (!organizationId) return null;
    const auth = await requireAuth();
    if (!auth) return null;

    const reason = params.reason.trim();
    const webhookUrl = params.webhookUrl.trim();
    if (reason.length < 10 || !webhookUrl.startsWith("https://")) {
      toast({
        title: "Compensation contract incomplete",
        description: "Provide a clear reason and an HTTPS compensation webhook.",
        variant: "destructive",
      });
      return null;
    }

    const { data, error: compensationError } = await (supabase as any).rpc("request_execution_compensation", {
      p_organization_id: organizationId,
      p_receipt_id: params.receiptId,
      p_compensation_type: "webhook",
      p_reason: reason,
      p_compensation_config: {
        webhook_url: webhookUrl,
        payload: params.payload,
      },
      p_evidence: params.evidence || {},
    });

    if (compensationError || !data) {
      toast({ title: "Compensation request failed", description: compensationError?.message ?? "No compensation request confirmation was returned.", variant: "destructive" });
      return null;
    }

    toast({ title: "Compensation submitted for independent review" });
    await fetchTimeline();
    return data;
  }, [organizationId, toast, fetchTimeline, requireAuth]);

  const reviewCompensation = useCallback(async (
    requestId: string,
    decision: "approved" | "rejected",
    note: string,
  ) => {
    if (!organizationId) return null;
    const auth = await requireAuth();
    if (!auth) return null;

    const normalizedNote = note.trim();
    if (normalizedNote.length < 10) {
      toast({
        title: "Review evidence required",
        description: "Record the approval or rejection rationale in at least 10 characters.",
        variant: "destructive",
      });
      return null;
    }

    const { data, error: reviewError } = await (supabase as any).rpc("review_execution_compensation", {
      p_organization_id: organizationId,
      p_request_id: requestId,
      p_decision: decision,
      p_note: normalizedNote,
    });

    if (reviewError || !data) {
      toast({ title: "Compensation review failed", description: reviewError?.message ?? "No compensation review confirmation was returned.", variant: "destructive" });
      return null;
    }

    toast({ title: `Compensation ${decision}` });
    await fetchTimeline();
    return data;
  }, [organizationId, toast, fetchTimeline, requireAuth]);

  const completionRate = plans.length > 0
    ? plans.filter(p => p.status === "completed").length / plans.length
    : 0;
  const uncertainReceipts = receipts.filter(receipt => receipt.status === "uncertain");
  const exhaustedReceipts = receipts.filter(receipt => receipt.retry_exhausted_at !== null);
  const pendingCompensations = compensationRequests.filter(request => request.status === "requested");
  const approvedCompensations = compensationRequests.filter(request => request.status === "approved");
  const uncertainCompensations = compensationRequests.filter(request => request.status === "uncertain");
  const evidenceReady = Boolean(organizationId && decisionId && !loading && !error);

  return {
    plans,
    events,
    receipts,
    uncertainReceipts,
    exhaustedReceipts,
    compensationRequests,
    pendingCompensations,
    approvedCompensations,
    uncertainCompensations,
    loading,
    error,
    evidenceReady,
    createPlan,
    updatePlanStatus,
    triggerWebhook,
    notifySlack,
    reconcileReceipt,
    requestCompensation,
    reviewCompensation,
    refresh: fetchTimeline,
    completionRate,
  };
};
