// AICIS Outcome Evaluator
// Scans completed decisions linked to AICIS predictions, compares predicted
// risk vs an actual binary risk-event outcome, and writes aicis_outcomes rows
// with a mathematically valid Brier score.
// Idempotent on (organization_id, external_id).
//
// Triggers:
//   - Cron mode: { cron: true } + x-cron-secret header → all orgs
//   - Manual: { organization_id } + Bearer auth (owner/admin)
//   - Single: { organization_id, decision_id, actual_outcome: 'positive'|'negative', actual_value? }
//
// IMPORTANT SEMANTICS:
//   risk_probability predicts an adverse event, so:
//     positive business outcome -> risk event 0
//     negative business outcome -> risk event 1
//   actual_value is business impact/metric data. It is NEVER a Brier target.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts";

const RUN_INTERVAL_MS = 60 * 60 * 1000;

const log = (level: string, msg: string, ctx: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...ctx }));

interface BodyShape {
  cron?: boolean;
  organization_id?: string;
  decision_id?: string;
  actual_outcome?: "positive" | "negative";
  /** Business impact or observed metric value; never used as a binary calibration target. */
  actual_value?: number;
}

type Direction = "increase" | "decrease" | "stable";

function normalizedProbability(value: unknown): number | null {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  const normalized = raw > 1 && raw <= 100 ? raw / 100 : raw;
  return normalized >= 0 && normalized <= 1 ? normalized : null;
}

