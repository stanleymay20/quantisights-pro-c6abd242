// Phase 5E — Deterministic Graph Reasoning (BFS traversals; no LLM)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Traversal =
  | "root_cause"
  | "pressure_propagation"
  | "escalation_chain"
  | "dependency_concentration"
  | "intervention_impact"
  | "narrative_conflict"
  | "governance_lineage";

const TRAVERSAL_EDGES: Record<Traversal, { edges: string[]; reverse: boolean }> = {
  root_cause: { edges: ["caused_by", "informed_by", "derived_from"], reverse: true },
  pressure_propagation: { edges: ["pressure_propagates_to", "amplifies", "escalates"], reverse: false },
  escalation_chain: { edges: ["escalates", "pressure_propagates_to"], reverse: false },
  dependency_concentration: { edges: ["depends_on"], reverse: true },
  intervention_impact: { edges: ["mitigates", "intervention_accelerates", "resolved_by"], reverse: false },
  narrative_conflict: { edges: ["contradicts"], reverse: false },
  governance_lineage: { edges: ["derived_from", "informed_by", "caused_by"], reverse: true },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { organization_id, start_node_id, traversal_type } = await req.json();

    if (!organization_id || !start_node_id || !traversal_type) {
      return new Response(JSON.stringify({ error: "organization_id, start_node_id, traversal_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = TRAVERSAL_EDGES[traversal_type as Traversal];
    if (!config) {
      return new Response(JSON.stringify({ error: "unknown traversal_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache check
    const { data: cached } = await supabase
      .from("graph_traversal_cache")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("traversal_type", traversal_type)
      .eq("start_node_id", start_node_id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached) {
      return new Response(JSON.stringify({ ok: true, cached: true, traversal: cached }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull relevant edges (org-scoped, edge_type filter, not invalid)
    const { data: edges } = await supabase
      .from("operational_graph_edges")
      .select("id,source_node_id,target_node_id,edge_type,strength,confidence,validity_decay_score,relationship_semantics,evidence_refs")
      .eq("organization_id", organization_id)
      .in("edge_type", config.edges)
      .neq("edge_staleness_state", "invalid");

    const { data: nodes } = await supabase
      .from("operational_graph_nodes")
      .select("id,node_type,title")
      .eq("organization_id", organization_id);
    const nodeMap: Record<string, any> = {};
    for (const n of (nodes ?? []) as any[]) nodeMap[n.id] = n;

    // BFS, bounded
    const MAX_DEPTH = 4;
    const MAX_NODES = 50;
    const visited = new Set<string>([start_node_id]);
    const path: any[] = [{ node_id: start_node_id, depth: 0, ...nodeMap[start_node_id] }];
    const reasoning: any[] = [];
    const evidence: any[] = [];
    let confidenceProduct = 1;
    let confCount = 0;

    let frontier: Array<{ id: string; depth: number }> = [{ id: start_node_id, depth: 0 }];
    for (let d = 1; d <= MAX_DEPTH && frontier.length && visited.size < MAX_NODES; d++) {
      const next: Array<{ id: string; depth: number }> = [];
      for (const { id } of frontier) {
        for (const e of (edges ?? []) as any[]) {
          const matchSrc = config.reverse ? e.target_node_id === id : e.source_node_id === id;
          const other = config.reverse ? e.source_node_id : e.target_node_id;
          if (!matchSrc) continue;
          if (visited.has(other)) continue;
          visited.add(other);
          path.push({ node_id: other, depth: d, ...nodeMap[other] });
          const stepConf = (e.strength ?? 0.5) * (e.confidence ?? 0.5) * (e.validity_decay_score ?? 1);
          confidenceProduct *= Math.max(0.3, stepConf); // floor to avoid collapse
          confCount += 1;
          reasoning.push({
            step: reasoning.length + 1,
            from: config.reverse ? nodeMap[other]?.title ?? other : nodeMap[id]?.title ?? id,
            to: config.reverse ? nodeMap[id]?.title ?? id : nodeMap[other]?.title ?? other,
            label: `${e.edge_type} (${e.relationship_semantics})`,
            value: `strength ${(e.strength ?? 0).toFixed(2)} · confidence ${(e.confidence ?? 0).toFixed(2)} · decay ${(e.validity_decay_score ?? 1).toFixed(2)}`,
            evidence_refs: e.evidence_refs ?? [],
          });
          for (const ref of e.evidence_refs ?? []) evidence.push(ref);
          next.push({ id: other, depth: d });
          if (visited.size >= MAX_NODES) break;
        }
        if (visited.size >= MAX_NODES) break;
      }
      frontier = next;
    }

    const finalConfidence = Math.min(0.85, confCount === 0 ? 0 : Math.pow(confidenceProduct, 1 / Math.max(1, confCount)));

    // Confidence decomposition
    const distinctSem = new Set(reasoning.map((r: any) => (r.label as string).split("(")[1]?.replace(")", ""))).size;
    const confidence_breakdown = {
      evidence_confidence: Math.min(100, evidence.length * 15 + 20),
      relationship_stability: Math.round(finalConfidence * 100),
      cross_source_consistency: Math.min(100, distinctSem * 30),
      topology_reliability: Math.min(100, (visited.size / MAX_NODES) * 100 * 0.5 + 50),
      historical_accuracy: 50,
    };

    const { data: insertedArr } = await supabase
      .from("graph_traversal_cache")
      .insert({
        organization_id,
        traversal_type,
        start_node_id,
        traversal_path: path,
        reasoning_chain: reasoning,
        evidence_refs: evidence,
        confidence: finalConfidence,
        confidence_breakdown,
      })
      .select()
      .single();

    await supabase.from("graph_governance_events").insert({
      organization_id,
      node_id: start_node_id,
      event_type: "traversed",
      new_state: { traversal_type, nodes_visited: visited.size, confidence: finalConfidence },
      reason: `Deterministic ${traversal_type} traversal`,
      actor: "graph-reasoning-engine",
    });

    return new Response(JSON.stringify({ ok: true, cached: false, traversal: insertedArr }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("graph-reasoning-engine error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
