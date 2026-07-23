import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { capConfidence, dataSufficiencyRating, fetchCalibrationModel } from "../_shared/confidence-cap.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { enrichWithContext, getOrgContext } from "../_shared/enrichment.ts";
import { requireFeatureAccess } from "../_shared/feature-access.ts";
import { getGovernanceProfile } from "../_shared/governance-profile.ts";
import { recordGovernanceUse } from "../_shared/governance-audit.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);const auth = await authenticateRequest(req);
  const corsHeaders = getCorsHeaders(req);
  if (auth.response) return auth.response;

  try {
    const { organization_id, dataset_id, role_type, decision_context_id, dry_run } = await req.json();
    if (!organization_id) throw new Error("organization_id required");
    if (!dataset_id) throw new Error("dataset_id required by Active Data Contract");

    const isMember = await verifyOrgMembership(auth.userId, organization_id);
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Tier gating ──
    const access = await requireFeatureAccess(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      req.headers.get("Authorization"),
      "advisory",
    );
    if (access.ok === false) {
      return new Response(JSON.stringify(access.body), {
        status: access.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    // Dataset contract: verify dataset belongs to org
    const dsCheckResp = await fetch(
      `${supabaseUrl}/rest/v1/datasets?id=eq.${dataset_id}&organization_id=eq.${organization_id}&select=id`,
      { headers }
    );
    const dsCheck = await dsCheckResp.json();
    if (!dsCheck || dsCheck.length === 0) {
      return new Response(JSON.stringify({ error: "dataset_id does not belong to this organization" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (dry_run) {
      return new Response(JSON.stringify({ dry_run: true, status: "PASS", dataset_id, organization_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metricsUrl = `${supabaseUrl}/rest/v1/metrics?organization_id=eq.${organization_id}&dataset_id=eq.${dataset_id}&order=date.asc&limit=1000`;
    const insightsUrl = `${supabaseUrl}/rest/v1/insights?organization_id=eq.${organization_id}&dataset_id=eq.${dataset_id}&severity=in.(high,medium)&order=created_at.desc&limit=20`;

    const [metricsResp, riskResp, insightsResp, calibrationModel] = await Promise.all([
      fetch(metricsUrl, { headers }),
      fetch(`${supabaseUrl}/rest/v1/executive_risk_index?organization_id=eq.${organization_id}&select=score,role_type,components`, { headers }),
      fetch(insightsUrl, { headers }),
      fetchCalibrationModel(supabaseUrl, serviceKey, organization_id),
    ]);

    const metrics = await metricsResp.json();
    const riskIndices = await riskResp.json();
    const insights = await insightsResp.json();

    const totalSampleSize = (metrics || []).length;

    // Data quality gate
    const qualityMetrics = (metrics || []).filter((m: any) => (m.quality_score ?? 100) >= 60);
    if (qualityMetrics.length < 8) {
      return new Response(JSON.stringify({
        advisories: [],
        total_advisories: 0,
        critical_count: 0,
        message: `Insufficient quality data (${qualityMetrics.length} records with quality ≥60). Minimum 8 required.`,
        generated_at: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group metrics by type with time series
    const metricsByType: Record<string, { values: number[]; dates: string[]; regions: Set<string> }> = {};
    for (const m of qualityMetrics) {
      if (!metricsByType[m.metric_type]) {
        metricsByType[m.metric_type] = { values: [], dates: [], regions: new Set() };
      }
      metricsByType[m.metric_type].values.push(Number(m.value));
      metricsByType[m.metric_type].dates.push(m.date);
      if (m.region) metricsByType[m.metric_type].regions.add(m.region);
    }

    // Build summary for AI
    const metricSummaries = Object.entries(metricsByType).map(([type, data]) => {
      const vals = data.values;
      const n = vals.length;
      const mean = vals.reduce((s, v) => s + v, 0) / n;
      const latest = vals[n - 1];
      const earliest = vals[0];
      const changePct = earliest !== 0 ? ((latest - earliest) / Math.abs(earliest)) * 100 : 0;
      const half = Math.floor(n / 2);
      const recentHalf = vals.slice(half);
      const earlyHalf = vals.slice(0, half);
      const recentAvg = recentHalf.reduce((s, v) => s + v, 0) / recentHalf.length;
      const earlyAvg = earlyHalf.length > 0 ? earlyHalf.reduce((s, v) => s + v, 0) / earlyHalf.length : recentAvg;
      const trendPct = earlyAvg !== 0 ? ((recentAvg - earlyAvg) / Math.abs(earlyAvg)) * 100 : 0;
      const max = vals.reduce((a, b) => a > b ? a : b, vals[0]);
      const min = vals.reduce((a, b) => a < b ? a : b, vals[0]);
      const volatility = mean !== 0 ? (Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n) / Math.abs(mean)) * 100 : 0;

      return {
        metric_type: type,
        data_points: n,
        date_range: `${data.dates[0]} to ${data.dates[n - 1]}`,
        latest_value: latest,
        earliest_value: earliest,
        total_change_pct: Number(changePct.toFixed(2)),
        recent_trend_pct: Number(trendPct.toFixed(2)),
        mean: Number(mean.toFixed(2)),
        min: Number(min.toFixed(2)),
        max: Number(max.toFixed(2)),
        volatility_pct: Number(volatility.toFixed(2)),
        regions: [...data.regions],
      };
    });

    // Use AI to generate domain-agnostic advisories
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const riskSummary = (riskIndices || []).map((r: any) => ({
      role: r.role_type,
      score: r.score,
      components: r.components,
    }));

    const insightSummary = (insights || []).slice(0, 10).map((i: any) => ({
      message: i.message,
      severity: i.severity,
      category: i.category,
    }));

    // ── RAG: Retrieve similar past decisions and outcomes ──
    let ragContextBlock = "";
    let ragMetadata: { similar_count: number; avg_similarity: number; historical_success_rate: number | null; confidence_adjustment: number } = {
      similar_count: 0, avg_similarity: 0, historical_success_rate: null, confidence_adjustment: 0,
    };
    try {
      const { generateEmbedding, searchSimilar, buildRAGContext } = await import("../_shared/embeddings.ts");
      
      // Build a query from the top metric summaries
      const queryText = metricSummaries.slice(0, 5).map(m => 
        `${m.metric_type} ${m.total_change_pct > 0 ? 'increasing' : 'declining'} ${Math.abs(m.total_change_pct).toFixed(0)}% volatility ${m.volatility_pct.toFixed(0)}%`
      ).join(". ");
      
      const queryEmbedding = await generateEmbedding(queryText);
      const similar = await searchSimilar(supabaseUrl, serviceKey, organization_id, queryEmbedding, {
        entityTypes: ["decision", "outcome"],
        limit: 8,
        minSimilarity: 0.25,
      });
      
      if (similar.length > 0) {
        ragContextBlock = "\n" + buildRAGContext(similar) + "\n";
        ragMetadata.similar_count = similar.length;
        ragMetadata.avg_similarity = similar.reduce((s, r) => s + r.similarity, 0) / similar.length;
        
        // Compute historical success rate from retrieved outcomes
        const outcomes = similar.filter(r => r.entity_type === "outcome");
        if (outcomes.length >= 2) {
          const successCount = outcomes.filter(r => {
            const delta = (r.metadata as any)?.outcome_delta;
            return delta != null && delta > 0;
          }).length;
          ragMetadata.historical_success_rate = (successCount / outcomes.length) * 100;
          
          // Adjust confidence based on historical accuracy
          const avgAccuracy = outcomes
            .map(r => (r.metadata as any)?.accuracy_score)
            .filter((a): a is number => a != null);
          if (avgAccuracy.length > 0) {
            const meanAccuracy = avgAccuracy.reduce((s, v) => s + v, 0) / avgAccuracy.length;
            // If past similar decisions had low accuracy, reduce confidence
            if (meanAccuracy < 50) ragMetadata.confidence_adjustment = -10;
            else if (meanAccuracy < 70) ragMetadata.confidence_adjustment = -5;
            else if (meanAccuracy > 85) ragMetadata.confidence_adjustment = 5;
          }
        }
      }
    } catch (ragErr) {
      console.warn("RAG retrieval skipped:", ragErr instanceof Error ? ragErr.message : "unknown");
    }

    // Fetch decision context if provided
    let contextBlock = "";
    if (decision_context_id) {
      const ctxResp = await fetch(
        `${supabaseUrl}/rest/v1/decision_contexts?id=eq.${decision_context_id}&organization_id=eq.${organization_id}&select=name,decision_type,objective,industry,target_metrics`,
        { headers }
      );
      const ctxArr = await ctxResp.json();
      if (ctxArr?.[0]) {
        const ctx = ctxArr[0];
        contextBlock = `
DECISION CONTEXT:
Name: ${ctx.name}
Type: ${ctx.decision_type}
Objective: ${ctx.objective || "Not specified"}
Industry: ${ctx.industry || "Not specified"}
Target Metrics: ${JSON.stringify(ctx.target_metrics || [])}

IMPORTANT: Generate advisories specifically relevant to this "${ctx.decision_type}" decision. Prioritize actions that advance the stated objective. Every advisory must explain its relevance to the decision context.
`;
      }
    }

    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 30000);
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: aiController.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: `You are an enterprise decision intelligence advisor for a $1B+ company.
${contextBlock}
${ragContextBlock}
Analyze the following dataset metrics and generate strategic advisories.

METRIC SUMMARIES:
${JSON.stringify(metricSummaries, null, 2)}

EXISTING RISK INDICES:
${JSON.stringify(riskSummary, null, 2)}

RECENT INSIGHTS:
${JSON.stringify(insightSummary, null, 2)}

Generate 3-7 strategic advisories. For EACH advisory, return ONLY valid JSON array with this structure:
[
  {
    "title": "Clear advisory title",
    "category": "cost_optimization" | "revenue_growth" | "risk_mitigation" | "operational" | "strategic",
    "priority": "critical" | "high" | "medium" | "low",
    "action": "Specific recommended action (1-2 sentences)",
    "expected_impact": "Quantified expected impact",
    "timeframe": "e.g. Immediate, 30 days, 30-90 days",
    "raw_confidence": 60-90,
    "rationale": "Evidence-based rationale referencing specific metrics and trends",
    "kpi_affected": ["list", "of", "affected", "KPIs"],
    "playbook_steps": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"]
  }
]

Rules:
- Be domain-agnostic: these could be economic, financial, industrial, SaaS, or any domain metrics
- Reference actual metric names and values from the data
- Prioritize based on magnitude of change, volatility, and risk
- Do NOT generate filler advisories if metrics are stable
- Critical = immediate action needed, High = within 30 days, Medium = 30-90 days, Low = monitoring
- Return ONLY the JSON array, no other text`,
        }],
      }),
    });

    clearTimeout(aiTimeout);

    if (!aiRes.ok) {
      console.error("AI advisory error:", aiRes.status);
      // Fallback: return empty advisories rather than failing
      return new Response(JSON.stringify({
        advisories: [],
        total_advisories: 0,
        critical_count: 0,
        data_sufficiency: dataSufficiencyRating(totalSampleSize),
        sample_size: totalSampleSize,
        confidence_ceiling: totalSampleSize < 12 ? 60 : totalSampleSize < 30 ? 75 : 90,
        adaptive_calibration_applied: !!calibrationModel,
        calibration_model_version: calibrationModel?.model_version ?? null,
        generated_at: new Date().toISOString(),
        ai_error: "AI service temporarily unavailable",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    let aiAdvisories: any[] = [];
    if (jsonMatch) {
      try {
        aiAdvisories = JSON.parse(jsonMatch[0]);
      } catch {
        console.error("Failed to parse AI advisory JSON");
      }
    }

    // Apply confidence capping to each advisory (with historical RAG adjustment)
    const advisories = aiAdvisories.map((a: any, i: number) => {
      const baseConfidence = (a.raw_confidence || 70) + ragMetadata.confidence_adjustment;
      const clampedConfidence = Math.max(30, Math.min(95, baseConfidence));
      return {
        id: `adv-${i + 1}`,
        title: a.title || "Strategic Advisory",
        category: a.category || "strategic",
        priority: a.priority || "medium",
        action: a.action || "",
        expected_impact: a.expected_impact || "",
        timeframe: a.timeframe || "30-90 days",
        confidence: capConfidence(clampedConfidence, totalSampleSize, undefined, calibrationModel),
        rationale: a.rationale || "",
        kpi_affected: a.kpi_affected || [],
        playbook_steps: a.playbook_steps || [],
        rag_adjustment: ragMetadata.confidence_adjustment !== 0 ? {
          adjustment_pp: ragMetadata.confidence_adjustment,
          similar_outcomes: ragMetadata.similar_count,
          historical_success_rate: ragMetadata.historical_success_rate,
        } : undefined,
      };
    });

    // Add risk-based advisories from risk index (these are always relevant)
    for (const risk of (riskIndices || [])) {
      if (risk.score >= 70) {
        const role = risk.role_type || "executive";
        advisories.push({
          id: `adv-risk-${role}`,
          title: `${role.toUpperCase()} Risk Escalation Protocol`,
          category: "strategic",
          priority: risk.score >= 85 ? "critical" : "high",
          action: `Initiate board-level review of ${role} risk factors and implement mitigation plan`,
          expected_impact: `Reduce ${role} risk score from ${risk.score} to below 50 within 60 days`,
          timeframe: risk.score >= 85 ? "Immediate" : "30 days",
          confidence: capConfidence(85, totalSampleSize, undefined, calibrationModel),
          rationale: `${role.toUpperCase()} strategic risk index at ${risk.score}/100.`,
          kpi_affected: ["Strategic Risk Index", "Board Confidence"],
          playbook_steps: [
            `Schedule emergency ${role} strategy review`,
            "Identify top 3 risk contributors",
            "Develop contingency plans",
            "Establish weekly risk monitoring",
            "Report mitigation progress within 14 days",
          ],
          rag_adjustment: undefined,
        });
      }
    }

    // Sort by priority
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    advisories.sort((a: any, b: any) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));

    // Deduplication: close existing open advisories for this dataset before inserting new ones
    const serviceHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" };

    await fetch(
      `${supabaseUrl}/rest/v1/advisory_instances?organization_id=eq.${organization_id}&dataset_id=eq.${dataset_id}&advisory_type=eq.prescriptive&status=in.(open)`,
      {
        method: "PATCH",
        headers: serviceHeaders,
        body: JSON.stringify({ status: "dismissed", resolution_summary: "Superseded by newer analysis run" }),
      }
    );

    if (advisories.length > 0) {
      // ── Layer C synthesis: enrich each advisory with internal context ──
      // Doctrine: client values stay; only confidence + interpretation are augmented.
      const orgCtx = await getOrgContext(organization_id);

      const enrichedRows = await Promise.all(advisories.map(async (a: any) => {
        const rawConf = typeof a.confidence === "object" ? a.confidence?.raw_confidence : a.confidence;
        const cappedConf = typeof a.confidence === "object" ? a.confidence?.capped_confidence : a.confidence;

        const focusMetric = Array.isArray(a.kpi_affected) && a.kpi_affected.length > 0
          ? String(a.kpi_affected[0]).toLowerCase().replace(/\s+/g, "_")
          : a.category;

        const enrichment = await enrichWithContext({
          organization_id,
          region: orgCtx.region,
          industry: orgCtx.industry,
          metric_focus: focusMetric,
          client_confidence: Number(cappedConf ?? 50),
        });

        // Safety: never overwrite client-anchored core values; only adjust confidence within ±10pp
        const safeEnrichedConfidence = enrichment.ok
          ? Math.max(0, Math.min(100, enrichment.enriched_confidence))
          : (cappedConf ?? null);

        return {
          organization_id,
          dataset_id,
          title: a.title,
          action: a.action,
          advisory_type: "prescriptive",
          category: a.category,
          priority: a.priority,
          confidence: safeEnrichedConfidence,
          capped_confidence: cappedConf ?? null,
          raw_confidence: rawConf ?? null,
          confidence_cap_reason: typeof a.confidence === "object" ? a.confidence?.confidence_cap_reason : null,
          rationale: a.rationale,
          expected_impact: a.expected_impact,
          timeframe: a.timeframe,
          kpi_affected: a.kpi_affected,
          playbook_steps: a.playbook_steps,
          status: "open",
          // Enrichment fields (Layer C)
          decision_enrichment_id: enrichment.enrichment_id,
          client_evidence_summary: enrichment.client_evidence_summary || null,
          internal_context_summary: enrichment.internal_context_summary || null,
          combined_interpretation: enrichment.combined_interpretation || null,
          client_confidence: enrichment.ok ? enrichment.client_confidence : null,
          enriched_confidence: enrichment.ok ? safeEnrichedConfidence : null,
          confidence_delta: enrichment.ok ? enrichment.confidence_delta : null,
          blending_rule: enrichment.ok ? enrichment.blending_rule : "no_context",
          evidence_sources: enrichment.ok && enrichment.internal_context_count > 0
            ? [
                { source_type: "client", source_name: "client_upload", metric_type: focusMetric, dataset_id, contribution_weight: 0.7 },
                { source_type: "internal", source_name: "internal_reference", metric_type: focusMetric, dataset_id: null, contribution_weight: 0.3 },
              ]
            : [
                { source_type: "client", source_name: "client_upload", metric_type: focusMetric, dataset_id, contribution_weight: 1.0 },
              ],
          advisory_lane: "primary",
        };
      }));

      const insertResp = await fetch(`${supabaseUrl}/rest/v1/advisory_instances`, {
        method: "POST",
        headers: { ...serviceHeaders, Prefer: "return=representation" },
        body: JSON.stringify(enrichedRows),
      });
      if (!insertResp.ok) {
        const errBody = await insertResp.text();
        console.error("advisory_instances INSERT failed:", insertResp.status, errBody);
      } else {
        // Phase 9: record governance audit trail per advisory
        try {
          const inserted = await insertResp.json();
          const profile = await getGovernanceProfile(supabaseUrl, serviceKey, organization_id);
          const thresholds = {
            advisory_threshold: profile.advisory_threshold,
            escalation_threshold: profile.escalation_threshold,
            intervention_threshold: profile.intervention_threshold,
          };
          const approvalRules = { governance_model: profile.governance_model };
          await Promise.all((inserted ?? []).map((row: any) =>
            recordGovernanceUse(supabaseUrl, serviceKey, {
              organization_id,
              subject_type: "advisory",
              subject_id: row.id,
              profile,
              thresholds_applied: thresholds,
              approval_rules_applied: approvalRules,
              decision_path: {
                dataset_id,
                priority: row.priority,
                category: row.category,
                capped_confidence: row.capped_confidence,
                blending_rule: row.blending_rule,
                engine: "prescriptive-advisory",
              },
              engine_version: "prescriptive-advisory-v1",
            })
          ));
        } catch (auditErr) {
          console.warn("governance audit (advisory) write failed:", (auditErr as Error).message);
        }
      }
    }

    return new Response(JSON.stringify({
      advisories,
      total_advisories: advisories.length,
      critical_count: advisories.filter((a: any) => a.priority === "critical").length,
      data_sufficiency: dataSufficiencyRating(totalSampleSize),
      sample_size: totalSampleSize,
      confidence_ceiling: totalSampleSize < 12 ? 60 : totalSampleSize < 30 ? 75 : 90,
      adaptive_calibration_applied: !!calibrationModel,
      calibration_model_version: calibrationModel?.model_version ?? null,
      rag_context: {
        similar_decisions_retrieved: ragMetadata.similar_count,
        avg_similarity: ragMetadata.avg_similarity,
        historical_success_rate: ragMetadata.historical_success_rate,
        confidence_adjustment_pp: ragMetadata.confidence_adjustment,
      },
      generated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
