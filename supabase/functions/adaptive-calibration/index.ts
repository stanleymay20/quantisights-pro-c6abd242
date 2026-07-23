import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { cronGuard } from "../_shared/cron-guard.ts";
import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts";

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // calibration cadence

/**
 * Adaptive Calibration Engine v2
 * 
 * Hardened version with:
 * - Laplace/Beta smoothing per band (prevents wild corrections from small samples)
 * - Windowed computation (most recent 500 decisions)
 * - Improved success metric (prefers prediction_accuracy_score over binary outcome_delta)
 * - Minimal column select (no select("*"))
 * - Model metadata (window bounds, success metric, low-sample warnings)
 */

const DECISION_COLUMNS = "execution_status, capped_confidence, raw_confidence, outcome_delta, prediction_accuracy_score, created_at" as const;
const WINDOW_SIZE = 500;
const MIN_DECISIONS = 5;
const MIN_BAND_COUNT = 2;
const SMOOTHING_ALPHA = 1; // Beta prior α
const SMOOTHING_BETA = 1;  // Beta prior β
const LOW_SAMPLE_THRESHOLD = 5;

interface BandData {
  predicted_sum: number;
  successes: number; // smoothed will be computed from this
  count: number;
}

/**
 * Compute success signal for a single decision.
 * Prefers prediction_accuracy_score (0–100 continuous).
 * Falls back to outcome_delta with a neutral zone (±1% = 0.5).
 * Returns a value between 0 and 1.
 */
function computeSuccess(d: any): { value: number; metric: "prediction_accuracy_score" | "outcome_delta" } {
  const accuracy = d.prediction_accuracy_score != null ? Number(d.prediction_accuracy_score) : null;
  if (accuracy != null && Number.isFinite(accuracy)) {
    // Normalize 0–100 to 0–1
    return { value: Math.min(1, Math.max(0, accuracy / 100)), metric: "prediction_accuracy_score" };
  }

  const delta = d.outcome_delta != null ? Number(d.outcome_delta) : null;
  if (delta != null && Number.isFinite(delta)) {
    // Neutral zone: within ±1% = 0.5 (ambiguous)
    if (Math.abs(delta) <= 1) return { value: 0.5, metric: "outcome_delta" };
    return { value: delta > 0 ? 1 : 0, metric: "outcome_delta" };
  }

  return { value: 0.5, metric: "outcome_delta" }; // No data = neutral
}

