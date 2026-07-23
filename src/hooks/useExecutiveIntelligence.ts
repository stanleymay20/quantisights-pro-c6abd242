import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { getVerifiedAuth, authHeaders } from "@/lib/auth-helpers";

export interface ExecBriefSummary {
  headline: string;
  why_it_matters: string;
  likely_business_impact: string;
  affected_areas: string[];
  projected_time_horizon_days: number;
  recommended_executive_actions: Array<{ label: string; value: string }>;
  confidence: number;
  escalation_recommended: boolean;
  provenance: Record<string, unknown>;
  pressure_tiers: { critical: number; high: number; elevated: number };
}

export interface ExecBrief {
  id: string;
  summary_json: ExecBriefSummary;
  risk_score: number | null;
  generated_at: string;
}

export interface Intervention {
  id: string;
  intervention_type: string;
  severity: string;
  urgency: string;
  title: string;
  summary: string | null;
  recommended_action: string | null;
  rationale: string | null;
  contributing_signals: unknown[];
  decision_pressure_score: number;
  business_impact: number;
  organizational_exposure: number;
  intervention_priority_score: number;
  escalation_tier: "informational" | "elevated" | "high" | "critical";
  status: string;
  owner_id: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  sla_due_at: string | null;
  created_at: string;
  scoring_breakdown: Record<string, number>;
}

export interface Narrative {
  id: string;
  narrative: string;
  narrative_strength: number;
  affected_domains: string[];
  projected_window_days: number | null;
  combined_pressure_score: number;
  generated_at: string;
}

export interface Exposure {
  id: string;
  exposure_score: number;
  exposure_reasoning: string | null;
  geography_exposure: Record<string, number>;
  entity_exposure: Record<string, number>;
  sector_exposure: Record<string, number>;
  dependency_graph: { nodes?: string[]; domain_counts?: Record<string, number> };
  computed_at: string;
}

export interface ExecObservability {
  snapshot_day: string;
  items_to_decision_rate: number;
  advisory_adoption_rate: number;
  intervention_resolution_rate: number;
  unresolved_critical_pressure: number;
  avg_response_latency_hours: number;
  memory_effectiveness_score: number;
}

export interface SignalHealthSurface {
  surface: string;
  consecutive_failures: number;
  last_success_at: string | null;
  last_error_message: string | null;
}

export interface ExecIntelSnapshot {
  id: string;
  snapshot_date: string;
  generated_at: string;
  generated_by: string;
  headline: string | null;
  top_interventions: Array<Record<string, unknown>>;
  pressure_queue: Array<Record<string, unknown>>;
  cross_domain_narratives: Array<Record<string, unknown>>;
  emerging_threats: Array<Record<string, unknown>>;
  fatigue_warning: {
    avg_fatigue_score?: number;
    high_fatigue_owner_count?: number;
    breached_owners?: Array<Record<string, unknown>>;
    triggered?: boolean;
  };
  conversion_metrics: {
    items_evaluated?: number;
    items_routed_to_decision?: number;
    conversion_rate_pct?: number;
    advisories_open?: number;
    decisions_created_7d?: number;
    intervention_resolution_rate_pct?: number;
  };
  recommended_actions: Array<{ label: string; value: string }>;
  provenance: Record<string, unknown>;
  risk_score: number | null;
  confidence: number | null;
}


