import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { cronGuard } from "../_shared/cron-guard.ts";
import { verifyCronSecret, cronSecretUnauthorized } from "../_shared/cron-secret.ts";


/**
 * Alert Monitor — Enterprise observability alerting.
 * 
 * Checks for:
 * 1. Failed cron jobs in the last hour
 * 2. Rising error rates in audit_log
 * 3. Calibration failures
 * 4. Outcome evaluation failures
 * 5. Upload pipeline failures
 * 
 * Can be called by cron (every 15 min) or manually.
 */

interface Alert {
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  count: number;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const log = createLogger("alert-monitor", req);

  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  if (req.method === "OPTIONS") return corsPreflightResponse(req);

  if (!verifyCronSecret(req)) return cronSecretUnauthorized(corsHeaders);


    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: cron calls are protected by advisory lock; user calls require auth header
    const authHeader = req.headers.get("Authorization") || "";

    const svc = createClient(supabaseUrl, serviceKey);

    const guard = await cronGuard("alert-monitor");
    if (!guard.acquired) return guard.earlyResponse(corsHeaders);

    log.info("Alert monitor scan starting");
    const alerts: Alert[] = [];
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const sixHoursAgo = new Date(Date.now() - 21600000).toISOString();

    // 1. Failed cron jobs in last hour
    const { data: failedCrons } = await svc
      .from("cron_run_log")
      .select("job_name, error_message, started_at")
      .eq("status", "failed")
      .gte("started_at", oneHourAgo)
      .limit(50);

    if (failedCrons && failedCrons.length > 0) {
      const jobNames = [...new Set(failedCrons.map((c: any) => c.job_name))];
      alerts.push({
        severity: failedCrons.length >= 3 ? "critical" : "warning",
        category: "cron_failure",
        message: `${failedCrons.length} cron job(s) failed in last hour: ${jobNames.join(", ")}`,
        count: failedCrons.length,
        metadata: { jobs: jobNames },
      });
    }

    // 2. Client errors in audit_log (last 6 hours)
    const { data: clientErrors, count: errorCount } = await svc
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action_type", "client_error")
      .gte("created_at", sixHoursAgo);

    if (errorCount && errorCount > 10) {
      alerts.push({
        severity: errorCount > 50 ? "critical" : "warning",
        category: "client_error_spike",
        message: `${errorCount} client errors logged in last 6 hours`,
        count: errorCount,
      });
    }

    // 3. Calibration health — check latest model age
    const { data: latestCal } = await svc
      .from("calibration_models")
      .select("computed_at, overall_calibration_score")
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestCal) {
      const age = Date.now() - new Date(latestCal.computed_at).getTime();
      if (age > 86400000) { // > 24h old
        alerts.push({
          severity: "warning",
          category: "calibration_stale",
          message: `Calibration model is ${Math.round(age / 3600000)}h old`,
          count: 1,
          metadata: { score: latestCal.overall_calibration_score },
        });
      }
    }

    // 4. Not-evaluable outcomes spike
    const { data: notEval, count: notEvalCount } = await svc
      .from("decision_outcomes")
      .select("id", { count: "exact", head: true })
      .eq("outcome_status", "not_evaluable")
      .gte("evaluation_date", sixHoursAgo);

    if (notEvalCount && notEvalCount > 5) {
      alerts.push({
        severity: "warning",
        category: "outcome_evaluation_failure",
        message: `${notEvalCount} outcomes became not_evaluable in last 6 hours`,
        count: notEvalCount,
      });
    }

    // 5. Dataset upload failures (stale datasets)
    const { data: staleDs, count: staleCount } = await svc
      .from("datasets")
      .select("id", { count: "exact", head: true })
      .eq("is_stale", true);

    if (staleCount && staleCount > 3) {
      alerts.push({
        severity: "info",
        category: "stale_datasets",
        message: `${staleCount} datasets are stale per freshness policy`,
        count: staleCount,
      });
    }

    // 6. AICIS surface staleness — query directly from surface_status (authoritative)
    const twelveHoursAgo = new Date(Date.now() - 12 * 3600_000).toISOString();
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600_000).toISOString();
    const { data: aicisSurfaces } = await svc
      .from("aicis_sync_surface_status")
      .select("organization_id, surface, last_success_at, consecutive_failures, last_error_message, circuit_breaker_until");

    if (aicisSurfaces && aicisSurfaces.length > 0) {
      const critical = aicisSurfaces.filter((s: any) =>
        !s.last_success_at || s.last_success_at < fortyEightHoursAgo || (s.consecutive_failures ?? 0) >= 10
      );
      const warning = aicisSurfaces.filter((s: any) =>
        s.last_success_at && s.last_success_at >= fortyEightHoursAgo && s.last_success_at < twelveHoursAgo
      );
      if (critical.length > 0) {
        alerts.push({
          severity: "critical",
          category: "aicis_surface_stale",
          message: `${critical.length} AICIS surface(s) stale >48h or in breakdown: ${critical.map((s: any) => s.surface).join(", ")}`,
          count: critical.length,
          metadata: { surfaces: critical.map((s: any) => ({ surface: s.surface, last_success_at: s.last_success_at, consecutive_failures: s.consecutive_failures, error: s.last_error_message })) },
        });
      }
      if (warning.length > 0) {
        alerts.push({
          severity: "warning",
          category: "aicis_surface_stale",
          message: `${warning.length} AICIS surface(s) stale 12–48h: ${warning.map((s: any) => s.surface).join(", ")}`,
          count: warning.length,
          metadata: { surfaces: warning.map((s: any) => ({ surface: s.surface, last_success_at: s.last_success_at })) },
        });
      }
    }

    // Log alerts to cron_run_log
    const summary = {
      alerts_count: alerts.length,
      critical: alerts.filter(a => a.severity === "critical").length,
      warnings: alerts.filter(a => a.severity === "warning").length,
      info: alerts.filter(a => a.severity === "info").length,
      alerts,
    };

    log.info("Alert monitor scan complete", summary);
    await guard.succeed(summary);

    // If critical alerts and Slack is configured, attempt to notify
    const criticalAlerts = alerts.filter(a => a.severity === "critical");
    if (criticalAlerts.length > 0) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
      
      if (LOVABLE_API_KEY && SLACK_API_KEY) {
        try {
          const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";
          const message = `🚨 *Quantivis Alert Monitor*\n${criticalAlerts.map(a => `• [${a.severity.toUpperCase()}] ${a.message}`).join("\n")}`;
          
          // Get first available channel from connector config
          const { data: slackConfig } = await svc
            .from("connector_configs")
            .select("host")
            .eq("connector_type", "slack")
            .limit(1)
            .maybeSingle();
          
          if (slackConfig?.host) {
            await fetch(`${GATEWAY_URL}/chat.postMessage`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "X-Connection-Api-Key": SLACK_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ channel: slackConfig.host, text: message }),
            });
          }
        } catch (e) {
          log.warn("Failed to send Slack alert", { error: (e as Error).message });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("alert-monitor error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
