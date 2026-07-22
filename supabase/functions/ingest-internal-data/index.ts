/**
 * Ingest Internal Data — programmatic REST endpoint for org-scoped internal
 * reference signals (industry benchmarks, regulatory thresholds, competitive
 * intel) that blend into Layer B advisory context.
 *
 * Auth: requires authenticated user JWT. The user's organization is resolved
 * via profiles, and the user must hold an admin/owner role for that org.
 *
 * Body: { rows: Array<{ metric_name, value, source, ... }> }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";

interface InboundRow {
  category?: string;
  metric_name: string;
  value: number;
  unit?: string;
  industry?: string;
  region?: string;
  period_start?: string;
  period_end?: string;
  source: string;
  source_url?: string;
  confidence_grade?: "A" | "B" | "C";
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const log = createLogger("ingest-internal-data", req);

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return json({ error: "Missing bearer token" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userResult, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userResult?.user) return json({ error: "Invalid token" }, 401);
  const userId = userResult.user.id;
  log.setUser(userId);

  const svc = createClient(supabaseUrl, serviceKey);

  // Resolve org + verify elevated role
  const { data: profile } = await svc
    .from("profiles")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();

  const orgId = profile?.organization_id as string | undefined;
  if (!orgId) return json({ error: "User has no organization" }, 403);

  const { data: roleCheck } = await svc.rpc("exec_require_elevated_role", {
    _user_id: userId,
    _org_id: orgId,
  });
  if (!roleCheck) return json({ error: "Requires admin or owner role" }, 403);

  let body: { rows?: InboundRow[] } = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return json({ error: "No rows provided" }, 400);
  if (rows.length > 5000) return json({ error: "Max 5000 rows per request" }, 413);

  const cleaned = rows
    .filter((r) => r && typeof r.metric_name === "string" && typeof r.source === "string" && Number.isFinite(Number(r.value)))
    .map((r) => ({
      organization_id: orgId,
      category: r.category ?? "industry",
      metric_name: r.metric_name.trim(),
      value: Number(r.value),
      unit: r.unit ?? null,
      industry: r.industry ?? null,
      region: r.region ?? null,
      period_start: r.period_start ?? null,
      period_end: r.period_end ?? null,
      source: r.source.trim(),
      source_url: r.source_url ?? null,
      confidence_grade: r.confidence_grade ?? "B",
      metadata: { ...(r.metadata ?? {}), entry_method: "rest_api", ingested_by: userId },
    }));

  if (cleaned.length === 0) return json({ error: "All rows failed validation" }, 400);

  const { error } = await svc
    .from("internal_reference_data")
    .upsert(cleaned, { onConflict: "organization_id,metric_name,source,period_start", ignoreDuplicates: false });

  if (error) {
    log.error("upsert failed", { error: error.message });
    return json({ error: error.message }, 500);
  }

  // Audit
  await svc.from("audit_log").insert({
    organization_id: orgId,
    actor_id: userId,
    actor_type: "user",
    action_type: "internal_reference_data_ingest",
    resource_type: "internal_reference_data",
    payload: { rows_upserted: cleaned.length },
  });

  log.info("ingest complete", { rows: cleaned.length });
  return json({ ok: true, rows_upserted: cleaned.length });
});
