import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { cronGuard } from "../_shared/cron-guard.ts";
import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts";

const RUN_INTERVAL_MS = 60 * 60 * 1000; // outcome evaluation cadence

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const log = createLogger("evaluate-outcomes", req);

  if (req.method === "OPTIONS") return corsPreflightResponse(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { action, organization_id, dataset_id, decision_id, outcome_id } = body;

    // ── CRON: evaluate_all processes all orgs — protected by advisory lock ──
    if (action === "evaluate_all" && body.cron === true) {
      // Advisory lock — prevent overlapping cron runs
      const guard = await cronGuard("evaluate-outcomes");
      if (!guard.acquired) return guard.earlyResponse(corsHeaders);

      log.info("Cron-triggered batch evaluation starting");
      const { data: orgs } = await supabase.from("organizations").select("id");
      let totalEvaluated = 0;

      // Bound the org loop to the invocation's wall-clock budget, and
      // rotate the starting point each tick so a sustained overload
      // doesn't permanently starve whichever orgs sort last -- safe
      // since a pending outcome stays pending until it's actually
      // evaluated, so a skipped org is simply retried next tick.
      const cronStartedAt = Date.now();
      const deadline = makeDeadline(cronStartedAt);
      const rotatedOrgs = rotateForFairness(orgs || [], cronStartedAt, RUN_INTERVAL_MS);
      let orgsProcessed = 0;

      for (const org of rotatedOrgs) {
        if (deadline.expired()) break;
        orgsProcessed++;
        const { data: pending } = await supabase
          .from("decision_outcomes")
          .select("*, decision_ledger!inner(decided_at, organization_id)")
          .eq("organization_id", org.id)
          .eq("outcome_status", "pending");

        if (!pending?.length) continue;

        const now = new Date();

        // Collect all dataset_ids and metric types to batch-fetch metrics
        const metricQueries = new Map<string, { datasetId: string; metricType: string; outcomes: typeof pending }>();
        const immediateUpdates: Array<{ id: string; update: Record<string, unknown> }> = [];

        for (const outcome of pending) {
          const decidedAt = new Date((outcome as any).decision_ledger?.decided_at);
          if (isNaN(decidedAt.getTime())) continue;
          const windowEnd = new Date(decidedAt.getTime() + outcome.evaluation_window_days * 86400000);
          if (now < windowEnd) continue;

          // If no dataset_id, try to find the most recent active dataset for this org
          let effectiveDatasetId = outcome.dataset_id;
          if (!effectiveDatasetId) {
            const { data: latestDataset } = await supabase
              .from("datasets")
              .select("id")
              .eq("organization_id", org.id)
              .eq("status", "active")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (latestDataset?.id) {
              effectiveDatasetId = latestDataset.id;
              // Also update the outcome record with the resolved dataset_id
              await supabase.from("decision_outcomes")
                .update({ dataset_id: effectiveDatasetId })
                .eq("id", outcome.id);
            } else {
              immediateUpdates.push({
                id: outcome.id,
                update: {
                  outcome_status: "not_evaluable",
                  evaluation_date: now.toISOString(),
                  notes: "No dataset found in organization — cannot measure outcome.",
                },
              });
              totalEvaluated++;
              continue;
            }
          }

          // Use effectiveDatasetId from here on
          outcome.dataset_id = effectiveDatasetId;

          const key = `${outcome.dataset_id}:${outcome.expected_metric}`;
          if (!metricQueries.has(key)) {
            metricQueries.set(key, { datasetId: outcome.dataset_id, metricType: outcome.expected_metric, outcomes: [] });
          }
          metricQueries.get(key)!.outcomes.push(outcome);
        }

        // Apply immediate updates (not_evaluable)
        for (const item of immediateUpdates) {
          await supabase.from("decision_outcomes").update(item.update).eq("id", item.id);
        }

        // Batch-fetch metrics per (dataset_id, metric_type) — eliminates N+1
        for (const [, { datasetId, metricType, outcomes: groupOutcomes }] of metricQueries) {
          // Find earliest and latest date range across all outcomes in this group
          let earliestBefore = new Date();
          let latestAfter = new Date(0);
          for (const outcome of groupOutcomes) {
            const decidedAt = new Date((outcome as any).decision_ledger?.decided_at);
            const beforeStart = new Date(decidedAt.getTime() - 30 * 86400000);
            const windowEnd = new Date(decidedAt.getTime() + outcome.evaluation_window_days * 86400000);
            if (beforeStart < earliestBefore) earliestBefore = beforeStart;
            if (windowEnd > latestAfter) latestAfter = windowEnd;
          }

          // Single query for all metrics in this group's date range
          const { data: allMetrics } = await supabase
            .from("metrics").select("value, date")
            .eq("organization_id", org.id)
            .eq("dataset_id", datasetId)
            .eq("metric_type", metricType)
            .gte("date", earliestBefore.toISOString().slice(0, 10))
            .lte("date", latestAfter.toISOString().slice(0, 10))
            .order("date", { ascending: true })
            .limit(5000);

          if (!allMetrics?.length) {
            for (const outcome of groupOutcomes) {
              await supabase.from("decision_outcomes").update({
                outcome_status: "not_evaluable",
                evaluation_date: now.toISOString(),
                notes: `Insufficient ${metricType} data for evaluation period.`,
              }).eq("id", outcome.id);
              totalEvaluated++;
            }
            continue;
          }

          // Process each outcome using the pre-fetched metrics
          for (const outcome of groupOutcomes) {
            const decidedAt = new Date((outcome as any).decision_ledger?.decided_at);
            const windowEnd = new Date(decidedAt.getTime() + outcome.evaluation_window_days * 86400000);
            const beforeStart = new Date(decidedAt.getTime() - 30 * 86400000);
            const decidedDateStr = decidedAt.toISOString().slice(0, 10);
            const windowEndStr = windowEnd.toISOString().slice(0, 10);
            const beforeStartStr = beforeStart.toISOString().slice(0, 10);

            const beforeMetrics = allMetrics.filter(m => m.date >= beforeStartStr && m.date <= decidedDateStr);
            const afterMetrics = allMetrics.filter(m => m.date >= decidedDateStr && m.date <= windowEndStr);

            if (!beforeMetrics.length || !afterMetrics.length) {
              await supabase.from("decision_outcomes").update({
                outcome_status: "not_evaluable",
                evaluation_date: now.toISOString(),
                notes: `Insufficient ${metricType} data for evaluation period.`,
              }).eq("id", outcome.id);
              totalEvaluated++;
              continue;
            }

            const avgBefore = beforeMetrics.reduce((s: number, m: any) => s + Number(m.value), 0) / beforeMetrics.length;
            const avgAfter = afterMetrics.reduce((s: number, m: any) => s + Number(m.value), 0) / afterMetrics.length;
            const observedChange = avgBefore !== 0 ? ((avgAfter - avgBefore) / Math.abs(avgBefore)) * 100 : 0;

            let outcomeStatus = "no_effect";
            const expectedDir = outcome.expected_direction;
            const directionMatch = (expectedDir === "increase" && observedChange > 1) ||
                                    (expectedDir === "decrease" && observedChange < -1);
            if (directionMatch) {
              if (outcome.expected_change !== null) {
                const observedMagnitude = Math.abs(observedChange);
                if (observedMagnitude >= Math.abs(Number(outcome.expected_change)) * 0.8) outcomeStatus = "success";
                else if (observedMagnitude >= Math.abs(Number(outcome.expected_change)) * 0.3) outcomeStatus = "partial_success";
              } else {
                outcomeStatus = "success";
              }
            } else if ((expectedDir === "increase" && observedChange < -5) || (expectedDir === "decrease" && observedChange > 5)) {
              outcomeStatus = "negative_outcome";
            }

            let accuracyScore: number | null = null;
            if (outcome.expected_change !== null && Number(outcome.expected_change) !== 0) {
              accuracyScore = Math.max(0, Math.min(100, 100 - Math.abs(observedChange - Number(outcome.expected_change)) * 2));
            }

            await supabase.from("decision_outcomes").update({
              observed_metric: outcome.expected_metric,
              observed_value_before: avgBefore,
              observed_value_after: avgAfter,
              outcome_status: outcomeStatus,
              evaluation_date: now.toISOString(),
              accuracy_score: accuracyScore,
              notes: `Observed ${observedChange.toFixed(2)}% change. Before avg: ${avgBefore.toFixed(2)}, After avg: ${avgAfter.toFixed(2)}.`,
            }).eq("id", outcome.id);

            await supabase.from("decision_ledger").update({
              actual_value: avgAfter,
              outcome_delta: observedChange,
              outcome_measured_at: now.toISOString(),
              prediction_accuracy_score: accuracyScore,
            }).eq("id", outcome.decision_id);

            totalEvaluated++;
          }
        }
      }

      const truncated = orgsProcessed < rotatedOrgs.length;
      log.info("Cron batch evaluation complete", { totalEvaluated, orgsProcessed, orgsTotal: rotatedOrgs.length, truncated });
      await guard.succeed({ evaluated: totalEvaluated, orgs_processed: orgsProcessed, orgs_total: rotatedOrgs.length, truncated });
      return new Response(JSON.stringify({ success: true, evaluated: totalEvaluated, orgs_processed: orgsProcessed, orgs_total: rotatedOrgs.length, truncated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Standard auth flow for user-initiated actions ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = user.id;
    log.setUser(userId);

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), { status: 400, headers: corsHeaders });
    }
    log.setOrg(organization_id);

    // Verify org membership
    const { data: isMember } = await supabase.rpc("is_org_member", {
      _user_id: userId,
      _org_id: organization_id,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SCHEDULE: Create outcome tracking entry when decision is approved ──
    if (action === "schedule") {
      if (!decision_id || !body.expected_metric) {
        return new Response(JSON.stringify({ error: "decision_id and expected_metric required" }), { status: 400, headers: corsHeaders });
      }

      // Validate dataset belongs to org if provided
      if (dataset_id) {
        const { data: dsCheck } = await supabase
          .from("datasets")
          .select("id")
          .eq("id", dataset_id)
          .eq("organization_id", organization_id)
          .maybeSingle();
        if (!dsCheck) {
          return new Response(JSON.stringify({ error: "dataset_id does not belong to this organization" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { data, error } = await supabase.from("decision_outcomes").insert({
        decision_id,
        organization_id,
        dataset_id: dataset_id || null,
        expected_metric: body.expected_metric,
        expected_direction: body.expected_direction || "increase",
        expected_change: body.expected_change || null,
        evaluation_window_days: body.evaluation_window_days || 30,
        outcome_status: "pending",
      }).select().single();

      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

      // Audit trail
      await supabase.from("audit_log").insert({
        organization_id,
        actor_id: userId,
        actor_type: "user",
        action_type: "outcome_scheduled",
        resource_type: "decision_outcome",
        resource_id: data.id,
        payload: { decision_id, expected_metric: body.expected_metric, dataset_id: dataset_id || null },
      });

      return new Response(JSON.stringify({ success: true, outcome: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── EVALUATE: Check pending outcomes against actual metrics ──
    if (action === "evaluate") {
      const { data: pending, error: fetchErr } = await supabase
        .from("decision_outcomes")
        .select("*, decision_ledger!inner(decided_at, organization_id)")
        .eq("organization_id", organization_id)
        .eq("outcome_status", "pending");

      if (fetchErr) return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500, headers: corsHeaders });

      const now = new Date();
      const evaluated: unknown[] = [];

      for (const outcome of (pending || [])) {
        const decidedAt = new Date((outcome as any).decision_ledger?.decided_at);
        if (isNaN(decidedAt.getTime())) continue;

        const windowEnd = new Date(decidedAt.getTime() + outcome.evaluation_window_days * 86400000);
        if (now < windowEnd) continue; // Not yet in evaluation window

        // Can we evaluate? Need dataset_id and metric data
        if (!outcome.dataset_id) {
          await supabase.from("decision_outcomes").update({
            outcome_status: "not_evaluable",
            evaluation_date: now.toISOString(),
            notes: "No dataset_id linked — cannot measure outcome.",
          }).eq("id", outcome.id);
          evaluated.push({ id: outcome.id, status: "not_evaluable" });
          continue;
        }

        // Validate dataset still belongs to org
        const { data: dsCheck } = await supabase
          .from("datasets")
          .select("id")
          .eq("id", outcome.dataset_id)
          .eq("organization_id", organization_id)
          .maybeSingle();

        if (!dsCheck) {
          await supabase.from("decision_outcomes").update({
            outcome_status: "not_evaluable",
            evaluation_date: now.toISOString(),
            notes: "Dataset no longer accessible for this organization.",
          }).eq("id", outcome.id);
          evaluated.push({ id: outcome.id, status: "not_evaluable" });
          continue;
        }

        // Get metric values BEFORE decision
        const beforeStart = new Date(decidedAt.getTime() - 30 * 86400000);
        const { data: beforeMetrics } = await supabase
          .from("metrics")
          .select("value")
          .eq("organization_id", organization_id)
          .eq("dataset_id", outcome.dataset_id)
          .eq("metric_type", outcome.expected_metric)
          .gte("date", beforeStart.toISOString().slice(0, 10))
          .lte("date", decidedAt.toISOString().slice(0, 10))
          .order("date", { ascending: false })
          .limit(50);

        // Get metric values AFTER evaluation window
        const { data: afterMetrics } = await supabase
          .from("metrics")
          .select("value")
          .eq("organization_id", organization_id)
          .eq("dataset_id", outcome.dataset_id)
          .eq("metric_type", outcome.expected_metric)
          .gte("date", decidedAt.toISOString().slice(0, 10))
          .lte("date", windowEnd.toISOString().slice(0, 10))
          .order("date", { ascending: false })
          .limit(50);

        if (!beforeMetrics?.length || !afterMetrics?.length) {
          await supabase.from("decision_outcomes").update({
            outcome_status: "not_evaluable",
            evaluation_date: now.toISOString(),
            notes: `Insufficient ${outcome.expected_metric} data for evaluation period.`,
          }).eq("id", outcome.id);
          evaluated.push({ id: outcome.id, status: "not_evaluable" });
          continue;
        }

        // Compute averages
        const avgBefore = beforeMetrics.reduce((s: number, m: any) => s + Number(m.value), 0) / beforeMetrics.length;
        const avgAfter = afterMetrics.reduce((s: number, m: any) => s + Number(m.value), 0) / afterMetrics.length;
        const observedChange = avgBefore !== 0 ? ((avgAfter - avgBefore) / Math.abs(avgBefore)) * 100 : 0;

        // Determine outcome status
        let outcomeStatus = "no_effect";
        const expectedDir = outcome.expected_direction;
        const directionMatch = (expectedDir === "increase" && observedChange > 1) ||
                               (expectedDir === "decrease" && observedChange < -1);

        if (directionMatch) {
          if (outcome.expected_change !== null) {
            const expectedMagnitude = Math.abs(Number(outcome.expected_change));
            const observedMagnitude = Math.abs(observedChange);
            if (observedMagnitude >= expectedMagnitude * 0.8) {
              outcomeStatus = "success";
            } else if (observedMagnitude >= expectedMagnitude * 0.3) {
              outcomeStatus = "partial_success";
            }
          } else {
            outcomeStatus = "success";
          }
        } else if ((expectedDir === "increase" && observedChange < -5) ||
                   (expectedDir === "decrease" && observedChange > 5)) {
          outcomeStatus = "negative_outcome";
        }

        // Accuracy score: how close was the prediction?
        let accuracyScore: number | null = null;
        if (outcome.expected_change !== null && Number(outcome.expected_change) !== 0) {
          accuracyScore = Math.max(0, Math.min(100,
            100 - Math.abs(observedChange - Number(outcome.expected_change)) * 2
          ));
        }

        await supabase.from("decision_outcomes").update({
          observed_metric: outcome.expected_metric,
          observed_value_before: avgBefore,
          observed_value_after: avgAfter,
          outcome_status: outcomeStatus,
          evaluation_date: now.toISOString(),
          accuracy_score: accuracyScore,
          notes: `Observed ${observedChange.toFixed(2)}% change (expected: ${expectedDir} ${outcome.expected_change ?? "any"}%). Before avg: ${avgBefore.toFixed(2)}, After avg: ${avgAfter.toFixed(2)}.`,
        }).eq("id", outcome.id);

        // Also update the decision_ledger with outcome data
        await supabase.from("decision_ledger").update({
          actual_value: avgAfter,
          outcome_delta: observedChange,
          outcome_measured_at: now.toISOString(),
          prediction_accuracy_score: accuracyScore,
        }).eq("id", outcome.decision_id);

        evaluated.push({ id: outcome.id, status: outcomeStatus, accuracy: accuracyScore });
      }

      // Audit trail for batch evaluation
      if (evaluated.length > 0) {
        await supabase.from("audit_log").insert({
          organization_id,
          actor_id: userId,
          actor_type: "user",
          action_type: "outcomes_evaluated",
          resource_type: "decision_outcome",
          payload: { evaluated_count: evaluated.length, results: evaluated },
        });
      }

      return new Response(JSON.stringify({ success: true, evaluated_count: evaluated.length, results: evaluated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PERFORMANCE: Get decision performance metrics ──
    if (action === "performance") {
      const { data: outcomes, error: perfErr } = await supabase
        .from("decision_outcomes")
        .select("outcome_status, accuracy_score, expected_metric, evaluation_date")
        .eq("organization_id", organization_id)
        .neq("outcome_status", "pending");

      if (perfErr) return new Response(JSON.stringify({ error: perfErr.message }), { status: 500, headers: corsHeaders });

      const total = outcomes?.length || 0;
      const evaluable = outcomes?.filter((o: any) => o.outcome_status !== "not_evaluable") || [];
      const successes = evaluable.filter((o: any) => o.outcome_status === "success" || o.outcome_status === "partial_success");
      const negatives = evaluable.filter((o: any) => o.outcome_status === "negative_outcome");
      const scored = evaluable.filter((o: any) => o.accuracy_score !== null);
      const avgAccuracy = scored.length > 0
        ? scored.reduce((s: number, o: any) => s + Number(o.accuracy_score), 0) / scored.length
        : null;

      // Per-metric breakdown
      const byMetric = new Map<string, { total: number; success: number; avgAccuracy: number; scores: number[] }>();
      evaluable.forEach((o: any) => {
        const key = o.expected_metric;
        const entry = byMetric.get(key) || { total: 0, success: 0, avgAccuracy: 0, scores: [] };
        entry.total++;
        if (o.outcome_status === "success" || o.outcome_status === "partial_success") entry.success++;
        if (o.accuracy_score !== null) entry.scores.push(Number(o.accuracy_score));
        byMetric.set(key, entry);
      });

      const metricBreakdown = [...byMetric.entries()].map(([metric, data]) => ({
        metric,
        total: data.total,
        successRate: data.total > 0 ? (data.success / data.total) * 100 : 0,
        avgAccuracy: data.scores.length > 0 ? data.scores.reduce((s, v) => s + v, 0) / data.scores.length : null,
      })).sort((a, b) => b.total - a.total);

      // Confidence calibration: compare predicted confidence vs actual success rate
      const { data: decisions } = await supabase
        .from("decision_ledger")
        .select("id, confidence_at_decision, prediction_accuracy_score")
        .eq("organization_id", organization_id)
        .not("confidence_at_decision", "is", null)
        .not("prediction_accuracy_score", "is", null);

      let calibrationGap: number | null = null;
      if (decisions && decisions.length >= 5) {
        const avgConf = decisions.reduce((s: number, d: any) => s + Number(d.confidence_at_decision), 0) / decisions.length;
        const avgAcc = decisions.reduce((s: number, d: any) => s + Number(d.prediction_accuracy_score), 0) / decisions.length;
        calibrationGap = avgConf - avgAcc;
      }

      // Generate learning insights
      const learnings: string[] = [];
      metricBreakdown.forEach(mb => {
        if (mb.total >= 3) {
          learnings.push(
            `${mb.metric} recommendations have produced positive outcomes in ${mb.successRate.toFixed(0)}% of cases (n=${mb.total}).`
          );
        }
      });
      if (calibrationGap !== null && Math.abs(calibrationGap) > 5) {
        learnings.push(
          calibrationGap > 0
            ? `System is overconfident by ${calibrationGap.toFixed(1)} points — recommendations carry more certainty than outcomes justify.`
            : `System is underconfident by ${Math.abs(calibrationGap).toFixed(1)} points — outcomes are better than predicted.`
        );
      }

      return new Response(JSON.stringify({
        total_decisions: total,
        evaluable_decisions: evaluable.length,
        success_count: successes.length,
        success_rate: evaluable.length > 0 ? (successes.length / evaluable.length) * 100 : null,
        negative_count: negatives.length,
        false_positive_rate: evaluable.length > 0 ? (negatives.length / evaluable.length) * 100 : null,
        avg_accuracy: avgAccuracy,
        calibration_gap: calibrationGap,
        metric_breakdown: metricBreakdown,
        learnings,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── RELIABILITY: Get reliability index for a recommendation context ──
    if (action === "reliability") {
      const metricType = body.metric_type;
      if (!metricType) {
        return new Response(JSON.stringify({ error: "metric_type required" }), { status: 400, headers: corsHeaders });
      }

      const { data: similar } = await supabase
        .from("decision_outcomes")
        .select("outcome_status, accuracy_score")
        .eq("organization_id", organization_id)
        .eq("expected_metric", metricType)
        .neq("outcome_status", "pending")
        .neq("outcome_status", "not_evaluable");

      const total = similar?.length || 0;
      const successes = similar?.filter((o: any) => o.outcome_status === "success" || o.outcome_status === "partial_success").length || 0;
      const reliability = total >= 3 ? (successes / total) * 100 : null;

      return new Response(JSON.stringify({
        metric_type: metricType,
        similar_decisions: total,
        reliability_index: reliability,
        note: total < 3 ? "Insufficient historical data for reliability estimation." : `Based on ${total} similar past decisions.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use: schedule, evaluate, performance, reliability" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("evaluate-outcomes error:", err);
    // If guard was acquired in a cron path but threw, the catch in the cron block handles it
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
