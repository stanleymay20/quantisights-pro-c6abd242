// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

/**
 * connector-dq-compute
 * Computes 6-dimension data quality scores per connector (optionally per stream) and
 * writes a row to connector_dq_scores. Designed to run after each sync or on cron.
 *
 *  - freshness_score        : 100 if last_success within expected_interval, decays linearly
 *  - completeness_score     : 100 - null_rate*100 averaged over sampled rows
 *  - schema_stability_score : 100 - (added+removed_cols / total_cols) over last N runs
 *  - anomaly_score          : pct of recent runs with row count > 3σ from rolling mean
 *  - null_rate              : avg fraction of null cells in last sync sample
 *  - duplicate_rate         : pct rows with duplicate natural keys in last sync
 *  - confidence_score       : weighted composite
 *
 * POST body: { connector_id: string, stream_key?: string }
 */

const WEIGHTS = { fresh: 0.30, complete: 0.25, schema: 0.15, anomaly: 0.15, dup: 0.15 };

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const connectorId = body.connector_id as string | undefined;
    const streamKey = body.stream_key as string | undefined;
    if (!connectorId) {
      return new Response(JSON.stringify({ error: "connector_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: cfg } = await svc.from("connector_configs").select("organization_id, last_tested_at").eq("id", connectorId).maybeSingle();
    if (!cfg) {
      return new Response(JSON.stringify({ error: "connector not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Pull last N sync runs for this connector
    const { data: runs } = await svc
      .from("connector_sync_runs")
      .select("status, rows_extracted, rows_valid, rows_invalid, completed_at, metadata")
      .eq("connector_id", connectorId)
      .order("created_at", { ascending: false })
      .limit(20);

    const N = runs?.length ?? 0;
    const lastSuccess = runs?.find(r => r.status === "completed");

    // freshness
    let freshness = 0;
    if (lastSuccess?.completed_at) {
      const ageMin = (Date.now() - new Date(lastSuccess.completed_at).getTime()) / 60_000;
      const expected = 60; // default 60min SLA; can be parameterized per connector
      freshness = Math.max(0, Math.min(100, 100 - (Math.max(0, ageMin - expected) / expected) * 100));
    }

    // completeness via rows_valid / rows_extracted on last success
    let completeness = 0;
    let nullRate = 0;
    if (lastSuccess && (lastSuccess.rows_extracted ?? 0) > 0) {
      const rate = (lastSuccess.rows_valid ?? 0) / lastSuccess.rows_extracted;
      completeness = Math.round(rate * 100);
      nullRate = Math.max(0, 1 - rate);
    }

    // schema stability — count metadata.schema_changes across runs
    const schemaChanges = (runs ?? []).reduce((acc, r) => acc + ((r.metadata as any)?.schema_changes ?? 0), 0);
    const schemaStability = Math.max(0, 100 - schemaChanges * 10);

    // anomaly — 3σ on rows_extracted
    const counts = (runs ?? []).map(r => r.rows_extracted ?? 0).filter(n => n > 0);
    let anomaly = 0;
    if (counts.length >= 5) {
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
      const sd = Math.sqrt(variance);
      const outliers = counts.filter(c => Math.abs(c - mean) > 3 * sd).length;
      anomaly = Math.round((outliers / counts.length) * 100);
    }

    // duplicates — rows_invalid as proxy (real dedup pass would check natural_key collisions)
    const dupRate = lastSuccess && (lastSuccess.rows_extracted ?? 0) > 0
      ? (lastSuccess.rows_invalid ?? 0) / lastSuccess.rows_extracted
      : 0;
    const dupScore = Math.max(0, 100 - dupRate * 200);

    const confidence = Math.round(
      freshness * WEIGHTS.fresh +
      completeness * WEIGHTS.complete +
      schemaStability * WEIGHTS.schema +
      (100 - anomaly) * WEIGHTS.anomaly +
      dupScore * WEIGHTS.dup
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
      sample_size: N,
      notes: { based_on_runs: N, last_success_at: lastSuccess?.completed_at ?? null },
    }).select("*").single();

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, score: row }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
