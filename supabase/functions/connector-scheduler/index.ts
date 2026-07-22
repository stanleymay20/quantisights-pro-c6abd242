// @ts-nocheck
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

  const log = createLogger("connector-scheduler", req);

  // Verify cron secret
  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  ) as any;
  const { data: expected } = await svc.rpc("get_ingest_cron_secret");
  const provided = req.headers.get("x-cron-secret");
  if (!expected || expected !== provided) {
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
      // Compute next run + claim
      const intervalMs = NEXT_INTERVAL_MS[sched.schedule_kind] ?? 60 * 60 * 1000;
      const nextRun = new Date(now.getTime() + intervalMs).toISOString();

      const { error: claimErr } = await svc
        .from("connector_sync_schedules")
        .update({ last_dispatch_at: now.toISOString(), next_run_at: nextRun })
        .eq("id", sched.id)
        .eq("next_run_at", sched.next_run_at);

      if (claimErr) {
        skipped.push(sched.connector_id);
        continue;
      }

      // Look up connector type to choose handler
      const { data: cRow } = await svc
        .from("data_connectors")
        .select("connector_type,status")
        .eq("id", sched.connector_id)
        .maybeSingle();
      if (!cRow || (cRow as { status: string }).status === "paused") {
        skipped.push(sched.connector_id);
        continue;
      }

      const fnName = pickFunction((cRow as { connector_type: string }).connector_type);
      if (!fnName) {
        skipped.push(sched.connector_id);
        continue;
      }

      // Fire-and-forget dispatch (best-effort with cron-secret header)
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fnName}`;
      try {
        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": provided,
            apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          },
          body: JSON.stringify({
            connector_id: sched.connector_id,
            triggered_by: "schedule",
            request_id: `cron-${sched.id}-${now.getTime()}`,
          }),
        });
        dispatched.push(sched.connector_id);
      } catch (e) {
        log.warn("dispatch failed", {
          connector: sched.connector_id,
          error: String(e),
        });
        skipped.push(sched.connector_id);
      }
    }

    await guard.succeed({ dispatched: dispatched.length, skipped: skipped.length });
    return new Response(
      JSON.stringify({ dispatched, skipped, scanned: schedules?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    log.error("fatal", { error: String(e) });
    await guard.fail(e);
    return new Response(JSON.stringify({ error: String(e) }), {
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