export const useExecutiveIntelligence = () => {
  const { orgId } = useActiveDataContext();
  const [brief, setBrief] = useState<ExecBrief | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [narratives, setNarratives] = useState<Narrative[]>([]);
  const [exposure, setExposure] = useState<Exposure | null>(null);
  const [observability, setObservability] = useState<ExecObservability | null>(null);
  const [snapshot, setSnapshot] = useState<ExecIntelSnapshot | null>(null);
  const [degradedSurfaces, setDegradedSurfaces] = useState<SignalHealthSurface[]>([]);

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [b, iv, nar, exp, obs, snap, health] = await Promise.all([
        supabase
          .from("executive_briefs")
          .select("id,summary_json,risk_score,generated_at")
          .eq("organization_id", orgId)
          .eq("role_type", "ceo")
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("executive_interventions")
          .select("id,intervention_type,severity,urgency,title,summary,recommended_action,rationale,contributing_signals,decision_pressure_score,business_impact,organizational_exposure,intervention_priority_score,escalation_tier,status,owner_id,acknowledged_at,resolved_at,sla_due_at,created_at,scoring_breakdown")
          .eq("organization_id", orgId)
          .order("intervention_priority_score", { ascending: false })
          .limit(50),
        supabase
          .from("executive_cross_domain_narratives")
          .select("id,narrative,narrative_strength,affected_domains,projected_window_days,combined_pressure_score,generated_at")
          .eq("organization_id", orgId)
          .order("generated_at", { ascending: false })
          .limit(10),
        supabase
          .from("executive_exposure_snapshots")
          .select("id,exposure_score,exposure_reasoning,geography_exposure,entity_exposure,sector_exposure,dependency_graph,computed_at")
          .eq("organization_id", orgId)
          .order("computed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("executive_intel_observability")
          .select("snapshot_day,items_to_decision_rate,advisory_adoption_rate,intervention_resolution_rate,unresolved_critical_pressure,avg_response_latency_hours,memory_effectiveness_score")
          .eq("organization_id", orgId)
          .order("snapshot_day", { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown }> } } } } } })
          .from("executive_intelligence_snapshots")
          .select("id,snapshot_date,generated_at,generated_by,headline,top_interventions,pressure_queue,cross_domain_narratives,emerging_threats,fatigue_warning,conversion_metrics,recommended_actions,provenance,risk_score,confidence")
          .eq("organization_id", orgId)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("aicis_sync_surface_status")
          .select("surface,consecutive_failures,last_success_at,last_error_message")
          .eq("organization_id", orgId),
      ]);
      setBrief((b.data as unknown as ExecBrief) || null);
      setInterventions((iv.data as unknown as Intervention[]) || []);
      setNarratives((nar.data as unknown as Narrative[]) || []);
      setExposure((exp.data as unknown as Exposure) || null);
      setObservability((obs.data as unknown as ExecObservability) || null);
      setSnapshot((snap.data as unknown as ExecIntelSnapshot) || null);
      // A signal source stuck at 3+ consecutive failures means the metrics
      // above may be computed from incomplete/stale data, not genuine "all
      // clear" — the UI must say so instead of presenting zeros as fact.
      setDegradedSurfaces(
        ((health.data as unknown as SignalHealthSurface[]) || []).filter((s) => (s.consecutive_failures ?? 0) >= 3)
      );

    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime on interventions — per-instance unique channel name prevents
  // "cannot add postgres_changes callbacks after subscribe()" when StrictMode
  // remounts or when multiple consumers of this hook mount concurrently.
  useEffect(() => {
    if (!orgId) return;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    try {
      const uniq = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
      ch = supabase
        .channel(`exec-intel-${orgId}-${uniq}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "executive_interventions", filter: `organization_id=eq.${orgId}` },
          () => refresh())
        .subscribe();
    } catch (err) {
      console.warn("[useExecutiveIntelligence] realtime subscribe failed:", err);
    }
    return () => { if (ch) { try { supabase.removeChannel(ch); } catch { /* noop */ } } };
  }, [orgId, refresh]);

  const regenerate = useCallback(async () => {
    if (!orgId) return null;
    setGenerating(true);
    try {
      const auth = await getVerifiedAuth();
      if (!auth) return null;
      const { data, error } = await invokeWithRetry("executive-brief-generator", {
        body: { organization_id: orgId },
        headers: authHeaders(auth),
      });
      if (error) throw error;
      await refresh();
      return data;
    } finally {
      setGenerating(false);
    }
  }, [orgId, refresh]);

  // Auto-regenerate if brief is stale (>6 hours) — declared AFTER regenerate to avoid TDZ
  useEffect(() => {
    if (!brief || generating || !orgId) return;
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    const generatedAt = new Date(brief.generated_at).getTime();
    if (Date.now() - generatedAt > SIX_HOURS_MS) {
      const cacheKey = `brief_stale_refresh_${orgId}_${new Date().toISOString().slice(0, 13)}`;
      if (!sessionStorage.getItem(cacheKey)) {
        sessionStorage.setItem(cacheKey, "1");
        regenerate();
      }
    }
  }, [brief, generating, orgId, regenerate]);

  const updateIntervention = useCallback(async (
    id: string,
    patch: { status?: string; owner_id?: string | null; resolved?: boolean; acknowledged?: boolean }
  ) => {
    if (!orgId) return;
    setInterventions((cur) => cur.map((i) => i.id === id ? {
      ...i,
      ...patch,
      acknowledged_at: patch.acknowledged ? new Date().toISOString() : i.acknowledged_at,
      resolved_at: patch.resolved ? new Date().toISOString() : i.resolved_at,
    } as Intervention : i));
    const updates: Record<string, unknown> = {};
    if (patch.status) updates.status = patch.status;
    if (patch.owner_id !== undefined) updates.owner_id = patch.owner_id;
    if (patch.acknowledged && !patch.status) updates.status = "acknowledged";
    if (patch.resolved && !patch.status) updates.status = "resolved";
    await supabase.from("executive_interventions").update(updates as never).eq("id", id).eq("organization_id", orgId);
    refresh();
  }, [orgId, refresh]);

  const topByPressure = useMemo(
    () => [...interventions].sort((a, b) => b.intervention_priority_score - a.intervention_priority_score),
    [interventions]
  );

  return {
    brief, interventions, topByPressure, narratives, exposure, observability, snapshot,
    degradedSurfaces, loading, generating, refresh, regenerate, updateIntervention,
  };

};
