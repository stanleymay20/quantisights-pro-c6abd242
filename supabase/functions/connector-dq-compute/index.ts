import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";

/**
 * connector-dq-compute
 * Computes 6-dimension data quality scores per connector (optionally per stream) and
 * writes a row to connector_dq_scores. Designed to run after each sync or on cron.
 *
 * POST body: { connector_id: string, stream_key?: string }
 */

const WEIGHTS = { fresh: 0.30, complete: 0.25, schema: 0.15, anomaly: 0.15, dup: 0.15 };

type SyncRun = {
  status: string;
  rows_extracted: number | null;
  rows_valid: number | null;
  rows_invalid: number | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Data quality service unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const svc = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const connectorId = typeof body.connector_id === "string" ? body.connector_id : undefined;
    const streamKey = typeof body.stream_key === "string" ? body.stream_key : undefined;
    if (!connectorId) {
      return new Response(JSON.stringify({ error: "connector_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cfg, error: cfgError } = await svc
      .from("connector_configs")
      .select("organization_id, last_tested_at")
      .eq("id", connectorId)
      .maybeSingle();
    if (cfgError) throw new Error(`Failed to load connector: ${cfgError.message}`);
    if (!cfg?.organization_id) {
      return new Response(JSON.stringify({ error: "connector not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const guard = await requireCronOrOrgMember(req, cfg.organization_id);
    if (!guard.ok) return guard.response;

    const { data: runRows, error: runsError } = await svc
      .from("connector_sync_runs")
      .select("status, rows_extracted, rows_valid, rows_invalid, completed_at, metadata")
      .eq("connector_id", connectorId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (runsError) throw new Error(`Failed to load connector runs: ${runsError.message}`);

    const runs = (runRows ?? []) as SyncRun[];
    const sampleSize = runs.length;
    const lastSuccess = runs.find((run) => run.status === "completed");

    let freshness = 0;
    if (lastSuccess?.completed_at) {
      const ageMin = (Date.now() - new Date(lastSuccess.completed_at).getTime()) / 60_000;
      const expected = 60;
      freshness = Math.max(0, Math.min(100, 100 - (Math.max(0, ageMin - expected) / expected) * 100));
    }

    let completeness = 0;
    let nullRate = 0;
    const extracted = lastSuccess?.rows_extracted ?? 0;
    if (lastSuccess && extracted > 0) {
      const rate = (lastSuccess.rows_valid ?? 0) / extracted;
      completeness = Math.round(rate * 100);
      nullRate = Math.max(0, 1 - rate);
    }

    const schemaChanges = runs.reduce((acc, run) => {
      const metadata = run.metadata ?? {};
      const value = metadata.schema_changes;
      return acc + (typeof value === "number" && Number.isFinite(value) ? value : 0);
    }, 0);
    const schemaStability = Math.max(0, 100 - schemaChanges * 10);

    const counts = runs
      .map((run) => run.rows_extracted ?? 0)
      .filter((value) => value > 0);
    let anomaly = 0;
    if (counts.length >= 5) {
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
      const sd = Math.sqrt(variance);
      const outliers = counts.filter((count) => Math.abs(count - mean) > 3 * sd).length;
      anomaly = Math.round((outliers / counts.length) * 100);
    }

    const dupRate = lastSuccess && extracted > 0
      ? (lastSuccess.rows_invalid ?? 0) / extracted
      : 0;
    const dupScore = Math.max(0, 100 - dupRate * 200);

    const confidence = Math.round(
      freshness * WEIGHTS.fresh +
      completeness * WEIGHTS.complete +
      schemaStability * WEIGHTS.schema +
      (100 - anomaly) * WEIGHTS.anomaly +
      dupScore * WEIGHTS.dup,
    );

    const { data: row, error } = await svc.from("connector_dq_scores").insert({
      organization_id: cfg.organization_id,
      connector_id: connectorId,
      stream_key: streamKey ?? null,
      freshness_score: freshness,
      completeness_score: completeness,
      schema_stability_score: schemaStability,
      anomaly_score: anomaly,
      null_rate: nullRate,
      duplicate_rate: dupRate,
      confidence_score: confidence,
      sample_size: sampleSize,
      notes: { based_on_runs: sampleSize, last_success_at: lastSuccess?.completed_at ?? null },
    }).select("*").single();

    if (error) throw new Error(`Failed to persist connector quality score: ${error.message}`);

    return new Response(JSON.stringify({ ok: true, score: row }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
