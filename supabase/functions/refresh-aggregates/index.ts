import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

/**
 * Refresh Aggregates Edge Function
 * 
 * Computes pre-aggregated rollups from the clean metrics layer
 * into the metric_aggregates table for fast dashboard serving.
 * 
 * Supports: monthly, quarterly, yearly aggregation periods.
 * Designed for 100M+ metric scale — dashboards read aggregates, not raw metrics.
 * 
 * Auth: Accepts both authenticated user calls and internal service calls
 * (identified by service role key in Authorization header).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const { organization_id, dataset_id, pipeline_run_id, period_types, workspace_id } = await req.json();

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Auth: verify caller is either the service role or an authenticated user with org membership
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const isServiceCall = token === serviceKey;

    if (!isServiceCall) {
      // Validate user JWT using getClaims for secure, real-time verification
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await userClient.auth.getUser();
      if (error || !user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = user.id;
      // Verify org membership
      const { data: membership } = await supabase
        .from("organization_members")
        .select("id")
        .eq("user_id", userId)
        .eq("organization_id", organization_id)
        .maybeSingle();
      if (!membership) {
        return new Response(JSON.stringify({ error: "Forbidden: not a member of this organization" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Verify dataset belongs to org if provided
    if (dataset_id) {
      const { data: ds } = await supabase.from("datasets").select("id").eq("id", dataset_id).eq("organization_id", organization_id).maybeSingle();
      if (!ds) {
        return new Response(JSON.stringify({ error: "Dataset not found or does not belong to this organization" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (pipeline_run_id) {
      await supabase.from("pipeline_runs").update({ stage: "aggregating", status: "running" }).eq("id", pipeline_run_id);
    }

    const periods = period_types || ["monthly", "quarterly", "yearly"];

    // Fetch all metrics for scope in batches to avoid 1000-row default limit
    const allMetrics: Record<string, unknown>[] = [];
    const PAGE_SIZE = 1000;
    let page = 0;
    while (true) {
      let query = supabase
        .from("metrics")
        .select("metric_type, value, date, region, segment, dataset_id")
        .eq("organization_id", organization_id)
        .order("date", { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (dataset_id) {
        query = query.eq("dataset_id", dataset_id);
      }

      const { data: batch, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;
      if (!batch || batch.length === 0) break;
      allMetrics.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      page++;
    }

    const metrics = allMetrics;
    if (metrics.length === 0) {
      return new Response(JSON.stringify({ success: true, aggregated: 0, message: "No metrics to aggregate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    interface AggBucket {
      sum: number;
      count: number;
      min: number;
      max: number;
    }

    const buckets = new Map<string, AggBucket>();

    function getPeriodStart(dateStr: string, periodType: string): string {
      const d = new Date(dateStr);
      const y = d.getFullYear();
      const m = d.getMonth();
      switch (periodType) {
        case "monthly":
          return `${y}-${String(m + 1).padStart(2, "0")}-01`;
        case "quarterly": {
          const q = Math.floor(m / 3);
          return `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`;
        }
        case "yearly":
          return `${y}-01-01`;
        default:
          return `${y}-${String(m + 1).padStart(2, "0")}-01`;
      }
    }

    for (const m of metrics) {
      for (const period of periods) {
        const ps = getPeriodStart(String(m.date), period);
        const key = `${m.dataset_id || "null"}|${m.metric_type}|${period}|${ps}|${m.region || ""}|${m.segment || ""}`;
        const val = Number(m.value);
        if (isNaN(val)) continue;

        const existing = buckets.get(key);
        if (existing) {
          existing.sum += val;
          existing.count += 1;
          existing.min = Math.min(existing.min, val);
          existing.max = Math.max(existing.max, val);
        } else {
          buckets.set(key, { sum: val, count: 1, min: val, max: val });
        }
      }
    }

    const rows: Record<string, unknown>[] = [];
    for (const [key, agg] of buckets) {
      const [dsId, metricType, periodType, periodStart, region, segment] = key.split("|");
      rows.push({
        organization_id,
        dataset_id: dsId === "null" ? null : dsId,
        workspace_id: workspace_id || null,
        metric_type: metricType,
        period_type: periodType,
        period_start: periodStart,
        region: region || "",
        segment: segment || "",
        agg_sum: agg.sum,
        agg_count: agg.count,
        agg_min: agg.min,
        agg_max: agg.max,
        agg_avg: agg.count > 0 ? agg.sum / agg.count : 0,
        computed_at: new Date().toISOString(),
      });
    }

    let upserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase.from("metric_aggregates").upsert(batch, {
        onConflict: "organization_id,dataset_id,metric_type,period_type,period_start,region,segment",
      });
      if (error) throw error;
      upserted += batch.length;
    }

    if (pipeline_run_id) {
      await supabase.from("pipeline_runs").update({
        stage: "complete",
        status: "completed",
        aggregated_count: upserted,
        completed_at: new Date().toISOString(),
      }).eq("id", pipeline_run_id);
    }

    // Refresh precomputed metric summaries alongside aggregates
    if (dataset_id) {
      await supabase.rpc("refresh_metric_summaries", {
        _org_id: organization_id,
        _dataset_id: dataset_id,
      });
    }

    // Audit log
    await supabase.from("audit_log").insert({
      organization_id,
      actor_type: isServiceCall ? "system" : "user",
      action_type: "refresh_aggregates",
      resource_type: "dataset",
      resource_id: dataset_id || organization_id,
      payload: { aggregated: upserted, periods, metric_count: metrics.length },
    });

    return new Response(JSON.stringify({
      success: true,
      aggregated: upserted,
      periods,
      metric_count: metrics.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("refresh-aggregates error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
