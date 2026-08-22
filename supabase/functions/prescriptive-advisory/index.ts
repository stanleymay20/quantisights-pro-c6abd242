import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { capConfidence, dataSufficiencyRating, fetchCalibrationModel, type ConfidenceResult } from "../_shared/confidence-cap.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { enrichWithContext, getOrgContext } from "../_shared/enrichment.ts";
import { requireFeatureAccess } from "../_shared/feature-access.ts";
import { getGovernanceProfile } from "../_shared/governance-profile.ts";
import { recordGovernanceUse } from "../_shared/governance-audit.ts";

const FETCH_TIMEOUT_MS = 30_000;
const AI_TIMEOUT_MS = 30_000;
const ALLOWED_PRIORITIES = new Set(["critical", "high", "medium", "low"]);
const ALLOWED_CATEGORIES = new Set(["cost_optimization", "revenue_growth", "risk_mitigation", "operational", "strategic"]);
const UNQUANTIFIED_IMPACT = "Not quantified from available evidence";

type JsonRecord = Record<string, unknown>;

type MetricRow = {
  metric_type: string;
  value: number | string;
  date: string;
  region?: string | null;
  quality_score?: number | null;
};

type RiskRow = {
  score: number | string;
  role_type?: string | null;
  components?: unknown;
};

type InsightRow = {
  message?: string | null;
  severity?: string | null;
  category?: string | null;
};

type AdvisoryDraft = {
  title: string;
  category: string;
  priority: string;
  action: string;
  timeframe: string;
  rawConfidence: number | null;
  confidence: ConfidenceResult | null;
  rationale: string;
  kpiAffected: string[];
  playbookSteps: string[];
  expectedImpact: string;
  source: "ai" | "risk_index";
};

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArray(value: unknown, limit = 10): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

async function fetchChecked(url: string, init: RequestInit, label: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`${label} request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${label} failed (${response.status}): ${body.slice(0, 300)}`);
  }
  return response;
}

async function fetchArray<T>(url: string, headers: Record<string, string>, label: string): Promise<T[]> {
  const response = await fetchChecked(url, { headers }, label);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error(`${label} returned an invalid response shape`);
  return body as T[];
}

function buildMetricSummaries(metrics: MetricRow[]) {
  const grouped = new Map<string, { values: number[]; dates: string[]; regions: Set<string> }>();
  for (const metric of metrics) {
    const metricType = nonEmpty(metric.metric_type);
    const value = finiteNumber(metric.value);
    const date = nonEmpty(metric.date);
    if (!metricType || value === null || !date) continue;
    const existing = grouped.get(metricType) ?? { values: [], dates: [], regions: new Set<string>() };
    existing.values.push(value);
    existing.dates.push(date);
    if (nonEmpty(metric.region)) existing.regions.add(String(metric.region));
    grouped.set(metricType, existing);
  }

  return [...grouped.entries()].map(([metricType, data]) => {
    const values = data.values;
    const count = values.length;
    const mean = values.reduce((sum, value) => sum + value, 0) / count;
    const earliest = values[0];
    const latest = values[count - 1];
    const half = Math.floor(count / 2);
    const early = values.slice(0, half);
    const recent = values.slice(half);
    const earlyMean = early.length ? early.reduce((sum, value) => sum + value, 0) / early.length : mean;
    const recentMean = recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : mean;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
    return {
      metric_type: metricType,
      data_points: count,
      date_range: `${data.dates[0]} to ${data.dates[count - 1]}`,
      latest_value: latest,
      earliest_value: earliest,
      total_change_pct: earliest !== 0 ? Number((((latest - earliest) / Math.abs(earliest)) * 100).toFixed(2)) : 0,
      recent_trend_pct: earlyMean !== 0 ? Number((((recentMean - earlyMean) / Math.abs(earlyMean)) * 100).toFixed(2)) : 0,
      mean: Number(mean.toFixed(2)),
      min: Math.min(...values),
      max: Math.max(...values),
      volatility_pct: mean !== 0 ? Number(((Math.sqrt(variance) / Math.abs(mean)) * 100).toFixed(2)) : 0,
      regions: [...data.regions],
    };
  });
}

