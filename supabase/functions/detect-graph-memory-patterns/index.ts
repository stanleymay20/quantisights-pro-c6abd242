// Phase 5E — Recurring Pattern Detection over cached traversals
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";

const TRAV_TO_PATTERN: Record<string, string> = {
  escalation_chain: "recurring_escalation",
  intervention_impact: "recurring_intervention_chain",
  narrative_conflict: "recurring_narrative_conflict",
  governance_lineage: "recurring_governance_breakdown",
  dependency_concentration: "recurring_dependency_risk",
  root_cause: "recurring_failure",
};

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: travs } = await supabase
      .from("graph_traversal_cache")
      .select("traversal_type,traversal_path,created_at")
      .eq("organization_id", organization_id)
      .gte("created_at", since)
      .limit(1000);

    // Group by signature: traversal_type + ordered node_type chain
    const groups: Record<string, { type: string; nodes: string[]; count: number; lastSeen: string; pattern_type: string }> = {};
    for (const t of (travs ?? []) as any[]) {
      const pathNodes = (t.traversal_path ?? []) as any[];
      if (pathNodes.length < 2) continue;
      const sig = `${t.traversal_type}|${pathNodes.map((p) => p.node_type ?? "?").join(">")}`;
      const pat = TRAV_TO_PATTERN[t.traversal_type];
      if (!pat) continue;
      if (!groups[sig]) {
        groups[sig] = {
          type: t.traversal_type,
          nodes: pathNodes.map((p) => p.node_type),
          count: 0,
          lastSeen: t.created_at,
          pattern_type: pat,
        };
      }
      groups[sig].count++;
      if (t.created_at > groups[sig].lastSeen) groups[sig].lastSeen = t.created_at;
    }

    const inserts = Object.entries(groups)
      .filter(([, g]) => g.count >= 3)
      .map(([sig, g]) => ({
        organization_id,
        pattern_type: g.pattern_type,
        pattern_signature: sig,
        recurring_path: g.nodes,
        recurrence_frequency: g.count,
        last_seen_at: g.lastSeen,
        historical_effectiveness: 50,
      }));

    let inserted = 0;
    if (inserts.length) {
      const { error } = await supabase
        .from("graph_memory_patterns")
        .upsert(inserts, { onConflict: "organization_id,pattern_type,pattern_signature" });
      if (error) throw error;
      inserted = inserts.length;
      await supabase.from("graph_governance_events").insert({
        organization_id,
        event_type: "memory_pattern_detected",
        new_state: { patterns: inserted },
        reason: "Recurring pattern scan",
        actor: "detect-graph-memory-patterns",
      });
    }

    await supabase.from("graph_observability").upsert(
      {
        organization_id,
        day: new Date().toISOString().slice(0, 10),
        recurring_pattern_count: inserted,
      },
      { onConflict: "organization_id,day" },
    );

    return new Response(JSON.stringify({ ok: true, patterns_upserted: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("detect-graph-memory-patterns error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
