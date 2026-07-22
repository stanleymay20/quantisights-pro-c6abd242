import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { createSafeChannel } from "@/lib/realtime-channel";

export interface InterventionRow {
  id: string;
  organization_id: string;
  source_type: string;
  source_id: string | null;
  intervention_type: string;
  title: string;
  summary: string | null;
  rationale: string | null;
  recommended_action: string | null;
  severity: string;
  urgency: string;
  business_impact: number;
  organizational_exposure: number;
  uncertainty_score: number;
  decision_pressure_score: number;
  intervention_priority_score: number;
  escalation_tier: "informational" | "elevated" | "high" | "critical";
  status: string;
  owner_id: string | null;
  acknowledged_at: string | null;
  assigned_at: string | null;
  acted_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  outcome_score: number | null;
  decision_id: string | null;
  execution_plan_id: string | null;
  sla_due_at: string | null;
  last_escalated_at: string | null;
  escalation_count: number;
  scoring_breakdown: Record<string, number>;
  contributing_signals: unknown[];
  created_at: string;
}

export interface InterventionEscalation {
  id: string;
  intervention_id: string;
  escalation_level: number;
  escalation_reason: string;
  escalation_summary: string | null;
  escalation_targets: unknown[];
  triggered_by: string;
  created_at: string;
}

export interface InterventionObservability {
  day: string;
  creation_count: number;
  resolution_count: number;
  escalation_count: number;
  avg_response_latency_minutes: number | null;
  avg_resolution_hours: number | null;
  fatigue_score: number;
  false_positive_count: number;
  effectiveness_avg: number | null;
  conversion_to_decision_rate: number;
}

export interface InterventionLearning {
  id: string;
  intervention_id: string;
  outcome: string | null;
  time_to_resolution_hours: number | null;
  effectiveness_score: number | null;
  recurrence_count: number;
  false_positive: boolean;
  recommendation_confidence_adjustment: number;
  notes: string | null;
  recorded_at: string;
}

export const useInterventions = () => {
  const { orgId } = useActiveDataContext();
  const [items, setItems] = useState<InterventionRow[]>([]);
  const [escalations, setEscalations] = useState<InterventionEscalation[]>([]);
  const [observability, setObservability] = useState<InterventionObservability | null>(null);
  const [loading, setLoading] = useState(false);

  const [learning, setLearning] = useState<InterventionLearning[]>([]);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [itemsRes, escRes, obsRes, learnRes] = await Promise.all([
        supabase
          .from("executive_interventions")
          .select("*")
          .eq("organization_id", orgId)
          .order("intervention_priority_score", { ascending: false })
          .limit(200),
        supabase
          .from("intervention_escalations")
          .select("id,intervention_id,escalation_level,escalation_reason,escalation_summary,escalation_targets,triggered_by,created_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("intervention_observability")
          .select("day,creation_count,resolution_count,escalation_count,avg_response_latency_minutes,avg_resolution_hours,fatigue_score,false_positive_count,effectiveness_avg,conversion_to_decision_rate")
          .eq("organization_id", orgId)
          .order("day", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("intervention_learning")
          .select("id,intervention_id,outcome,time_to_resolution_hours,effectiveness_score,recurrence_count,false_positive,recommendation_confidence_adjustment,notes,recorded_at")
          .eq("organization_id", orgId)
          .order("recorded_at", { ascending: false })
          .limit(200),
      ]);
      setItems((itemsRes.data as unknown as InterventionRow[]) || []);
      setEscalations((escRes.data as unknown as InterventionEscalation[]) || []);
      setObservability((obsRes.data as unknown as InterventionObservability) || null);
      setLearning((learnRes.data as unknown as InterventionLearning[]) || []);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!orgId) return;
    return createSafeChannel(`interventions-${orgId}`, (ch) =>
      ch
        .on("postgres_changes", { event: "*", schema: "public", table: "executive_interventions", filter: `organization_id=eq.${orgId}` }, () => refresh())
        .subscribe()
    );
  }, [orgId, refresh]);

  const updateStatus = useCallback(async (id: string, status: string, extra: Partial<InterventionRow> = {}) => {
    if (!orgId) return;
    setItems((cur) => cur.map((i) => i.id === id ? { ...i, status, ...extra } as InterventionRow : i));
    await supabase.from("executive_interventions").update({ status, ...extra } as never).eq("id", id).eq("organization_id", orgId);
    refresh();
  }, [orgId, refresh]);

  const assignOwner = useCallback(async (id: string, owner_id: string | null) => {
    if (!orgId) return;
    await supabase.from("executive_interventions").update({ owner_id, status: owner_id ? "assigned" : "proposed" } as never).eq("id", id).eq("organization_id", orgId);
    refresh();
  }, [orgId, refresh]);

  const escalate = useCallback(async (id: string, reason: string, summary?: string) => {
    if (!orgId) return;
    const target = items.find((i) => i.id === id);
    const newLevel = (target?.escalation_count ?? 0) + 1;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("intervention_escalations").insert({
      organization_id: orgId,
      intervention_id: id,
      escalation_level: newLevel,
      escalation_reason: reason,
      escalation_summary: summary ?? null,
      triggered_by: "user",
      actor_id: user?.id ?? null,
    } as never);
    await supabase.from("executive_interventions").update({
      status: "escalated",
      last_escalated_at: new Date().toISOString(),
      escalation_count: newLevel,
    } as never).eq("id", id).eq("organization_id", orgId);
    refresh();
  }, [orgId, items, refresh]);

  const resolve = useCallback(async (id: string, notes: string, outcome_score?: number) => {
    if (!orgId) return;
    await supabase.from("executive_interventions").update({
      status: "resolved",
      resolution_notes: notes,
      outcome_score: outcome_score ?? null,
    } as never).eq("id", id).eq("organization_id", orgId);
    refresh();
  }, [orgId, refresh]);

  const buckets = useMemo(() => ({
    critical: items.filter((i) => i.escalation_tier === "critical" && !i.resolved_at),
    high: items.filter((i) => i.escalation_tier === "high" && !i.resolved_at),
    elevated: items.filter((i) => i.escalation_tier === "elevated" && !i.resolved_at),
    informational: items.filter((i) => i.escalation_tier === "informational" && !i.resolved_at),
    resolved: items.filter((i) => !!i.resolved_at),
  }), [items]);

  return { items, escalations, observability, learning, buckets, loading, refresh, updateStatus, assignOwner, escalate, resolve };
};