function parseAiAdvisories(content: string, sampleSize: number, calibrationModel: Awaited<ReturnType<typeof fetchCalibrationModel>>): AdvisoryDraft[] {
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("AI advisory response did not contain a JSON array");

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("AI advisory response contained invalid JSON");
  }
  if (!Array.isArray(parsed)) throw new Error("AI advisory response was not an array");

  const drafts: AdvisoryDraft[] = [];
  for (const item of parsed.slice(0, 7)) {
    if (!isRecord(item)) continue;
    const title = nonEmpty(item.title);
    const category = nonEmpty(item.category);
    const priority = nonEmpty(item.priority);
    const action = nonEmpty(item.action);
    const rationale = nonEmpty(item.rationale);
    const rawConfidence = finiteNumber(item.raw_confidence);
    if (!title || !category || !priority || !action || !rationale) continue;
    if (!ALLOWED_CATEGORIES.has(category) || !ALLOWED_PRIORITIES.has(priority)) continue;
    if (rawConfidence === null || rawConfidence < 0 || rawConfidence > 100) continue;

    drafts.push({
      title,
      category,
      priority,
      action,
      timeframe: nonEmpty(item.timeframe) ?? "Executive review required",
      rawConfidence,
      confidence: capConfidence(rawConfidence, sampleSize, undefined, calibrationModel),
      rationale,
      kpiAffected: stringArray(item.kpi_affected),
      playbookSteps: stringArray(item.playbook_steps, 8),
      // LLM-authored quantified impact is not treated as evidence. A separate,
      // measured/modelled impact pipeline can populate this field later.
      expectedImpact: UNQUANTIFIED_IMPACT,
      source: "ai",
    });
  }
  return drafts;
}

