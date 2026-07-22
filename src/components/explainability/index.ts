/**
 * Explainability barrel — single import surface for Phase 6 consumers.
 *
 * Usage:
 *   import { ExplainabilityPanel, fromAdvisory } from "@/components/explainability";
 */
export { default as ExplainabilityPanel } from "./ExplainabilityPanel";
export { default as ExplainabilitySection, NOT_AVAILABLE } from "./ExplainabilitySection";
export {
  fromAdvisory,
  fromDecision,
  fromOutcome,
  fromExecutiveBrief,
  fromBoardroomItem,
} from "./explainability-adapter";
export type {
  ExplainabilityRecord,
  ExplainabilitySourceKind,
  ExplainabilityEvidence,
  ExplainabilityConfidence,
  ExplainabilityAlternative,
  ExplainabilityRisk,
  ExplainabilityImpact,
} from "./types";
