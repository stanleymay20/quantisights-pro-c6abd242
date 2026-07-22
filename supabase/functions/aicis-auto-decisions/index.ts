// AICIS Auto-Decision Pipeline
// Scans new high-risk predictions + high-urgency recommendations from the
// projected AICIS tables and creates pending decisions in decision_ledger.
// Idempotent: skips if a decision already linked to the same source.
//
// Thresholds (Balanced):
//   - Prediction: risk_probability > 0.60
//   - Recommendation: urgency_hours <= 72  (i.e. "act within 3 days")
//
// Auth: requires owner/admin role on the org (decision creation is privileged).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { getGovernanceProfile, approvalChainForModel } from "../_shared/governance-profile.ts";
import { getThreshold } from "../_shared/threshold-registry.ts";
import { recordGovernanceUse, buildGovernanceContext } from "../_shared/governance-audit.ts";
import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts";

const RUN_INTERVAL_MS = 15 * 60 * 1000; // matches the ~15min cron cadence

// Phase 6A: defaults only — per-org values come from governance_profiles + governance_thresholds.
const DEFAULT_RISK_THRESHOLD = 0.60;
const DEFAULT_URGENCY_HOURS_THRESHOLD = 72;
const MAX_DECISIONS_PER_RUN = 50;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

