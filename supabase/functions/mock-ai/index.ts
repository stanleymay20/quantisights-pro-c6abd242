// supabase/functions/mock-ai/index.ts
// Deterministic stub. Refuses to run unless x-test-mock: 1.
// Supports x-mock-failure for chaos tests.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.headers.get("x-test-mock") !== "1") {
    return new Response(JSON.stringify({ error: "mock-ai requires x-test-mock: 1" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const failure = req.headers.get("x-mock-failure");
  switch (failure) {
    case "timeout": await new Promise((r) => setTimeout(r, 31_000)); break;
    case "rate_limit":
      return new Response(JSON.stringify({ error: "rate_limited" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    case "malformed":
      return new Response("{not-json", { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    case "unavailable":
      return new Response(JSON.stringify({ error: "unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  await req.text().catch(() => "");
  return new Response(JSON.stringify({
    ok: true, recommendation: "mock-recommendation", confidence: 0.75, mock: true,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
