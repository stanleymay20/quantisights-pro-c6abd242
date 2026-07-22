/**
 * Executive Routing Engine — Phase 8
 *
 * Maps the set of detected KPIs to the executive dashboards (CFO, COO,
 * CMO, CHRO, CRO, CEO, CIO) that should auto-activate. Returns the top
 * matches with confidence and human-readable reasoning.
 */

import type { OntologyReport } from "../ontology/kpi-ontology";
import type { ExecutiveRole } from "../ontology/industry-kpi-packs";

interface RoleMapping {
  role: ExecutiveRole;
  /** Canonical KPI keys that strongly suggest this role */
  signals: string[];
  label: string;
}

const ROLE_MAPPINGS: RoleMapping[] = [
  {
    role: "CFO",
    label: "Chief Financial Officer",
    signals: ["revenue", "gross_margin", "net_profit", "ebitda", "cash_flow", "cost", "ar_days"],
  },
  {
    role: "COO",
    label: "Chief Operating Officer",
    signals: ["inventory_turnover", "downtime", "defect_rate", "oee", "throughput", "on_time_delivery"],
  },
  {
    role: "CMO",
    label: "Chief Marketing Officer",
    signals: ["nps", "csat", "churn_rate", "retention_rate", "leads", "conversion_rate", "pipeline"],
  },
  {
    role: "CHRO",
    label: "Chief Human Resources Officer",
    signals: ["headcount", "attrition", "engagement", "time_to_hire"],
  },
  {
    role: "CRO",
    label: "Chief Risk Officer",
    signals: ["risk_score", "compliance_score", "incident_count"],
  },
  {
    role: "CEO",
    label: "Chief Executive Officer",
    signals: ["revenue", "net_profit", "arr", "headcount", "nps"],
  },
];

export interface DashboardRecommendation {
  role: ExecutiveRole;
  label: string;
  confidence: number;
  matchedKpis: string[];
  reason: string;
}

export interface RoutingResult {
  recommendedDashboards: DashboardRecommendation[];
  confidence: number;
  reason: string;
}

export function routeToExecutives(ontology: OntologyReport): RoutingResult {
  const matchedKeys = new Set(ontology.matches.map((m) => m.kpi.key));
  if (matchedKeys.size === 0) {
    return {
      recommendedDashboards: [],
      confidence: 0,
      reason: "No canonical KPIs detected — no dashboards routed.",
    };
  }

  const recs: DashboardRecommendation[] = [];
  for (const m of ROLE_MAPPINGS) {
    const hits = m.signals.filter((s) => matchedKeys.has(s));
    if (hits.length === 0) continue;
    // Confidence: how much of the role's signal set is covered
    const coverage = hits.length / m.signals.length;
    // Plus a boost from match confidence average
    const avgConf =
      ontology.matches
        .filter((om) => hits.includes(om.kpi.key))
        .reduce((s, om) => s + om.confidence, 0) / hits.length;
    const confidence = Math.round((0.6 * coverage + 0.4 * avgConf) * 100) / 100;
    recs.push({
      role: m.role,
      label: m.label,
      confidence,
      matchedKpis: hits,
      reason: `${hits.length}/${m.signals.length} ${m.role} KPIs detected: ${hits.slice(0, 4).join(", ")}`,
    });
  }

  recs.sort((a, b) => b.confidence - a.confidence);
  const top = recs.slice(0, 3);
  const overall =
    top.length === 0 ? 0 : Math.round((top.reduce((s, r) => s + r.confidence, 0) / top.length) * 100) / 100;

  return {
    recommendedDashboards: top,
    confidence: overall,
    reason:
      top.length === 0
        ? "No executive role thresholds met."
        : `Top role: ${top[0].role} (${Math.round(top[0].confidence * 100)}%)`,
  };
}
