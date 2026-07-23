import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Find all orgs with Growth/Enterprise subscriptions
    const { data: subs } = await serviceClient
      .from("subscriptions")
      .select("organization_id, tier")
      .eq("status", "active")
      .in("tier", ["growth", "enterprise"]);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ message: "No eligible organizations" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roles = ["ceo", "cfo", "cmo", "coo"];
    const results: any[] = [];

    for (const sub of subs) {
      for (const role of roles) {
        try {
          // Call compute-executive-signals internally via service role
          const signalsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/compute-executive-signals`;

          // Get an owner to act as for the signals computation
          const { data: owner } = await serviceClient
            .from("organization_members")
            .select("user_id")
            .eq("organization_id", sub.organization_id)
            .eq("role", "owner")
            .limit(1)
            .single();

          if (!owner) continue;

          // Generate a brief directly using AI
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (!LOVABLE_API_KEY) continue;

          // Fetch risk index
          const { data: riskIndex } = await serviceClient
            .from("executive_risk_index")
            .select("score, components")
            .eq("organization_id", sub.organization_id)
            .eq("role_type", role)
            .maybeSingle();

          // Fetch active alerts
          const { data: alerts } = await serviceClient
            .from("executive_alerts")
            .select("title, severity")
            .eq("organization_id", sub.organization_id)
            .eq("role_type", role)
            .eq("status", "active");

          // Store brief record
          await serviceClient.from("executive_briefs").insert({
            organization_id: sub.organization_id,
            role_type: role,
            summary_json: {
              risk_score: riskIndex?.score ?? 0,
              components: riskIndex?.components ?? {},
              active_alerts: alerts?.length ?? 0,
              generated_type: "weekly_scheduled",
            },
            risk_score: riskIndex?.score ?? 0,
            generated_by: "scheduled",
          });

          results.push({ org: sub.organization_id, role, status: "ok" });
        } catch (e) {
          results.push({ org: sub.organization_id, role, status: "error", error: (e instanceof Error ? e.message : String(e)) });
        }
      }
    }

    console.log(JSON.stringify({ event: "weekly_briefs_generated", count: results.length }));

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("weekly-executive-brief error:", err);
    return new Response(JSON.stringify({ error: (err instanceof Error ? err.message : String(err)) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
