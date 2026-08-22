import { useCallback, useEffect, useRef, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const scopeRef = useRef<string | null>(null);

  const clearFusion = useCallback(() => {
    setClusters([]);
    setPressureHistory([]);
    setObservability(null);
    setConflicts([]);
    setAuditLog([]);
  }, []);

  const refresh = useCallback(async () => {
    if (!orgId) {
      scopeRef.current = null;
      clearFusion();
      setError(null);
      setLoading(false);
      return;
    }

    if (scopeRef.current !== orgId) {
      scopeRef.current = orgId;
      clearFusion();
    }

    setLoading(true);
    setError(null);
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

      const failures = [
        ["fusion clusters", cl.error],
        ["pressure history", ph.error],
        ["fusion observability", ob.error],
        ["narrative conflicts", cf.error],
        ["narrative audit", au.error],
      ].filter(([, queryError]) => Boolean(queryError)) as Array<[string, { message?: string }]>;

      if (failures.length > 0) {
        const message = failures.map(([surface, queryError]) => `${surface}: ${queryError.message ?? "query failed"}`).join("; ");
        clearFusion();
        setError(`Narrative fusion evidence could not be verified: ${message}`);
        return;
      }

      setClusters((cl.data as FusionCluster[]) || []);
      setPressureHistory(((ph.data as PressureModel[]) || []).slice().reverse());
      setObservability((ob.data as FusionObservability) || null);
      setConflicts((cf.data as NarrativeConflict[]) || []);
      setAuditLog((au.data as NarrativeAuditEntry[]) || []);
      setError(null);
    } catch (e) {
      clearFusion();
      setError(e instanceof Error ? e.message : "Narrative fusion refresh failed");
    } finally {
      setLoading(false);
    }
  }, [clearFusion, orgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!orgId) return;
    return createSafeChannel(`fusion-${orgId}`, (ch) =>
      ch.on("postgres_changes",
        { event: "*", schema: "public", table: "intelligence_fusion_clusters", filter: `organization_id=eq.${orgId}` },
        () => void refresh())
      .subscribe()
    );
  }, [orgId, refresh]);

  const regenerate = useCallback(async () => {
    if (!orgId) throw new Error("Organization context is required to regenerate narrative fusion.");
    setGenerating(true);
    setError(null);
    try {
      const auth = await getVerifiedAuth();
      if (!auth) throw new Error("A verified authenticated session is required to regenerate narrative fusion.");
      const { data, error: fnError } = await invokeWithRetry("narrative-fusion-engine", {
        body: { organization_id: orgId },
        headers: authHeaders(auth),
      });
      if (fnError) throw fnError;
      if (!data) throw new Error("Narrative fusion engine returned no confirmation payload.");
      await refresh();
      return data;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Narrative fusion regeneration failed";
      setError(message);
      throw e instanceof Error ? e : new Error(message);
    } finally {
      setGenerating(false);
    }
  }, [orgId, refresh]);

  return {
    clusters, pressureHistory, observability, conflicts, auditLog,
    loading, generating, error, refresh, regenerate,
  };
};
