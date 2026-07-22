// AICIS Outcome Evaluator
// Scans completed decisions linked to AICIS predictions, compares predicted
// risk vs actual binary outcome, and writes aicis_outcomes rows (Brier score).
// Idempotent on (organization_id, external_id).
//
// Triggers:
//   - Cron mode: { cron: true }  + x-cron-secret header  → all orgs
//   - Manual:    { organization_id }  + Bearer auth (owner/admin)
//   - Single:    { decision_id, actual_outcome: 'positive'|'negative', actual_value? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts";

const RUN_INTERVAL_MS = 60 * 60 * 1000; // outcome evaluation cadence

const log = (level: string, msg: string, ctx: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...ctx }));

interface BodyShape {
  cron?: boolean;
  organization_id?: string;
  decision_id?: string;
  actual_outcome?: "positive" | "negative";
  actual_value?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
  const isCronMode = body.cron === true && cronSecretHeader && cronSecretEnv && cronSecretHeader === cronSecretEnv;

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
    if (!member || !["owner", "admin"].includes(member.role)) return json({ error: "Forbidden" }, 403);
    orgsToProcess = [body.organization_id];
  }

  let total_evaluated = 0;
  let total_skipped = 0;
  let total_errors = 0;
  const per_org: Array<{ org_id: string; evaluated: number; skipped: number; errors: number }> = [];

  // Bound the org loop to the invocation's wall-clock budget, and rotate
  // the starting point each tick so a sustained overload doesn't
  // permanently starve whichever orgs sort last -- re-evaluating an org is
  // a no-op past the first pass since results upsert on (organization_id,
  // external_id).
  const deadline = makeDeadline(startedAt);
  const rotatedOrgs = rotateForFairness(orgsToProcess, startedAt, RUN_INTERVAL_MS);
  let orgsProcessed = 0;

  try {
    for (const orgId of rotatedOrgs) {
      if (deadline.expired()) break;
      orgsProcessed++;
      const stat = { org_id: orgId, evaluated: 0, skipped: 0, errors: 0 };
      try {
        // Find completed AICIS-linked decisions
        let q = service
          .from("decision_ledger")
          .select("id, organization_id, linked_aicis_prediction_id, linked_aicis_recommendation_id, decision_status, execution_status, outcome_delta, actual_value, baseline_value, predicted_net_impact, decided_at, execution_completed_at, outcome_measured_at, notes")
          .eq("organization_id", orgId)
          .eq("execution_status", "completed");
        if (body.decision_id) q = q.eq("id", body.decision_id);
        const { data: decisions, error: dErr } = await q.limit(500);
        if (dErr) throw new Error(`decisions query: ${dErr.message}`);

        for (const d of decisions ?? []) {
          if (!d.linked_aicis_prediction_id && !d.linked_aicis_recommendation_id) { stat.skipped++; continue; }

          // Resolve prediction (if any)
          let pred: { id: string; external_id: string; country_iso3: string | null; domain: string | null; risk_probability: number | null } | null = null;
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
            if (r) pred = { id: r.id, external_id: r.external_id, country_iso3: r.country_iso3, domain: r.domain, risk_probability: null };
          }
          if (!pred) { stat.skipped++; continue; }

          // Determine actual outcome (binary 0/1) and value
          let actual: number | null = null;
          if (typeof body.actual_value === "number") actual = body.actual_value;
          else if (body.actual_outcome) actual = body.actual_outcome === "positive" ? 1 : 0;
          else if (typeof d.actual_value === "number") actual = d.actual_value > 0 ? 1 : 0;
          else if (typeof d.outcome_delta === "number") actual = d.outcome_delta > 0 ? 1 : 0;
          else { stat.skipped++; continue; } // no signal yet

          const predicted = pred.risk_probability != null ? Number(pred.risk_probability) : null;
          const brier = predicted != null ? Math.pow(predicted - actual, 2) : null;
          const error_margin = predicted != null ? Math.abs(predicted - actual) : null;
          const externalId = `decision:${d.id}`;

          const row = {
            organization_id: orgId,
            external_id: externalId,
            prediction_external_id: pred.external_id,
            country_iso3: pred.country_iso3,
            domain: pred.domain,
            predicted_value: predicted,
            actual_value: actual,
            error_margin,
            brier_score: brier,
            evaluated_at: new Date().toISOString(),
          };

          const { error: upErr } = await service
            .from("aicis_outcomes")
            .upsert(row, { onConflict: "organization_id,external_id" });
          if (upErr) { stat.errors++; total_errors++; log("error", "upsert_failed", { err: upErr.message, decision_id: d.id }); continue; }
          stat.evaluated++; total_evaluated++;
        }

        // Audit
        await service.from("audit_log").insert({
          organization_id: orgId,
          actor_id: userId,
          actor_type: isCronMode ? "system" : "user",
          action_type: "aicis_outcomes_evaluated",
          resource_type: "aicis_outcomes",
          resource_id: correlationId,
          payload: { evaluated: stat.evaluated, skipped: stat.skipped, errors: stat.errors, cron: isCronMode },
        });

        per_org.push(stat);
      } catch (orgErr) {
        const msg = orgErr instanceof Error ? orgErr.message : String(orgErr);
        log("error", "org_failed", { org_id: orgId, err: msg });
        stat.errors++; total_errors++;
        per_org.push(stat);
      }
    }

    const duration_ms = Date.now() - startedAt;
    const truncated = orgsProcessed < rotatedOrgs.length;
    log("info", "aicis_evaluate_outcomes_done", { total_evaluated, total_skipped, total_errors, orgs: orgsToProcess.length, orgs_processed: orgsProcessed, truncated, duration_ms, correlation_id: correlationId });
    return json({ total_evaluated, total_skipped, total_errors, per_org, correlation_id: correlationId, duration_ms, orgs_processed: orgsProcessed, orgs_total: rotatedOrgs.length, truncated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg, total_evaluated, total_errors, correlation_id: correlationId }, 500);
  }
});
