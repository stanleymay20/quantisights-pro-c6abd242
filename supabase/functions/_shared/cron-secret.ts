/**
 * Cron secret guard.
 * Requires callers to present `x-cron-secret` matching the INGEST_CRON_SECRET env var.
 * Used to lock down cron-only edge functions that must not be invoked by the public internet.
 */
export function verifyCronSecret(req: Request): boolean {
  const expected = Deno.env.get("INGEST_CRON_SECRET");
  if (!expected) return false;
  const incoming = req.headers.get("x-cron-secret");
  return !!incoming && incoming === expected;
}

export function cronSecretUnauthorized(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
