/**
 * KPI Ontology Engine — Phase 8
 *
 * Canonical KPI dictionary with synonyms, fuzzy matching, and confidence
 * scoring. Versioned so downstream modules can detect ontology drift.
 *
 * Pure functions, no I/O. Deterministic outputs for the same inputs.
 */

export const KPI_ONTOLOGY_VERSION = "8.0.0";

export type KpiCategory =
  | "financial"
  | "operational"
  | "customer"
  | "people"
  | "risk"
  | "growth";

export interface CanonicalKpi {
  /** Canonical machine name, e.g. "revenue" */
  key: string;
  /** Human label, e.g. "Revenue" */
  label: string;
  category: KpiCategory;
  /** Lowercased synonyms (incl. canonical key) */
  synonyms: string[];
  /** Higher = lower-is-better (cost, churn, defects) */
  inverse?: boolean;
  /** Optional unit hint */
  unit?: "currency" | "percent" | "count" | "ratio" | "days";
}

export const KPI_DICTIONARY: CanonicalKpi[] = [
  // ── Financial ────────────────────────────────────────────────
  { key: "revenue", label: "Revenue", category: "financial", unit: "currency",
    synonyms: ["revenue", "sales", "turnover", "income", "net_sales", "gross_sales", "umsatz", "erloese"] },
  { key: "gross_margin", label: "Gross Margin", category: "financial", unit: "percent",
    synonyms: ["gross_margin", "margin_pct", "gross_profit_pct", "gm", "gp_margin", "bruttomarge"] },
  { key: "net_profit", label: "Net Profit", category: "financial", unit: "currency",
    synonyms: ["net_profit", "net_income", "profit", "earnings", "bottom_line", "gewinn"] },
  { key: "ebitda", label: "EBITDA", category: "financial",
    synonyms: ["ebitda", "operating_income", "operating_profit"] },
  { key: "cash_flow", label: "Cash Flow", category: "financial", unit: "currency",
    synonyms: ["cash_flow", "fcf", "free_cash_flow", "operating_cash_flow", "cashflow"] },
  { key: "cost", label: "Cost", category: "financial", inverse: true, unit: "currency",
    synonyms: ["cost", "costs", "expense", "expenses", "opex", "spend", "kosten"] },
  { key: "ar_days", label: "AR Days", category: "financial", inverse: true, unit: "days",
    synonyms: ["ar_days", "dso", "days_sales_outstanding", "receivable_days"] },

  // ── Operational ──────────────────────────────────────────────
  { key: "inventory_turnover", label: "Inventory Turnover", category: "operational", unit: "ratio",
    synonyms: ["inventory_turnover", "stock_turnover", "inventory_turns", "lager_umschlag"] },
  { key: "downtime", label: "Downtime", category: "operational", inverse: true,
    synonyms: ["downtime", "machine_downtime", "outage_time", "stillstand"] },
  { key: "defect_rate", label: "Defect Rate", category: "operational", inverse: true, unit: "percent",
    synonyms: ["defect_rate", "defects", "defect_pct", "scrap_rate", "fehlerquote"] },
  { key: "oee", label: "Overall Equipment Effectiveness", category: "operational", unit: "percent",
    synonyms: ["oee", "overall_equipment_effectiveness"] },
  { key: "throughput", label: "Throughput", category: "operational",
    synonyms: ["throughput", "units_produced", "output", "production_volume"] },
  { key: "on_time_delivery", label: "On-Time Delivery", category: "operational", unit: "percent",
    synonyms: ["on_time_delivery", "otd", "ontime_pct", "delivery_performance"] },

  // ── Customer ─────────────────────────────────────────────────
  { key: "nps", label: "NPS", category: "customer",
    synonyms: ["nps", "net_promoter_score", "promoter_score"] },
  { key: "csat", label: "CSAT", category: "customer", unit: "percent",
    synonyms: ["csat", "customer_satisfaction", "satisfaction_score"] },
  { key: "churn_rate", label: "Churn Rate", category: "customer", inverse: true, unit: "percent",
    synonyms: ["churn", "churn_rate", "attrition_rate", "cancellation_rate", "abwanderung"] },
  { key: "retention_rate", label: "Retention Rate", category: "customer", unit: "percent",
    synonyms: ["retention", "retention_rate", "renewal_rate"] },
  { key: "cac", label: "CAC", category: "customer", inverse: true, unit: "currency",
    synonyms: ["cac", "customer_acquisition_cost", "acquisition_cost"] },
  { key: "ltv", label: "LTV", category: "customer", unit: "currency",
    synonyms: ["ltv", "clv", "lifetime_value", "customer_lifetime_value"] },
  { key: "mrr", label: "MRR", category: "customer", unit: "currency",
    synonyms: ["mrr", "monthly_recurring_revenue"] },
  { key: "arr", label: "ARR", category: "customer", unit: "currency",
    synonyms: ["arr", "annual_recurring_revenue"] },

  // ── People / HR ──────────────────────────────────────────────
  { key: "headcount", label: "Headcount", category: "people",
    synonyms: ["headcount", "employee_count", "fte", "staff_count", "mitarbeiterzahl"] },
  { key: "attrition", label: "Attrition", category: "people", inverse: true, unit: "percent",
    synonyms: ["attrition", "attrition_rate", "turnover_rate", "employee_turnover", "fluktuation"] },
  { key: "engagement", label: "Engagement Score", category: "people",
    synonyms: ["engagement", "engagement_score", "employee_engagement"] },
  { key: "time_to_hire", label: "Time to Hire", category: "people", inverse: true, unit: "days",
    synonyms: ["time_to_hire", "tth", "hiring_days"] },

  // ── Risk ─────────────────────────────────────────────────────
  { key: "risk_score", label: "Risk Score", category: "risk", inverse: true,
    synonyms: ["risk_score", "risk_rating", "risk_index"] },
  { key: "compliance_score", label: "Compliance Score", category: "risk", unit: "percent",
    synonyms: ["compliance_score", "compliance_rate", "audit_score"] },
  { key: "incident_count", label: "Incidents", category: "risk", inverse: true,
    synonyms: ["incidents", "incident_count", "safety_incidents", "violations"] },

  // ── Growth ───────────────────────────────────────────────────
  { key: "leads", label: "Leads", category: "growth",
    synonyms: ["leads", "lead_count", "qualified_leads", "mqls", "sqls"] },
  { key: "conversion_rate", label: "Conversion Rate", category: "growth", unit: "percent",
    synonyms: ["conversion_rate", "conversion_pct", "cvr"] },
  { key: "pipeline", label: "Pipeline", category: "growth", unit: "currency",
    synonyms: ["pipeline", "sales_pipeline", "opportunity_value"] },
];

