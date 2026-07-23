import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyAdaptiveConfidence, fetchCalibrationModel } from "../_shared/adaptive-confidence.ts";
import { capConfidence } from "../_shared/confidence-cap.ts";
import { applyRateLimit } from "../_shared/rate-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { requireFeatureAccess } from "../_shared/feature-access.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Use getClaims() for secure JWT validation
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user?.id as string;

    const { organization_id } = await req.json();
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: intelligence tier (20/min per org)
    const rl = applyRateLimit(req, organization_id, "intelligence", "generate-board-report");
    if (rl) return rl;

    const { data: isMember } = await serviceClient.rpc("is_org_member", {
      _user_id: userId, _org_id: organization_id,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: sub } = await serviceClient
      .from("subscriptions").select("tier")
      .eq("organization_id", organization_id).eq("status", "active").maybeSingle();
    const tier = sub?.tier || "starter";
    if (tier === "starter") {
      return new Response(JSON.stringify({ error: "Board reports require Growth or Enterprise plan" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      orgResult, riskResult, convergenceLatestResult,
      convergenceHistoryResult, conflictsResult, simulationResult,
    ] = await Promise.all([
      serviceClient.from("organizations").select("name").eq("id", organization_id).single(),
      serviceClient.from("executive_risk_index")
        .select("role_type, score, components, last_updated, escalation_required, escalation_reason")
        .eq("organization_id", organization_id),
      serviceClient.from("executive_convergence_index")
        .select("score, dispersion, conflict_penalty, volatility_divergence, alignment_status, created_at")
        .eq("organization_id", organization_id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      serviceClient.from("executive_convergence_index")
        .select("score, dispersion, conflict_penalty, volatility_divergence, alignment_status, created_at")
        .eq("organization_id", organization_id)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: true }),
      serviceClient.from("executive_conflicts")
        .select("rule_triggered, severity, role_1, role_2, description, created_at")
        .eq("organization_id", organization_id).is("resolved_at", null)
        .order("created_at", { ascending: false }),
      // A single scenario run inserts one row per (KPI x forecast date) in one
      // batch, so they typically share the same created_at — "order by
      // created_at desc limit 10" has no reliable tiebreak and can surface
      // several dates of the SAME kpi_id instead of a spread across KPIs.
      // Fetch a wider window and dedupe to one (latest-dated) row per KPI below.
      serviceClient.from("scenario_results")
        .select("kpi_id, baseline_value, simulated_value, delta_value, date")
        .eq("organization_id", organization_id)
        .order("created_at", { ascending: false }).limit(200),
    ]);

    const roleRisks = (riskResult.data || []).map((r: any) => ({
      role_type: r.role_type, score: r.score, components: r.components,
      last_updated: r.last_updated, escalation_required: r.escalation_required,
      escalation_reason: r.escalation_reason,
    }));

    const convergence = convergenceLatestResult.data || null;
    const convergenceHistory = convergenceHistoryResult.data || [];
    const conflicts = conflictsResult.data || [];

    // One row per KPI (its latest-dated projection), not the raw top-200 —
    // otherwise the summary can show several dates of a single KPI instead
    // of a spread across the org's actual KPIs.
    const latestByKpi = new Map<string, { kpi_id: string; baseline_value: number; simulated_value: number; delta_value: number; date: string }>();
    for (const row of (simulationResult.data || []) as Array<{ kpi_id: string; baseline_value: number; simulated_value: number; delta_value: number; date: string }>) {
      const existing = latestByKpi.get(row.kpi_id);
      if (!existing || row.date > existing.date) latestByKpi.set(row.kpi_id, row);
    }
    const simulation = Array.from(latestByKpi.values());

    // Governance posture
    const maxRiskScore = roleRisks.length > 0 ? Math.max(...roleRisks.map((r: any) => r.score)) : 0;
    const hasEscalation = roleRisks.some((r: any) => r.escalation_required);
    const criticalConflicts = conflicts.filter((c: any) => c.severity === "critical" || c.severity === "high").length;

    let governanceStatus: "green" | "amber" | "red" = "green";
    if (maxRiskScore > 75 || hasEscalation || criticalConflicts > 0 || convergence?.alignment_status === "structural_conflict") {
      governanceStatus = "red";
    } else if (maxRiskScore > 50 || convergence?.alignment_status === "misalignment" || convergence?.alignment_status === "tension") {
      governanceStatus = "amber";
    }

    // Governance headline
    let governanceHeadline = "";
    if (governanceStatus === "red") {
      if (hasEscalation) {
        const escalatedRoles = roleRisks.filter((r: any) => r.escalation_required).map((r: any) => r.role_type.toUpperCase());
        governanceHeadline = `Critical Governance Risk: ${escalatedRoles.join(", ")} Escalation Required`;
      } else if (criticalConflicts > 0) {
        governanceHeadline = `Structural Governance Conflict Across ${criticalConflicts} Active Dispute${criticalConflicts > 1 ? "s" : ""}`;
      } else {
        governanceHeadline = `Elevated Risk Profile Requires Immediate Board Attention`;
      }
    } else if (governanceStatus === "amber") {
      governanceHeadline = convergence?.alignment_status === "misalignment"
        ? `Moderate Structural Misalignment Detected Across Executive Functions`
        : `Executive Tension Identified — Monitoring Recommended`;
    } else {
      governanceHeadline = `Governance Aligned — No Immediate Intervention Required`;
    }

    // Board summary
    const summaryLines: string[] = [];
    if (roleRisks.length > 0) {
      const highest = roleRisks.reduce((a: any, b: any) => a.score > b.score ? a : b);
      const lowest = roleRisks.reduce((a: any, b: any) => a.score < b.score ? a : b);
      summaryLines.push(`The ${highest.role_type.toUpperCase()} function carries the highest risk exposure at ${highest.score}/100, while ${lowest.role_type.toUpperCase()} is lowest at ${lowest.score}/100.`);
    }
    if (convergence) {
      summaryLines.push(`Executive Convergence Index stands at ${convergence.score}/100 with ${convergence.alignment_status.replace("_", " ")} status.`);
    }
    summaryLines.push(conflicts.length > 0
      ? `${conflicts.length} active governance conflict${conflicts.length > 1 ? "s" : ""} remain${conflicts.length === 1 ? "s" : ""} unresolved.`
      : "No active governance conflicts detected.");

    // Governance actions
    const governanceActions: { action: string; priority: "immediate" | "medium_term"; trigger: string }[] = [];
    const cfo = roleRisks.find((r: any) => r.role_type === "cfo");
    const ceo = roleRisks.find((r: any) => r.role_type === "ceo");
    if (cfo && ceo && cfo.score > 70 && ceo.score < 50) {
      governanceActions.push({ action: "Schedule capital allocation alignment session between CEO and CFO", priority: "immediate", trigger: `CFO risk ${cfo.score} > 70, CEO risk ${ceo.score} < 50` });
    }
    if (convergence && convergence.dispersion > 15) {
      governanceActions.push({ action: "Initiate cross-functional alignment workshop across all executive roles", priority: "immediate", trigger: `Dispersion ${convergence.dispersion} > 15` });
    }
    if (convergence?.alignment_status === "structural_conflict") {
      governanceActions.push({ action: "Convene emergency board review to address structural executive conflict", priority: "immediate", trigger: "Structural conflict detected" });
    }
    roleRisks.filter((r: any) => r.escalation_required).forEach((r: any) => {
      governanceActions.push({ action: `Review escalation for ${r.role_type.toUpperCase()}: ${r.escalation_reason || "threshold exceeded"}`, priority: "immediate", trigger: `${r.role_type.toUpperCase()} escalation required` });
    });
    if (convergence && convergence.conflict_penalty > 10) {
      governanceActions.push({ action: "Review and resolve active governance conflicts to reduce ECI penalty", priority: "medium_term", trigger: `Conflict penalty ${convergence.conflict_penalty} > 10` });
    }
    if (maxRiskScore > 50 && maxRiskScore <= 75) {
      governanceActions.push({ action: "Establish quarterly executive risk review cadence", priority: "medium_term", trigger: `Max risk score ${maxRiskScore} in moderate range` });
    }

    // ECI trend
    let eciTrend: { direction: "up" | "down" | "stable"; percentChange: number; dataPoints: number } | null = null;
    if (convergenceHistory.length >= 2) {
      const oldest = convergenceHistory[0];
      const newest = convergenceHistory[convergenceHistory.length - 1];
      const change = newest.score - oldest.score;
      const pct = oldest.score !== 0 ? Math.round((change / oldest.score) * 100) : 0;
      eciTrend = {
        direction: change > 2 ? "up" : change < -2 ? "down" : "stable",
        percentChange: pct,
        dataPoints: convergenceHistory.length,
      };
    }

    // AI narrative for Enterprise with AbortController timeout + adaptive confidence
    let aiNarrative: any = null;
    if (tier === "enterprise" && lovableApiKey) {
      const contextBlock = `
BOARD GOVERNANCE REPORT DATA:
Organization: ${orgResult.data?.name || "Unknown"}
Generated: ${new Date().toISOString()}
Governance Status: ${governanceStatus.toUpperCase()}

ROLE RISK INDICES:
${roleRisks.map((r: any) => `${r.role_type.toUpperCase()}: ${r.score}/100 (dev=${r.components?.deviation}, trend=${r.components?.trend}, vol=${r.components?.volatility}, forecast=${r.components?.forecast})${r.escalation_required ? " ⚠ ESCALATION" : ""}`).join("\n")}

CONVERGENCE INDEX:
${convergence ? `Score: ${convergence.score}/100 | Status: ${convergence.alignment_status} | Dispersion: ${convergence.dispersion} | Conflict Penalty: ${convergence.conflict_penalty}` : "Not yet computed"}

ACTIVE CONFLICTS (${conflicts.length}):
${conflicts.length > 0 ? conflicts.map((c: any) => `[${c.severity.toUpperCase()}] ${c.role_1} vs ${c.role_2}: ${c.description}`).join("\n") : "None"}

DETERMINISTIC ACTIONS:
${governanceActions.map((a) => `[${a.priority}] ${a.action}`).join("\n")}

ECI TREND (30 days):
${eciTrend ? `Direction: ${eciTrend.direction} | Change: ${eciTrend.percentChange}%` : "Insufficient data"}
`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const totalDataPoints = roleRisks.length + (convergence ? 1 : 0) + conflicts.length + convergenceHistory.length;
        const calModel = await fetchCalibrationModel(supabaseUrl, serviceKey, organization_id);

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `You are a board governance advisor. Based on the provided data, return ONLY valid JSON with no markdown:
{
  "governance_risk_statement": "2-3 sentence board-level risk summary",
  "strategic_outlook": "2-3 sentence forward-looking assessment",
  "recommended_actions": ["action1", "action2", "action3", "action4", "action5"],
  "immediate_actions": ["action1", "action2"],
  "medium_term_actions": ["action1", "action2"],
  "governance_risk_if_ignored": "1-2 sentence consequence statement",
  "confidence_score": 0-100
}
Refine the deterministic actions already provided. Be authoritative. Reference only supplied metrics.`,
              },
              { role: "user", content: contextBlock },
            ],
            tools: [{
              type: "function",
              function: {
                name: "board_narrative",
                description: "Return structured board governance narrative with action tiers",
                parameters: {
                  type: "object",
                  properties: {
                    governance_risk_statement: { type: "string" },
                    strategic_outlook: { type: "string" },
                    recommended_actions: { type: "array", items: { type: "string" } },
                    immediate_actions: { type: "array", items: { type: "string" } },
                    medium_term_actions: { type: "array", items: { type: "string" } },
                    governance_risk_if_ignored: { type: "string" },
                    confidence_score: { type: "number" },
                  },
                  required: ["governance_risk_statement", "strategic_outlook", "recommended_actions", "confidence_score"],
                  additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "board_narrative" } },
          }),
        });
        clearTimeout(timeout);
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            aiNarrative = JSON.parse(toolCall.function.arguments);
            // EPISTEMIC ENFORCEMENT: Apply universal adaptive confidence
            if (aiNarrative?.confidence_score !== undefined) {
              const meta = applyAdaptiveConfidence({
                rawConfidence: aiNarrative.confidence_score,
                sampleSize: totalDataPoints,
                calibrationModel: calModel,
              });
              aiNarrative.confidence = meta.confidence;
              aiNarrative.raw_confidence = meta.raw_confidence;
              aiNarrative.capped_confidence = meta.capped_confidence;
              aiNarrative.confidence_cap_reason = meta.confidence_cap_reason;
              aiNarrative.confidence_score = meta.confidence;
              aiNarrative.data_sufficiency = meta.data_sufficiency;
              aiNarrative.adaptive_calibration_applied = meta.adaptive_calibration_applied;
              aiNarrative.calibration_model_version = meta.calibration_model_version;
              aiNarrative.calibration_band_used = meta.calibration_band_used;
              aiNarrative.calibration_correction_applied_pp = meta.calibration_correction_applied_pp;
              aiNarrative.calibration_low_sample_band = meta.calibration_low_sample_band;
              aiNarrative.confidence_source = meta.confidence_source;
            }
          }
        } else {
          await aiResp.text(); // consume body
        }
      } catch (aiErr) {
        clearTimeout(timeout);
        console.error("AI board narrative error:", aiErr);
      }
    }

    // Audit log
    console.log(JSON.stringify({
      event: "board_report_generated",
      organization_id,
      user_id: userId,
      tier,
      governance_status: governanceStatus,
      role_risks_count: roleRisks.length,
      conflicts_count: conflicts.length,
    }));

    const report = {
      organization_name: orgResult.data?.name || "Unknown",
      generated_at: new Date().toISOString(),
      generated_by: userId,
      tier,
      governance_status: governanceStatus,
      governance_headline: governanceHeadline,
      board_summary: summaryLines,
      max_risk_score: maxRiskScore,
      has_escalation: hasEscalation,
      active_conflicts_count: conflicts.length,
      role_risks: roleRisks,
      convergence,
      conflicts,
      simulation,
      eci_trend: eciTrend,
      convergence_history: convergenceHistory,
      governance_actions: governanceActions,
      ai_narrative: aiNarrative,
    };

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-board-report error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
