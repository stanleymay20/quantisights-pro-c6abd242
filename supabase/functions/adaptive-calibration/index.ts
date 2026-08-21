import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { cronGuard } from "../_shared/cron-guard.ts";
import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts";
import { verifyCronSecret, cronSecretUnauthorized } from "../_shared/cron-secret.ts";

/** Length-safe, constant-time string comparison (no substring matching). */
function timingSafeEquals(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const av = enc.encode(a);
  const bv = enc.encode(b);
  let diff = av.length ^ bv.length;
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    diff |= (av[i] ?? 0) ^ (bv[i] ?? 0);
  }
  return diff === 0;
}

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DECISION_COLUMNS = "execution_status, capped_confidence, raw_confidence, prediction_accuracy_score, created_at, decision_outcomes(calibration_eligible, evidence_regime, outcome_status)" as const;
const WINDOW_SIZE = 500;
const SOURCE_WINDOW_SIZE = 1000;
const MIN_DECISIONS = 5;
const MIN_BAND_COUNT = 2;
const SMOOTHING_ALPHA = 1;
const SMOOTHING_BETA = 1;
const LOW_SAMPLE_THRESHOLD = 5;

interface BandData {
  predicted_sum: number;
  successes: number;
  count: number;
}

function computeSuccess(d: any): number | null {
  const accuracy = d.prediction_accuracy_score != null ? Number(d.prediction_accuracy_score) : null;
  if (accuracy == null || !Number.isFinite(accuracy)) return null;
  return Math.min(1, Math.max(0, accuracy / 100));
}

function isEvaluatedOutcome(outcome: any): boolean {
  return Boolean(outcome) && !["pending", "not_evaluable"].includes(String(outcome.outcome_status ?? "pending"));
}

function hasProspectiveCalibrationEvidence(d: any): boolean {
  const outcomes = Array.isArray(d.decision_outcomes) ? d.decision_outcomes : [];
  const evaluated = outcomes.filter(isEvaluatedOutcome);
  if (evaluated.length === 0) return false;

  const hasEligible = evaluated.some(
    (o: any) => o.calibration_eligible === true && o.evidence_regime === "prospective"
  );
  const hasIneligibleEvaluated = evaluated.some(
    (o: any) => o.calibration_eligible !== true || o.evidence_regime !== "prospective"
  );
  return hasEligible && !hasIneligibleEvaluated;
}