async function cleanupInsertedAdvisories(
  supabaseUrl: string,
  headers: Record<string, string>,
  organizationId: string,
  insertedIds: string[],
): Promise<void> {
  if (!insertedIds.length) return;
  const filter = insertedIds.map((id) => `"${id.replaceAll('"', '')}"`).join(",");
  await fetchChecked(
    `${supabaseUrl}/rest/v1/advisory_instances?organization_id=eq.${encodeURIComponent(organizationId)}&id=in.(${encodeURIComponent(filter)})`,
    { method: "DELETE", headers },
    "advisory cleanup",
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Advisory service unavailable" }, 503, corsHeaders);

    const rawBody: unknown = await req.json().catch(() => null);
    if (!isRecord(rawBody)) return json({ error: "Valid JSON object body required" }, 400, corsHeaders);
    const organizationId = nonEmpty(rawBody.organization_id);
    const datasetId = nonEmpty(rawBody.dataset_id);
    const decisionContextId = nonEmpty(rawBody.decision_context_id);
    const dryRun = rawBody.dry_run === true;
    if (!organizationId) return json({ error: "organization_id required" }, 400, corsHeaders);
    if (!datasetId) return json({ error: "dataset_id required by Active Data Contract" }, 400, corsHeaders);

    if (!(await verifyOrgMembership(auth.userId, organizationId))) {
      return json({ error: "Forbidden" }, 403, corsHeaders);
    }

    const featureAccess = await requireFeatureAccess(
      supabaseUrl,
      serviceKey,
      req.headers.get("Authorization"),
      "advisory",
    );
    if (featureAccess.ok === false) return json(featureAccess.body, featureAccess.status, corsHeaders);

    const readHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    const writeHeaders = {
      ...readHeaders,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    const datasetRows = await fetchArray<{ id: string }>(
      `${supabaseUrl}/rest/v1/datasets?id=eq.${encodeURIComponent(datasetId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=id`,
      readHeaders,
      "dataset scope verification",
    );
    if (!datasetRows.length) return json({ error: "dataset_id does not belong to this organization" }, 403, corsHeaders);

    if (dryRun) {
      return json({ dry_run: true, status: "PASS", dataset_id: datasetId, organization_id: organizationId }, 200, corsHeaders);
    }
    if (!lovableApiKey) return json({ error: "AI service not configured" }, 503, corsHeaders);

    const metricsUrl = `${supabaseUrl}/rest/v1/metrics?organization_id=eq.${encodeURIComponent(organizationId)}&dataset_id=eq.${encodeURIComponent(datasetId)}&order=date.asc&limit=1000`;
    const riskUrl = `${supabaseUrl}/rest/v1/executive_risk_index?organization_id=eq.${encodeURIComponent(organizationId)}&select=score,role_type,components`;
    const insightsUrl = `${supabaseUrl}/rest/v1/insights?organization_id=eq.${encodeURIComponent(organizationId)}&dataset_id=eq.${encodeURIComponent(datasetId)}&severity=in.(high,medium)&order=created_at.desc&limit=20`;

    const [metrics, riskIndices, insights, calibrationModel] = await Promise.all([
      fetchArray<MetricRow>(metricsUrl, readHeaders, "metrics read"),
      fetchArray<RiskRow>(riskUrl, readHeaders, "risk index read"),
      fetchArray<InsightRow>(insightsUrl, readHeaders, "insights read"),
      fetchCalibrationModel(supabaseUrl, serviceKey, organizationId),
    ]);

    const qualityMetrics = metrics.filter((metric) => {
      const quality = finiteNumber(metric.quality_score);
      return quality === null || quality >= 60;
    });
    const totalSampleSize = qualityMetrics.length;
    if (qualityMetrics.length < 8) {
      return json({
        advisories: [],
        total_advisories: 0,
        critical_count: 0,
        message: `Insufficient quality data (${qualityMetrics.length} records with quality ≥60). Minimum 8 required.`,
        data_sufficiency: dataSufficiencyRating(totalSampleSize),
        sample_size: totalSampleSize,
        generated_at: new Date().toISOString(),
      }, 200, corsHeaders);
    }

    const metricSummaries = buildMetricSummaries(qualityMetrics);
    if (!metricSummaries.length) {
      return json({ error: "Quality metrics contained no usable numeric observations" }, 422, corsHeaders);
    }

    let ragContextBlock = "";
    const ragMetadata = {
      similar_count: 0,
      avg_similarity: 0,
      historical_success_rate: null as number | null,
      confidence_adjustment: 0,
    };
    try {
      const { generateEmbedding, searchSimilar, buildRAGContext } = await import("../_shared/embeddings.ts");
      const queryText = metricSummaries.slice(0, 5).map((metric) =>
        `${metric.metric_type} ${metric.total_change_pct >= 0 ? "increasing" : "declining"} ${Math.abs(metric.total_change_pct).toFixed(0)}% volatility ${metric.volatility_pct.toFixed(0)}%`
      ).join(". ");
      const embedding = await generateEmbedding(queryText);
      const similar = await searchSimilar(supabaseUrl, serviceKey, organizationId, embedding, {
        entityTypes: ["decision", "outcome"],
        limit: 8,
        minSimilarity: 0.25,
      });
      if (similar.length) {
        ragContextBlock = `\n${buildRAGContext(similar)}\n`;
        ragMetadata.similar_count = similar.length;
        ragMetadata.avg_similarity = similar.reduce((sum, row) => sum + row.similarity, 0) / similar.length;
        const evaluated = similar.filter((row) =>
          row.entity_type === "outcome" && typeof (row.metadata as JsonRecord | undefined)?.outcome_success === "boolean"
        );
        if (evaluated.length >= 2) {
          const successes = evaluated.filter((row) => (row.metadata as JsonRecord).outcome_success === true).length;
          ragMetadata.historical_success_rate = (successes / evaluated.length) * 100;
        }
      }
    } catch (error) {
      console.warn("RAG retrieval unavailable; proceeding without historical context:", error instanceof Error ? error.message : String(error));
    }

    let decisionContextBlock = "";
    if (decisionContextId) {
      const contexts = await fetchArray<JsonRecord>(
        `${supabaseUrl}/rest/v1/decision_contexts?id=eq.${encodeURIComponent(decisionContextId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=name,decision_type,objective,industry,target_metrics`,
        readHeaders,
        "decision context read",
      );
      if (!contexts.length) return json({ error: "decision_context_id does not belong to this organization" }, 403, corsHeaders);
      decisionContextBlock = `\nDECISION CONTEXT:\n${JSON.stringify(contexts[0], null, 2)}\n`;
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableApiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: `You are an enterprise decision-intelligence advisor. Use only the supplied evidence.\n${decisionContextBlock}\n${ragContextBlock}\nMETRIC SUMMARIES:\n${JSON.stringify(metricSummaries, null, 2)}\n\nRISK INDICES:\n${JSON.stringify(riskIndices, null, 2)}\n\nRECENT INSIGHTS:\n${JSON.stringify(insights.slice(0, 10), null, 2)}\n\nReturn a JSON array of 0-7 materially justified advisories. Required fields: title, category, priority, action, timeframe, raw_confidence, rationale, kpi_affected, playbook_steps. raw_confidence must be an explicit 0-100 model assessment; omit the advisory if you cannot assess it. Do not fabricate monetary savings, ROI, percentages, or causal impact. Quantified expected impact is not requested here. If impact has not been measured or modelled by the supplied evidence, it is unquantified. Categories: cost_optimization, revenue_growth, risk_mitigation, operational, strategic. Priorities: critical, high, medium, low. Return ONLY valid JSON.`
        }],
      }),
    }).catch((error) => {
      throw new Error(`AI advisory request failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    if (!aiResponse.ok) {
      const text = await aiResponse.text().catch(() => "");
      return json({ error: `AI advisory service failed (${aiResponse.status})`, detail: text.slice(0, 300) }, 502, corsHeaders);
    }

    const aiBody: unknown = await aiResponse.json();
    const aiContent = isRecord(aiBody)
      && Array.isArray(aiBody.choices)
      && isRecord(aiBody.choices[0])
      && isRecord(aiBody.choices[0].message)
      ? nonEmpty(aiBody.choices[0].message.content) ?? ""
      : "";
    if (!aiContent) return json({ error: "AI advisory service returned no content" }, 502, corsHeaders);

    const drafts = parseAiAdvisories(aiContent, totalSampleSize, calibrationModel);

    // Risk-index escalations are deterministic alerts, but the risk score is a
    // severity index—not a confidence estimate—so confidence remains unknown.
    for (const risk of riskIndices) {
      const score = finiteNumber(risk.score);
      if (score === null || score < 70) continue;
      const role = nonEmpty(risk.role_type) ?? "executive";
      drafts.push({
        title: `${role.toUpperCase()} Risk Escalation Protocol`,
        category: "strategic",
        priority: score >= 85 ? "critical" : "high",
        action: `Initiate an executive review of the measured ${role} risk factors and assign a mitigation owner.`,
        timeframe: score >= 85 ? "Immediate" : "30 days",
        rawConfidence: null,
        confidence: null,
        rationale: `${role.toUpperCase()} strategic risk index is ${score}/100. The index is treated as severity, not confidence.`,
        kpiAffected: ["Strategic Risk Index"],
        playbookSteps: ["Review risk-index components", "Assign accountable owner", "Document mitigation plan", "Set evidence-based review date"],
        expectedImpact: UNQUANTIFIED_IMPACT,
        source: "risk_index",
      });
    }

    if (!drafts.length) {
      return json({
        advisories: [],
        total_advisories: 0,
        critical_count: 0,
        message: "No evidence-supported advisory passed the generation contract.",
        data_sufficiency: dataSufficiencyRating(totalSampleSize),
        sample_size: totalSampleSize,
        generated_at: new Date().toISOString(),
      }, 200, corsHeaders);
    }

    const orgContext = await getOrgContext(organizationId);
    const rows = await Promise.all(drafts.map(async (draft) => {
      const capped = draft.confidence?.calibrated_confidence ?? draft.confidence?.capped_confidence ?? null;
      const focusMetric = draft.kpiAffected[0]?.toLowerCase().replace(/\s+/g, "_") ?? draft.category;
      const enrichment = capped === null
        ? null
        : await enrichWithContext({
            organization_id: organizationId,
            region: orgContext.region,
            industry: orgContext.industry,
            metric_focus: focusMetric,
            client_confidence: capped,
          });
      const enrichedConfidence = enrichment?.ok
        ? Math.max(0, Math.min(100, enrichment.enriched_confidence))
        : capped;

      return {
        organization_id: organizationId,
        dataset_id: datasetId,
        title: draft.title,
        action: draft.action,
        advisory_type: "prescriptive",
        category: draft.category,
        priority: draft.priority,
        confidence: enrichedConfidence,
        capped_confidence: draft.confidence?.capped_confidence ?? null,
        raw_confidence: draft.rawConfidence,
        confidence_cap_reason: draft.confidence?.confidence_cap_reason ?? null,
        rationale: draft.rationale,
        expected_impact: draft.expectedImpact,
        timeframe: draft.timeframe,
        kpi_affected: draft.kpiAffected,
        playbook_steps: draft.playbookSteps,
        status: "open",
        decision_enrichment_id: enrichment?.enrichment_id ?? null,
        client_evidence_summary: enrichment?.client_evidence_summary || null,
        internal_context_summary: enrichment?.internal_context_summary || null,
        combined_interpretation: enrichment?.combined_interpretation || null,
        client_confidence: enrichment?.ok ? enrichment.client_confidence : capped,
        enriched_confidence: enrichment?.ok ? enrichedConfidence : null,
        confidence_delta: enrichment?.ok ? enrichment.confidence_delta : null,
        blending_rule: enrichment?.ok ? enrichment.blending_rule : "no_context",
        evidence_sources: enrichment?.ok && enrichment.internal_context_count > 0
          ? [
              { source_type: "client", source_name: "client_upload", metric_type: focusMetric, dataset_id: datasetId, contribution_weight: 0.7 },
              { source_type: "internal", source_name: "internal_reference", metric_type: focusMetric, dataset_id: null, contribution_weight: 0.3 },
            ]
          : [{ source_type: "client", source_name: "client_upload", metric_type: focusMetric, dataset_id: datasetId, contribution_weight: 1.0 }],
        advisory_lane: "primary",
        source_evidence: {
          generation_source: draft.source,
          impact_quantified: false,
          impact_basis: UNQUANTIFIED_IMPACT,
          sample_size: totalSampleSize,
          rag_similar_count: ragMetadata.similar_count,
        },
      };
    }));

    const insertResponse = await fetchChecked(
      `${supabaseUrl}/rest/v1/advisory_instances`,
      { method: "POST", headers: writeHeaders, body: JSON.stringify(rows) },
      "advisory persistence",
    );
    const insertedBody: unknown = await insertResponse.json();
    if (!Array.isArray(insertedBody) || insertedBody.length !== rows.length) {
      throw new Error(`advisory persistence returned ${Array.isArray(insertedBody) ? insertedBody.length : 0} rows for ${rows.length} requested`);
    }
    const inserted = insertedBody.filter(isRecord);
    const insertedIds = inserted.map((row) => nonEmpty(row.id)).filter((id): id is string => Boolean(id));
    if (insertedIds.length !== rows.length) throw new Error("advisory persistence did not return every inserted id");

    try {
      const profile = await getGovernanceProfile(supabaseUrl, serviceKey, organizationId);
      const thresholds = {
        advisory_threshold: profile.advisory_threshold,
        escalation_threshold: profile.escalation_threshold,
        intervention_threshold: profile.intervention_threshold,
      };
      await Promise.all(inserted.map((row) => recordGovernanceUse(supabaseUrl, serviceKey, {
        organization_id: organizationId,
        subject_type: "advisory",
        subject_id: String(row.id),
        profile,
        thresholds_applied: thresholds,
        approval_rules_applied: { governance_model: profile.governance_model },
        decision_path: {
          dataset_id: datasetId,
          priority: row.priority,
          category: row.category,
          capped_confidence: row.capped_confidence,
          blending_rule: row.blending_rule,
          impact_quantified: false,
          engine: "prescriptive-advisory",
        },
        engine_version: "prescriptive-advisory-v2",
      })));
    } catch (auditError) {
      try {
        await cleanupInsertedAdvisories(supabaseUrl, readHeaders, organizationId, insertedIds);
      } catch (cleanupError) {
        console.error("advisory governance audit failed and cleanup also failed", cleanupError);
      }
      throw new Error(`Governance evidence persistence failed: ${auditError instanceof Error ? auditError.message : String(auditError)}`);
    }

    // Only after the new advisory set AND its governance evidence are durable do
    // we supersede previous open advisories. Exclude the newly inserted IDs.
    const excludeIds = insertedIds.map((id) => `"${id.replaceAll('"', '')}"`).join(",");
    await fetchChecked(
      `${supabaseUrl}/rest/v1/advisory_instances?organization_id=eq.${encodeURIComponent(organizationId)}&dataset_id=eq.${encodeURIComponent(datasetId)}&advisory_type=eq.prescriptive&status=eq.open&id=not.in.(${encodeURIComponent(excludeIds)})`,
      {
        method: "PATCH",
        headers: { ...writeHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ status: "dismissed", resolution_summary: "Superseded by newer evidence-backed analysis run" }),
      },
      "previous advisory supersession",
    );

    return json({
      advisories: inserted,
      persisted: true,
      governance_evidence_persisted: true,
      total_advisories: inserted.length,
      critical_count: inserted.filter((row) => row.priority === "critical").length,
      data_sufficiency: dataSufficiencyRating(totalSampleSize),
      sample_size: totalSampleSize,
      confidence_ceiling: totalSampleSize < 12 ? 60 : totalSampleSize < 30 ? 75 : 90,
      adaptive_calibration_applied: Boolean(calibrationModel),
      calibration_model_version: calibrationModel?.model_version ?? null,
      rag_context: {
        similar_decisions_retrieved: ragMetadata.similar_count,
        avg_similarity: ragMetadata.avg_similarity,
        historical_success_rate: ragMetadata.historical_success_rate,
      },
      generated_at: new Date().toISOString(),
    }, 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("prescriptive-advisory failed:", message);
    return json({ error: message }, 500, corsHeaders);
  }
});
