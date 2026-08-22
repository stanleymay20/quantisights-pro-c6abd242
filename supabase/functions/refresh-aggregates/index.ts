import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { isValidUUID } from "../_shared/input-validation.ts";
import { isRecord, parseJsonBody } from "../_shared/ingest-utils.ts";

const MAX_BODY_BYTES = 64 * 1024;
const ALLOWED_PERIODS = new Set(["monthly", "quarterly", "yearly"]);

type AggregateResult = {
  aggregated_count: number | string | null;
  metric_count: number | string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  let pipelineRunId: string | null = null;
  let pipelineRunScoped = false;
  let serviceClient: ReturnType<typeof createClient> | null = null;

  try {
    const parsed = await parseJsonBody(req, MAX_BODY_BYTES);
    if (parsed.error || !isRecord(parsed.body)) {
      return respond({ error: parsed.error ?? "JSON object body required" }, 400);
    }

    const organizationId = typeof parsed.body.organization_id === "string"
      ? parsed.body.organization_id.trim()
      : "";
    let datasetId = typeof parsed.body.dataset_id === "string"
      ? parsed.body.dataset_id.trim()
      : "";
    pipelineRunId = typeof parsed.body.pipeline_run_id === "string"
      ? parsed.body.pipeline_run_id.trim()
      : null;

    if (!isValidUUID(organizationId)) return respond({ error: "valid organization_id required" }, 400);
    if (datasetId && !isValidUUID(datasetId)) return respond({ error: "dataset_id must be a valid UUID" }, 400);
    if (pipelineRunId && !isValidUUID(pipelineRunId)) return respond({ error: "pipeline_run_id must be a valid UUID" }, 400);

    const requestedPeriods = Array.isArray(parsed.body.period_types)
      ? parsed.body.period_types
      : ["monthly", "quarterly", "yearly"];
    const periods = Array.from(new Set(requestedPeriods.map((value) => String(value).trim())));
    if (periods.length === 0 || periods.some((period) => !ALLOWED_PERIODS.has(period))) {
      return respond({ error: "period_types may contain only monthly, quarterly, yearly" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) return respond({ error: "Aggregate service unavailable" }, 503);

    serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    const isServiceCall = token === serviceKey;
    let actorUserId: string | null = null;

    if (!isServiceCall) {
      if (!token) return respond({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user?.id) return respond({ error: "Unauthorized" }, 401);
      actorUserId = user.id;

      const { data: membership, error: membershipError } = await serviceClient
        .from("organization_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (membershipError) return respond({ error: `Organization authorization unavailable: ${membershipError.message}` }, 503);
      if (!membership) return respond({ error: "Forbidden: not a member of this organization" }, 403);
    }

    if (datasetId) {
      const { data: dataset, error: datasetError } = await serviceClient
        .from("datasets")
        .select("id")
        .eq("id", datasetId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (datasetError) return respond({ error: `Dataset scope validation failed: ${datasetError.message}` }, 503);
      if (!dataset) return respond({ error: "Dataset not found or does not belong to this organization" }, 403);
    }

    if (pipelineRunId) {
      const { data: run, error: runError } = await serviceClient
        .from("pipeline_runs")
        .select("id,organization_id,dataset_id")
        .eq("id", pipelineRunId)
        .maybeSingle();
      if (runError) return respond({ error: `Pipeline scope validation failed: ${runError.message}` }, 503);
      if (!run || run.organization_id !== organizationId) {
        return respond({ error: "Pipeline run does not belong to this organization" }, 403);
      }
      if (datasetId && run.dataset_id !== datasetId) {
        return respond({ error: "Pipeline run does not belong to the requested dataset" }, 403);
      }
      if (!datasetId) datasetId = run.dataset_id;
      pipelineRunScoped = true;

      const { error: runStartError } = await serviceClient
        .from("pipeline_runs")
        .update({ stage: "aggregating", status: "running", error_message: null })
        .eq("id", pipelineRunId)
        .eq("organization_id", organizationId)
        .eq("dataset_id", datasetId);
      if (runStartError) throw new Error(`Pipeline aggregation-state update failed: ${runStartError.message}`);
    }

    const { data: aggregateRows, error: aggregateError } = await serviceClient.rpc(
      "refresh_metric_aggregates_scoped",
      {
        _org_id: organizationId,
        _dataset_id: datasetId || null,
        _period_types: periods,
      },
    );
    if (aggregateError) throw new Error(`Server-side aggregate refresh failed: ${aggregateError.message}`);

    const aggregateResult = Array.isArray(aggregateRows)
      ? aggregateRows[0] as AggregateResult | undefined
      : undefined;
    if (!aggregateResult) throw new Error("Server-side aggregate refresh returned no result");

    const aggregated = Math.max(0, Number(aggregateResult.aggregated_count) || 0);
    const metricCount = Math.max(0, Number(aggregateResult.metric_count) || 0);

    if (datasetId) {
      const { error: summaryError } = await serviceClient.rpc("refresh_metric_summaries", {
        _org_id: organizationId,
        _dataset_id: datasetId,
      });
      if (summaryError) throw new Error(`Metric summary refresh failed: ${summaryError.message}`);
    }

    const { error: auditError } = await serviceClient.from("audit_log").insert({
      organization_id: organizationId,
      actor_type: isServiceCall ? "system" : "user",
      actor_id: actorUserId,
      action_type: "refresh_aggregates",
      resource_type: "dataset",
      resource_id: datasetId || organizationId,
      payload: {
        aggregated,
        periods,
        metric_count: metricCount,
        execution: "postgres_set_based",
      },
    });
    if (auditError) throw new Error(`Aggregate audit persistence failed: ${auditError.message}`);

    if (pipelineRunId && pipelineRunScoped) {
      const { error: runCompleteError } = await serviceClient
        .from("pipeline_runs")
        .update({
          stage: "complete",
          status: "completed",
          aggregated_count: aggregated,
          error_message: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", pipelineRunId)
        .eq("organization_id", organizationId)
        .eq("dataset_id", datasetId);
      if (runCompleteError) throw new Error(`Pipeline completion persistence failed: ${runCompleteError.message}`);
    }

    return respond({
      success: true,
      aggregated,
      periods,
      metric_count: metricCount,
      execution: "postgres_set_based",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("refresh-aggregates error:", message);

    if (serviceClient && pipelineRunId && pipelineRunScoped) {
      try {
        const { error: partialError } = await serviceClient
          .from("pipeline_runs")
          .update({
            stage: "aggregate_failed",
            status: "partial",
            error_message: message.slice(0, 2000),
            completed_at: new Date().toISOString(),
          })
          .eq("id", pipelineRunId);
        if (partialError) console.error("refresh-aggregates pipeline failure bookkeeping error:", partialError.message);
      } catch (bookkeepingError) {
        console.error("refresh-aggregates pipeline failure bookkeeping exception:", bookkeepingError);
      }
    }

    return respond({ error: message }, 500);
  }
});