function computeCalibrationModel(decisions: any[]) {
  const scored = decisions.filter(
    (d) =>
      d.capped_confidence != null &&
      d.prediction_accuracy_score != null &&
      Number.isFinite(Number(d.prediction_accuracy_score))
  );

  const calibrated = scored.filter(hasProspectiveCalibrationEvidence);
  const excludedNonProspective = scored.length - calibrated.length;

  if (calibrated.length < MIN_DECISIONS) {
    return {
      insufficient: true,
      count: calibrated.length,
      excluded_nonprospective_count: excludedNonProspective,
    };
  }

  const windowed = calibrated
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, WINDOW_SIZE);

  const windowStart = windowed[windowed.length - 1]?.created_at;
  const windowEnd = windowed[0]?.created_at;

  const bands: Record<string, BandData> = {};
  for (let b = 0; b < 100; b += 10) {
    const key = `${b}-${b + 10}`;
    bands[key] = { predicted_sum: 0, successes: 0, count: 0 };
  }

  windowed.forEach((d) => {
    const success = computeSuccess(d);
    if (success == null) return;
    const conf = Math.min(99, Math.max(0, Number(d.capped_confidence ?? d.raw_confidence ?? 50)));
    const bandStart = Math.floor(conf / 10) * 10;
    const key = `${bandStart}-${bandStart + 10}`;
    bands[key].predicted_sum += conf;
    bands[key].successes += success;
    bands[key].count++;
  });

  const band_corrections: Record<string, number> = {};
  const band_sample_sizes: Record<string, number> = {};
  const low_sample_bands: string[] = [];
  let totalAbsError = 0;
  let bandsWithData = 0;
  let overconfidentBands = 0;
  let underconfidentBands = 0;

  for (const [key, band] of Object.entries(bands)) {
    if (band.count < MIN_BAND_COUNT) continue;
    const meanPredicted = band.predicted_sum / band.count;
    const smoothedRate = ((band.successes + SMOOTHING_ALPHA) / (band.count + SMOOTHING_ALPHA + SMOOTHING_BETA)) * 100;
    const correction = Math.round((smoothedRate - meanPredicted) * 10) / 10;
    band_corrections[key] = correction;
    band_sample_sizes[key] = band.count;
    totalAbsError += Math.abs(correction);
    bandsWithData++;
    if (band.count < LOW_SAMPLE_THRESHOLD) low_sample_bands.push(key);
    if (correction < -3) overconfidentBands++;
    if (correction > 3) underconfidentBands++;
  }

  const mae = bandsWithData > 0 ? Math.round((totalAbsError / bandsWithData) * 10) / 10 : 0;
  let biasDirection = "neutral";
  if (overconfidentBands > underconfidentBands && overconfidentBands >= 2) biasDirection = "overconfident";
  else if (underconfidentBands > overconfidentBands && underconfidentBands >= 2) biasDirection = "underconfident";

  return {
    insufficient: false,
    band_corrections,
    band_sample_sizes,
    overall_calibration_score: Math.max(0, Math.round(100 - mae)),
    overall_bias_direction: biasDirection,
    mean_absolute_error: mae,
    total_decisions_analyzed: windowed.length,
    confidence_bands_count: bandsWithData,
    success_metric: "prediction_accuracy_score",
    evidence_regime: "prospective_only",
    prospective_decisions_count: windowed.length,
    excluded_nonprospective_count: excludedNonProspective,
    window_start: windowStart,
    window_end: windowEnd,
    window_decisions_count: windowed.length,
    low_sample_bands,
    smoothing_alpha: SMOOTHING_ALPHA,
    smoothing_beta: SMOOTHING_BETA,
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const log = createLogger("adaptive-calibration", req);
  if (req.method === "OPTIONS") return corsPreflightResponse(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const svc = createClient(supabaseUrl, serviceKey);
    const body = await req.json();

    if (body.action === "calibrate_all" && body.cron === true) {
      const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
      const bearer = /^Bearer\s+(\S+)$/i.exec(authHeader)?.[1] ?? null;
      const serviceRoleAuthorized = Boolean(serviceKey) && bearer !== null && timingSafeEquals(bearer, serviceKey);
      const cronSecretAuthorized = verifyCronSecret(req);

      if (!serviceRoleAuthorized && !cronSecretAuthorized) {
        log.warn("Rejected unauthorized calibrate_all cron request");
        return cronSecretUnauthorized(corsHeaders);
      }

      const guard = await cronGuard("adaptive-calibration");
      if (!guard.acquired) return guard.earlyResponse(corsHeaders);

      log.info("Cron-triggered prospective calibration starting");
      const { data: orgs } = await svc.from("organizations").select("id");
      let calibrated = 0;
      const cronStartedAt = Date.now();
      const deadline = makeDeadline(cronStartedAt);
      const rotatedOrgs = rotateForFairness(orgs || [], cronStartedAt, RUN_INTERVAL_MS);
      let orgsProcessed = 0;

      for (const org of rotatedOrgs) {
        if (deadline.expired()) break;
        orgsProcessed++;
        const { data: decisions } = await svc
          .from("decision_ledger")
          .select(DECISION_COLUMNS)
          .eq("organization_id", org.id)
          .not("decided_at", "is", null)
          .order("created_at", { ascending: false })
          .limit(SOURCE_WINDOW_SIZE);

        if (!decisions?.length) continue;
        const result = computeCalibrationModel(decisions);
        if (result.insufficient) continue;

        const { data: existing } = await svc
          .from("calibration_models")
          .select("model_version")
          .eq("organization_id", org.id)
          .order("computed_at", { ascending: false })
          .limit(1);

        const nextVersion = (existing?.[0]?.model_version ?? 0) + 1;
        await svc.from("calibration_models").insert({
          organization_id: org.id,
          band_corrections: result.band_corrections,
          band_sample_sizes: result.band_sample_sizes,
          overall_calibration_score: result.overall_calibration_score,
          overall_bias_direction: result.overall_bias_direction,
          total_decisions_analyzed: result.total_decisions_analyzed,
          model_version: nextVersion,
          confidence_bands_count: result.confidence_bands_count,
          mean_absolute_error: result.mean_absolute_error,
          success_metric: result.success_metric,
          evidence_regime: result.evidence_regime,
          prospective_decisions_count: result.prospective_decisions_count,
          excluded_decisions_count: result.excluded_nonprospective_count,
          window_start: result.window_start,
          window_end: result.window_end,
          window_decisions_count: result.window_decisions_count,
          smoothing_alpha: result.smoothing_alpha,
          smoothing_beta: result.smoothing_beta,
          low_sample_bands: result.low_sample_bands,
        });
        calibrated++;
      }

      const truncated = orgsProcessed < rotatedOrgs.length;
      log.info("Cron batch prospective calibration complete", { calibrated, orgsProcessed, orgsTotal: rotatedOrgs.length, truncated });
      await guard.succeed({ calibrated, orgs_processed: orgsProcessed, orgs_total: rotatedOrgs.length, truncated, evidence_regime: "prospective_only" });
      return new Response(JSON.stringify({ success: true, calibrated, orgs_processed: orgsProcessed, orgs_total: rotatedOrgs.length, truncated, evidence_regime: "prospective_only" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { organization_id } = body;
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: isMember } = await svc.rpc("is_org_member", { _user_id: user.id, _org_id: organization_id });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: decisions } = await svc
      .from("decision_ledger")
      .select(DECISION_COLUMNS)
      .eq("organization_id", organization_id)
      .not("decided_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(SOURCE_WINDOW_SIZE);

    if (!decisions || decisions.length === 0) {
      return new Response(JSON.stringify({
        model: null,
        insufficient_data: true,
        evidence_regime: "prospective_only",
        message: "No evaluated decisions found",
        decisions_count: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = computeCalibrationModel(decisions);
    if (result.insufficient) {
      return new Response(JSON.stringify({
        model: null,
        insufficient_data: true,
        evidence_regime: "prospective_only",
        message: `Need at least ${MIN_DECISIONS} decisions with prospectively committed, direction-aware evaluated outcomes. Currently: ${result.count}`,
        decisions_count: result.count,
        excluded_nonprospective_count: result.excluded_nonprospective_count,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let aiNarrative = "";
    if (lovableApiKey) {
      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are an expert in decision science calibration. The statistics below are computed only from prospectively committed outcome evaluations. Write a concise 2-3 sentence executive summary: 1) Whether the organization is overconfident or underconfident, 2) Which bands need correction, 3) One actionable recommendation. Be direct and quantitative. Plain text only." },
              { role: "user", content: JSON.stringify({
                band_corrections: result.band_corrections,
                overall_bias: result.overall_bias_direction,
                calibration_score: result.overall_calibration_score,
                mae: result.mean_absolute_error,
                total_decisions: result.total_decisions_analyzed,
                success_metric: result.success_metric,
                evidence_regime: result.evidence_regime,
                excluded_nonprospective_count: result.excluded_nonprospective_count,
                low_sample_bands: result.low_sample_bands,
              }) },
            ],
          }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          aiNarrative = aiData.choices?.[0]?.message?.content || "";
        } else {
          await aiResp.text();
        }
      } catch (e) {
        console.error("AI narrative error:", e);
      }
    }

    const { data: existing } = await svc
      .from("calibration_models")
      .select("model_version")
      .eq("organization_id", organization_id)
      .order("computed_at", { ascending: false })
      .limit(1);

    const nextVersion = (existing?.[0]?.model_version ?? 0) + 1;
    const modelRecord = {
      organization_id,
      band_corrections: result.band_corrections,
      band_sample_sizes: result.band_sample_sizes,
      overall_calibration_score: result.overall_calibration_score,
      overall_bias_direction: result.overall_bias_direction,
      total_decisions_analyzed: result.total_decisions_analyzed,
      model_version: nextVersion,
      confidence_bands_count: result.confidence_bands_count,
      mean_absolute_error: result.mean_absolute_error,
      ai_narrative: aiNarrative || null,
      success_metric: result.success_metric,
      evidence_regime: result.evidence_regime,
      prospective_decisions_count: result.prospective_decisions_count,
      excluded_decisions_count: result.excluded_nonprospective_count,
      window_start: result.window_start,
      window_end: result.window_end,
      window_decisions_count: result.window_decisions_count,
      smoothing_alpha: result.smoothing_alpha,
      smoothing_beta: result.smoothing_beta,
      low_sample_bands: result.low_sample_bands,
    };

    const { error: insertError } = await svc.from("calibration_models").insert(modelRecord);
    if (insertError) console.error("Failed to store calibration model:", insertError);

    return new Response(JSON.stringify({ model: modelRecord, insufficient_data: false, computed_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("adaptive-calibration error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});