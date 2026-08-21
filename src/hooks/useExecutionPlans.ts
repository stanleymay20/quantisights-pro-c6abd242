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
}

export const useExecutionPlans = (organizationId: string | null, decisionId: string | null) => {
  const { toast } = useToast();
  const [plans, setPlans] = useState<ExecutionPlan[]>([]);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [receipts, setReceipts] = useState<ExecutionReceipt[]>([]);
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

      // execution_action_receipts is intentionally service-role-only under RLS.
      // Read the safe timeline projection through the membership-checking RPC.
      const { data: receiptData, error: receiptError } = await (supabase as any).rpc(
        "list_execution_action_receipts",
        {
          p_organization_id: organizationId,
          p_decision_id: decisionId,
        },
      );

      if (receiptError) {
        console.error("Failed to fetch execution receipts:", receiptError);
        setReceipts([]);
      } else {
        setReceipts(Array.isArray(receiptData) ? receiptData as ExecutionReceipt[] : []);
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

  // Realtime subscription for plan updates
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

    // Optimistic update: apply status change immediately
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
      // Rollback on failure
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

    // Create the execution-intent key before invokeWithRetry so every transport
    // retry carries the same key and the backend can suppress duplicate sends.
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

  const completionRate = plans.length > 0
    ? plans.filter(p => p.status === "completed").length / plans.length
    : 0;
  const uncertainReceipts = receipts.filter(receipt => receipt.status === "uncertain");

  return {
    plans,
    events,
    receipts,
    uncertainReceipts,
    loading,
    createPlan,
    updatePlanStatus,
    triggerWebhook,
    notifySlack,
    reconcileReceipt,
    refresh: fetchTimeline,
    completionRate,
  };
};
