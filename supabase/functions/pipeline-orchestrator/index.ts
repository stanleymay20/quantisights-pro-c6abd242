import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { cronGuard } from "../_shared/cron-guard.ts";
import { verifyCronSecret, cronSecretUnauthorized } from "../_shared/cron-secret.ts";


/**
 * Pipeline Orchestrator — Enterprise Scheduled Sync Engine
 * 
 * Checks sync_schedules for overdue syncs and triggers connector-pull.
 * Supports retry logic with exponential backoff and dependency tracking.
 * 
 * Triggered via: cron, manual invocation, or webhook.
 */

interface SyncSchedule {
  id: string;
  organization_id: string;
  data_source_id: string;
  frequency: string;
  is_active: boolean;
  next_run_at: string;
  last_run_at: string | null;
  last_error: string | null;
  run_count: number;
  retry_count: number;
  max_retries: number;
  backoff_minutes: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  if (!verifyCronSecret(req)) return cronSecretUnauthorized(corsHeaders);

  // Advisory lock — prevent overlapping cron runs
  const guard = await cronGuard("pipeline-orchestrator");
  if (!guard.acquired) return guard.earlyResponse(corsHeaders);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceKey);

  const results: any[] = [];
  const now = new Date();

  try {
    // 1. Fetch overdue schedules
    const { data: schedules, error: schErr } = await (svc.from("sync_schedules") as any)
      .select("*, data_sources(id, name, config, organization_id, source_type)")
      .eq("is_active", true)
      .lte("next_run_at", now.toISOString())
      .order("next_run_at", { ascending: true })
      .limit(20);

    if (schErr) throw schErr;
    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ message: "No pending syncs", checked_at: now.toISOString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const schedule of schedules) {
      const ds = schedule.data_sources;
      if (!ds) continue;

      const connectorType = ds.config?.connector_type || ds.source_type;
      const syncResult: any = { schedule_id: schedule.id, data_source: ds.name, connector: connectorType };

      try {
        // Get metric mappings for this data source
        const { data: mappings } = await (svc.from("metric_mappings") as any)
          .select("*")
          .eq("data_source_id", ds.id)
          .eq("is_active", true);

        if (!mappings || mappings.length === 0) {
          syncResult.status = "skipped";
          syncResult.reason = "No active metric mappings";
          results.push(syncResult);
          continue;
        }

        // Trigger connector-pull via internal function call
        const pullRes = await fetch(`${supabaseUrl}/functions/v1/connector-pull`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            connector_type: connectorType,
            data_source_id: ds.id,
            organization_id: ds.organization_id,
          }),
        });

        const pullData = await pullRes.json();

        if (pullRes.ok && pullData.success) {
          syncResult.status = "completed";
          syncResult.records = pullData.records;
          syncResult.errors = pullData.errors;

          // Reset retry count on success
          const nextRun = computeNextRun(schedule.frequency, now);
          await (svc.from("sync_schedules") as any).update({
            last_run_at: now.toISOString(),
            next_run_at: nextRun.toISOString(),
            retry_count: 0,
          }).eq("id", schedule.id);
        } else {
          const retryCount = (schedule.retry_count || 0) + 1;
          const maxRetries = schedule.max_retries || 3;

          if (retryCount >= maxRetries) {
            syncResult.status = "failed_max_retries";
            await (svc.from("sync_schedules") as any).update({
              is_active: false,
              retry_count: retryCount,
              last_run_at: now.toISOString(),
            }).eq("id", schedule.id);

            // Create alert
            await svc.from("audit_log").insert({
              organization_id: ds.organization_id,
              actor_type: "system",
              action_type: "sync_failed_permanently",
              resource_type: "data_source",
              resource_id: ds.id,
              payload: { reason: pullData.error || pullData.errors, retries: retryCount },
            });
          } else {
            const backoffMinutes = (schedule.backoff_minutes || 15) * Math.pow(2, retryCount - 1);
            const retryAt = new Date(now.getTime() + backoffMinutes * 60 * 1000);
            syncResult.status = "retry_scheduled";
            syncResult.retry_at = retryAt.toISOString();
            syncResult.retry_count = retryCount;

            await (svc.from("sync_schedules") as any).update({
              next_run_at: retryAt.toISOString(),
              retry_count: retryCount,
              last_run_at: now.toISOString(),
            }).eq("id", schedule.id);
          }

          syncResult.error = pullData.error || pullData.errors?.join("; ");
        }
      } catch (err: unknown) {
        syncResult.status = "error";
        syncResult.error = err instanceof Error ? err.message : String(err);
      }

      results.push(syncResult);
    }

    // Pipeline health summary
    const { count: totalActive } = await (svc.from("sync_schedules") as any)
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);

    const { count: totalFailed } = await svc.from("data_sync_jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());

    await guard.succeed({ syncs_processed: results.length, pipeline_health: {
      active_schedules: totalActive || 0,
      failed_last_24h: totalFailed || 0,
      health_status: (totalFailed || 0) === 0 ? "healthy" : (totalFailed || 0) < 3 ? "degraded" : "critical",
    }});

    return new Response(JSON.stringify({
      success: true,
      executed_at: now.toISOString(),
      syncs_processed: results.length,
      results,
      pipeline_health: {
        active_schedules: totalActive || 0,
        failed_last_24h: totalFailed || 0,
        health_status: (totalFailed || 0) === 0 ? "healthy" : (totalFailed || 0) < 3 ? "degraded" : "critical",
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("pipeline-orchestrator error:", err);
    await guard.fail(err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function computeNextRun(frequency: string, from: Date): Date {
  const next = new Date(from);
  switch (frequency) {
    case "hourly": next.setHours(next.getHours() + 1); break;
    case "daily": next.setDate(next.getDate() + 1); break;
    case "weekly": next.setDate(next.getDate() + 7); break;
    case "monthly": next.setMonth(next.getMonth() + 1); break;
    default: next.setDate(next.getDate() + 1);
  }
  return next;
}
