/**
 * Single source of truth for data-residency and backup/disaster-recovery claims
 * shown on the homepage, Data Residency, Security Questionnaire, and SLA pages.
 *
 * Values here must never assert an infrastructure fact that has not been verified
 * against the deployed environment. Region is deliberately sourced from build-time
 * config rather than hardcoded, so no page can drift from infrastructure reality.
 * See docs/readiness/remediation-matrix-2026-08-06.md ("Residency/transfer claims
 * conflict" and "Backup retention/RPO claims conflict").
 */

export const CONFIGURED_REGION: string | null =
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_HOSTING_REGION) ||
  null;

/** Short disclosure suitable for a homepage/marketing card. */
export const REGION_DISCLOSURE_SHORT = CONFIGURED_REGION
  ? `Hosted in ${CONFIGURED_REGION}. Full disclosure at /data-residency.`
  : "Hosting region is disclosed under contract at /data-residency — not hardcoded here so no page can drift from infrastructure reality.";

/** Longer disclosure suitable for a questionnaire/legal answer. */
export const REGION_DISCLOSURE_LONG = CONFIGURED_REGION
  ? `Primary data storage (databases, file storage, backups) is hosted in ${CONFIGURED_REGION}. The live registry of hosting region and transfer mechanism per vendor is published at /data-residency.`
  : "The primary hosting region for data storage (databases, file storage, backups) is disclosed under contract and at /data-residency, and is not hardcoded on this page so it cannot drift from infrastructure reality. Data transferred to subprocessors outside the EU is protected by Standard Contractual Clauses (SCCs).";

/**
 * Default backup/DR posture that applies to every tier today. Numbers here reflect
 * a standard managed-Postgres automated-backup configuration and must only be
 * tightened once the underlying infrastructure (e.g. a paid point-in-time-recovery
 * add-on) is independently verified as active.
 */
export const BACKUP_BASELINE = {
  frequency: "Daily, encrypted",
  retentionDays: 7,
  targetRPOHours: 24,
  targetRTOHours: 4,
  commitment: "best effort" as const,
  note: "Applies by default to every tier. This is the baseline until a tighter, contractual SLA target (see /sla) is incorporated into a signed Order Form.",
};

/**
 * Tighter backup/DR commitment available contractually to eligible enterprise
 * customers. This is a target, not a claim about current default infrastructure —
 * it only takes effect once incorporated into a signed Order Form, matching the
 * uptime SLA's own qualification language.
 */
export const BACKUP_SLA_TARGET = {
  frequency: "Continuous + Daily",
  retentionDays: 30,
  targetRPOHours: 1,
  targetRTOHours: 4,
  commitment: "contractual" as const,
  note: "Enterprise-tier commitment, active only once incorporated into a signed Order Form. Until then, the baseline in the Security Questionnaire (/security-questionnaire) applies.",
};
