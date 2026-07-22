/**
 * Data Copilot — Phase 8
 *
 * Synthesizes the ontology + entity + routing + anomaly + trust outputs
 * into a single executive-facing brief that we render after upload.
 *
 * Pure compositor — does not perform additional analysis itself.
 */

import { buildOntologyReport, type OntologyReport } from "../ontology/kpi-ontology";
import {
  INDUSTRY_PACKS,
  type IndustryKey,
  type IndustryPack,
} from "../ontology/industry-kpi-packs";
import { resolveEntities, type ResolvedEntity } from "./entity-resolution";
import { discoverRelationships, type RelationshipGraph } from "./relationship-discovery";
import { routeToExecutives, type RoutingResult } from "./executive-routing";
import { detectAnomalies, type AnomalyDetectionResult } from "./anomaly-detector";
import { computeTrustScore, type TrustScore, type TrustScoreInput } from "./trust-score";

export interface IndustryFit {
  industry: IndustryKey;
  label: string;
  confidence: number;
  matchedKpis: string[];
}

export interface CopilotBrief {
  ontology: OntologyReport;
  entities: ResolvedEntity[];
  relationships: RelationshipGraph;
  routing: RoutingResult;
  anomalies: AnomalyDetectionResult;
  trust: TrustScore;
  detectedIndustry: IndustryFit | null;
  industryAlternatives: IndustryFit[];
  kpiCounts: { financial: number; operational: number; customer: number; people: number; risk: number; growth: number };
  recommendedAnalyses: string[];
  headline: string;
}

interface BuildInput {
  headers: string[];
  sampleRows: Array<Record<string, unknown> | unknown[]>;
  diagnostics: TrustScoreInput["diagnostics"];
  drift: TrustScoreInput["drift"];
  hasLineage: boolean;
}

function scoreIndustry(pack: IndustryPack, ontology: OntologyReport): IndustryFit {
  const matchedKpis = ontology.matches
    .filter((m) => pack.kpis.includes(m.kpi.key))
    .map((m) => m.kpi.key);

  // Coverage of the pack
  const coverage = matchedKpis.length / Math.max(1, pack.kpis.length);

  // Weighted category emphasis
  let weighted = 0;
  let weightTotal = 0;
  for (const [cat, w] of Object.entries(pack.categoryWeights)) {
    const count = ontology.byCategory[cat as keyof typeof ontology.byCategory] ?? 0;
    weighted += count * (w ?? 1);
    weightTotal += w ?? 1;
  }
  const emphasis = weightTotal > 0 ? Math.min(1, weighted / (weightTotal * 4)) : 0;
  const confidence = Math.round((0.7 * coverage + 0.3 * emphasis) * 100) / 100;

  return {
    industry: pack.industry,
    label: pack.label,
    confidence,
    matchedKpis,
  };
}

export function buildCopilotBrief(input: BuildInput): CopilotBrief {
  const ontology = buildOntologyReport(input.headers);
  const entities = resolveEntities(input.headers);
  const relationships = discoverRelationships(entities);
  const routing = routeToExecutives(ontology);
  const anomalies = detectAnomalies(input.headers, input.sampleRows);

  const trust = computeTrustScore({
    diagnostics: input.diagnostics,
    drift: input.drift,
    anomalies,
    hasLineage: input.hasLineage,
  });

  const industryFits = INDUSTRY_PACKS
    .map((p) => scoreIndustry(p, ontology))
    .filter((f) => f.matchedKpis.length > 0)
    .sort((a, b) => b.confidence - a.confidence);

  const detectedIndustry = industryFits[0] ?? null;
  const industryAlternatives = industryFits.slice(1, 3);

  const recommendedAnalyses = detectedIndustry
    ? INDUSTRY_PACKS.find((p) => p.industry === detectedIndustry.industry)!.recommendedAnalyses
    : [];

  const headline = detectedIndustry
    ? `${detectedIndustry.label} dataset — ${ontology.matches.length} canonical KPIs, trust ${trust.grade}`
    : `Dataset profiled — ${ontology.matches.length} canonical KPIs, trust ${trust.grade}`;

  return {
    ontology,
    entities,
    relationships,
    routing,
    anomalies,
    trust,
    detectedIndustry,
    industryAlternatives,
    kpiCounts: ontology.byCategory,
    recommendedAnalyses,
    headline,
  };
}
