import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createSafeChannel } from "@/lib/realtime-channel";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { getVerifiedAuth, authHeaders } from "@/lib/auth-helpers";

export interface ConfidenceBreakdown {
  data_quality_confidence: number;
  evidence_volume_confidence: number;
  cross_source_consistency: number;
  historical_reliability: number;
  model_stability: number;
  composite: number;
}

export interface FusionCluster {
  id: string;
  cluster_type: string;
  title: string;
  canonical_summary: string | null;
  narrative: string | null;
  supporting_item_ids: string[];
  supporting_intervention_ids: string[];
  supporting_advisory_ids: string[];
  affected_domains: string[];
  affected_geographies: string[];
  affected_entities: string[];
  trend_direction: "rising" | "falling" | "stable";
  escalation_velocity: number;
  narrative_strength: number;
  confidence_score: number;
  pressure_score: number;
  status: string;
  generated_at: string;
  updated_at: string;
  // Phase 5D
  narrative_class?: string | null;
  narrative_scope?: string | null;
  narrative_severity?: string | null;
  narrative_domain_mix?: Record<string, number>;
  stability_score?: number;
  volatility_score?: number;
  confidence_breakdown?: ConfidenceBreakdown;
  evidence_hash?: string | null;
  version?: number;
  first_seen_at?: string;
  llm_rendered?: boolean;
}

export interface PressureModel {
  id: string;
  snapshot_at: string;
  pressure_score: number;
  pressure_velocity: number;
  pressure_acceleration: number;
  stabilization_indicator: number;
  operational_pressure: number;
  strategic_pressure: number;
  geopolitical_pressure: number;
  cyber_pressure: number;
  supply_chain_pressure: number;
  regulatory_pressure: number;
  execution_pressure: number;
}

export interface FusionObservability {
  day: string;
  inputs_count: number;
  clusters_count: number;
  compression_ratio: number;
  duplicates_suppressed: number;
  avg_generation_latency_ms: number;
  narrative_to_decision_conversion_pct: number;
  ignored_narrative_pct: number;
  narrative_resolution_effectiveness_pct: number;
}

export interface NarrativeConflict {
  id: string;
  narrative_a_id: string;
  narrative_b_id: string;
  conflict_type: string;
  severity: "low" | "medium" | "high" | "critical";
  affected_dimensions: string[];
  evidence_disagreement: Record<string, unknown>;
  status: string;
  detected_at: string;
}

export interface NarrativeAuditEntry {
  id: string;
  cluster_id: string | null;
  event_type: string;
  prior_state: Record<string, unknown>;
  new_state: Record<string, unknown>;
  reason: string | null;
  created_at: string;
}

export const useNarrativeFusion = () => {
  const { orgId } = useActiveDataContext();
  const [clusters, setClusters] = useState<FusionCluster[]>([]);
  const [pressureHistory, setPressureHistory] = useState<PressureModel[]>([]);
  const [observability, setObservability] = useState<FusionObservability | null>(null);
  const [conflicts, setConflicts] = useState<NarrativeConflict[]>([]);
  const [auditLog, setAuditLog] = useState<NarrativeAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const sb = supabase as unknown as { from: (t: string) => any };
      const [cl, ph, ob, cf, au] = await Promise.all([
        sb.from("intelligence_fusion_clusters")
          .select("*").eq("organization_id", orgId).eq("status", "active")
          .order("pressure_score", { ascending: false }).limit(25),
        sb.from("organizational_pressure_models")
          .select("*").eq("organization_id", orgId)
          .order("snapshot_at", { ascending: false }).limit(30),
        sb.from("fusion_observability")
          .select("*").eq("organization_id", orgId)
          .order("day", { ascending: false }).limit(1).maybeSingle(),
        sb.from("narrative_conflicts")
          .select("*").eq("organization_id", orgId).eq("status", "open")
          .order("detected_at", { ascending: false }).limit(20),
        sb.from("narrative_audit_log")
          .select("*").eq("organization_id", orgId)
          .order("created_at", { ascending: false }).limit(50),
      ]);
      setClusters((cl.data as FusionCluster[]) || []);
      setPressureHistory(((ph.data as PressureModel[]) || []).slice().reverse());
      setObservability((ob.data as FusionObservability) || null);
      setConflicts((cf.data as NarrativeConflict[]) || []);
      setAuditLog((au.data as NarrativeAuditEntry[]) || []);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!orgId) return;
    return createSafeChannel(`fusion-${orgId}`, (ch) =>
      ch.on("postgres_changes",
        { event: "*", schema: "public", table: "intelligence_fusion_clusters", filter: `organization_id=eq.${orgId}` },
        () => refresh())
      .subscribe()
    );
  }, [orgId, refresh]);

  const regenerate = useCallback(async () => {
    if (!orgId) return null;
    setGenerating(true);
    try {
      const auth = await getVerifiedAuth();
      if (!auth) return null;
      const { data, error } = await invokeWithRetry("narrative-fusion-engine", {
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

  return {
    clusters, pressureHistory, observability, conflicts, auditLog,
    loading, generating, refresh, regenerate,
  };
};
