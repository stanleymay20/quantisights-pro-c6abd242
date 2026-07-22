import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

const PUBLIC_JOBS = [
  { name: "evaluate-outcomes", intervalMs: 6 * 60 * 60 * 1000, severity: "critical" },
  { name: "adaptive-calibration", intervalMs: 12 * 60 * 60 * 1000, severity: "critical" },
  { name: "refresh-aggregates", intervalMs: 24 * 60 * 60 * 1000, severity: "warning" },
  { name: "compute-rollups", intervalMs: 24 * 60 * 60 * 1000, severity: "warning" },
  { name: "retention-cleanup", intervalMs: 24 * 60 * 60 * 1000, severity: "warning" },
  { name: "weekly-calibration-digest", intervalMs: 7 * 24 * 60 * 60 * 1000, severity: "info" },
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase
    .from("cron_run_log")
    .select("job_name,status,started_at,completed_at,duration_ms,error_message,records_processed")
    .in("job_name", PUBLIC_JOBS.map((job) => job.name))
    .order("started_at", { ascending: false })
    .limit(60);

  if (error) {
    return new Response(
      JSON.stringify({ error: "scheduler_evidence_unavailable" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  }

  const latestByJob = new Map<string, NonNullable<typeof data>[number]>();
  for (const run of data ?? []) {
    if (!latestByJob.has(run.job_name)) latestByJob.set(run.job_name, run);
  }

  const jobs = PUBLIC_JOBS.map((job) => {
    const run = latestByJob.get(job.name);
    const lastRunAt = run?.started_at ?? null;
    return {
      job_name: job.name,
      status: run?.status ?? "never",
      started_at: lastRunAt,
      last_run_at: lastRunAt,
      next_expected_run_at: lastRunAt
        ? new Date(new Date(lastRunAt).getTime() + job.intervalMs).toISOString()
        : null,
      severity: job.severity,
      evidence_source: "cron_run_log",
      completed_at: run?.completed_at ?? null,
      duration_ms: run?.duration_ms ?? null,
      error_message: run?.error_message ?? null,
      records_processed: run?.records_processed ?? null,
    };
  });

  return new Response(
    JSON.stringify({ generated_at: new Date().toISOString(), jobs }),
    { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=30" } },
  );
});
