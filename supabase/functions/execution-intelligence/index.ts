/**
 * Execution Intelligence — Thin Router (v4.0)
 * 
 * This is the orchestration layer only. All business logic lives in bounded action modules:
 *   - actions/interventions.ts  — scan, resolve, reassign, list
 *   - actions/scoring.ts        — compute, get, trend, explain
 *   - actions/predictions.ts    — predict, get, history
 *   - actions/overrides.ts      — executive override, retention cleanup
 *   - actions/intelligence.ts   — health, command summary, metrics, blockers, graph, trace
 * 
 * Cross-cutting concerns handled here:
 *   - Authentication & org membership
 *   - Rate limiting (tiered by action category)
 *   - Per-action error isolation
 *   - Structured telemetry
 *   - Run logging
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { isValidUUID, isValidString } from "../_shared/input-validation.ts";
import { applyRateLimit } from "../_shared/rate-guard.ts";
import { getAllCircuitStatuses } from "../_shared/circuit-breaker.ts";
import { emitTelemetry, getActionStats } from "./telemetry.ts";
import type { ActionContext, ActionResult } from "./actions/types.ts";

// Bounded action modules
import { scanInterventions, resolveIntervention, reassignPlan, getInterventions } from "./actions/interventions.ts";
import { computeScores, getScores, getScoreTrend, explainScoreChange } from "./actions/scoring.ts";
import { predictRisks, getPredictions, getPredictionHistory } from "./actions/predictions.ts";
import { executeOverride, getOverrides, retentionCleanup } from "./actions/overrides.ts";
import { engineHealth, commandSummary, operationalMetrics, inferBlockers, getDependencyGraph, forensicTrace } from "./actions/intelligence.ts";

// ─── Action Registry ───
type ActionHandler = (ctx: ActionContext, supabase: ReturnType<typeof createClient>) => Promise<ActionResult>;

const MUTATION_ACTIONS: Record<string, ActionHandler> = {
  scan_interventions: scanInterventions,
  resolve_intervention: resolveIntervention,
  reassign_plan: reassignPlan,
  compute_scores: computeScores,
  predict_risks: predictRisks,
  executive_override: executeOverride,
  retention_cleanup: retentionCleanup,
};

const QUERY_ACTIONS: Record<string, ActionHandler> = {
  get_interventions: getInterventions,
  get_scores: getScores,
  get_score_trend: getScoreTrend,
  explain_score_change: explainScoreChange,
  get_predictions: getPredictions,
  get_prediction_history: getPredictionHistory,
  get_overrides: getOverrides,
  engine_health: engineHealth,
  command_summary: commandSummary,
  operational_metrics: operationalMetrics,
  infer_blockers: inferBlockers,
  get_dependency_graph: getDependencyGraph,
  forensic_trace: forensicTrace,
};

// ─── Main Router ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const correlationId = req.headers.get("x-request-id") || crypto.randomUUID();
  const startTs = Date.now();

  // ─── Authentication ───
  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;
  const userId = auth.userId;

  // ─── Parse & Validate ───
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const { action, organization_id } = body;

  if (!isValidUUID(organization_id as string)) return json({ error: "Invalid organization_id" }, 400);
  if (!isValidString(action as string, 50)) return json({ error: "action required" }, 400);

  const orgId = organization_id as string;
  const actionName = action as string;

  // ─── Org Membership ───
  const isMember = await verifyOrgMembership(userId, orgId);
  if (!isMember) return json({ error: "Not a member" }, 403);

  // ─── Resolve Action Handler ───
  const isMutation = actionName in MUTATION_ACTIONS;
  const handler = MUTATION_ACTIONS[actionName] || QUERY_ACTIONS[actionName];

  // Special internal action: telemetry dashboard
  if (actionName === "telemetry_stats") {
    return json({
      action_stats: getActionStats(),
      circuit_breakers: getAllCircuitStatuses(),
      generated_at: new Date().toISOString(),
    });
  }

  if (!handler) return json({ error: `Unknown action: ${actionName}` }, 400);

  // ─── Rate Limiting (tiered) ───
  const rlCategory = isMutation ? "mutation" as const : "query" as const;
  const rlResult = applyRateLimit(req, orgId, rlCategory, "execution-intelligence");
  if (rlResult) return rlResult;

  // ─── Build Context ───
  const ctx: ActionContext = { orgId, userId, correlationId, body };
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!) as any;

  // ─── Run Log Helper ───
  const logRun = async (runType: string, runId: string, itemsProcessed: number, itemsCreated: number, status: string, errorMsg?: string, meta?: Record<string, unknown>) => {
    const elapsed = Date.now() - startTs;
    await supabase.from("execution_run_log").insert({
      organization_id: orgId,
      run_type: runType,
      run_id: runId,
      correlation_id: correlationId,
      started_at: new Date(startTs).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: elapsed,
      items_processed: itemsProcessed,
      items_created: itemsCreated,
      status,
      error_message: errorMsg || null,
      metadata: meta || null,
    });
  };

  // ─── Execute with Error Isolation + Telemetry ───
  emitTelemetry({ action: actionName, correlationId, orgId, startedAt: startTs, status: "started" });

  try {
    const result = await handler(ctx, supabase);
    const durationMs = Date.now() - startTs;

    // Log run if action provided metadata
    if (result.logMeta) {
      await logRun(
        result.logMeta.runType,
        result.logMeta.runId,
        result.logMeta.processed,
        result.logMeta.created,
        "completed",
        undefined,
        result.logMeta.meta,
      ).catch(() => {});
    }

    emitTelemetry({
      action: actionName,
      correlationId,
      orgId,
      startedAt: startTs,
      completedAt: Date.now(),
      durationMs,
      status: "completed",
      itemsProcessed: result.logMeta?.processed,
      itemsCreated: result.logMeta?.created,
    });

    return json(result.data, result.status || 200);
  } catch (e: unknown) {
    const durationMs = Date.now() - startTs;
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`[${actionName}] error [${correlationId}]:`, errorMsg);

    // Log failure
    await logRun(actionName, crypto.randomUUID(), 0, 0, "failed", errorMsg).catch(() => {});

    emitTelemetry({
      action: actionName,
      correlationId,
      orgId,
      startedAt: startTs,
      completedAt: Date.now(),
      durationMs,
      status: "failed",
      errorMessage: errorMsg,
    });

    return json({ error: errorMsg, action: actionName, correlation_id: correlationId }, 500);
  }
});
