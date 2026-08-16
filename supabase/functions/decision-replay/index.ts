import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import {
  normalizeExpectedOutcomeDirection,
  outcomeSucceededForDirection,
} from "../_shared/outcome-direction.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;
  const userId = auth.userId;

  const body = await req.json();
  const { action, organization_id, decision_id } = body;

  if (!organization_id) {
    return new Response(JSON.stringify({ error: "organization_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const isMember = await verifyOrgMembership(userId, organization_id);
  if (!isMember) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    switch (action) {
      case "replay": {
        if (!decision_id) {
          return new Response(JSON.stringify({ error: "decision_id required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch the original decision
        const { data: decision, error: dErr } = await supabase
          .from("decision_ledger")
          .select("*")
          .eq("id", decision_id)
          .eq("organization_id", organization_id)
          .single();

        if (dErr || !decision) {
          return new Response(JSON.stringify({ error: "Decision not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Resolve the canonical outcome contract. Raw delta sign is not a
        // business-success signal because some KPIs are explicitly lower-is-better.
        const { data: outcomeContract } = await supabase
          .from("decision_outcomes")
          .select("expected_direction, expected_metric, evaluation_date, created_at")
          .eq("decision_id", decision_id)
          .eq("organization_id", organization_id)
          .order("evaluation_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const expectedDirection = outcomeContract
          ? normalizeExpectedOutcomeDirection(outcomeContract.expected_direction, outcomeContract.expected_metric)
          : null;

        // Get current metrics snapshot for context
        const { data: currentMetrics } = await supabase
          .from("metrics")
          .select("metric_type, value, date")
          .eq("organization_id", organization_id)
          .order("date", { ascending: false })
          .limit(50);

        // Get latest calibration model
        const { data: calModel } = await supabase
          .from("calibration_models")
          .select("overall_calibration_score, band_corrections, overall_bias_direction")
          .eq("organization_id", organization_id)
          .order("computed_at", { ascending: false })
          .limit(1)
          .single();

        // Calculate replayed confidence using current calibration
        const originalConf = decision.confidence_at_decision || decision.capped_confidence || 50;
        let replayedConf = originalConf;

        if (calModel?.band_corrections) {
          const corrections = calModel.band_corrections as Record<string, number>;
          // Find applicable band
          const bandKey = Object.keys(corrections).find(k => {
            const [lo, hi] = k.split("-").map(Number);
            return originalConf >= lo && originalConf <= hi;
          });
          if (bandKey) {
            replayedConf = Math.max(0, Math.min(100, originalConf + (corrections[bandKey] || 0)));
          }
        }

        const drift = replayedConf - originalConf;

        // Build current data summary
        const metricSummary: Record<string, any> = {};
        (currentMetrics || []).forEach((m: any) => {
          if (!metricSummary[m.metric_type]) {
            metricSummary[m.metric_type] = { latest: m.value, date: m.date };
          }
        });

        // Determine if recommendation would change using the outcome contract.
        const hasOutcome = decision.actual_value !== null || decision.outcome_delta !== null;
        const outcomePositive = hasOutcome && expectedDirection
          ? outcomeSucceededForDirection(decision.outcome_delta, expectedDirection, 1)
          : null;
        let recommendationChanged = false;
        let replayedRecommendation = decision.recommended_action;

        if (hasOutcome && outcomePositive === false && Math.abs(drift) > 10) {
          recommendationChanged = true;
          replayedRecommendation = `[REVISED] With current calibration (${drift > 0 ? "+" : ""}${drift.toFixed(1)}pp drift), this decision would require additional analysis. Original: ${decision.recommended_action}`;
        } else if (Math.abs(drift) > 15) {
          recommendationChanged = true;
          replayedRecommendation = `[CONFIDENCE SHIFT] Current data suggests ${drift > 0 ? "higher" : "lower"} confidence (${replayedConf.toFixed(0)}% vs ${originalConf.toFixed(0)}%). ${decision.recommended_action}`;
        }

        // Build narrative
        const narrativeParts = [
          `Decision "${decision.recommended_action}" was originally made with ${originalConf.toFixed(0)}% confidence.`,
          `Current calibration model suggests ${replayedConf.toFixed(0)}% confidence (${drift > 0 ? "+" : ""}${drift.toFixed(1)}pp drift).`,
        ];

        if (calModel?.overall_bias_direction) {
          narrativeParts.push(`Organization shows ${calModel.overall_bias_direction} bias pattern.`);
        }

        if (hasOutcome) {
          narrativeParts.push(`Actual metric change: ${decision.outcome_delta !== null ? `${decision.outcome_delta > 0 ? "+" : ""}${decision.outcome_delta.toFixed(1)}%` : "unmeasured"}${expectedDirection ? `; intended direction: ${expectedDirection}` : ""}.`);
          if (decision.prediction_accuracy_score !== null) {
            narrativeParts.push(`Prediction accuracy: ${decision.prediction_accuracy_score.toFixed(0)}/100.`);
          }
        }

        if (recommendationChanged) {
          narrativeParts.push(`⚠️ With today's data, this recommendation would change.`);
        } else {
          narrativeParts.push(`✅ This recommendation remains consistent with current data.`);
        }

        // Save replay
        const { data: replay, error: rErr } = await supabase
          .from("decision_replays")
          .insert({
            decision_id,
            organization_id,
            replayed_by: userId,
            original_confidence: originalConf,
            replayed_confidence: replayedConf,
            confidence_drift: drift,
            original_recommendation: decision.recommended_action,
            replayed_recommendation: replayedRecommendation,
            recommendation_changed: recommendationChanged,
            current_data_summary: metricSummary,
            replay_narrative: narrativeParts.join(" "),
          })
          .select()
          .single();

        if (rErr) throw rErr;

        // Audit
        await supabase.from("audit_log").insert({
          organization_id,
          actor_id: userId,
          actor_type: "user",
          action_type: "decision_replayed",
          resource_type: "decision_replay",
          resource_id: replay.id,
          payload: { decision_id, drift, recommendation_changed: recommendationChanged, expected_direction: expectedDirection },
        });

        return new Response(JSON.stringify(replay), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list": {
        if (!decision_id) {
          return new Response(JSON.stringify({ error: "decision_id required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data, error } = await supabase
          .from("decision_replays")
          .select("*")
          .eq("decision_id", decision_id)
          .eq("organization_id", organization_id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        return new Response(JSON.stringify(data || []), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "org_drift_report": {
        const { data, error } = await supabase
          .from("decision_replays")
          .select("confidence_drift, recommendation_changed, created_at")
          .eq("organization_id", organization_id)
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) throw error;

        const replays = data || [];
        const avgDrift = replays.length > 0
          ? replays.reduce((s: number, r: any) => s + (r.confidence_drift || 0), 0) / replays.length
          : 0;
        const changedCount = replays.filter((r: any) => r.recommendation_changed).length;

        return new Response(JSON.stringify({
          total_replays: replays.length,
          avg_confidence_drift: avgDrift,
          recommendations_changed: changedCount,
          change_rate: replays.length > 0 ? changedCount / replays.length : 0,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    console.error("decision-replay error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});