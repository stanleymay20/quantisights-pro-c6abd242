/**
 * Phase 6A — Governance Simulation (real engine, not mocked)
 *
 * Takes one synthetic operational signal and runs it through the SAME
 * threshold + profile + approval-chain resolution path used by
 * aicis-auto-decisions. Returns a side-by-side comparison for the
 * organization IDs provided.
 *
 * Proves that with identical input, three orgs with different governance
 * configurations produce different:
 *   - thresholds applied
 *   - escalation behavior
 *   - approval requirements
 *   - intervention recommendation
 *
 * The simulation does NOT write to decision_ledger.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { getGovernanceProfile, approvalChainForModel } from "../_shared/governance-profile.ts";
import { getThreshold } from "../_shared/threshold-registry.ts";

interface Signal {
  risk_probability: number;
  urgency_hours: number;
  raw_confidence: number;
  domain: string;
}

const DEFAULT_SIGNAL: Signal = {
  risk_probability: 0.72,
  urgency_hours: 48,
  raw_confidence: 88,
  domain: "operational",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;

  let body: { organization_ids?: string[]; signal?: Partial<Signal> };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const orgIds = (body.organization_ids ?? []).filter(Boolean);
  if (orgIds.length === 0 || orgIds.length > 5) {
    return json({ error: "organization_ids: 1–5 required" }, 400);
  }
  const signal: Signal = { ...DEFAULT_SIGNAL, ...(body.signal ?? {}) };

  // Caller must be a member of every org they ask to simulate
  for (const orgId of orgIds) {
    if (!(await verifyOrgMembership(auth.userId, orgId))) {
      return json({ error: `not a member of ${orgId}` }, 403);
    }
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const results: Array<Record<string, unknown>> = [];

  for (const orgId of orgIds) {
    const profile = await getGovernanceProfile(SUPABASE_URL, SERVICE_KEY, orgId);
    const riskThreshold = await getThreshold(
      SUPABASE_URL, SERVICE_KEY, orgId, "aicis.risk_threshold",
      profile.intervention_threshold ?? 0.60,
    );
    const urgencyHours = await getThreshold(
      SUPABASE_URL, SERVICE_KEY, orgId, "aicis.urgency_hours", 72,
    );
    const highTier = await getThreshold(
      SUPABASE_URL, SERVICE_KEY, orgId, "intervention.high_tier", 80,
    );

    const chain = approvalChainForModel(profile.governance_model);
    const govCeiling = profile.governance_confidence_ceiling * 100;

    const wouldTrigger = signal.risk_probability >= riskThreshold || signal.urgency_hours <= urgencyHours;
    const cappedConfidence = Math.min(signal.raw_confidence, govCeiling);
    const escalationTier = signal.raw_confidence >= highTier ? "executive"
                          : signal.raw_confidence >= highTier - 20 ? "manager" : "team";

    const { data: orgRow } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
    const { data: packRow } = await supabase.from("organization_context_packs")
      .select("pack_key").eq("organization_id", orgId).order("enabled_at", { ascending: false }).limit(1).maybeSingle();

    results.push({
      organization_id: orgId,
      organization_name: orgRow?.name ?? orgId,
      profile: {
        risk_appetite: profile.risk_appetite,
        governance_model: profile.governance_model,
        version: profile.version,
      },
      context_pack: packRow?.pack_key ?? null,
      thresholds_applied: {
        "aicis.risk_threshold": riskThreshold,
        "aicis.urgency_hours": urgencyHours,
        "intervention.high_tier": highTier,
        "governance.confidence_ceiling": profile.governance_confidence_ceiling,
      },
      outcome: {
        would_trigger_decision: wouldTrigger,
        capped_confidence: cappedConfidence,
        raw_confidence: signal.raw_confidence,
        escalation_tier: escalationTier,
        required_approvals: chain.length,
        approval_chain: chain,
        intervention_recommendation: wouldTrigger
          ? `Open ${signal.domain} intervention (urgency ${signal.urgency_hours}h)`
          : "No intervention — signal below org threshold",
      },
    });
  }

  return json({
    signal,
    results,
    note: "Real engine: thresholds + profile + approval chain resolved via the same helpers used by aicis-auto-decisions.",
  });
});