// ──────────────────────────────────────────────────────────────
// Matching
// ──────────────────────────────────────────────────────────────

export interface KpiMatch {
  kpi: CanonicalKpi;
  /** Header that matched, lowercased + normalized */
  source: string;
  /** 0..1 */
  confidence: number;
  matchType: "exact" | "synonym" | "fuzzy";
}

const normalize = (s: string): string =>
  s.toLowerCase().trim().replace(/[\s/.-]+/g, "_").replace(/[^\w%]/g, "");

/** Levenshtein distance, bounded for performance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 4) return Math.max(m, n);
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/** Match a single header to its best canonical KPI. */
export function matchKpi(header: string): KpiMatch | null {
  const norm = normalize(header);
  if (!norm) return null;

  let best: KpiMatch | null = null;

  for (const kpi of KPI_DICTIONARY) {
    for (const syn of kpi.synonyms) {
      const synNorm = normalize(syn);
      if (norm === synNorm) {
        return { kpi, source: norm, confidence: 1, matchType: syn === kpi.key ? "exact" : "synonym" };
      }
      // contained-word match (e.g. "total_revenue_usd" contains "revenue")
      if (norm.includes(synNorm) && synNorm.length >= 4) {
        const conf = Math.min(0.92, 0.7 + synNorm.length / norm.length * 0.25);
        if (!best || conf > best.confidence) {
          best = { kpi, source: norm, confidence: conf, matchType: "synonym" };
        }
      }
      // fuzzy
      const sim = similarity(norm, synNorm);
      if (sim >= 0.82) {
        const conf = sim * 0.9;
        if (!best || conf > best.confidence) {
          best = { kpi, source: norm, confidence: conf, matchType: "fuzzy" };
        }
      }
    }
  }
  return best;
}

export interface OntologyReport {
  version: string;
  matches: KpiMatch[];
  unmatched: string[];
  byCategory: Record<KpiCategory, number>;
}

/** Match a list of headers and group by category. */
export function buildOntologyReport(headers: string[]): OntologyReport {
  const matches: KpiMatch[] = [];
  const unmatched: string[] = [];
  const byCategory: Record<KpiCategory, number> = {
    financial: 0, operational: 0, customer: 0, people: 0, risk: 0, growth: 0,
  };
  const seen = new Set<string>();
  for (const h of headers) {
    const m = matchKpi(h);
    if (m && !seen.has(m.kpi.key)) {
      matches.push(m);
      byCategory[m.kpi.category]++;
      seen.add(m.kpi.key);
    } else if (!m) {
      unmatched.push(h);
    }
  }
  return { version: KPI_ONTOLOGY_VERSION, matches, unmatched, byCategory };
}
