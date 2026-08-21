import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { cronGuard } from "../_shared/cron-guard.ts";
import { verifyCronSecret, cronSecretUnauthorized } from "../_shared/cron-secret.ts";

/**
 * Pipeline Orchestrator — Enterprise Scheduled Sync Engine
 *
 * Checks sync_schedules for overdue syncs and triggers connector-pull.
 * Every due schedule is advanced, retried, or disabled explicitly; no schedule
 * may remain perpetually overdue because an inner step threw or was skipped.
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

type ScheduleResult = {
  schedule_id: string;
  data_source?: string;
  connector?: string;
  status: string;
  records?: number;
  errors?: unknown;
  error?: string;
  reason?: string;
  retry_at?: string;
  retry_count?: number;
};

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

async function updateScheduleOrThrow(svc: any, scheduleId: string, patch: Record<string, unknown>) {
  const { error } = await (svc.from("sync_schedules") as any)
    .update(patch)
    .eq("id", scheduleId);
  if (error) throw new Error(`sync schedule bookkeeping failed: ${error.message}`);
}

async function recordScheduleFailure(
  svc: any,
  schedule: SyncSchedule,
  now: Date,
  message: string,
  organizationId?: string,
  dataSourceId?: string,
): Promise<ScheduleResult> {
  const retryCount = (schedule.retry_count || 0) + 1;
  const maxRetries = schedule.max_retries || 3;
  const truncated = message.slice(0, 2_000);

  if (retryCount >= maxRetries) {
    await updateScheduleOrThrow(svc, schedule.id, {
      is_active: false,
      retry_count: retryCount,
      last_run_at: now.toISOString(),
      last_error: truncated,
      run_count: (schedule.run_count || 0) + 1,
    });

    if (organizationId && dataSourceId) {
      const { error: auditError } = await svc.from("audit_log").insert({
        organization_id: organizationId,
        actor_type: "system",
        action_type: "sync_failed_permanently",
        resource_type: "data_source",
        resource_id: dataSourceId,
        payload: { reason: truncated, retries: retryCount },
      });
      if (auditError) {
        console.error("pipeline-orchestrator audit failure", auditError.message);
      }
    }

    return {
      schedule_id: schedule.id,
      status: "failed_max_retries",
      retry_count: retryCount,
      error: truncated,
    };
  }

  const backoffMinutes = (schedule.backoff_minutes || 15) * Math.pow(2, retryCount - 1);
  const retryAt = new Date(now.getTime() + backoffMinutes * 60 * 1000);
  await updateScheduleOrThrow(svc, schedule.id, {
    next_run_at: retryAt.toISOString(),
    retry_count: retryCount,
    last_run_at: now.toISOString(),
    last_error: truncated,
    run_count: (schedule.run_count || 0) + 1,
  });

  return {
    schedule_id: schedule.id,
    status: "retry_scheduled",
    retry_at: retryAt.toISOString(),
    retry_count: retryCount,
    error: truncated,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  if (!verifyCronSecret(req)) return cronSecretUnauthorized(corsHeaders);

  const guard = await cronGuard("pipeline-orchestrator");
  if (!guard.acquired) return guard.earlyResponse(corsHeaders);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceKey);
  const results: ScheduleResult[] = [];
  const now = new Date();

  try {
    const { data: schedules, error: schErr } = await (svc.from("sync_schedules") as any)
      .select("*, data_sources(id, name, config, organization_id, source_type)")
      .eq("is_active", true)
      .lte("next_run_at", now.toISOString())
      .order("next_run_at", { ascending: true })
      .limit(20);

    if (schErr) throw schErr;
    if (!schedules || schedules.length === 0) {
      await guard.succeed({ syncs_processed: 0, pipeline_health: { health_status: "healthy" } });
      return new Response(JSON.stringify({
        success: true,
        message: "No pending syncs",
        checked_at: now.toISOString(),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    for (const rawSchedule of schedules) {
      const schedule = rawSchedule as SyncSchedule & { data_sources?: any };
      const ds = schedule.data_sources;
      const base: ScheduleResult = {
        schedule_id: schedule.id,
        data_source: ds?.name,
        connector: ds?.config?.connector_type || ds?.source_type,
        status: "pending",
      };

      if (!ds) {
        const failure = await recordScheduleFailure(
          svc,
          schedule,
          now,
          "Scheduled data source no longer exists or is inaccessible",
        );
        results.push({ ...base, ...failure });
        continue;
      }

      try {
        const { data: mappings, error: mappingError } = await (svc.from("metric_mappings") as any)
          .select("id")
          .eq("data_source_id", ds.id)
          .eq("is_active", true);
        if (mappingError) throw new Error(`metric mapping lookup failed: ${mappingError.message}`);

        if (!mappings || mappings.length === 0) {
          const nextRun = computeNextRun(schedule.frequency, now);
          await updateScheduleOrThrow(svc, schedule.id, {
            last_run_at: now.toISOString(),
            next_run_at: nextRun.toISOString(),
            last_error: "No active metric mappings",
            retry_count: 0,
            run_count: (schedule.run_count || 0) + 1,
          });
          results.push({ ...base, status: "skipped_no_mappings", reason: "No active metric mappings" });
          continue;
        }

        const pullRes = await fetch(`${supabaseUrl}/functions/v1/connector-pull`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ connector_id: ds.config?.connector_id ?? ds.config?.id }),
          signal: AbortSignal.timeout(120_000),
        });

        const rawText = await pullRes.text();
        let pullData: any = {};
        try {
          pullData = rawText ? JSON.parse(rawText) : {};
        } catch {
          throw new Error(`connector-pull returned non-JSON HTTP ${pullRes.status}`);
        }

        // connector-pull deliberately reports partial runs as success=true with
        // an errors array. Preserve that distinction instead of flattening it.
        const hasErrors = Array.isArray(pullData.errors) && pullData.errors.length > 0;
        if (pullRes.ok && pullData.success) {
          const nextRun = computeNextRun(schedule.frequency, now);
          await updateScheduleOrThrow(svc, schedule.id, {
            last_run_at: now.toISOString(),
            next_run_at: nextRun.toISOString(),
            retry_count: 0,
            last_error: hasErrors ? pullData.errors.join("; ").slice(0, 2_000) : null,
            run_count: (schedule.run_count || 0) + 1,
          });
          results.push({
            ...base,
            status: hasErrors ? "partial" : "completed",
            records: Number(pullData.records ?? 0),
            errors: pullData.errors,
          });
          continue;
        }

        const reason = String(
          pullData.error || (Array.isArray(pullData.errors) ? pullData.errors.join("; ") : "") ||
          `connector-pull HTTP ${pullRes.status}`,
        );
        const failure = await recordScheduleFailure(svc, schedule, now, reason, ds.organization_id, ds.id);
        results.push({ ...base, ...failure });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          const failure = await recordScheduleFailure(svc, schedule, now, message, ds.organization_id, ds.id);
          results.push({ ...base, ...failure });
        } catch (bookkeepingErr) {
          // At this point both execution and retry bookkeeping failed. Surface it
          // prominently so the cron run cannot be reported as healthy.
          const bookkeepingMessage = bookkeepingErr instanceof Error ? bookkeepingErr.message : String(bookkeepingErr);
          results.push({ ...base, status: "bookkeeping_failed", error: `${message}; ${bookkeepingMessage}` });
        }
      }
    }

    const { count: totalActive, error: activeError } = await (svc.from("sync_schedules") as any)
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);
    if (activeError) throw activeError;

    const { count: failedJobs, error: failedError } = await svc.from("data_sync_jobs")
      .select("*", { count: "exact", head: true })
      .in("status", ["failed", "partial"])
      .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
    if (failedError) throw failedError;

    const currentRunProblems = results.filter((r) =>
      ["failed_max_retries", "retry_scheduled", "bookkeeping_failed"].includes(r.status)
    ).length;
    const partials = results.filter((r) => r.status === "partial").length;
    const problemCount = (failedJobs || 0) + currentRunProblems;
    const healthStatus = problemCount === 0 && partials === 0
      ? "healthy"
      : problemCount < 3
        ? "degraded"
        : "critical";

    const pipelineHealth = {
      active_schedules: totalActive || 0,
      failed_or_partial_last_24h: failedJobs || 0,
      current_run_problems: currentRunProblems,
      current_run_partials: partials,
      health_status: healthStatus,
    };

    await guard.succeed({ syncs_processed: results.length, pipeline_health: pipelineHealth });

    return new Response(JSON.stringify({
      success: currentRunProblems === 0,
      executed_at: now.toISOString(),
      syncs_processed: results.length,
      results,
      pipeline_health: pipelineHealth,
    }), {
      status: currentRunProblems === 0 ? 200 : 207,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("pipeline-orchestrator error:", err);
    await guard.fail(err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
