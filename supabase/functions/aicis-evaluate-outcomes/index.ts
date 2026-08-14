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
    const { data: orgs } = await service
      .from("decision_ledger")
      .select("organization_id")
      .or("linked_aicis_prediction_id.not.is.null,linked_aicis_recommendation_id.not.is.null")
      .eq("execution_status", "completed");
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
    const { data: member } = await service
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", body.organization_id)
      .maybeSingle();
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

        // Resolve expected metric direction once per batch. Direction belongs to
        // the decision outcome contract; never infer success from delta sign alone.
        const decisionIds = (decisions ?? []).map(d => d.id);
        const directionByDecision = new Map<string, Direction>();
        if (decisionIds.length > 0) {
          const { data: outcomeDefs, error: directionErr } = await service
            .from("decision_outcomes")
            .select("decision_id, expected_direction")
            .eq("organization_id", orgId)
            .in("decision_id", decisionIds)
            .limit(1000);

          if (directionErr) {
            log("warn", "outcome_direction_lookup_failed", { org_id: orgId, err: directionErr.message });
          } else {
            for (const def of outcomeDefs ?? []) {
              if (!directionByDecision.has(def.decision_id) && ["increase", "decrease", "stable"].includes(def.expected_direction)) {
                directionByDecision.set(def.decision_id, def.expected_direction as Direction);
              }
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
            const { data: p } = await service
              .from("aicis_predictions")
              .select("id, external_id, country_iso3, domain, risk_probability")
              .eq("id", d.linked_aicis_prediction_id)
              .maybeSingle();
            pred = p;
          } else if (d.linked_aicis_recommendation_id) {
            const { data: r } = await service
              .from("aicis_recommendations")
              .select("id, external_id, country_iso3, domain")
              .eq("id", d.linked_aicis_recommendation_id)
              .maybeSingle();
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

          // Determine whether the business decision succeeded. Manual feedback
          // is explicit. Automated evaluation requires a known expected direction.
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

          // risk_probability is the probability of an adverse event. A successful
          // business outcome therefore means the risk event did not materialize.
          const riskEventActual = businessSuccess ? 0 : 1;
          const predicted = normalizedProbability(pred.risk_probability);
          const brier = predicted != null ? Math.pow(predicted - riskEventActual, 2) : null;
          const error_margin = predicted != null ? Math.abs(predicted - riskEventActual) : null;
          const externalId = `decision:${d.id}`;
          const evaluatedAt = new Date().toISOString();

          // Preserve optional business impact on the decision record, but never
          // write a fabricated prediction-accuracy score from a yes/no verdict.
          if (isExplicitManual) {
            const ledgerUpdate: Record<string, unknown> = {
              outcome_measured_at: evaluatedAt,
            };
            if (typeof body.actual_value === "number" && Number.isFinite(body.actual_value)) {
              ledgerUpdate.actual_value = body.actual_value;
            }
            const { error: ledgerErr } = await service
              .from("decision_ledger")
              .update(ledgerUpdate)
              .eq("id", d.id)
              .eq("organization_id", orgId);
            if (ledgerErr) {
              stat.errors++;
              total_errors++;
              log("error", "manual_outcome_ledger_update_failed", { err: ledgerErr.message, decision_id: d.id });
              continue;
            }
          }

          const row = {
            organization_id: orgId,
            external_id: externalId,
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
          if (upErr) {
            stat.errors++;
            total_errors++;
            log("error", "upsert_failed", { err: upErr.message, decision_id: d.id });
            continue;
          }

          stat.evaluated++;
          total_evaluated++;
        }

        await service.from("audit_log").insert({
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

        per_org.push(stat);
      } catch (orgErr) {
        const msg = orgErr instanceof Error ? orgErr.message : String(orgErr);
        log("error", "org_failed", { org_id: orgId, err: msg });
        stat.errors++;
        total_errors++;
        per_org.push(stat);
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

    return json({
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
