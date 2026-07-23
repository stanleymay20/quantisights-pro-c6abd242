import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Cron Guard — Advisory Lock + cron_run_log for all scheduled functions.
 *
 * Each cron job gets a unique lock_id (bigint). If another instance is
 * already running, the guard returns { acquired: false } and the function
 * should exit immediately.
 *
 * Usage:
 *   const guard = await cronGuard("my-job", 100001);
 *   if (!guard.acquired) return guard.earlyResponse(corsHeaders);
 *   try { ... await guard.succeed({ records: 42 }); }
 *   catch (e) { await guard.fail(e); throw e; }
 */

// Well-known lock IDs — keep in sync across the codebase
export const LOCK_IDS = {
  "evaluate-outcomes": 700001,
  "adaptive-calibration": 700002,
  "retention-cleanup": 700003,
  "morning-brief": 700004,
  "convergence-reconcile": 700005,
  "health-check": 700006,
  "pipeline-orchestrator": 700007,
  "alert-monitor": 700008,
} as const;

export type CronJobName = keyof typeof LOCK_IDS;

interface CronGuardResult {
  acquired: boolean;
  earlyResponse: (corsHeaders: Record<string, string>) => Response;
  succeed: (metadata?: Record<string, unknown>) => Promise<void>;
  fail: (err: unknown) => Promise<void>;
}

export async function cronGuard(
  jobName: CronJobName,
  lockIdOverride?: number,
): Promise<CronGuardResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const lockId = lockIdOverride ?? LOCK_IDS[jobName];
  const startedAt = new Date();

  // Try advisory lock
  const { data: lockResult } = await svc.rpc("try_cron_advisory_lock", { _lock_id: lockId });
  const acquired = lockResult === true;

  if (!acquired) {
    // Log the skip
    await svc.from("cron_run_log").insert({
      job_name: jobName,
      status: "skipped_overlap",
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      metadata: { reason: "Advisory lock not acquired — another instance running" },
    });

    return {
      acquired: false,
      earlyResponse: (corsHeaders: Record<string, string>) =>
        new Response(
          JSON.stringify({ skipped: true, reason: "Another instance is already running" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        ),
      succeed: async () => {},
      fail: async () => {},
    };
  }

  const releaseLock = async () => {
    await svc.rpc("release_cron_advisory_lock", { _lock_id: lockId });
  };

  return {
    acquired: true,
    earlyResponse: () => new Response("should not be called", { status: 500 }),
    succeed: async (metadata?: Record<string, unknown>) => {
      const completedAt = new Date();
      await svc.from("cron_run_log").insert({
        job_name: jobName,
        status: "completed",
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: completedAt.getTime() - startedAt.getTime(),
        metadata: metadata ?? {},
      });
      await releaseLock();
    },
    fail: async (err: unknown) => {
      const completedAt = new Date();
      await svc.from("cron_run_log").insert({
        job_name: jobName,
        status: "failed",
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: completedAt.getTime() - startedAt.getTime(),
        error_message: err instanceof Error ? err.message : String(err),
        metadata: {},
      });
      await releaseLock();
    },
  };
}
