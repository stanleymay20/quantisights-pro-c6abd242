// AICIS Auto-Decision Pipeline
// Creates pending decisions from high-risk predictions and urgent recommendations.
// Source-level idempotency is enforced in decision_ledger, so concurrent cron/user
// runs cannot create duplicate decisions from the same AICIS source row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { getGovernanceProfile, approvalChainForModel } from "../_shared/governance-profile.ts";
import { getThreshold } from "../_shared/threshold-registry.ts";
import { recordGovernanceUse, buildGovernanceContext } from "../_shared/governance-audit.ts";
import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts";

const RUN_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_RISK_THRESHOLD = 0.60;
const DEFAULT_URGENCY_HOURS_THRESHOLD = 72;
const MAX_DECISIONS_PER_RUN = 50;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

interface AutoRunResult {
  scanned_predictions: number;
  scanned_recommendations: number;
  decisions_created: number;
  skipped_existing: number;
  skipped_below_threshold: number;
  errors: number;
  correlation_id: string;
  duration_ms: number;
}

type InsertedDecision = { id: string; source_idempotency_key?: string | null };

const log = (level: string, msg: string, ctx: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...ctx }));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return json({ error: "AICIS auto-decision service unavailable" }, 503);
  }

  const correlationId = req.headers.get("x-request-id") || crypto.randomUUID();
  const startedAt = Date.now();
  let body: { organization_id?: string; dry_run?: boolean; cron?: boolean } = {};
  try { body = await req.json(); } catch { /* empty is valid for non-cron auth rejection */ }

  const service = createClient(SUPABASE_URL, SERVICE_KEY);
  const cronSecretHeader = req.headers.get("x-cron-secret");
  const cronSecretEnv = Deno.env.get("CRON_SHARED_SECRET") ?? Deno.env.get("INGEST_CRON_SECRET");
  const isCronMode = body.cron === true && Boolean(cronSecretHeader && cronSecretEnv && timingSafeEqual(cronSecretHeader!, cronSecretEnv!));

  let userId: string;
  let orgsToProcess: string[] = [];
  const dryRun = body.dry_run === true;

  if (isCronMode) {
    userId = "00000000-0000-0000-0000-000000000000";
    const { data: candidateOrgs, error: candidateOrgError } = await service
      .from("aicis_predictions")
      .select("organization_id")
      .gte("risk_probability", DEFAULT_RISK_THRESHOLD);
    if (candidateOrgError) return json({ error: `Failed to resolve AICIS prediction organizations: ${candidateOrgError.message}` }, 500);

    const { data: recommendationOrgs, error: recommendationOrgError } = await service
      .from("aicis_recommendations")
      .select("organization_id")
      .lte("urgency_hours", DEFAULT_URGENCY_HOURS_THRESHOLD);
    if (recommendationOrgError) return json({ error: `Failed to resolve AICIS recommendation organizations: ${recommendationOrgError.message}` }, 500);

    const organizations = new Set<string>();
    for (const row of candidateOrgs ?? []) if (typeof row.organization_id === "string") organizations.add(row.organization_id);
    for (const row of recommendationOrgs ?? []) if (typeof row.organization_id === "string") organizations.add(row.organization_id);
    orgsToProcess = [...organizations];
    log("info", "cron_mode_started", { org_count: orgsToProcess.length, correlation_id: correlationId });
  } else {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.id) return json({ error: "Unauthorized" }, 401);
    if (!body.organization_id) return json({ error: "organization_id required" }, 400);

    const { data: member, error: memberError } = await service
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", body.organization_id)
      .maybeSingle();
    if (memberError) return json({ error: `Failed to verify organization role: ${memberError.message}` }, 500);
    if (!member || !["owner", "admin"].includes(String(member.role))) {
      return json({ error: "Forbidden — owner or admin required" }, 403);
    }
    userId = user.id;
    orgsToProcess = [body.organization_id];
  }

  const result: AutoRunResult = {
    scanned_predictions: 0,
    scanned_recommendations: 0,
    decisions_created: 0,
    skipped_existing: 0,
    skipped_below_threshold: 0,
    errors: 0,
    correlation_id: correlationId,
    duration_ms: 0,
  };
  const perOrgResults: Array<{ org_id: string; created: number; skipped: number; errors: number }> = [];
  const deadline = makeDeadline(startedAt);
  const rotatedOrgs = rotateForFairness(orgsToProcess, startedAt, RUN_INTERVAL_MS);
  let orgsProcessed = 0;

  try {
    for (const orgId of rotatedOrgs) {
      if (deadline.expired()) break;
      orgsProcessed++;
      const orgResult = { org_id: orgId, created: 0, skipped: 0, errors: 0 };

      try {
        const profile = await getGovernanceProfile(SUPABASE_URL, SERVICE_KEY, orgId);
        const orgRiskThreshold = await getThreshold(
          SUPABASE_URL, SERVICE_KEY, orgId, "aicis.risk_threshold",
          profile.intervention_threshold ?? DEFAULT_RISK_THRESHOLD,
        );
        const orgUrgencyHours = await getThreshold(
          SUPABASE_URL, SERVICE_KEY, orgId, "aicis.urgency_hours", DEFAULT_URGENCY_HOURS_THRESHOLD,
        );
        const chainStages = approvalChainForModel(profile.governance_model);
        const requiredApprovals = chainStages.length;
        const thresholdsApplied = {
          "aicis.risk_threshold": orgRiskThreshold,
          "aicis.urgency_hours": orgUrgencyHours,
          "governance.confidence_ceiling": profile.governance_confidence_ceiling,
        };

        const { data: contextPackRow, error: contextPackError } = await service
          .from("organization_context_packs")
          .select("pack_key")
          .eq("organization_id", orgId)
          .order("enabled_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (contextPackError) throw new Error(`context pack query failed: ${contextPackError.message}`);
        const activePack = typeof contextPackRow?.pack_key === "string" ? contextPackRow.pack_key : null;

        const { data: predictions, error: predictionError } = await service
          .from("aicis_predictions")
          .select("id, external_id, country_iso3, domain, risk_probability, confidence_lower, confidence_upper, horizon_days, evidence_count, generated_at")
          .eq("organization_id", orgId)
          .gte("risk_probability", orgRiskThreshold)
          .order("risk_probability", { ascending: false })
          .limit(MAX_DECISIONS_PER_RUN);
        if (predictionError) throw new Error(`predictions query failed: ${predictionError.message}`);
        result.scanned_predictions += predictions?.length ?? 0;

        const { data: recommendations, error: recommendationError } = await service
          .from("aicis_recommendations")
          .select("id, external_id, country_iso3, domain, intervention_type, intervention_title, rationale_md, urgency_hours, urgency_window, confidence, estimated_cost_eur, estimated_roi_eur, generated_at")
          .eq("organization_id", orgId)
          .lte("urgency_hours", orgUrgencyHours)
          .order("urgency_hours", { ascending: true })
          .limit(MAX_DECISIONS_PER_RUN);
        if (recommendationError) throw new Error(`recommendations query failed: ${recommendationError.message}`);
        result.scanned_recommendations += recommendations?.length ?? 0;

        const { data: existing, error: existingError } = await service
          .from("decision_ledger")
          .select("linked_aicis_prediction_id, linked_aicis_recommendation_id, source_idempotency_key")
          .eq("organization_id", orgId)
          .or("linked_aicis_prediction_id.not.is.null,linked_aicis_recommendation_id.not.is.null,source_idempotency_key.like.aicis_%");
        if (existingError) throw new Error(`existing decision query failed: ${existingError.message}`);
        const linkedPredictionIds = new Set((existing ?? []).map((row) => row.linked_aicis_prediction_id).filter(Boolean));
        const linkedRecommendationIds = new Set((existing ?? []).map((row) => row.linked_aicis_recommendation_id).filter(Boolean));
        const existingSourceKeys = new Set((existing ?? []).map((row) => row.source_idempotency_key).filter(Boolean));

        const { data: pendingSameText, error: pendingError } = await service
          .from("decision_ledger")
          .select("recommended_action")
          .eq("organization_id", orgId)
          .eq("decision_origin", "aicis_auto")
          .eq("decision_status", "pending");
        if (pendingError) throw new Error(`pending AICIS decision query failed: ${pendingError.message}`);
        const pendingActionTexts = new Set((pendingSameText ?? []).map((row) => row.recommended_action).filter(Boolean));

        const governanceContext = buildGovernanceContext(
          profile,
          thresholdsApplied,
          { required_approvals: requiredApprovals, chain: chainStages },
          activePack,
        );
        const decisionDefaults = {
          governance_profile_id: profile.id,
          required_approvals: requiredApprovals,
          approval_chain: chainStages,
          governance_context: governanceContext,
        };
        const toInsert: Record<string, unknown>[] = [];

        for (const prediction of predictions ?? []) {
          const sourceKey = `aicis_prediction:${prediction.id}`;
          if (linkedPredictionIds.has(prediction.id) || existingSourceKeys.has(sourceKey)) {
            result.skipped_existing++; orgResult.skipped++; continue;
          }
          const country = prediction.country_iso3 ? ` in ${prediction.country_iso3}` : "";
          const horizon = prediction.horizon_days ? ` (${prediction.horizon_days}d horizon)` : "";
          const action = `Review elevated ${prediction.domain ?? "risk"} forecast${country}${horizon}`;
          if (pendingActionTexts.has(action)) { result.skipped_existing++; orgResult.skipped++; continue; }
          pendingActionTexts.add(action);
          const governanceCeiling = profile.governance_confidence_ceiling * 100;
          const confidence = finitePercent(prediction.confidence_upper);
          toInsert.push({
            ...decisionDefaults,
            organization_id: orgId,
            source_idempotency_key: sourceKey,
            decision_type: "risk_response",
            decision_status: "pending",
            execution_status: "not_started",
            decision_origin: "aicis_auto",
            recommended_action: action,
            notes: `AICIS predicts ${(Number(prediction.risk_probability) * 100).toFixed(1)}% risk probability` +
              (prediction.confidence_lower != null && prediction.confidence_upper != null
                ? ` (CI: ${(Number(prediction.confidence_lower) * 100).toFixed(0)}–${(Number(prediction.confidence_upper) * 100).toFixed(0)}%)`
                : "") + `. Evidence count: ${prediction.evidence_count ?? "n/a"}.`,
            raw_confidence: confidence,
            capped_confidence: confidence == null ? null : Math.min(confidence, governanceCeiling),
            confidence_at_decision: confidence,
            confidence_cap_reason: confidence != null && confidence > governanceCeiling ? "governance_ceiling" : null,
            linked_aicis_prediction_id: prediction.id,
            recommendation_logic_type: "aicis_risk_prediction",
            source_insight_summary: `AICIS prediction ${prediction.external_id}`,
            evidence_sources: [{
              source_type: "external",
              source_name: "AICIS",
              source_id: prediction.external_id,
              contribution_weight: 1,
              confidence,
              recency_days: recencyDays(prediction.generated_at),
            }],
            explanation_metadata: {
              source: { kind: "aicis_prediction", id: prediction.id, external_id: prediction.external_id },
              surface: "predictions",
              risk_probability: Number(prediction.risk_probability),
              domain: prediction.domain,
              country_iso3: prediction.country_iso3,
              horizon_days: prediction.horizon_days,
              evidence_count: prediction.evidence_count,
              threshold_used: orgRiskThreshold,
              correlation_id: correlationId,
            },
          });
        }

        for (const recommendation of recommendations ?? []) {
          const sourceKey = `aicis_recommendation:${recommendation.id}`;
          if (linkedRecommendationIds.has(recommendation.id) || existingSourceKeys.has(sourceKey)) {
            result.skipped_existing++; orgResult.skipped++; continue;
          }
          const action = recommendation.intervention_title ?? `Execute ${recommendation.intervention_type ?? "intervention"}`;
          if (pendingActionTexts.has(action)) { result.skipped_existing++; orgResult.skipped++; continue; }
          pendingActionTexts.add(action);
          const governanceCeiling = profile.governance_confidence_ceiling * 100;
          const confidence = finitePercent(recommendation.confidence);
          const estimatedCost = finiteNumber(recommendation.estimated_cost_eur);
          const estimatedRoi = finiteNumber(recommendation.estimated_roi_eur);
          const costText = estimatedCost == null ? "TBD" : `€${estimatedCost.toLocaleString()}`;
          const roiText = estimatedRoi == null ? "TBD" : `€${estimatedRoi.toLocaleString()}`;

          toInsert.push({
            ...decisionDefaults,
            organization_id: orgId,
            source_idempotency_key: sourceKey,
            decision_type: "intervention",
            decision_status: "pending",
            execution_status: "not_started",
            decision_origin: "aicis_auto",
            recommended_action: action,
            notes: `${recommendation.rationale_md ?? ""}\n\n— Estimated cost: ${costText} · Estimated ROI: ${roiText} · Window: ${recommendation.urgency_window ?? `${recommendation.urgency_hours}h`}`.trim(),
            raw_confidence: confidence,
            capped_confidence: confidence == null ? null : Math.min(confidence, governanceCeiling),
            confidence_at_decision: confidence,
            confidence_cap_reason: confidence != null && confidence > governanceCeiling ? "governance_ceiling" : null,
            linked_aicis_recommendation_id: recommendation.id,
            recommendation_logic_type: "aicis_recommendation",
            source_insight_summary: `AICIS recommendation ${recommendation.external_id}`,
            predicted_net_impact: estimatedRoi == null ? null : estimatedRoi - (estimatedCost ?? 0),
            evidence_sources: [{
              source_type: "external",
              source_name: "AICIS",
              source_id: recommendation.external_id,
              contribution_weight: 1,
              confidence,
              recency_days: recencyDays(recommendation.generated_at),
            }],
            explanation_metadata: {
              source: { kind: "aicis_recommendation", id: recommendation.id, external_id: recommendation.external_id },
              surface: "recommendations",
              intervention_type: recommendation.intervention_type,
              urgency_hours: recommendation.urgency_hours,
              urgency_window: recommendation.urgency_window,
              domain: recommendation.domain,
              country_iso3: recommendation.country_iso3,
              estimated_cost_eur: estimatedCost,
              estimated_roi_eur: estimatedRoi,
              threshold_used: orgUrgencyHours,
              correlation_id: correlationId,
            },
          });
        }

        if (dryRun) {
          orgResult.created = toInsert.length;
          perOrgResults.push(orgResult);
          continue;
        }

        if (toInsert.length > 0) {
          const CHUNK_SIZE = 25;
          for (let offset = 0; offset < toInsert.length; offset += CHUNK_SIZE) {
            const slice = toInsert.slice(offset, offset + CHUNK_SIZE);
            const { data: inserted, error: insertError } = await service
              .from("decision_ledger")
              .upsert(slice, {
                onConflict: "organization_id,source_idempotency_key",
                ignoreDuplicates: true,
              })
              .select("id, source_idempotency_key");
            if (insertError) throw new Error(`decision insert failed: ${insertError.message}`);

            const newDecisions = (inserted ?? []) as InsertedDecision[];
            const skippedByConflict = slice.length - newDecisions.length;
            if (skippedByConflict > 0) {
              result.skipped_existing += skippedByConflict;
              orgResult.skipped += skippedByConflict;
            }
            result.decisions_created += newDecisions.length;
            orgResult.created += newDecisions.length;

            if (chainStages.length > 0 && newDecisions.length > 0) {
              const chainRows = newDecisions.flatMap((decision) =>
                chainStages.map((stage) => ({
                  decision_id: decision.id,
                  organization_id: orgId,
                  approval_stage: stage.approval_stage,
                  sequence_order: stage.sequence_order,
                  required_quorum: stage.required_quorum,
                  approver_role: stage.approver_role,
                }))
              );
              const { error: chainError } = await service.from("approval_chain_stages").insert(chainRows);
              if (chainError) throw new Error(`approval chain persistence failed: ${chainError.message}`);
            }

            for (const decision of newDecisions) {
              await recordGovernanceUse(SUPABASE_URL, SERVICE_KEY, {
                organization_id: orgId,
                subject_type: "decision",
                subject_id: decision.id,
                profile,
                thresholds_applied: thresholdsApplied,
                approval_rules_applied: { required_approvals: requiredApprovals, chain: chainStages },
                decision_path: {
                  source: "aicis_auto",
                  source_idempotency_key: decision.source_idempotency_key ?? null,
                  correlation_id: correlationId,
                },
                context_pack: activePack,
                engine_version: "aicis-auto-decisions/phase-6b",
              });
            }
          }
        }

        const { error: auditError } = await service.from("audit_log").insert({
          organization_id: orgId,
          actor_id: isCronMode ? null : userId,
          actor_type: isCronMode ? "system" : "user",
          action_type: "aicis_auto_decisions_run",
          resource_type: "decision_ledger",
          resource_id: correlationId,
          payload: {
            cron: isCronMode,
            scanned_predictions: predictions?.length ?? 0,
            scanned_recommendations: recommendations?.length ?? 0,
            decisions_created: orgResult.created,
            skipped_existing: orgResult.skipped,
            errors: orgResult.errors,
            risk_threshold: orgRiskThreshold,
            urgency_threshold_hours: orgUrgencyHours,
            governance_profile_version: profile.version,
            governance_model: profile.governance_model,
            context_pack: activePack,
          },
        });
        if (auditError) throw new Error(`AICIS auto-decision run audit failed: ${auditError.message}`);

        perOrgResults.push(orgResult);
      } catch (orgError: unknown) {
        const message = orgError instanceof Error ? orgError.message : String(orgError);
        log("error", "org_failed", { org_id: orgId, err: message, correlation_id: correlationId });
        result.errors++;
        orgResult.errors++;
        perOrgResults.push(orgResult);
      }
    }

    result.duration_ms = Date.now() - startedAt;
    const truncated = orgsProcessed < rotatedOrgs.length;
    log("info", "aicis_auto_decisions_done", {
      ...result,
      orgs: perOrgResults.length,
      cron: isCronMode,
      orgs_processed: orgsProcessed,
      orgs_total: rotatedOrgs.length,
      truncated,
    });
    return json({ ...result, dry_run: dryRun, per_org: perOrgResults, orgs_processed: orgsProcessed, orgs_total: rotatedOrgs.length, truncated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    result.duration_ms = Date.now() - startedAt;
    log("error", "aicis_auto_decisions_failed", { err: message, correlation_id: correlationId });
    return json({ error: message, ...result }, 500);
  }
});

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finitePercent(value: unknown): number | null {
  const number = finiteNumber(value);
  return number == null ? null : number * 100;
}

function recencyDays(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
