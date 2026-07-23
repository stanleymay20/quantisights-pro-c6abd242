// Intervention Fatigue Compute
// Rolling 7-day per-owner fatigue: volume, unresolved, escalation density.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const correlationId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - 7 * 86400_000);

    const { data: rows, error } = await supabase
      .from("executive_interventions")
      .select("organization_id, owner_id, status, escalation_tier, created_at, resolved_at")
      .gte("created_at", windowStart.toISOString())
      .limit(10000);
    if (error) throw error;

    const buckets = new Map<string, { org: string; owner: string; total: number; unresolved: number; escalated: number }>();
    for (const r of rows ?? []) {
      const owner = r.owner_id ?? "unassigned";
      const key = `${r.organization_id}::${owner}`;
      const b = buckets.get(key) ?? { org: r.organization_id, owner, total: 0, unresolved: 0, escalated: 0 };
      b.total += 1;
      if (!r.resolved_at) b.unresolved += 1;
      if (r.escalation_tier && r.escalation_tier !== "none") b.escalated += 1;
      buckets.set(key, b);
    }

    const payload = Array.from(buckets.values()).map((b) => {
      const escDensity = b.total ? b.escalated / b.total : 0;
      const fatigueScore = Math.min(100, Math.round(b.total * 4 + b.unresolved * 5 + escDensity * 20));
      const overload =
        fatigueScore >= 80 ? "severe" :
        fatigueScore >= 60 ? "high" :
        fatigueScore >= 35 ? "moderate" : "low";
      return {
        organization_id: b.org,
        scope_type: "owner",
        scope_id: b.owner,
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        total_interventions: b.total,
        unresolved_count: b.unresolved,
        escalation_density: Number(escDensity.toFixed(3)),
        repeat_advisories: 0,
        ignored_count: 0,
        fatigue_score: fatigueScore,
        overload_risk: overload,
      };
    });

    if (payload.length) {
      const { error: upErr } = await supabase
        .from("intervention_fatigue")
        .upsert(payload, { onConflict: "organization_id,scope_type,scope_id,window_start" });
      if (upErr) throw upErr;
    }

    return new Response(
      JSON.stringify({ ok: true, buckets_written: payload.length, correlation_id: correlationId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, correlation_id: correlationId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
