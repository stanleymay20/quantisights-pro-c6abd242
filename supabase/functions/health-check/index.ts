import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { cronGuard } from "../_shared/cron-guard.ts";
import { verifyCronSecret } from "../_shared/cron-secret.ts";


/**
 * Health Check & SLO Monitor (v2.0)
 * 
 * Probes: database, auth, storage, cron jobs, execution engine telemetry
 * SLO Alerts: latency thresholds, error rate, cron staleness
 * Used by: uptime monitoring, load balancers, SLA dashboards
 */

// SLO thresholds
const SLO = {
  DB_LATENCY_WARN_MS: 500,
  DB_LATENCY_CRITICAL_MS: 2000,
  AUTH_LATENCY_WARN_MS: 1000,
  CRON_STALENESS_HOURS: 2,
  ERROR_RATE_WARN_PCT: 5,
  ERROR_RATE_CRITICAL_PCT: 15,
};

interface HealthCheck {
  status: "healthy" | "degraded" | "unreachable";
  latency_ms?: number;
  detail?: string;
}

interface SLOViolation {
  signal: string;
  severity: "warn" | "critical";
  message: string;
  value: number;
  threshold: number;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const log = createLogger("health-check", req);

  if (req.method === "OPTIONS") {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  // Public uptime probes get a minimal liveness response only.
  // Detailed metrics require the cron secret to prevent internal-info disclosure.
  if (!verifyCronSecret(req)) {
    return new Response(
      JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-cache" } },
    );
  }

  const guard = await cronGuard("health-check");
  if (!guard.acquired) return guard.earlyResponse(corsHeaders);

  const start = Date.now();
  const checks: Record<string, HealthCheck> = {};
  const sloViolations: SLOViolation[] = [];

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // 1. Database connectivity + latency
  try {
    const dbStart = Date.now();
    const { error } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .maybeSingle();

    const latency = Date.now() - dbStart;
    checks.database = {
      status: error ? "degraded" : "healthy",
      latency_ms: latency,
    };

    if (latency > SLO.DB_LATENCY_CRITICAL_MS) {
      sloViolations.push({ signal: "db_latency", severity: "critical", message: `Database latency ${latency}ms exceeds ${SLO.DB_LATENCY_CRITICAL_MS}ms`, value: latency, threshold: SLO.DB_LATENCY_CRITICAL_MS });
    } else if (latency > SLO.DB_LATENCY_WARN_MS) {
      sloViolations.push({ signal: "db_latency", severity: "warn", message: `Database latency ${latency}ms exceeds ${SLO.DB_LATENCY_WARN_MS}ms`, value: latency, threshold: SLO.DB_LATENCY_WARN_MS });
    }
  } catch {
    checks.database = { status: "unreachable" };
    sloViolations.push({ signal: "db_connectivity", severity: "critical", message: "Database unreachable", value: 0, threshold: 0 });
  }

  // 2. Auth service check
  try {
    const authStart = Date.now();
    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")!}/auth/v1/health`, {
      headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
    });
    const latency = Date.now() - authStart;
    checks.auth = {
      status: resp.ok ? "healthy" : "degraded",
      latency_ms: latency,
    };
    await resp.text();

