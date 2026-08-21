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

  const fetchTimeline = useCallback(async () => {
    if (!organizationId || !decisionId) return;
    setLoading(true);
    try {
      const auth = await getVerifiedAuth();
      if (!auth) return;

      const { data, error } = await invokeWithRetry<{ plans: ExecutionPlan[]; events: ExecutionEvent[] }>(
        "execute-decision-action",
        {
          body: { action: "get_timeline", organization_id: organizationId, decision_id: decisionId },
          headers: authHeaders(auth),
        },
      );

      if (error) throw error;
      setPlans(data?.plans || []);
      setEvents(data?.events || []);

      // Service-role-only execution records are exposed through tenant-checking RPC projections.
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
        console.error("Failed to fetch execution receipts:", receiptResult.error);
        setReceipts([]);
      } else {
        setReceipts(Array.isArray(receiptResult.data) ? receiptResult.data as ExecutionReceipt[] : []);
      }

      if (compensationResult.error) {
        console.error("Failed to fetch compensation requests:", compensationResult.error);
        setCompensationRequests([]);
      } else {
        setCompensationRequests(
          Array.isArray(compensationResult.data)
            ? compensationResult.data as ExecutionCompensationRequest[]
            : [],
        );
      }
    } catch (e: unknown) {
      console.error("Failed to fetch timeline:", e);
    } finally {
      setLoading(false);
    }
  }, [organizationId, decisionId]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  useEffect(() => {
    if (!decisionId) return;
    return createSafeChannel(`exec-plans-${decisionId}`, (channel) =>
      channel.on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "execution_plans",
        filter: `decision_id=eq.${decisionId}`,
      }, () => {
        fetchTimeline();
      })
      .subscribe()
    );
  }, [decisionId, fetchTimeline]);

  const createPlan = useCallback(async (params: {
    action_title: string;
    action_description?: string;
    priority?: string;
    deadline?: string;
    trigger_type?: string;
    trigger_config?: Record<string, unknown>;
  }) => {
    if (!organizationId || !decisionId) return null;
    const auth = await getVerifiedAuth();
    if (!auth) return null;

    const { data, error } = await invokeWithRetry("execute-decision-action", {
      body: {
        action: "create_plan",
        organization_id: organizationId,
        decision_id: decisionId,
        ...params,
      },
      headers: authHeaders(auth),
    });

    if (error) {
      toast({ title: "Failed to create action", description: error.message, variant: "destructive" });
      return null;
    }
    toast({ title: "Execution action created" });
    fetchTimeline();
    return data;
  }, [organizationId, decisionId, toast, fetchTimeline]);

  const updatePlanStatus = useCallback(async (planId: string, status: string, notes?: string) => {
    if (!organizationId) return;
    const auth = await getVerifiedAuth();
    if (!auth) return;

    const previousPlans = plans;
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, status } : p));

    const { error } = await invokeWithRetry("execute-decision-action", {
      body: {
        action: "update_plan_status",
        organization_id: organizationId,
        plan_id: planId,
        status,
        notes,
      },
      headers: authHeaders(auth),
    });

    if (error) {
      setPlans(previousPlans);
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Action marked as ${status}` });
      fetchTimeline();
    }
  }, [organizationId, plans, toast, fetchTimeline]);

  const triggerWebhook = useCallback(async (planId: string, webhookUrl: string, payload?: Record<string, unknown>) => {
    if (!organizationId) return;
    const auth = await getVerifiedAuth();
    if (!auth) return;

    const idempotencyKey = crypto.randomUUID();

    const { data, error } = await invokeWithRetry("execute-decision-action", {
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

    if (error || !(data as Record<string, unknown>)?.success) {
      toast({ title: "Webhook failed", variant: "destructive" });
    } else {
      toast({ title: "Webhook triggered successfully" });
    }
    fetchTimeline();
  }, [organizationId, toast, fetchTimeline]);

  const notifySlack = useCallback(async (planId: string, channel: string, message: string) => {
    if (!organizationId) return;
    const auth = await getVerifiedAuth();
    if (!auth) return;

    const idempotencyKey = crypto.randomUUID();

    const { data, error } = await invokeWithRetry("execute-decision-action", {
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

    if (error || !(data as Record<string, unknown>)?.success) {
      toast({ title: "Slack notification failed", variant: "destructive" });
    } else {
      toast({ title: "Slack notification sent" });
    }
    fetchTimeline();
  }, [organizationId, toast, fetchTimeline]);

  const reconcileReceipt = useCallback(async (
    receiptId: string,
    resolution: "succeeded" | "failed",
    note: string,
    externalReference?: string,
  ) => {
    if (!organizationId) return null;
    const auth = await getVerifiedAuth();
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

    const { data, error } = await (supabase as any).rpc(
      "reconcile_execution_action_receipt",
      {
        p_organization_id: organizationId,
        p_receipt_id: receiptId,
        p_resolution: resolution,
        p_note: normalizedNote,
        p_external_reference: externalReference?.trim() || null,
      },
    );

    if (error) {
      toast({ title: "Reconciliation failed", description: error.message, variant: "destructive" });
      return null;
    }

    toast({ title: `Execution receipt reconciled as ${resolution}` });
    await fetchTimeline();
    return data;
  }, [organizationId, toast, fetchTimeline]);

  const requestCompensation = useCallback(async (params: {
    receiptId: string;
    reason: string;
    webhookUrl: string;
    payload: Record<string, unknown>;
    evidence?: Record<string, unknown>;
  }) => {
    if (!organizationId) return null;
    const auth = await getVerifiedAuth();
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

    const { data, error } = await (supabase as any).rpc("request_execution_compensation", {
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

    if (error) {
      toast({ title: "Compensation request failed", description: error.message, variant: "destructive" });
      return null;
    }

    toast({ title: "Compensation submitted for independent review" });
    await fetchTimeline();
    return data;
  }, [organizationId, toast, fetchTimeline]);

  const reviewCompensation = useCallback(async (
    requestId: string,
    decision: "approved" | "rejected",
    note: string,
  ) => {
    if (!organizationId) return null;
    const auth = await getVerifiedAuth();
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

    const { data, error } = await (supabase as any).rpc("review_execution_compensation", {
      p_organization_id: organizationId,
      p_request_id: requestId,
      p_decision: decision,
      p_note: normalizedNote,
    });

    if (error) {
      toast({ title: "Compensation review failed", description: error.message, variant: "destructive" });
      return null;
    }

    toast({ title: `Compensation ${decision}` });
    await fetchTimeline();
    return data;
  }, [organizationId, toast, fetchTimeline]);

  const completionRate = plans.length > 0
    ? plans.filter(p => p.status === "completed").length / plans.length
    : 0;
  const uncertainReceipts = receipts.filter(receipt => receipt.status === "uncertain");
  const exhaustedReceipts = receipts.filter(receipt => receipt.retry_exhausted_at !== null);
  const pendingCompensations = compensationRequests.filter(request => request.status === "requested");
  const approvedCompensations = compensationRequests.filter(request => request.status === "approved");
  const uncertainCompensations = compensationRequests.filter(request => request.status === "uncertain");

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
