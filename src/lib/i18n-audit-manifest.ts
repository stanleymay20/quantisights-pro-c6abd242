/**
 * Localization audit manifest.
 *
 * Hand-curated snapshot of which routes have German equivalents, and a coarse
 * estimate of hardcoded-string density per page. This is intentionally NOT a
 * full i18n extraction — it's a procurement-readiness signal so a reviewer can
 * see localization coverage at a glance.
 *
 * Regenerate with `scripts/scan-i18n.ts` (or update manually as DE pages ship).
 */

export type LocalizationStatus = "localized" | "english_only" | "admin_only" | "n_a";

export interface AuditEntry {
  route: string;
  /** Friendly name for the audit table */
  label: string;
  status: LocalizationStatus;
  /** Estimated hardcoded user-visible strings (rough order of magnitude) */
  hardcodedStrings: number;
  /** German equivalent route, if any */
  deRoute?: string;
}

export const LOCALIZATION_AUDIT: AuditEntry[] = [
  // ── Legal / procurement (Phase 5F) ─────────────────────────────────────────
  { route: "/privacy", label: "Privacy Policy", status: "localized", deRoute: "/de/datenschutz", hardcodedStrings: 40 },
  { route: "/terms", label: "Terms of Service", status: "localized", deRoute: "/de/agb", hardcodedStrings: 45 },
  { route: "/dpa", label: "Data Processing Agreement", status: "localized", deRoute: "/de/avv", hardcodedStrings: 50 },
  { route: "/toms", label: "Technical & Organizational Measures", status: "localized", deRoute: "/de/toms", hardcodedStrings: 55 },
  { route: "/cookies", label: "Cookie Policy", status: "localized", deRoute: "/de/cookies", hardcodedStrings: 25 },
  { route: "/how-ai-is-used", label: "How AI Is Used", status: "localized", deRoute: "/de/ki-nutzung", hardcodedStrings: 35 },
  { route: "/impressum", label: "Impressum", status: "localized", hardcodedStrings: 30 },
  { route: "/data-residency", label: "Data Residency & Transfers", status: "english_only", hardcodedStrings: 40 },
  { route: "/dpia", label: "DPIA Summary", status: "english_only", hardcodedStrings: 50 },
  { route: "/gdpr-rights", label: "GDPR Rights & Erasure", status: "english_only", hardcodedStrings: 45 },
  { route: "/enterprise-readiness", label: "Enterprise Readiness", status: "english_only", hardcodedStrings: 60 },

  // ── Trust / compliance surfaces ────────────────────────────────────────────
  { route: "/trust", label: "Trust Center", status: "english_only", hardcodedStrings: 90 },
  { route: "/security", label: "Security", status: "english_only", hardcodedStrings: 70 },
  { route: "/security-overview", label: "Security Overview", status: "english_only", hardcodedStrings: 80 },
  { route: "/security-questionnaire", label: "Security Questionnaire", status: "english_only", hardcodedStrings: 100 },
  { route: "/ai-system-classification", label: "AI System Classification", status: "english_only", hardcodedStrings: 70 },
  { route: "/ai-governance", label: "AI Governance", status: "english_only", hardcodedStrings: 60 },
  { route: "/incident-response", label: "Incident Response", status: "english_only", hardcodedStrings: 55 },
  { route: "/auditability", label: "Auditability", status: "english_only", hardcodedStrings: 50 },
  { route: "/subprocessors", label: "Sub-processor Registry", status: "english_only", hardcodedStrings: 30 },
  { route: "/data-retention", label: "Data Retention", status: "english_only", hardcodedStrings: 35 },
  { route: "/procurement-pack", label: "Procurement Pack", status: "english_only", hardcodedStrings: 25 },
  { route: "/sla", label: "SLA", status: "english_only", hardcodedStrings: 40 },

  // ── Marketing / public ─────────────────────────────────────────────────────
  { route: "/", label: "Landing", status: "english_only", hardcodedStrings: 200 },
  { route: "/pricing", label: "Pricing", status: "english_only", hardcodedStrings: 80 },
  { route: "/compare", label: "Compare", status: "english_only", hardcodedStrings: 70 },
  { route: "/business-model", label: "Business Model", status: "english_only", hardcodedStrings: 60 },
  { route: "/vs/microsoft", label: "Why vs Microsoft", status: "english_only", hardcodedStrings: 70 },
  { route: "/competitive-analysis", label: "Competitive Analysis", status: "english_only", hardcodedStrings: 80 },
  { route: "/pitch-deck", label: "Pitch Deck", status: "english_only", hardcodedStrings: 60 },
  { route: "/pitch", label: "Pitch", status: "english_only", hardcodedStrings: 40 },
  { route: "/ebook", label: "Ebook", status: "english_only", hardcodedStrings: 80 },
  { route: "/free-analysis", label: "Free Analysis", status: "english_only", hardcodedStrings: 50 },
  { route: "/enterprise/contact", label: "Enterprise Contact", status: "english_only", hardcodedStrings: 40 },
  { route: "/demo", label: "Demo", status: "english_only", hardcodedStrings: 30 },
  { route: "/status", label: "System Status", status: "english_only", hardcodedStrings: 25 },

  // ── Auth ───────────────────────────────────────────────────────────────────
  { route: "/login", label: "Login", status: "english_only", hardcodedStrings: 30 },
  { route: "/register", label: "Register", status: "english_only", hardcodedStrings: 35 },
  { route: "/forgot-password", label: "Forgot Password", status: "english_only", hardcodedStrings: 20 },
  { route: "/reset-password", label: "Reset Password", status: "english_only", hardcodedStrings: 20 },

  // ── In-app application (admin-only / out of scope for procurement i18n) ────
  { route: "/dashboard", label: "Dashboard", status: "admin_only", hardcodedStrings: 120 },
  { route: "/kpis", label: "KPIs", status: "admin_only", hardcodedStrings: 90 },
  { route: "/diagnostics", label: "Diagnostics", status: "admin_only", hardcodedStrings: 100 },
  { route: "/advisory", label: "Advisory", status: "admin_only", hardcodedStrings: 110 },
  { route: "/decisions", label: "Decision Ledger", status: "admin_only", hardcodedStrings: 130 },
  { route: "/executive", label: "Executive", status: "admin_only", hardcodedStrings: 100 },
  { route: "/boardroom", label: "Boardroom", status: "admin_only", hardcodedStrings: 90 },
  { route: "/operational-graph", label: "Operational Graph", status: "admin_only", hardcodedStrings: 80 },
  { route: "/narratives", label: "Narrative Cockpit", status: "admin_only", hardcodedStrings: 70 },
];

export function summarizeAudit() {
  const total = LOCALIZATION_AUDIT.length;
  const localized = LOCALIZATION_AUDIT.filter((e) => e.status === "localized").length;
  const englishOnly = LOCALIZATION_AUDIT.filter((e) => e.status === "english_only").length;
  const adminOnly = LOCALIZATION_AUDIT.filter((e) => e.status === "admin_only").length;
  const hardcodedTotal = LOCALIZATION_AUDIT.reduce((s, e) => s + e.hardcodedStrings, 0);

  // Coverage = localized / (localized + english_only) — admin pages excluded.
  const inScope = localized + englishOnly;
  const coveragePct = inScope === 0 ? 0 : Math.round((localized / inScope) * 100);

  return { total, localized, englishOnly, adminOnly, hardcodedTotal, coveragePct };
}