    if (latency > SLO.AUTH_LATENCY_WARN_MS) {
      sloViolations.push({ signal: "auth_latency", severity: "warn", message: `Auth latency ${latency}ms exceeds ${SLO.AUTH_LATENCY_WARN_MS}ms`, value: latency, threshold: SLO.AUTH_LATENCY_WARN_MS });
    }
  } catch {
    checks.auth = { status: "unreachable" };
    sloViolations.push({ signal: "auth_connectivity", severity: "critical", message: "Auth service unreachable", value: 0, threshold: 0 });
  }

  // 3. Storage check
  try {
    const storageStart = Date.now();
    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")!}/storage/v1/health`, {
      headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
    });
    checks.storage = {
      status: resp.ok ? "healthy" : "degraded",
      latency_ms: Date.now() - storageStart,
    };
    await resp.text();
  } catch {
    checks.storage = { status: "unreachable" };
  }

  // 4. Cron job health — check for stale jobs
  try {
    const { data: recentCrons } = await supabase
      .from("cron_run_log")
      .select("job_name, status, started_at, duration_ms, error_message")
      .order("started_at", { ascending: false })
      .limit(20);

    const cronsByJob = new Map<string, { last_run: string; status: string; error?: string }>();
    for (const row of recentCrons || []) {
      if (!cronsByJob.has(row.job_name)) {
        cronsByJob.set(row.job_name, { last_run: row.started_at, status: row.status, error: row.error_message });
      }
    }

    const now = Date.now();
    const staleJobs: string[] = [];
    const failedJobs: string[] = [];

    for (const [name, info] of cronsByJob) {
      const hoursSince = (now - new Date(info.last_run).getTime()) / 3600000;
      if (hoursSince > SLO.CRON_STALENESS_HOURS) {
        staleJobs.push(name);
      }
      if (info.status === "failed") {
        failedJobs.push(name);
      }
    }

    checks.cron_jobs = {
      status: staleJobs.length > 0 || failedJobs.length > 0 ? "degraded" : "healthy",
      detail: `${cronsByJob.size} jobs tracked, ${staleJobs.length} stale, ${failedJobs.length} last-failed`,
    };

    if (staleJobs.length > 0) {
      sloViolations.push({ signal: "cron_staleness", severity: "warn", message: `Stale cron jobs: ${staleJobs.join(", ")}`, value: staleJobs.length, threshold: 0 });
    }
    if (failedJobs.length > 0) {
      sloViolations.push({ signal: "cron_failures", severity: "warn", message: `Failed cron jobs: ${failedJobs.join(", ")}`, value: failedJobs.length, threshold: 0 });
    }
  } catch {
    checks.cron_jobs = { status: "degraded", detail: "Could not query cron_run_log" };
  }

  // 5. Execution engine health — recent run_log error rate
  try {
    const { data: recentRuns } = await supabase
      .from("execution_run_log")
      .select("status, duration_ms")
      .gte("started_at", new Date(Date.now() - 3600000).toISOString())
      .limit(200);

    if (recentRuns && recentRuns.length > 0) {
      const total = recentRuns.length;
      const errors = recentRuns.filter(r => r.status === "failed").length;
      const errorRate = (errors / total) * 100;
      const avgDuration = recentRuns.reduce((s, r) => s + (r.duration_ms || 0), 0) / total;

      checks.execution_engine = {
        status: errorRate > SLO.ERROR_RATE_CRITICAL_PCT ? "degraded" : "healthy",
        detail: `${total} runs/hr, ${errorRate.toFixed(1)}% error rate, ${Math.round(avgDuration)}ms avg`,
      };

      if (errorRate > SLO.ERROR_RATE_CRITICAL_PCT) {
        sloViolations.push({ signal: "exec_error_rate", severity: "critical", message: `Execution error rate ${errorRate.toFixed(1)}% exceeds ${SLO.ERROR_RATE_CRITICAL_PCT}%`, value: errorRate, threshold: SLO.ERROR_RATE_CRITICAL_PCT });
      } else if (errorRate > SLO.ERROR_RATE_WARN_PCT) {
        sloViolations.push({ signal: "exec_error_rate", severity: "warn", message: `Execution error rate ${errorRate.toFixed(1)}% exceeds ${SLO.ERROR_RATE_WARN_PCT}%`, value: errorRate, threshold: SLO.ERROR_RATE_WARN_PCT });
      }
    } else {
      checks.execution_engine = { status: "healthy", detail: "No runs in last hour" };
    }
  } catch {
    checks.execution_engine = { status: "degraded", detail: "Could not query execution_run_log" };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === "healthy");
  const overallStatus = allHealthy ? "healthy" : "degraded";
  const httpStatus = allHealthy ? 200 : 503;

  // Log SLO violations
  if (sloViolations.length > 0) {
    log.warn(`SLO violations detected`, { violations: sloViolations });
  }

  try {
    await guard.succeed({ status: overallStatus, checks, slo_violations: sloViolations.length });
  } catch (e) {
    // If succeed fails (e.g. DB error during logging), still release the lock
    log.error("Failed to log health-check completion", { error: e instanceof Error ? e.message : String(e) });
    try { await guard.fail(e); } catch { /* lock release best-effort */ }
  }

  return new Response(
    JSON.stringify({
      status: overallStatus,
      version: "2.0.0",
      timestamp: new Date().toISOString(),
      uptime_ms: Date.now() - start,
      checks,
      slo: {
        violations: sloViolations,
        thresholds: SLO,
      },
    }),
    {
      status: httpStatus,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store",
      },
    }
  );
});
