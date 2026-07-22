// Phase 5E — Deterministic Operational Graph Construction
// Builds nodes + edges from existing operational tables. No LLM reasoning.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";

interface NodeUpsert {
  organization_id: string;
  node_type: string;
  node_ref_id: string;
  canonical_key: string;
  title: string;
  summary?: string;
  operational_state?: string;
  status?: string;
  operational_criticality?: number;
  exposure_score?: number;
  volatility_score?: number;
  metadata?: Record<string, unknown>;
}

interface EdgeUpsert {
  organization_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
  strength: number;
  confidence: number;
  propagation_weight: number;
  relationship_semantics: string;
  validity_decay_score: number;
  last_validated_at: string;
  edge_staleness_state: string;
  max_propagation_influence: number;
  propagation_saturation_score: number;
  evidence_refs: unknown[];
  provenance: Record<string, unknown>;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const ageDays = (iso?: string | null) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : 999;

function decayFor(ageD: number) {
  const decay = clamp01(Math.exp(-ageD / 21));
  const state =
    decay > 0.7 ? "fresh" : decay > 0.4 ? "aging" : decay > 0.15 ? "stale" : "invalid";
  return { decay, state };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const organization_id: string | undefined = body.organization_id;
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const guard = await requireCronOrOrgMember(req, organization_id);
    if (!guard.ok) return guard.response;

    // ── 1. Pull source records (bounded) ──
    const [narratives, pressures, interventions, decisions, advisories, inbox, conflicts] =
      await Promise.all([
        supabase
          .from("intelligence_fusion_clusters")
          .select("id,title,canonical_summary,narrative_class,pressure_score,confidence_score,stability_score,volatility_score,status,generated_at,affected_entities,affected_domains,supporting_advisory_ids,supporting_intervention_ids,supporting_item_ids")
          .eq("organization_id", organization_id)
          .eq("status", "active")
          .limit(150),
        supabase
          .from("organizational_pressure_models")
          .select("id,snapshot_at,pressure_score,pressure_velocity,operational_pressure,strategic_pressure,supply_chain_pressure,execution_pressure,geopolitical_pressure,cyber_pressure,regulatory_pressure")
          .eq("organization_id", organization_id)
          .order("snapshot_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("executive_interventions")
          .select("id,title,intervention_type,status,severity,urgency,created_at,source_type,source_id,decision_id,resolved_at,outcome_score")
          .eq("organization_id", organization_id)
          .in("status", ["proposed", "acknowledged", "assigned", "in_progress", "deferred", "escalated", "resolved"])
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("decision_ledger")
          .select("id,recommended_action,chosen_action,decision_status,confidence_at_decision,decision_type,decided_at,created_at,advisory_instance_id,linked_aicis_recommendation_id,evidence_sources")
          .eq("organization_id", organization_id)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("advisory_instances")
          .select("id,title,action,confidence,status,priority,created_at,source_evidence,advisory_lane")
          .eq("organization_id", organization_id)
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("aicis_intelligence_items")
          .select("id,title,status,severity,urgency,ingested_at,occurred_at,domain,geography")
          .eq("organization_id", organization_id)
          .order("ingested_at", { ascending: false })
          .limit(100),
        supabase
          .from("narrative_conflicts")
          .select("id,narrative_a_id,narrative_b_id,severity,status,detected_at")
          .eq("organization_id", organization_id)
          .eq("status", "open")
          .limit(50),
      ]);

    if (narratives.error) console.warn("narratives select error:", narratives.error.message);
    if (pressures.error) console.warn("pressures select error:", pressures.error.message);
    if (interventions.error) console.warn("interventions select error:", interventions.error.message);
    if (decisions.error) console.warn("decisions select error:", decisions.error.message);
    if (advisories.error) console.warn("advisories select error:", advisories.error.message);
    if (inbox.error) console.warn("inbox select error:", inbox.error.message);
    if (conflicts.error) console.warn("conflicts select error:", conflicts.error.message);

    const nodeBuf: NodeUpsert[] = [];
    const refToKey: Record<string, string> = {}; // ref_type:ref_id → canonical_key

    const clamp100 = (v: any) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
    const pushNode = (n: NodeUpsert, refKey?: string) => {
      n.operational_criticality = clamp100(n.operational_criticality);
      n.exposure_score = clamp100(n.exposure_score);
      n.volatility_score = clamp100(n.volatility_score);
      if (n.status == null) n.status = "active";
      if (n.operational_state == null) n.operational_state = "active";
      nodeBuf.push(n);
      if (refKey) refToKey[refKey] = n.canonical_key;
    };

    // Narratives
    for (const n of (narratives.data ?? []) as any[]) {
      pushNode(
        {
          organization_id,
          node_type: "narrative",
          node_ref_id: n.id,
          canonical_key: `narrative:${n.id}`,
          title: n.title ?? "Narrative",
          summary: n.canonical_summary ?? null,
          operational_state: n.narrative_class ?? "active",
          status: "active",
          operational_criticality: Math.round((n.pressure_score ?? 0)),
          exposure_score: Math.round((n.pressure_score ?? 0)),
          volatility_score: Math.round((n.volatility_score ?? 0) * 100),
          metadata: {
            class: n.narrative_class,
            stability: n.stability_score,
            confidence: n.confidence_score,
            generated_at: n.generated_at,
          },
        },
        `narrative:${n.id}`,
      );
    }

    // Pressures (one node per non-zero dimension)
    if (pressures.data) {
      const p: any = pressures.data;
      const dims = [
        ["operational_pressure", "operational"],
        ["strategic_pressure", "strategic"],
        ["supply_chain_pressure", "supply_chain"],
        ["execution_pressure", "execution"],
        ["geopolitical_pressure", "geopolitical"],
        ["cyber_pressure", "cyber"],
        ["regulatory_pressure", "regulatory"],
      ];
      for (const [col, key] of dims) {
        const val = p[col] ?? 0;
        if (val <= 0) continue;
        pushNode(
          {
            organization_id,
            node_type: "pressure",
            node_ref_id: `${p.id}:${key}`,
            canonical_key: `pressure:${key}`,
            title: `${key.replace("_", " ")} pressure`,
            operational_criticality: Math.round(val),
            exposure_score: Math.round(val),
            volatility_score: Math.round(Math.abs(p.pressure_velocity ?? 0) * 100),
            metadata: { dimension: key, snapshot_at: p.snapshot_at, velocity: p.pressure_velocity },
          },
          `pressure:${key}`,
        );
      }
    }

    // Interventions
    for (const iv of (interventions.data ?? []) as any[]) {
      const sev = (iv.severity ?? "").toLowerCase();
      const crit = sev === "critical" ? 90 : sev === "high" ? 70 : sev === "medium" ? 50 : 35;
      pushNode(
        {
          organization_id,
          node_type: "intervention",
          node_ref_id: iv.id,
          canonical_key: `intervention:${iv.id}`,
          title: iv.title ?? "Intervention",
          status: iv.status === "resolved" ? "retired" : "active",
          operational_state: iv.status,
          operational_criticality: crit,
          metadata: {
            type: iv.intervention_type,
            source_type: iv.source_type,
            source_id: iv.source_id,
            decision_id: iv.decision_id,
            outcome_score: iv.outcome_score,
            created_at: iv.created_at,
          },
        },
        `intervention:${iv.id}`,
      );
    }

    // Decisions
    for (const d of (decisions.data ?? []) as any[]) {
      const dStatus = d.decision_status ?? "open";
      const conf = d.confidence_at_decision ?? 0.5;
      const crit = conf >= 0.8 ? 80 : conf >= 0.6 ? 65 : 50;
      pushNode(
        {
          organization_id,
          node_type: "decision",
          node_ref_id: d.id,
          canonical_key: `decision:${d.id}`,
          title: d.recommended_action ?? d.chosen_action ?? "Decision",
          status: dStatus === "executed" || dStatus === "rejected" || dStatus === "completed" ? "retired" : "active",
          operational_criticality: crit,
          metadata: {
            type: d.decision_type,
            confidence: conf,
            advisory_instance_id: d.advisory_instance_id,
            linked_aicis_recommendation_id: d.linked_aicis_recommendation_id,
            created_at: d.created_at ?? d.decided_at,
          },
        },
        `decision:${d.id}`,
      );
    }

    // Advisories
    for (const a of (advisories.data ?? []) as any[]) {
      pushNode(
        {
          organization_id,
          node_type: "advisory",
          node_ref_id: a.id,
          canonical_key: `advisory:${a.id}`,
          title: a.title ?? a.action ?? "Advisory",
          status: a.status === "expired" || a.status === "resolved" ? "retired" : "active",
          operational_criticality: Math.round(Math.min(1, (a.confidence ?? 0.5) > 1 ? (a.confidence ?? 50) / 100 : (a.confidence ?? 0.5)) * 80),
          metadata: {
            confidence: a.confidence,
            priority: a.priority,
            lane: a.advisory_lane,
            created_at: a.created_at,
          },
        },
        `advisory:${a.id}`,
      );
    }

    // Inbox signals
    for (const s of (inbox.data ?? []) as any[]) {
      const sev = (s.severity ?? "").toLowerCase();
      pushNode(
        {
          organization_id,
          node_type: "signal",
          node_ref_id: s.id,
          canonical_key: `signal:${s.id}`,
          title: s.title ?? "Signal",
          operational_criticality: sev === "critical" ? 85 : sev === "high" ? 65 : 35,
          metadata: { domain: s.domain, geography: s.geography, created_at: s.ingested_at ?? s.occurred_at },
        },
        `signal:${s.id}`,
      );
    }

    // ── 2. Upsert nodes ──
    let nodesCreated = 0;
    if (nodeBuf.length) {
      const { data: upserted, error } = await supabase
        .from("operational_graph_nodes")
        .upsert(nodeBuf, { onConflict: "organization_id,node_type,canonical_key" })
        .select("id,canonical_key");
      if (error) throw error;
      nodesCreated = upserted?.length ?? 0;
    }

    // Refresh id lookup
    const { data: allNodes } = await supabase
      .from("operational_graph_nodes")
      .select("id,canonical_key")
      .eq("organization_id", organization_id);
    const keyToId: Record<string, string> = {};
    for (const n of (allNodes ?? []) as any[]) keyToId[n.canonical_key] = n.id;

    // ── 3. Build edges deterministically ──
    const edgeBuf: EdgeUpsert[] = [];
    const pushEdge = (
      srcKey: string,
      tgtKey: string,
      edge_type: string,
      strength: number,
      confidence: number,
      semantics: string,
      evidence: unknown[],
      sourceAt?: string,
    ) => {
      const sid = keyToId[srcKey];
      const tid = keyToId[tgtKey];
      if (!sid || !tid || sid === tid) return;
      const { decay, state } = decayFor(ageDays(sourceAt));
      edgeBuf.push({
        organization_id,
        source_node_id: sid,
        target_node_id: tid,
        edge_type,
        strength: clamp01(strength),
        confidence: clamp01(confidence),
        propagation_weight: clamp01(strength * decay),
        relationship_semantics: semantics,
        validity_decay_score: decay,
        last_validated_at: new Date().toISOString(),
        edge_staleness_state: state,
        max_propagation_influence: 0.7,
        propagation_saturation_score: 0,
        evidence_refs: evidence.length ? evidence : [{ kind: "deterministic_inference", note: "no explicit evidence ref" }],
        provenance: { engine: "build-operational-graph", v: 1, derived_at: new Date().toISOString() },
      });
    };

    // narrative → intervention (mitigates)
    for (const n of (narratives.data ?? []) as any[]) {
      for (const ivId of (n.supporting_intervention_ids ?? []) as string[]) {
        pushEdge(
          `intervention:${ivId}`,
          `narrative:${n.id}`,
          "mitigates",
          0.7,
          n.confidence_score ?? 0.6,
          "governance-linked",
          [{ kind: "narrative_link", narrative_id: n.id, intervention_id: ivId }],
          n.generated_at,
        );
      }
      for (const advId of (n.supporting_advisory_ids ?? []) as string[]) {
        pushEdge(
          `advisory:${advId}`,
          `narrative:${n.id}`,
          "informed_by",
          0.6,
          n.confidence_score ?? 0.6,
          "governance-linked",
          [{ kind: "narrative_link", narrative_id: n.id, advisory_id: advId }],
          n.generated_at,
        );
      }
      for (const sigId of (n.supporting_item_ids ?? []) as string[]) {
        pushEdge(
          `signal:${sigId}`,
          `narrative:${n.id}`,
          "derived_from",
          0.55,
          n.confidence_score ?? 0.55,
          "temporal",
          [{ kind: "narrative_evidence", narrative_id: n.id, signal_id: sigId }],
          n.generated_at,
        );
      }
    }

    // pressure → narrative (propagation), via narrative_class hint
    for (const n of (narratives.data ?? []) as any[]) {
      const cls = (n.narrative_class ?? "").toLowerCase();
      const pressureKey =
        cls.includes("supply") ? "pressure:supply_chain"
        : cls.includes("exec") ? "pressure:execution"
        : cls.includes("strategy") || cls.includes("market") ? "pressure:strategic"
        : cls.includes("regul") || cls.includes("compli") ? "pressure:regulatory"
        : cls.includes("cyber") ? "pressure:cyber"
        : "pressure:operational";
      pushEdge(
        pressureKey,
        `narrative:${n.id}`,
        "pressure_propagates_to",
        Math.min(1, (n.pressure_score ?? 50) / 100),
        n.confidence_score ?? 0.6,
        "causal",
        [{ kind: "pressure_dim_match", narrative_id: n.id, class: cls }],
        n.generated_at,
      );
    }

    // decision → advisory (caused_by) and decision → intelligence (informed_by)
    for (const d of (decisions.data ?? []) as any[]) {
      const conf = d.confidence_at_decision ?? 0.6;
      const at = d.created_at ?? d.decided_at;
      if (d.advisory_instance_id) {
        pushEdge(
          `advisory:${d.advisory_instance_id}`,
          `decision:${d.id}`,
          "caused_by",
          0.75,
          conf,
          "causal",
          [{ kind: "decision_advisory_link", decision_id: d.id, advisory_id: d.advisory_instance_id }],
          at,
        );
      }
      if (d.linked_aicis_recommendation_id) {
        pushEdge(
          `signal:${d.linked_aicis_recommendation_id}`,
          `decision:${d.id}`,
          "informed_by",
          0.65,
          conf,
          "governance-linked",
          [{ kind: "decision_signal_link", decision_id: d.id, signal_id: d.linked_aicis_recommendation_id }],
          at,
        );
      }
    }

    // intervention → decision (resolved_by / accelerates)
    for (const iv of (interventions.data ?? []) as any[]) {
      if (iv.source_type === "decision" && iv.source_id) {
        pushEdge(
          `decision:${iv.source_id}`,
          `intervention:${iv.id}`,
          "intervention_accelerates",
          0.7,
          0.7,
          "causal",
          [{ kind: "intervention_source", intervention_id: iv.id, decision_id: iv.source_id }],
          iv.created_at,
        );
      }
      if (iv.source_type === "narrative" && iv.source_id) {
        pushEdge(
          `narrative:${iv.source_id}`,
          `intervention:${iv.id}`,
          "escalates",
          0.6,
          0.7,
          "governance-linked",
          [{ kind: "intervention_source", intervention_id: iv.id, narrative_id: iv.source_id }],
          iv.created_at,
        );
      }
    }

    // narrative contradicts narrative (from narrative_conflicts)
    for (const c of (conflicts.data ?? []) as any[]) {
      pushEdge(
        `narrative:${c.narrative_a_id}`,
        `narrative:${c.narrative_b_id}`,
        "contradicts",
        c.severity === "critical" ? 0.9 : c.severity === "high" ? 0.7 : 0.5,
        0.8,
        "statistical",
        [{ kind: "narrative_conflict", conflict_id: c.id, severity: c.severity }],
        c.detected_at,
      );
    }

    // ── 4. Apply propagation saturation cap per source ──
    const outgoingCount: Record<string, number> = {};
    for (const e of edgeBuf) outgoingCount[e.source_node_id] = (outgoingCount[e.source_node_id] ?? 0) + 1;
    for (const e of edgeBuf) {
      const out = outgoingCount[e.source_node_id];
      // saturation: above 8 outgoing, dampen propagation_weight
      const saturation = Math.min(1, Math.max(0, (out - 8) / 20));
      e.propagation_saturation_score = saturation;
      e.propagation_weight = clamp01(e.propagation_weight * (1 - saturation * 0.5));
    }

    // ── 5. Upsert edges ──
    let edgesCreated = 0;
    if (edgeBuf.length) {
      const { data: upserted, error } = await supabase
        .from("operational_graph_edges")
        .upsert(edgeBuf, { onConflict: "organization_id,source_node_id,target_node_id,edge_type" })
        .select("id");
      if (error) throw error;
      edgesCreated = upserted?.length ?? 0;
    }

    // ── 6. Governance event + observability ──
    await supabase.from("graph_governance_events").insert({
      organization_id,
      event_type: "generated",
      new_state: { nodes_upserted: nodeBuf.length, edges_upserted: edgeBuf.length },
      reason: "Scheduled deterministic graph build",
      actor: "build-operational-graph",
    });

    const density = nodesCreated > 1 ? edgeBuf.length / (nodesCreated * (nodesCreated - 1)) : 0;
    await supabase.from("graph_observability").upsert(
      {
        organization_id,
        day: new Date().toISOString().slice(0, 10),
        nodes_created: nodeBuf.length,
        edges_created: edgeBuf.length,
        graph_density: density,
        conflict_count: (conflicts.data ?? []).length,
      },
      { onConflict: "organization_id,day" },
    );

    return new Response(
      JSON.stringify({
        ok: true,
        nodes: nodeBuf.length,
        edges: edgeBuf.length,
        duration_ms: Date.now() - started,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("build-operational-graph error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
