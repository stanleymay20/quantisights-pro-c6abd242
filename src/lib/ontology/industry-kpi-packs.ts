/**
 * Industry KPI Packs — Phase 8
 *
 * Each pack ties a set of canonical KPI keys to dimensions, expected
 * entities, and the executive dashboards that should auto-activate when
 * those KPIs are present.
 */

import type { KpiCategory } from "./kpi-ontology";

export type IndustryKey =
  | "manufacturing" | "retail" | "saas" | "healthcare"
  | "financial_services" | "hr" | "logistics" | "crm" | "government";

export type ExecutiveRole = "CEO" | "CFO" | "COO" | "CMO" | "CHRO" | "CRO" | "CIO";

export interface IndustryPack {
  industry: IndustryKey;
  label: string;
  /** Canonical KPI keys from kpi-ontology.ts */
  kpis: string[];
  /** Slice dimensions */
  dimensions: string[];
  /** Canonical entities expected in this domain */
  entities: string[];
  /** Dashboards to auto-activate when this pack matches */
  executiveDashboards: ExecutiveRole[];
  /** Suggested analyses copy for the data copilot */
  recommendedAnalyses: string[];
  /** Category emphasis used to score industry fit */
  categoryWeights: Partial<Record<KpiCategory, number>>;
}

export const INDUSTRY_PACKS: IndustryPack[] = [
  {
    industry: "manufacturing",
    label: "Manufacturing",
    kpis: ["revenue", "gross_margin", "inventory_turnover", "downtime", "defect_rate", "oee", "throughput", "on_time_delivery", "cost"],
    dimensions: ["plant", "line", "shift", "product", "sku"],
    entities: ["Plant", "Machine", "Product", "Supplier", "Work Order"],
    executiveDashboards: ["COO", "CFO"],
    recommendedAnalyses: ["Margin Optimization", "Supplier Risk", "Inventory Forecasting", "Downtime Root Cause"],
    categoryWeights: { operational: 1.5, financial: 1.0 },
  },
  {
    industry: "retail",
    label: "Retail",
    kpis: ["revenue", "gross_margin", "inventory_turnover", "conversion_rate", "csat", "cost"],
    dimensions: ["store", "region", "category", "sku", "channel"],
    entities: ["Store", "Product", "Customer", "Transaction"],
    executiveDashboards: ["CMO", "COO", "CFO"],
    recommendedAnalyses: ["Basket Analysis", "Stockout Risk", "Pricing Elasticity"],
    categoryWeights: { operational: 1.0, customer: 1.2, financial: 1.0 },
  },
  {
    industry: "saas",
    label: "SaaS",
    kpis: ["mrr", "arr", "churn_rate", "retention_rate", "cac", "ltv", "nps", "conversion_rate"],
    dimensions: ["plan", "cohort", "region", "segment"],
    entities: ["Customer", "Subscription", "Account", "User"],
    executiveDashboards: ["CEO", "CFO", "CMO"],
    recommendedAnalyses: ["Cohort Retention", "Net Revenue Retention", "LTV/CAC Ratio", "Expansion Pipeline"],
    categoryWeights: { customer: 1.5, growth: 1.2, financial: 1.0 },
  },
  {
    industry: "healthcare",
    label: "Healthcare",
    kpis: ["compliance_score", "incident_count", "csat", "cost", "throughput"],
    dimensions: ["facility", "department", "physician", "procedure"],
    entities: ["Patient", "Provider", "Facility", "Encounter"],
    executiveDashboards: ["COO", "CRO", "CFO"],
    recommendedAnalyses: ["Readmission Risk", "Capacity Planning", "Compliance Drift"],
    categoryWeights: { risk: 1.5, operational: 1.0 },
  },
  {
    industry: "financial_services",
    label: "Financial Services",
    kpis: ["revenue", "net_profit", "ebitda", "risk_score", "compliance_score", "cost"],
    dimensions: ["product", "region", "segment", "channel"],
    entities: ["Customer", "Account", "Transaction", "Portfolio"],
    executiveDashboards: ["CFO", "CRO", "CEO"],
    recommendedAnalyses: ["Portfolio Risk", "Regulatory Exposure", "Fraud Detection"],
    categoryWeights: { financial: 1.5, risk: 1.3 },
  },
  {
    industry: "hr",
    label: "HR",
    kpis: ["headcount", "attrition", "engagement", "time_to_hire"],
    dimensions: ["department", "location", "level", "function"],
    entities: ["Employee", "Department", "Role", "Manager"],
    executiveDashboards: ["CHRO", "CEO"],
    recommendedAnalyses: ["Attrition Drivers", "Workforce Planning", "Pay Equity"],
    categoryWeights: { people: 2.0 },
  },
  {
    industry: "logistics",
    label: "Logistics",
    kpis: ["on_time_delivery", "throughput", "cost", "inventory_turnover"],
    dimensions: ["lane", "carrier", "warehouse", "mode"],
    entities: ["Shipment", "Carrier", "Warehouse", "Order"],
    executiveDashboards: ["COO", "CFO"],
    recommendedAnalyses: ["Carrier Performance", "Lane Cost", "ETA Accuracy"],
    categoryWeights: { operational: 1.5, financial: 0.8 },
  },
  {
    industry: "crm",
    label: "CRM / Sales",
    kpis: ["leads", "conversion_rate", "pipeline", "revenue", "cac", "ltv"],
    dimensions: ["rep", "stage", "region", "segment"],
    entities: ["Lead", "Opportunity", "Account", "Contact"],
    executiveDashboards: ["CMO", "CEO", "CFO"],
    recommendedAnalyses: ["Pipeline Velocity", "Win Rate by Segment", "Quota Attainment"],
    categoryWeights: { growth: 1.5, customer: 1.0 },
  },
  {
    industry: "government",
    label: "Government / Public Sector",
    kpis: ["compliance_score", "incident_count", "cost", "csat"],
    dimensions: ["agency", "program", "region"],
    entities: ["Citizen", "Program", "Case", "Agency"],
    executiveDashboards: ["CRO", "COO"],
    recommendedAnalyses: ["Program Outcomes", "Compliance Drift", "Service Backlog"],
    categoryWeights: { risk: 1.5, operational: 1.0 },
  },
];

export function getIndustryPack(key: IndustryKey): IndustryPack | undefined {
  return INDUSTRY_PACKS.find((p) => p.industry === key);
}
