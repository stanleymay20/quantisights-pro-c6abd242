import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userInfo = { id: user.id, user_metadata: user.user_metadata || {} };

    const { ip_address, user_agent } = await req.json();

    // Get user's recent login history
    const { data: recentLogins } = await supabase
      .from("audit_log")
      .select("ip_address, payload, created_at")
      .eq("actor_id", user.id)
      .eq("action_type", "login")
      .order("created_at", { ascending: false })
      .limit(20);

    const anomalies: string[] = [];

    if (recentLogins && recentLogins.length > 0) {
      // Check for new IP
      const knownIPs = new Set(recentLogins.map((l) => l.ip_address).filter(Boolean));
      if (ip_address && knownIPs.size > 0 && !knownIPs.has(ip_address)) {
        anomalies.push("new_ip");
      }

      // Check for new user agent
      const knownAgents = new Set(
        recentLogins.map((l) => (l.payload as any)?.user_agent).filter(Boolean)
      );
      if (user_agent && knownAgents.size > 0 && !knownAgents.has(user_agent)) {
        anomalies.push("new_device");
      }

      // Check for rapid logins (>5 in last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const recentCount = recentLogins.filter((l) => l.created_at > oneHourAgo).length;
      if (recentCount >= 5) {
        anomalies.push("rapid_logins");
      }
    }

    // Log the current login
    const orgId = (user.user_metadata as any)?.organization_id;
    if (orgId) {
      await supabase.from("audit_log").insert({
        organization_id: orgId,
        actor_id: user.id,
        actor_type: "user",
        action_type: "login",
        resource_type: "session",
        ip_address: ip_address || null,
        payload: { user_agent: user_agent || null, anomalies },
      });
    }

    return new Response(
      JSON.stringify({
        anomalies,
        is_anomalous: anomalies.length > 0,
        message: anomalies.length > 0
          ? `Unusual login detected: ${anomalies.join(", ")}`
          : "Login looks normal",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: corsHeaders }
    );
  }
});