function computeCalibrationModel(decisions: any[]) {
  // Include decisions that have been decided AND have at least one measurable signal.
  // Previously required execution_status === "completed" which excluded 100% of decisions.
  // Now: any decision with a decided status and confidence data is eligible.
  // Success is still computed from prediction_accuracy_score or outcome_delta when available.
  const calibrated = decisions.filter(
    (d) =>
      d.capped_confidence != null &&
      (d.execution_status === "completed" ||
       d.prediction_accuracy_score != null ||
       d.outcome_delta != null)
  );

  if (calibrated.length < MIN_DECISIONS) {
    return { insufficient: true, count: calibrated.length };
  }

  // Window: use most recent
  const windowed = calibrated
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, WINDOW_SIZE);

  const windowStart = windowed[windowed.length - 1]?.created_at;
  const windowEnd = windowed[0]?.created_at;

  // Track which success metric is dominant
  let accuracyCount = 0;
  let deltaCount = 0;

  // Build 10-point confidence bands
  const bands: Record<string, BandData> = {};
  for (let b = 0; b < 100; b += 10) {
    const key = `${b}-${b + 10}`;
    bands[key] = { predicted_sum: 0, successes: 0, count: 0 };
  }

  windowed.forEach((d) => {
    const conf = Math.min(99, Math.max(0, Number(d.capped_confidence ?? d.raw_confidence ?? 50)));
    const bandStart = Math.floor(conf / 10) * 10;
    const key = `${bandStart}-${bandStart + 10}`;
    const { value, metric } = computeSuccess(d);

    if (metric === "prediction_accuracy_score") accuracyCount++;
    else deltaCount++;

    bands[key].predicted_sum += conf;
    bands[key].successes += value;
    bands[key].count++;
  });

  const successMetric = accuracyCount >= deltaCount ? "prediction_accuracy_score" : "outcome_delta";

  // Compute corrections per band with Laplace/Beta smoothing
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
    // Smoothed actual rate using Beta prior: (successes + α) / (count + α + β)
    const smoothedRate = ((band.successes + SMOOTHING_ALPHA) / (band.count + SMOOTHING_ALPHA + SMOOTHING_BETA)) * 100;
    const correction = Math.round((smoothedRate - meanPredicted) * 10) / 10;

    band_corrections[key] = correction;
    band_sample_sizes[key] = band.count;
    totalAbsError += Math.abs(correction);
    bandsWithData++;

    if (band.count < LOW_SAMPLE_THRESHOLD) {
      low_sample_bands.push(key);
    }

    if (correction < -3) overconfidentBands++;
    if (correction > 3) underconfidentBands++;
  }

  const mae = bandsWithData > 0 ? Math.round((totalAbsError / bandsWithData) * 10) / 10 : 0;

  let biasDirection = "neutral";
  if (overconfidentBands > underconfidentBands && overconfidentBands >= 2) {
    biasDirection = "overconfident";
  } else if (underconfidentBands > overconfidentBands && underconfidentBands >= 2) {
    biasDirection = "underconfident";
  }

  const calibrationScore = Math.max(0, Math.round(100 - mae));

  return {
    insufficient: false,
    band_corrections,
    band_sample_sizes,
    overall_calibration_score: calibrationScore,
    overall_bias_direction: biasDirection,
    mean_absolute_error: mae,
    total_decisions_analyzed: windowed.length,
    confidence_bands_count: bandsWithData,
    success_metric: successMetric,
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

    // ── CRON: calibrate_all processes all orgs — requires service-role auth ──
    if (body.action === "calibrate_all" && body.cron === true) {
      // Verify caller is service-role (cron) — reject anon/user tokens
      const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
      if (!authHeader || !authHeader.includes(serviceKey)) {
        const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader || "" } },
        });
        const { data: { user: cronUser } } = await callerClient.auth.getUser();
        if (cronUser) {
          return new Response(JSON.stringify({ error: "Forbidden: cron endpoint requires service-role" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Advisory lock — prevent overlapping cron runs
      const guard = await cronGuard("adaptive-calibration");
      if (!guard.acquired) return guard.earlyResponse(corsHeaders);

      log.info("Cron-triggered batch calibration starting");
      const { data: orgs } = await svc.from("organizations").select("id");
      let calibrated = 0;

      // Bound the org loop to the invocation's wall-clock budget, and
      // rotate the starting point each tick so a sustained overload
      // doesn't permanently starve whichever orgs sort last -- safe since
      // skipping an org this tick just leaves its calibration model at
      // the previous version until the next tick recomputes it.
      const cronStartedAt = Date.now();
      const deadline = makeDeadline(cronStartedAt);
      const rotatedOrgs = rotateForFairness(orgs || [], cronStartedAt, RUN_INTERVAL_MS);
      let orgsProcessed = 0;

      for (const org of rotatedOrgs) {
        if (deadline.expired()) break;
        orgsProcessed++;
        // Fetch ALL decided decisions (not just "completed") to maximize calibration coverage
        const { data: decisions } = await svc
          .from("decision_ledger")
          .select(DECISION_COLUMNS)
          .eq("organization_id", org.id)
          .not("decided_at", "is", null)
          .order("created_at", { ascending: false })
          .limit(WINDOW_SIZE);

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
      log.info("Cron batch calibration complete", { calibrated, orgsProcessed, orgsTotal: rotatedOrgs.length, truncated });
      await guard.succeed({ calibrated, orgs_processed: orgsProcessed, orgs_total: rotatedOrgs.length, truncated });
      return new Response(JSON.stringify({ success: true, calibrated, orgs_processed: orgsProcessed, orgs_total: rotatedOrgs.length, truncated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Standard auth flow for user-initiated calibration ──
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { organization_id } = body;
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isMember } = await svc.rpc("is_org_member", {
      _user_id: user.id,
      _org_id: organization_id,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Minimal select — only columns we actually use
    // Match cron path: include all decided decisions, not just "completed"
    const { data: decisions } = await svc
      .from("decision_ledger")
      .select(DECISION_COLUMNS)
      .eq("organization_id", organization_id)
      .not("decided_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(WINDOW_SIZE);

    if (!decisions || decisions.length === 0) {
      return new Response(
        JSON.stringify({
          model: null,
          insufficient_data: true,
          message: "No completed decisions found",
          decisions_count: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = computeCalibrationModel(decisions);

    if (result.insufficient) {
      return new Response(
        JSON.stringify({
          model: null,
          insufficient_data: true,
          message: `Need at least ${MIN_DECISIONS} completed decisions with outcomes. Currently: ${result.count}`,
          decisions_count: result.count,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // AI narrative — only aggregated stats, never raw decision data
    let aiNarrative = "";
    if (lovableApiKey) {
      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `You are an expert in decision science calibration. Given calibration band corrections and stats, write a concise 2-3 sentence executive summary: 1) Whether the organization is overconfident or underconfident, 2) Which bands need correction, 3) One actionable recommendation. Be direct and quantitative. Plain text only.`,
              },
              {
                role: "user",
                content: JSON.stringify({
                  band_corrections: result.band_corrections,
                  overall_bias: result.overall_bias_direction,
                  calibration_score: result.overall_calibration_score,
                  mae: result.mean_absolute_error,
                  total_decisions: result.total_decisions_analyzed,
                  success_metric: result.success_metric,
                  low_sample_bands: result.low_sample_bands,
                }),
              },
            ],
          }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          aiNarrative = aiData.choices?.[0]?.message?.content || "";
        } else {
          await aiResp.text(); // consume body
        }
      } catch (e) {
        console.error("AI narrative error:", e);
      }
    }

    // Get current model version
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
      window_start: result.window_start,
      window_end: result.window_end,
      window_decisions_count: result.window_decisions_count,
      smoothing_alpha: result.smoothing_alpha,
      smoothing_beta: result.smoothing_beta,
      low_sample_bands: result.low_sample_bands,
    };

    const { error: insertError } = await svc.from("calibration_models").insert(modelRecord);
    if (insertError) {
      console.error("Failed to store calibration model:", insertError);
    }

    return new Response(
      JSON.stringify({
        model: modelRecord,
        insufficient_data: false,
        computed_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("adaptive-calibration error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
