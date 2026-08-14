/**
 * connector-scheduler — cron-driven dispatcher for connector_sync_schedules.
 *
 * Runs every 5 minutes via pg_cron. Picks up schedules with next_run_at <= now()
 * and dispatches the appropriate sync function for each connector. Updates
 * next_run_at + last_dispatch_at atomically to prevent double-dispatch.
 *
 * Authentication: cron secret (x-cron-secret) verified against Vault.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { cronGuard } from "../_shared/cron-guard.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface ScheduleRow {
  id: string;
  organization_id: string;
  connector_id: string;
  schedule_kind: "manual" | "every_5_min" | "hourly" | "daily";
  next_run_at: string | null;
}

const NEXT_INTERVAL_MS: Record<string, number> = {
  every_5_min: 5 * 60 * 1000,
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const log = createLogger("connector-scheduler", req);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    log.error("missing required Supabase environment configuration");
    return new Response(JSON.stringify({ error: "Scheduler unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify cron secret before any service-role workload is performed.
  const svc = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: expected, error: secretError } = await svc.rpc("get_ingest_cron_secret");
  const provided = req.headers.get("x-cron-secret");
  if (secretError || typeof expected !== "string" || !provided || expected !== provided) {
    log.warn("invalid cron secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const guard = await cronGuard("pipeline-orchestrator", 700099);
  if (!guard.acquired) return guard.earlyResponse(corsHeaders);

  try {
    const now = new Date();
    const { data: schedules, error } = await svc
      .from("connector_sync_schedules")
      .select("id,organization_id,connector_id,schedule_kind,next_run_at")
      .eq("is_active", true)
      .neq("schedule_kind", "manual")
      .lte("next_run_at", now.toISOString())
      .limit(50);

    if (error) {
      log.error("fetch schedules failed", { error: error.message });
      await guard.fail(error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dispatched: string[] = [];
    const skipped: string[] = [];

    for (const sched of (schedules ?? []) as ScheduleRow[]) {
      const intervalMs = NEXT_INTERVAL_MS[sched.schedule_kind] ?? 60 * 60 * 1000;
      const nextRun = new Date(now.getTime() + intervalMs).toISOString();

      // Compare-and-swap claim: a zero-row update means another worker changed
      // next_run_at first. Only the worker that receives the claimed row may
      // dispatch the connector.
      const { data: claimed, error: claimErr } = await svc
        .from("connector_sync_schedules")
        .update({ last_dispatch_at: now.toISOString(), next_run_at: nextRun })
        .eq("id", sched.id)
        .eq("organization_id", sched.organization_id)
        .eq("next_run_at", sched.next_run_at)
        .select("id")
        .maybeSingle();

      if (claimErr || !claimed?.id) {
        skipped.push(sched.connector_id);
        if (claimErr) {
          log.warn("schedule claim failed", { schedule_id: sched.id, error: claimErr.message });
        }
        continue;
      }

      // Look up the connector inside the same organization before dispatch.
      const { data: cRow, error: connectorError } = await svc
        .from("data_connectors")
        .select("connector_type,status")
        .eq("id", sched.connector_id)
        .eq("organization_id", sched.organization_id)
        .maybeSingle();
      if (connectorError || !cRow || cRow.status === "paused") {
        skipped.push(sched.connector_id);
        continue;
      }

      const fnName = pickFunction(cRow.connector_type);
      if (!fnName) {
        skipped.push(sched.connector_id);
        continue;
      }

      const url = `${supabaseUrl}/functions/v1/${fnName}`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": provided,
            apikey: anonKey,
          },
          body: JSON.stringify({
            connector_id: sched.connector_id,
            triggered_by: "schedule",
            request_id: `cron-${sched.id}-${now.getTime()}`,
          }),
        });
        if (!response.ok) {
          log.warn("dispatch returned non-success status", {
            connector: sched.connector_id,
            status: response.status,
          });
          skipped.push(sched.connector_id);
          continue;
        }
        dispatched.push(sched.connector_id);
      } catch (e: unknown) {
        log.warn("dispatch failed", {
          connector: sched.connector_id,
          error: e instanceof Error ? e.message : String(e),
        });
        skipped.push(sched.connector_id);
      }
    }

    await guard.succeed({ dispatched: dispatched.length, skipped: skipped.length });
    return new Response(
      JSON.stringify({ dispatched, skipped, scanned: schedules?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    log.error("fatal", { error: e instanceof Error ? e.message : String(e) });
    await guard.fail(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function pickFunction(connectorType: string): string | null {
  switch (connectorType) {
    case "rest_api":
      return "connector-rest-sync";
    // csv_upload, postgres, mysql, snowflake, bigquery: not yet wired
    default:
      return null;
  }
}
