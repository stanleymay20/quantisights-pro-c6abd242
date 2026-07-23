/**
 * Phase 6A — Governance Audit Writer
 *
 * Append-only record of which governance configuration influenced a given
 * advisory / intervention / decision. Surfaced in UI for "Why did I receive
 * this?" and used as procurement / regulator evidence.
 */
import type { GovernanceProfile } from "./governance-profile.ts";

export interface GovernanceAuditEntry {
  organization_id: string;
  subject_type: "decision" | "intervention" | "advisory" | "insight";
  subject_id: string;
  profile: GovernanceProfile;
  thresholds_applied: Record<string, number>;
  approval_rules_applied: Record<string, unknown>;
  decision_path: Record<string, unknown>;
  context_pack?: string | null;
  engine_version?: string;
}

export async function recordGovernanceUse(
  supabaseUrl: string,
  serviceKey: string,
  entry: GovernanceAuditEntry,
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/context_governance_audit`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        organization_id: entry.organization_id,
        subject_type: entry.subject_type,
        subject_id: entry.subject_id,
        governance_profile_id: entry.profile.id,
        governance_profile_version: entry.profile.version,
        governance_model: entry.profile.governance_model,
        risk_profile: entry.profile.risk_appetite,
        context_pack: entry.context_pack ?? null,
        engine_version: entry.engine_version ?? "phase-6a",
        thresholds_applied: entry.thresholds_applied,
        approval_rules_applied: entry.approval_rules_applied,
        decision_path: entry.decision_path,
      }),
    });
  } catch (e) {
    console.warn("[governance-audit] write failed", (e as Error).message);
  }
}

/** Build the user-facing "Why did I receive this?" governance_context blob */
export function buildGovernanceContext(
  profile: GovernanceProfile,
  thresholds: Record<string, number>,
  approvalRules: Record<string, unknown>,
  contextPack?: string | null,
): Record<string, unknown> {
  return {
    risk_appetite: profile.risk_appetite,
    governance_model: profile.governance_model,
    profile_version: profile.version,
    thresholds_applied: thresholds,
    approval_rules: approvalRules,
    context_pack: contextPack ?? null,
    engine_version: "phase-6a",
    recorded_at: new Date().toISOString(),
  };
}
