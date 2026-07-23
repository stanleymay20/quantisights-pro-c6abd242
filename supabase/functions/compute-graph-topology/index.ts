// Phase 5E — Deterministic Graph Topology (PageRank + blast radius + confidence decomposition)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { organization_id } = await req.json().catch(() => ({}));
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const guard = await requireCronOrOrgMember(req, organization_id);
    if (!guard.ok) return guard.response;

    const [{ data: nodes }, { data: edges }] = await Promise.all([
      supabase
        .from("operational_graph_nodes")
        .select("id,node_type,operational_criticality,exposure_score,volatility_score,status")
        .eq("organization_id", organization_id)
        .eq("status", "active"),
      supabase
        .from("operational_graph_edges")
        .select("source_node_id,target_node_id,edge_type,strength,confidence,propagation_weight,validity_decay_score,relationship_semantics")
        .eq("organization_id", organization_id),
    ]);

    if (!nodes?.length) {
      return new Response(JSON.stringify({ ok: true, nodes: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nodeIds = nodes.map((n: any) => n.id);
    const idx: Record<string, number> = {};
    nodeIds.forEach((id: string, i: number) => (idx[id] = i));
    const N = nodeIds.length;

    // Out-neighbors with effective weights
    const out: Array<Array<{ to: number; w: number; c: number; type: string; sem: string }>> = Array.from({ length: N }, () => []);
    const incoming: Array<Array<{ from: number; w: number; type: string; sem: string }>> = Array.from({ length: N }, () => []);
    for (const e of (edges ?? []) as any[]) {
      const s = idx[e.source_node_id];
      const t = idx[e.target_node_id];
      if (s === undefined || t === undefined) continue;
      const w = (e.strength ?? 0.5) * (e.confidence ?? 0.5) * (e.validity_decay_score ?? 1);
      out[s].push({ to: t, w, c: e.confidence ?? 0.5, type: e.edge_type, sem: e.relationship_semantics });
      incoming[t].push({ from: s, w, type: e.edge_type, sem: e.relationship_semantics });
    }

    // PageRank
    const damping = 0.85;
    let pr = new Array(N).fill(1 / N);
    for (let iter = 0; iter < 15; iter++) {
      const next = new Array(N).fill((1 - damping) / N);
      for (let i = 0; i < N; i++) {
        const totalOut = out[i].reduce((a, b) => a + b.w, 0);
        if (totalOut === 0) {
          // distribute uniformly
          for (let j = 0; j < N; j++) next[j] += (damping * pr[i]) / N;
        } else {
          for (const e of out[i]) next[e.to] += (damping * pr[i] * e.w) / totalOut;
        }
      }
      pr = next;
    }
    const prMax = Math.max(...pr, 1e-9);

    // Blast radius: BFS within depth 3, count reachable downstream, weighted by criticality
    function blastRadius(start: number): { score: number; depth: number; touched: number } {
      const visited = new Set<number>([start]);
      let frontier = [start];
      let totalCrit = 0;
      let maxDepth = 0;
      const maxDepthCap = 3;
      const maxBreadth = 50;
      for (let d = 1; d <= maxDepthCap && frontier.length; d++) {
        const next: number[] = [];
        for (const n of frontier) {
          for (const e of out[n]) {
            if (visited.has(e.to)) continue;
            visited.add(e.to);
            const tgtCrit = (nodes![e.to] as any).operational_criticality ?? 0;
            totalCrit += tgtCrit * e.w * Math.pow(0.7, d - 1);
            next.push(e.to);
            if (next.length >= maxBreadth) break;
            maxDepth = d;
          }
          if (next.length >= maxBreadth) break;
        }
        frontier = next;
      }
      const score = Math.min(100, totalCrit / 5); // normalize
      return { score, depth: maxDepth, touched: visited.size - 1 };
    }

    const scoresPayload: any[] = [];
    for (let i = 0; i < N; i++) {
      const node: any = nodes[i];
      const centrality = (pr[i] / prMax) * 100;

      // Escalation density: incoming 'escalates' + 'pressure_propagates_to'
      const esc = incoming[i].filter((e) => e.type === "escalates" || e.type === "pressure_propagates_to");
      const escalation_density = Math.min(100, esc.reduce((a, b) => a + b.w * 100, 0) / 2);

      // Conflict density
      const contra = incoming[i].filter((e) => e.type === "contradicts");
      const conflict_density = Math.min(100, contra.length * 25);

      // Decision dependency: outgoing 'caused_by' or incoming 'depends_on'
      const ddep =
        out[i].filter((e) => e.type === "caused_by").length +
        incoming[i].filter((e) => e.type === "depends_on").length;
      const decision_dependency_score = Math.min(100, ddep * 15);

      // Propagation risk: weighted product of centrality and total outgoing propagation
      const outProp = out[i].reduce((a, b) => a + b.w, 0);
      const propagation_risk = Math.min(100, centrality * 0.4 + outProp * 20);

      const blast = blastRadius(i);

      // Confidence decomposition (Edit 6)
      const incomingCount = incoming[i].length;
      const evidence_confidence = Math.min(100, incomingCount * 12 + 20);
      const inConfidences = incoming[i].map((e) => e.w);
      const avgInConf = inConfidences.length ? inConfidences.reduce((a, b) => a + b, 0) / inConfidences.length : 0;
      const relationship_stability = Math.min(100, avgInConf * 100);
      const distinctSemantics = new Set(incoming[i].map((e) => e.sem)).size;
      const cross_source_consistency = Math.min(100, distinctSemantics * 25);
      const topology_reliability = Math.min(100, (centrality + relationship_stability) / 2);
      const historical_accuracy = 50; // placeholder, will be reinforced by memory patterns

      scoresPayload.push({
        node_id: node.id,
        organization_id,
        centrality_score: clamp(centrality),
        exposure_score: clamp(node.exposure_score ?? 0),
        volatility_score: clamp(node.volatility_score ?? 0),
        operational_criticality: clamp(node.operational_criticality ?? 0),
        decision_dependency_score: clamp(decision_dependency_score),
        propagation_risk: clamp(propagation_risk),
        escalation_density: clamp(escalation_density),
        conflict_density: clamp(conflict_density),
        blast_radius_score: clamp(blast.score),
        blast_radius_breakdown: { depth: blast.depth, touched: blast.touched },
        evidence_confidence: clamp(evidence_confidence),
        relationship_stability: clamp(relationship_stability),
        cross_source_consistency: clamp(cross_source_consistency),
        topology_reliability: clamp(topology_reliability),
        historical_accuracy: clamp(historical_accuracy),
        scoring_breakdown: { pagerank: pr[i], incoming: incoming[i].length, outgoing: out[i].length },
        computed_at: new Date().toISOString(),
      });
    }

    // Upsert
    await supabase.from("graph_topology_scores").upsert(scoresPayload, { onConflict: "node_id" });

    // Governance escalation thresholds (Edit 7)
    const breaches: any[] = [];
    for (const s of scoresPayload) {
      if (s.propagation_risk >= 80) {
        breaches.push({
          organization_id, node_id: s.node_id, event_type: "escalation_threshold_breached",
          escalation_threshold_breached: true, threshold_kind: "propagation_risk",
          threshold_value: s.propagation_risk, reason: "Propagation risk ≥ 80",
          actor: "compute-graph-topology",
          new_state: { propagation_risk: s.propagation_risk },
          prior_state: {},
        });
      }
      if (s.blast_radius_score >= 75) {
        breaches.push({
          organization_id, node_id: s.node_id, event_type: "escalation_threshold_breached",
          escalation_threshold_breached: true, threshold_kind: "blast_radius",
          threshold_value: s.blast_radius_score, reason: "Blast radius ≥ 75",
          actor: "compute-graph-topology",
          new_state: { blast_radius_score: s.blast_radius_score },
          prior_state: {},
        });
      }
      if (s.conflict_density >= 75) {
        breaches.push({
          organization_id, node_id: s.node_id, event_type: "escalation_threshold_breached",
          escalation_threshold_breached: true, threshold_kind: "conflict_density",
          threshold_value: s.conflict_density, reason: "Conflict density ≥ 75",
          actor: "compute-graph-topology",
          new_state: { conflict_density: s.conflict_density },
          prior_state: {},
        });
      }
    }
    if (breaches.length) await supabase.from("graph_governance_events").insert(breaches);

    await supabase.from("graph_governance_events").insert({
      organization_id,
      event_type: "topology_scored",
      new_state: { nodes_scored: scoresPayload.length, breaches: breaches.length },
      reason: "Scheduled topology compute",
      actor: "compute-graph-topology",
    });

    const ms = Date.now() - started;
    await supabase.from("graph_observability").upsert(
      {
        organization_id,
        day: new Date().toISOString().slice(0, 10),
        topology_compute_ms: ms,
      },
      { onConflict: "organization_id,day" },
    );

    return new Response(
      JSON.stringify({ ok: true, nodes_scored: scoresPayload.length, breaches: breaches.length, duration_ms: ms }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("compute-graph-topology error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
