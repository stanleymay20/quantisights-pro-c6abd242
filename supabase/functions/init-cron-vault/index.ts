/**
 * One-shot bootstrapper: copies the INGEST_CRON_SECRET env var into Supabase Vault
 * under the name `ingest_cron_secret` so pg_cron jobs can read it at runtime.
 *
 * Idempotent: re-running upserts the existing vault entry.
 *
 * Safe to expose: the function takes no input that affects what gets written.
 * It only mirrors a server-side env var (set by an admin via Lovable Cloud
 * secrets) into Vault. There is no way for a caller to inject a chosen value.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const log = createLogger("init-cron-vault", req);

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const expected = Deno.env.get("INGEST_CRON_SECRET");
  if (!expected) {
    log.error("INGEST_CRON_SECRET not configured");
    return json({ error: "Server not configured" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Use raw SQL via Postgres-side admin function (vault RPCs vary across versions).
    // Safest path: call vault.create_secret / update_secret directly through PostgREST RPC.
    // We expose two tiny SECURITY DEFINER wrappers in public to avoid schema scoping issues.
    const { error: rpcError } = await supabase.rpc("upsert_vault_secret", {
      _name: "ingest_cron_secret",
      _value: expected,
      _description: "Shared secret used by pg_cron to authenticate to ingest-external-signals",
    });
    if (rpcError) throw rpcError;

    log.info("vault secret synced");
    return json({ ok: true, message: "Cron secret synced to Vault" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error("vault write failed", { error: msg });
    return json({ error: msg }, 500);
  }
});