const log = (level: string, msg: string, ctx: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...ctx }));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const correlationId = req.headers.get("x-request-id") || crypto.randomUUID();
  const startedAt = Date.now();

  // ── Parse body first (cron mode needs body) ──
  let body: { organization_id?: string; dry_run?: boolean; cron?: boolean } = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Cron mode: shared secret bypasses user auth, iterates all orgs ──
  const cronSecretHeader = req.headers.get("x-cron-secret");
  const cronSecretEnv = Deno.env.get("CRON_SHARED_SECRET") ?? Deno.env.get("INGEST_CRON_SECRET");
  const isCronMode = body.cron === true && cronSecretHeader && cronSecretEnv && cronSecretHeader === cronSecretEnv;

  let userId: string;
  let orgsToProcess: string[] = [];
  const dryRun = body.dry_run === true;

  if (isCronMode) {
    userId = "00000000-0000-0000-0000-000000000000"; // system actor
    // Find orgs that actually have AICIS data above thresholds
    const { data: candidateOrgs } = await service
      .from("aicis_predictions")
      .select("organization_id")
      .gte("risk_probability", DEFAULT_RISK_THRESHOLD);
    const set = new Set<string>((candidateOrgs ?? []).map(r => r.organization_id as string));
    const { data: recOrgs } = await service
      .from("aicis_recommendations")
      .select("organization_id")
      .lte("urgency_hours", DEFAULT_URGENCY_HOURS_THRESHOLD);
    for (const r of recOrgs ?? []) set.add(r.organization_id as string);
    orgsToProcess = Array.from(set);
    log("info", "cron_mode_started", { org_count: orgsToProcess.length, correlation_id: correlationId });
  } else {
    // ── User-mode auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    if (!body.organization_id) return json({ error: "organization_id required" }, 400);

    const { data: member } = await service
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", body.organization_id)
      .maybeSingle();

    if (!member || !["owner", "admin"].includes(member.role)) {
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

  // A single invocation has a wall-clock ceiling; each org here does several
  // sequential round trips (governance profile, thresholds, predictions,
  // recommendations), so an unbounded loop gets killed mid-run once
  // candidate-org count is large enough. Bound it, and rotate the starting
  // point each tick so a sustained overload doesn't permanently starve
  // whichever orgs sort last -- safe because re-scanning an org is a no-op
  // for anything already decided (see pendingActionTexts dedup below).
  const deadline = makeDeadline(startedAt);
  const rotatedOrgs = rotateForFairness(orgsToProcess, startedAt, RUN_INTERVAL_MS);
  let orgsProcessed = 0;

  try {
    for (const orgId of rotatedOrgs) {
      if (deadline.expired()) break;
      orgsProcessed++;
      const orgRes = { org_id: orgId, created: 0, skipped: 0, errors: 0 };
      try {
        // ── Phase 6A: per-org governance profile + configurable thresholds ──
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

        // Look up active context pack (first, if any) for audit attribution
        const { data: packRow } = await service
          .from("organization_context_packs")
          .select("pack_key")
          .eq("organization_id", orgId)
          .order("enabled_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const activePack: string | null = packRow?.pack_key ?? null;

        // ── 1. Predictions above per-org risk threshold ──
        const { data: preds, error: predErr } = await service
          .from("aicis_predictions")
          .select("id, external_id, country_iso3, domain, risk_probability, confidence_lower, confidence_upper, horizon_days, evidence_count, generated_at")
          .eq("organization_id", orgId)
          .gte("risk_probability", orgRiskThreshold)
          .order("risk_probability", { ascending: false })
          .limit(MAX_DECISIONS_PER_RUN);
        if (predErr) throw new Error(`predictions query failed: ${predErr.message}`);
        result.scanned_predictions += preds?.length ?? 0;

        // ── 2. Recommendations within per-org urgency window ──
        const { data: recs, error: recErr } = await service
          .from("aicis_recommendations")
          .select("id, external_id, country_iso3, domain, intervention_type, intervention_title, rationale_md, urgency_hours, urgency_window, confidence, estimated_cost_eur, estimated_roi_eur, generated_at")
          .eq("organization_id", orgId)
          .lte("urgency_hours", orgUrgencyHours)
          .order("urgency_hours", { ascending: true })
          .limit(MAX_DECISIONS_PER_RUN);
        if (recErr) throw new Error(`recommendations query failed: ${recErr.message}`);
        result.scanned_recommendations += recs?.length ?? 0;

        // ── 3. Existing linkage (idempotency) ──
        const { data: existing } = await service
          .from("decision_ledger")
          .select("linked_aicis_prediction_id, linked_aicis_recommendation_id")
          .eq("organization_id", orgId)
          .or("linked_aicis_prediction_id.not.is.null,linked_aicis_recommendation_id.not.is.null");
        const linkedPredIds = new Set((existing ?? []).map(r => r.linked_aicis_prediction_id).filter(Boolean));
        const linkedRecIds = new Set((existing ?? []).map(r => r.linked_aicis_recommendation_id).filter(Boolean));

        // linkedPredIds/linkedRecIds only catch a re-run of THIS job against
        // the same AICIS-side prediction/recommendation row. If AICIS itself
        // re-emits a fresh id for a condition that's still true on every
        // sync (this job runs every 15-30 min), recommended_action text is
        // identical each time but the id-based check never matches, and the
        // ledger fills with near-duplicate pending decisions for the same
        // underlying condition. Close that gap: while a pending decision
        // for this exact recommended_action already exists, don't spawn
        // another one — once it's approved/rejected the condition can
        // legitimately generate a new decision again.
        const { data: pendingSameText } = await service
          .from("decision_ledger")
          .select("recommended_action")
          .eq("organization_id", orgId)
          .eq("decision_origin", "aicis_auto")
          .eq("decision_status", "pending");
        const pendingActionTexts = new Set((pendingSameText ?? []).map(r => r.recommended_action));

        // ── 4. Build decision rows (Phase 6A: governance-stamped) ──
        const governanceCtx = buildGovernanceContext(
          profile, thresholdsApplied,
          { required_approvals: requiredApprovals, chain: chainStages }, activePack,
        );
        const decisionDefaults = {
          governance_profile_id: profile.id,
          required_approvals: requiredApprovals,
          approval_chain: chainStages,
          governance_context: governanceCtx,
        };
        const toInsert: Record<string, unknown>[] = [];

        for (const p of preds ?? []) {
          if (linkedPredIds.has(p.id)) { result.skipped_existing++; orgRes.skipped++; continue; }
          const country = p.country_iso3 ? ` in ${p.country_iso3}` : "";
          const horizon = p.horizon_days ? ` (${p.horizon_days}d horizon)` : "";
          const predictedAction = `Review elevated ${p.domain ?? "risk"} forecast${country}${horizon}`;
          if (pendingActionTexts.has(predictedAction)) { result.skipped_existing++; orgRes.skipped++; continue; }
          pendingActionTexts.add(predictedAction);
          const govCeil = profile.governance_confidence_ceiling * 100;
          toInsert.push({
            ...decisionDefaults,
            organization_id: orgId,
            decision_type: "risk_response",
            decision_status: "pending",
            execution_status: "not_started",
            decision_origin: "aicis_auto",
            recommended_action: predictedAction,
            notes: `AICIS predicts ${(Number(p.risk_probability) * 100).toFixed(1)}% risk probability` +
                   (p.confidence_lower != null && p.confidence_upper != null
                     ? ` (CI: ${(Number(p.confidence_lower) * 100).toFixed(0)}–${(Number(p.confidence_upper) * 100).toFixed(0)}%)`
                     : "") +
                   `. Evidence count: ${p.evidence_count ?? "n/a"}.`,
            raw_confidence: p.confidence_upper ? Number(p.confidence_upper) * 100 : null,
            capped_confidence: p.confidence_upper ? Math.min(Number(p.confidence_upper) * 100, govCeil) : null,
            confidence_at_decision: p.confidence_upper ? Number(p.confidence_upper) * 100 : null,
            confidence_cap_reason: p.confidence_upper && Number(p.confidence_upper) * 100 > govCeil ? "governance_ceiling" : null,
            linked_aicis_prediction_id: p.id,
            recommendation_logic_type: "aicis_risk_prediction",
            source_insight_summary: `AICIS prediction ${p.external_id}`,
            evidence_sources: [{
              source_type: "external",
              source_name: "AICIS",
              source_id: p.external_id,
              contribution_weight: 1.0,
              confidence: p.confidence_upper ? Number(p.confidence_upper) * 100 : 60,
              recency_days: p.generated_at
                ? Math.floor((Date.now() - new Date(p.generated_at).getTime()) / 86400000)
                : 0,
            }],
            explanation_metadata: {
              source: "aicis_auto", surface: "predictions",
              risk_probability: Number(p.risk_probability),
              domain: p.domain, country_iso3: p.country_iso3,
              horizon_days: p.horizon_days, evidence_count: p.evidence_count,
              threshold_used: orgRiskThreshold, correlation_id: correlationId,
            },
          });
        }

        for (const r of recs ?? []) {
          if (linkedRecIds.has(r.id)) { result.skipped_existing++; orgRes.skipped++; continue; }
          const recommendedAction = r.intervention_title ?? `Execute ${r.intervention_type ?? "intervention"}`;
          if (pendingActionTexts.has(recommendedAction)) { result.skipped_existing++; orgRes.skipped++; continue; }
          pendingActionTexts.add(recommendedAction);
          const cost = r.estimated_cost_eur ? `€${Number(r.estimated_cost_eur).toLocaleString()}` : "TBD";
          const roi = r.estimated_roi_eur ? `€${Number(r.estimated_roi_eur).toLocaleString()}` : "TBD";
          const govCeil = profile.governance_confidence_ceiling * 100;
          toInsert.push({
            ...decisionDefaults,
            organization_id: orgId,
            decision_type: "intervention",
            decision_status: "pending",
            execution_status: "not_started",
            decision_origin: "aicis_auto",
            recommended_action: recommendedAction,
            notes: `${r.rationale_md ?? ""}\n\n— Estimated cost: ${cost} · Estimated ROI: ${roi} · Window: ${r.urgency_window ?? `${r.urgency_hours}h`}`.trim(),
            raw_confidence: r.confidence != null ? Number(r.confidence) * 100 : null,
            capped_confidence: r.confidence != null ? Math.min(Number(r.confidence) * 100, govCeil) : null,
            confidence_at_decision: r.confidence != null ? Number(r.confidence) * 100 : null,
            confidence_cap_reason: r.confidence != null && Number(r.confidence) * 100 > govCeil ? "governance_ceiling" : null,
            linked_aicis_recommendation_id: r.id,
            recommendation_logic_type: "aicis_recommendation",
            source_insight_summary: `AICIS recommendation ${r.external_id}`,
            predicted_net_impact: r.estimated_roi_eur ? Number(r.estimated_roi_eur) - Number(r.estimated_cost_eur ?? 0) : null,
            evidence_sources: [{
              source_type: "external",
              source_name: "AICIS",
              source_id: r.external_id,
              contribution_weight: 1.0,
              confidence: r.confidence != null ? Number(r.confidence) * 100 : 60,
              recency_days: r.generated_at
                ? Math.floor((Date.now() - new Date(r.generated_at).getTime()) / 86400000)
                : 0,
            }],
            explanation_metadata: {
              source: "aicis_auto", surface: "recommendations",
              intervention_type: r.intervention_type,
              urgency_hours: r.urgency_hours, urgency_window: r.urgency_window,
              domain: r.domain, country_iso3: r.country_iso3,
              estimated_cost_eur: r.estimated_cost_eur,
              estimated_roi_eur: r.estimated_roi_eur,
              threshold_used: orgUrgencyHours,
              correlation_id: correlationId,
            },
          });
        }

        if (dryRun) {
          orgRes.created = toInsert.length;
          perOrgResults.push(orgRes);
          continue;
        }

        // ── 5. Bulk insert + Phase 6A: approval-chain rows + governance audit ──
        if (toInsert.length > 0) {
          const CHUNK = 25;
          for (let i = 0; i < toInsert.length; i += CHUNK) {
            const slice = toInsert.slice(i, i + CHUNK);
            const { data: inserted, error: insErr } = await service
              .from("decision_ledger").insert(slice).select("id");
            if (insErr) {
              log("error", "decision_insert_failed", { org_id: orgId, err: insErr.message, chunk_size: slice.length });
              result.errors += slice.length; orgRes.errors += slice.length;
            } else {
              const n = inserted?.length ?? 0;
              result.decisions_created += n; orgRes.created += n;

              // Insert approval-chain stages for each new decision
              if (chainStages.length > 0 && inserted) {
                const chainRows = inserted.flatMap((d: { id: string }) =>
                  chainStages.map((s) => ({
                    decision_id: d.id,
                    organization_id: orgId,
                    approval_stage: s.approval_stage,
                    sequence_order: s.sequence_order,
                    required_quorum: s.required_quorum,
                    approver_role: s.approver_role,
                  }))
                );
                await service.from("approval_chain_stages").insert(chainRows);
              }

              // Governance audit (append-only) per decision
              for (const d of inserted ?? []) {
                await recordGovernanceUse(SUPABASE_URL, SERVICE_KEY, {
                  organization_id: orgId,
                  subject_type: "decision",
                  subject_id: (d as { id: string }).id,
                  profile,
                  thresholds_applied: thresholdsApplied,
                  approval_rules_applied: { required_approvals: requiredApprovals, chain: chainStages },
                  decision_path: { source: "aicis_auto", correlation_id: correlationId },
                  context_pack: activePack,
                  engine_version: "aicis-auto-decisions/phase-6a",
                });
              }
            }
          }
        }

        // ── 6. Audit log ──
        await service.from("audit_log").insert({
          organization_id: orgId,
          actor_id: isCronMode ? null : userId,
          actor_type: isCronMode ? "system" : "user",
          action_type: "aicis_auto_decisions_run",
          resource_type: "decision_ledger",
          resource_id: correlationId,
          payload: {
            cron: isCronMode,
            scanned_predictions: preds?.length ?? 0,
            scanned_recommendations: recs?.length ?? 0,
            decisions_created: orgRes.created,
            skipped_existing: orgRes.skipped,
            errors: orgRes.errors,
            risk_threshold: orgRiskThreshold,
            urgency_threshold_hours: orgUrgencyHours,
            governance_profile_version: profile.version,
            governance_model: profile.governance_model,
            context_pack: activePack,
          },
        });

        perOrgResults.push(orgRes);
      } catch (orgErr: unknown) {
        const msg = orgErr instanceof Error ? orgErr.message : String(orgErr);
        log("error", "org_failed", { org_id: orgId, err: msg, correlation_id: correlationId });
        result.errors += 1;
        orgRes.errors += 1;
        perOrgResults.push(orgRes);
      }
    }

    result.duration_ms = Date.now() - startedAt;
    const truncated = orgsProcessed < rotatedOrgs.length;
    log("info", "aicis_auto_decisions_done", { ...result, orgs: perOrgResults.length, cron: isCronMode, orgs_processed: orgsProcessed, orgs_total: rotatedOrgs.length, truncated });
    return json({ ...result, dry_run: dryRun, per_org: perOrgResults, orgs_processed: orgsProcessed, orgs_total: rotatedOrgs.length, truncated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    result.duration_ms = Date.now() - startedAt;
    log("error", "aicis_auto_decisions_failed", { err: msg, correlation_id: correlationId });
    return json({ error: msg, ...result }, 500);
  }
});