function successFromMeasurement(
  direction: Direction | null,
  outcomeDelta: unknown,
  actualValue: unknown,
  baselineValue: unknown,
): boolean | null {
  if (!direction) return null;

  const delta = Number(outcomeDelta);
  if (Number.isFinite(delta)) {
    if (direction === "increase") return delta > 0;
    if (direction === "decrease") return delta < 0;
    return Math.abs(delta) <= 1;
  }

  const actual = Number(actualValue);
  const baseline = Number(baselineValue);
  if (!Number.isFinite(actual) || !Number.isFinite(baseline)) return null;
  if (direction === "increase") return actual > baseline;
  if (direction === "decrease") return actual < baseline;
  const tolerance = Math.max(Math.abs(baseline) * 0.01, 1e-9);
  return Math.abs(actual - baseline) <= tolerance;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const correlationId = req.headers.get("x-request-id") || crypto.randomUUID();
  const startedAt = Date.now();

  let body: BodyShape = {};
  try { body = await req.json(); } catch { /* empty allowed */ }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Auth ──
  const cronSecretHeader = req.headers.get("x-cron-secret");
  const cronSecretEnv = Deno.env.get("CRON_SHARED_SECRET") ?? Deno.env.get("INGEST_CRON_SECRET");
  const isCronMode = body.cron === true && Boolean(
    cronSecretHeader && cronSecretEnv && cronSecretHeader === cronSecretEnv,
  );

  let orgsToProcess: string[] = [];
  let userId: string | null = null;

  if (isCronMode) {
    const { data: orgs, error: orgDiscoveryError } = await service
      .from("decision_ledger")
      .select("organization_id")
      .or("linked_aicis_prediction_id.not.is.null,linked_aicis_recommendation_id.not.is.null")
      .eq("execution_status", "completed");
    if (orgDiscoveryError) return json({ error: `organization discovery failed: ${orgDiscoveryError.message}` }, 500);
    orgsToProcess = Array.from(new Set((orgs ?? []).map(r => r.organization_id as string)));
  } else {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return json({ error: "Unauthorized" }, 401);
    userId = user.id;

    if (!body.organization_id) return json({ error: "organization_id required" }, 400);
    if (body.decision_id && !body.actual_outcome) {
      return json({ error: "actual_outcome is required for a single-decision evaluation" }, 400);
    }
    if (body.actual_value !== undefined && !Number.isFinite(body.actual_value)) {
      return json({ error: "actual_value must be a finite number" }, 400);
    }

    const { data: member, error: memberError } = await service
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", body.organization_id)
      .maybeSingle();
    if (memberError) return json({ error: `membership verification failed: ${memberError.message}` }, 500);
    if (!member || !["owner", "admin"].includes(member.role)) {
      return json({ error: "Forbidden" }, 403);
    }
    orgsToProcess = [body.organization_id];
  }

  let total_evaluated = 0;
  let total_skipped = 0;
  let total_errors = 0;
  const per_org: Array<{ org_id: string; evaluated: number; skipped: number; errors: number }> = [];

  const deadline = makeDeadline(startedAt);
  const rotatedOrgs = rotateForFairness(orgsToProcess, startedAt, RUN_INTERVAL_MS);
  let orgsProcessed = 0;

  try {
    for (const orgId of rotatedOrgs) {
      if (deadline.expired()) break;
      orgsProcessed++;
      const stat = { org_id: orgId, evaluated: 0, skipped: 0, errors: 0 };

      try {
        let q = service
          .from("decision_ledger")
          .select("id, organization_id, linked_aicis_prediction_id, linked_aicis_recommendation_id, decision_status, execution_status, outcome_delta, actual_value, baseline_value, predicted_net_impact, decided_at, execution_completed_at, outcome_measured_at, notes")
          .eq("organization_id", orgId)
          .eq("execution_status", "completed");
        if (body.decision_id) q = q.eq("id", body.decision_id);

        const { data: decisions, error: dErr } = await q.limit(500);
        if (dErr) throw new Error(`decisions query: ${dErr.message}`);
        if (body.decision_id && (decisions ?? []).length !== 1) {
          return json({ error: "Decision not found, not completed, or outside the requested organization", correlation_id: correlationId }, 404);
        }

        const decisionIds = (decisions ?? []).map(d => d.id);
        const directionByDecision = new Map<string, Direction>();
        if (decisionIds.length > 0 && !body.decision_id) {
          const { data: outcomeDefs, error: directionErr } = await service
            .from("decision_outcomes")
            .select("decision_id, expected_direction")
            .eq("organization_id", orgId)
            .in("decision_id", decisionIds)
            .limit(1000);

          if (directionErr) throw new Error(`outcome direction query: ${directionErr.message}`);
          for (const def of outcomeDefs ?? []) {
            if (!directionByDecision.has(def.decision_id) && ["increase", "decrease", "stable"].includes(def.expected_direction)) {
              directionByDecision.set(def.decision_id, def.expected_direction as Direction);
            }
          }
        }

        for (const d of decisions ?? []) {
          if (!d.linked_aicis_prediction_id && !d.linked_aicis_recommendation_id) {
            stat.skipped++;
            total_skipped++;
            continue;
          }

          let pred: {
            id: string;
            external_id: string;
            country_iso3: string | null;
            domain: string | null;
            risk_probability: number | null;
          } | null = null;

          if (d.linked_aicis_prediction_id) {
            const { data: p, error: predictionError } = await service
              .from("aicis_predictions")
              .select("id, external_id, country_iso3, domain, risk_probability")
              .eq("id", d.linked_aicis_prediction_id)
              .eq("organization_id", orgId)
              .maybeSingle();
            if (predictionError) throw new Error(`prediction query: ${predictionError.message}`);
            pred = p;
          } else if (d.linked_aicis_recommendation_id) {
            const { data: r, error: recommendationError } = await service
              .from("aicis_recommendations")
              .select("id, external_id, country_iso3, domain")
              .eq("id", d.linked_aicis_recommendation_id)
              .eq("organization_id", orgId)
              .maybeSingle();
            if (recommendationError) throw new Error(`recommendation query: ${recommendationError.message}`);
            if (r) {
              pred = {
                id: r.id,
                external_id: r.external_id,
                country_iso3: r.country_iso3,
                domain: r.domain,
                risk_probability: null,
              };
            }
          }

          if (!pred) {
            stat.skipped++;
            total_skipped++;
            continue;
          }

          const isExplicitManual = body.decision_id === d.id && Boolean(body.actual_outcome);
          const businessSuccess: boolean | null = isExplicitManual
            ? body.actual_outcome === "positive"
            : successFromMeasurement(
                directionByDecision.get(d.id) ?? null,
                d.outcome_delta,
                d.actual_value,
                d.baseline_value,
              );

          if (businessSuccess == null) {
            stat.skipped++;
            total_skipped++;
            log("info", "outcome_skipped_no_directional_signal", { decision_id: d.id, org_id: orgId });
            continue;
          }

          const riskEventActual = businessSuccess ? 0 : 1;
          const predicted = normalizedProbability(pred.risk_probability);
          const brier = predicted != null ? Math.pow(predicted - riskEventActual, 2) : null;
          const error_margin = predicted != null ? Math.abs(predicted - riskEventActual) : null;
          const evaluatedAt = new Date().toISOString();

          if (isExplicitManual) {
            const { data: outcomeId, error: atomicError } = await service.rpc("record_manual_aicis_outcome", {
              _organization_id: orgId,
              _decision_id: d.id,
              _prediction_external_id: pred.external_id,
              _country_iso3: pred.country_iso3,
              _domain: pred.domain,
              _predicted_value: predicted,
              _risk_event_actual: riskEventActual,
              _error_margin: error_margin,
              _brier_score: brier,
              _business_actual_value: typeof body.actual_value === "number" ? body.actual_value : null,
              _evaluated_at: evaluatedAt,
              _actor_id: userId,
            });
            if (atomicError || !outcomeId) {
              throw new Error(`atomic manual outcome persistence failed: ${atomicError?.message ?? "no outcome id returned"}`);
            }
            stat.evaluated++;
            total_evaluated++;
            continue;
          }

          const row = {
            organization_id: orgId,
            external_id: `decision:${d.id}`,
            prediction_external_id: pred.external_id,
            country_iso3: pred.country_iso3,
            domain: pred.domain,
            predicted_value: predicted,
            actual_value: riskEventActual,
            error_margin,
            brier_score: brier,
            evaluated_at: evaluatedAt,
          };

          const { error: upErr } = await service
            .from("aicis_outcomes")
            .upsert(row, { onConflict: "organization_id,external_id" });
          if (upErr) throw new Error(`outcome upsert failed for decision ${d.id}: ${upErr.message}`);

          stat.evaluated++;
          total_evaluated++;
        }

        // Single/manual writes already persist their audit record atomically in
        // record_manual_aicis_outcome. Bulk/cron processing gets one checked run audit.
        if (!body.decision_id) {
          const { error: auditError } = await service.from("audit_log").insert({
            organization_id: orgId,
            actor_id: userId,
            actor_type: isCronMode ? "system" : "user",
            action_type: "aicis_outcomes_evaluated",
            resource_type: "aicis_outcomes",
            resource_id: correlationId,
            payload: {
              evaluated: stat.evaluated,
              skipped: stat.skipped,
              errors: stat.errors,
              cron: isCronMode,
              calibration_target: "risk_event_binary",
            },
          });
          if (auditError) throw new Error(`outcome evaluation audit failed: ${auditError.message}`);
        }

        per_org.push(stat);
      } catch (orgErr) {
        const msg = orgErr instanceof Error ? orgErr.message : String(orgErr);
        log("error", "org_failed", { org_id: orgId, err: msg });
        stat.errors++;
        total_errors++;
        per_org.push(stat);
        if (body.decision_id) {
          return json({ error: msg, total_evaluated, total_errors, correlation_id: correlationId }, 500);
        }
      }
    }

    const duration_ms = Date.now() - startedAt;
    const truncated = orgsProcessed < rotatedOrgs.length;
    log("info", "aicis_evaluate_outcomes_done", {
      total_evaluated,
      total_skipped,
      total_errors,
      orgs: orgsToProcess.length,
      orgs_processed: orgsProcessed,
      truncated,
      duration_ms,
      correlation_id: correlationId,
    });

    if (body.decision_id) {
      if (total_evaluated !== 1 || total_errors !== 0) {
        return json({
          error: "The requested decision outcome was not durably recorded.",
          total_evaluated,
          total_skipped,
          total_errors,
          correlation_id: correlationId,
        }, 422);
      }
      return json({
        success: true,
        recorded: true,
        decision_id: body.decision_id,
        total_evaluated,
        correlation_id: correlationId,
        duration_ms,
      });
    }

    if (total_errors > 0) {
      return json({
        error: "One or more outcome evaluations failed; the idempotent batch may be retried safely.",
        total_evaluated,
        total_skipped,
        total_errors,
        per_org,
        correlation_id: correlationId,
        duration_ms,
        orgs_processed: orgsProcessed,
        orgs_total: rotatedOrgs.length,
        truncated,
      }, 500);
    }

    return json({
      success: true,
      total_evaluated,
      total_skipped,
      total_errors,
      per_org,
      correlation_id: correlationId,
      duration_ms,
      orgs_processed: orgsProcessed,
      orgs_total: rotatedOrgs.length,
      truncated,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg, total_evaluated, total_errors, correlation_id: correlationId }, 500);
  }
});
