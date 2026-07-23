/**
 * Phase 6A — Governance Profile Resolver
 *
 * Resolves the active versioned governance_profiles row for an organization
 * with a short-lived in-memory cache. All engines (advisory, intervention,
 * auto-decision) should read thresholds and governance bounds from here
 * rather than hardcoding them.
 *
 * NOTE: Statistical confidence caps (60/75/90 by sample size) remain
 * separate and untouched. This profile exposes only governance ceilings
 * and risk-appetite-driven thresholds.
 */

export interface GovernanceProfile {
  id: string;
  organization_id: string;
  version: number;
  risk_appetite: "conservative" | "balanced" | "aggressive";
  governance_model: "centralized" | "distributed" | "committee" | "founder_led";
  advisory_threshold: number;
  escalation_threshold: number;
  intervention_threshold: number;
  governance_confidence_floor: number;
  governance_confidence_ceiling: number;
  effective_from: string;
  effective_to: string | null;
}

const cache = new Map<string, { profile: GovernanceProfile; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

const DEFAULT_PROFILE = (orgId: string): GovernanceProfile => ({
  id: "00000000-0000-0000-0000-000000000000",
  organization_id: orgId,
  version: 0,
  risk_appetite: "balanced",
  governance_model: "centralized",
  advisory_threshold: 0.70,
  escalation_threshold: 0.70,
  intervention_threshold: 0.60,
  governance_confidence_floor: 0.50,
  governance_confidence_ceiling: 0.90,
  effective_from: new Date(0).toISOString(),
  effective_to: null,
});

export async function getGovernanceProfile(
  supabaseUrl: string,
  serviceKey: string,
  organizationId: string,
): Promise<GovernanceProfile> {
  const cached = cache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;

  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/governance_profiles?organization_id=eq.${organizationId}&effective_to=is.null&order=version.desc&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!resp.ok) return DEFAULT_PROFILE(organizationId);
    const rows = await resp.json();
    const profile: GovernanceProfile = rows?.[0] ?? DEFAULT_PROFILE(organizationId);
    cache.set(organizationId, { profile, expiresAt: Date.now() + TTL_MS });
    return profile;
  } catch {
    return DEFAULT_PROFILE(organizationId);
  }
}

/** Governance model → default approval chain stages */
export function approvalChainForModel(
  model: GovernanceProfile["governance_model"],
): Array<{ approval_stage: string; sequence_order: number; required_quorum: number; approver_role: string }> {
  switch (model) {
    case "centralized":
      return [{ approval_stage: "executive", sequence_order: 1, required_quorum: 1, approver_role: "executive" }];
    case "distributed":
      return [{ approval_stage: "department_head", sequence_order: 1, required_quorum: 1, approver_role: "manager" }];
    case "committee":
      return [
        { approval_stage: "finance", sequence_order: 1, required_quorum: 1, approver_role: "finance" },
        { approval_stage: "risk", sequence_order: 2, required_quorum: 1, approver_role: "risk" },
        { approval_stage: "executive", sequence_order: 3, required_quorum: 1, approver_role: "executive" },
      ];
    case "founder_led":
      return [{ approval_stage: "founder", sequence_order: 1, required_quorum: 1, approver_role: "founder" }];
  }
}

export function invalidateProfileCache(orgId?: string) {
  if (orgId) cache.delete(orgId);
  else cache.clear();
}
