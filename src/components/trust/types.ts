/**
 * TrustStrip types — Phase 8 contract.
 *
 * Thin credibility layer only. No scoring engine, no LLM prose, no synthetic
 * confidence. Adapters map existing trust/evidence/governance fields into this
 * record and the UI renders missing fields as "Not Available".
 */
import type { ConfidenceObject } from "@/components/ConfidenceBadge";

export type TrustStatus = "verified" | "partial" | "missing" | "blocked" | "not_available";

export interface TrustStripRecord {
  source: {
    kind: "advisory" | "decision" | "boardroom" | "brief" | "outcome" | "generic";
    id?: string | null;
  };
  confidence?: {
    value: number | null;
    meta?: ConfidenceObject | null;
    isHeuristic?: boolean;
  } | null;
  iq?: {
    organizationId: string;
    datasetId?: string | null;
  } | null;
  evidenceStatus?: TrustStatus | null;
  governanceStatus?: TrustStatus | null;
  sourceQuality?: string | null;
  lastVerifiedAt?: string | null;
  proofLabel?: string | null;
}

export const TRUST_NOT_AVAILABLE = "Not Available";
