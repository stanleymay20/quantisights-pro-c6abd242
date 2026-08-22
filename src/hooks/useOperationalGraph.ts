import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { getVerifiedAuth, authHeaders } from "@/lib/auth-helpers";

export interface GraphNode {
  id: string;
  node_type: string;
  title: string;
  summary: string | null;
  operational_state: string | null;
  status: string;
  operational_criticality: number;
  exposure_score: number;
  volatility_score: number;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
  strength: number;
  confidence: number;
  propagation_weight: number;
  relationship_semantics: string;
  validity_decay_score: number;
  edge_staleness_state: string;
  propagation_saturation_score: number;
  evidence_refs: unknown[];
}

export interface TopologyScore {
  node_id: string;
  centrality_score: number;
  propagation_risk: number;
  escalation_density: number;
  conflict_density: number;
  blast_radius_score: number;
  operational_criticality: number;
  evidence_confidence: number;
  relationship_stability: number;
  cross_source_consistency: number;
  topology_reliability: number;
  historical_accuracy: number;
}

export interface AttentionView {
  id: string;
  persona: string;
  abstraction_level: number;
  title: string;
  compressed_summary: string;
  priority_score: number;
  supporting_nodes: Array<{ node_id: string; type: string }>;
}

export interface MemoryPattern {
  id: string;
  pattern_type: string;
  recurring_path: string[];
  recurrence_frequency: number;
  historical_effectiveness: number;
  last_seen_at: string;
}

export interface GovernanceEvent {
  id: string;
  event_type: string;
  reason: string | null;
  escalation_threshold_breached: boolean;
  threshold_kind: string | null;
  threshold_value: number | null;
  created_at: string;
}

export interface TraversalResult {
  id: string;
  traversal_type: string;
  traversal_path: any[];
  reasoning_chain: any[];
  confidence: number;
  confidence_breakdown: Record<string, number>;
}

export const useOperationalGraph = () => {
  const { orgId } = useActiveDataContext();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [scores, setScores] = useState<TopologyScore[]>([]);
  const [attention, setAttention] = useState<AttentionView[]>([]);
  const [patterns, setPatterns] = useState<MemoryPattern[]>([]);
  const [governance, setGovernance] = useState<GovernanceEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopeRef = useRef<string | null>(null);

  const clearGraph = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setScores([]);
    setAttention([]);
    setPatterns([]);
    setGovernance([]);
  }, []);

  const refresh = useCallback(async () => {
    if (!orgId) {
      scopeRef.current = null;
      clearGraph();
      setError(null);
      setLoading(false);
      return;
    }

    if (scopeRef.current !== orgId) {
      scopeRef.current = orgId;
      clearGraph();
    }

    setLoading(true);
    setError(null);
    try {
      const sb = supabase as unknown as { from: (t: string) => any };
      const [n, e, s, a, p, g] = await Promise.all([
        sb.from("operational_graph_nodes").select("*").eq("organization_id", orgId).eq("status", "active").limit(500),
        sb.from("operational_graph_edges").select("*").eq("organization_id", orgId).neq("edge_staleness_state", "invalid").limit(2000),
        sb.from("graph_topology_scores").select("*").eq("organization_id", orgId).order("blast_radius_score", { ascending: false }).limit(200),
        sb.from("graph_attention_views").select("*").eq("organization_id", orgId).order("priority_score", { ascending: false }).limit(50),
        sb.from("graph_memory_patterns").select("*").eq("organization_id", orgId).order("recurrence_frequency", { ascending: false }).limit(25),
        sb.from("graph_governance_events").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50),
      ]);

      const failures = [
        ["nodes", n.error],
        ["edges", e.error],
        ["topology scores", s.error],
        ["attention views", a.error],
        ["memory patterns", p.error],
        ["governance events", g.error],
      ].filter(([, queryError]) => Boolean(queryError)) as Array<[string, { message?: string }]>;

      if (failures.length > 0) {
        const message = failures.map(([surface, queryError]) => `${surface}: ${queryError.message ?? "query failed"}`).join("; ");
        clearGraph();
        setError(`Operational graph evidence could not be verified: ${message}`);
        return;
      }

      setNodes((n.data as GraphNode[]) || []);
      setEdges((e.data as GraphEdge[]) || []);
      setScores((s.data as TopologyScore[]) || []);
      setAttention((a.data as AttentionView[]) || []);
      setPatterns((p.data as MemoryPattern[]) || []);
      setGovernance((g.data as GovernanceEvent[]) || []);
      setError(null);
    } catch (e) {
      clearGraph();
      setError(e instanceof Error ? e.message : "Operational graph refresh failed");
    } finally {
      setLoading(false);
    }
  }, [clearGraph, orgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const rebuildGraph = useCallback(async () => {
    if (!orgId) throw new Error("Organization context is required to rebuild the operational graph.");
    setBusy(true);
    setError(null);
    try {
      const auth = await getVerifiedAuth();
      if (!auth) throw new Error("A verified authenticated session is required to rebuild the operational graph.");

      const build = await invokeWithRetry("build-operational-graph", {
        body: { organization_id: orgId },
        headers: authHeaders(auth),
      });
      if (build.error) throw build.error;
      if (!build.data) throw new Error("Operational graph build returned no confirmation.");

      const topology = await invokeWithRetry("compute-graph-topology", {
        body: { organization_id: orgId },
        headers: authHeaders(auth),
      });
      if (topology.error) throw topology.error;

      const compression = await invokeWithRetry("compress-graph-attention", {
        body: { organization_id: orgId },
        headers: authHeaders(auth),
      });
      if (compression.error) throw compression.error;

      await refresh();
      return build.data;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Operational graph rebuild failed";
      setError(message);
      throw e instanceof Error ? e : new Error(message);
    } finally {
      setBusy(false);
    }
  }, [orgId, refresh]);

  const traverse = useCallback(
    async (start_node_id: string, traversal_type: string): Promise<TraversalResult> => {
      if (!orgId) throw new Error("Organization context is required for graph traversal.");
      const auth = await getVerifiedAuth();
      if (!auth) throw new Error("A verified authenticated session is required for graph traversal.");
      const { data, error: traversalError } = await invokeWithRetry("graph-reasoning-engine", {
        body: { organization_id: orgId, start_node_id, traversal_type },
        headers: authHeaders(auth),
      });
      if (traversalError) throw traversalError;
      const traversal = (data as any)?.traversal as TraversalResult | undefined;
      if (!traversal) throw new Error("Graph reasoning returned no traversal evidence.");
      return traversal;
    },
    [orgId],
  );

  return { nodes, edges, scores, attention, patterns, governance, loading, busy, error, refresh, rebuildGraph, traverse };
};
