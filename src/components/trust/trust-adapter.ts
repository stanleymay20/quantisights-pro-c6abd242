/**
 * Trust adapters — map existing source records into TrustStripRecord.
 *
 * No new scoring. No inferred trust engine. Only simple extraction from fields
 * already present on advisory/decision/brief/outcome/boardroom records.
 */
import type { TrustStatus, TrustStripRecord } from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeConfidence(value: unknown): number | null {
  const n = num(value);
  if (n == null) return null;
  return n <= 1 ? n * 100 : n;
}

function normalizeStatus(value: unknown): TrustStatus | null {
  const v = String(value ?? "").toLowerCase();
  if (!v) return null;
  if (["verified", "passed", "approved", "complete", "completed", "valid"].includes(v)) return "verified";
  if (["partial", "warning", "review", "in_review", "pending"].includes(v)) return "partial";
  if (["blocked", "failed", "rejected", "critical"].includes(v)) return "blocked";
  if (["missing", "none", "unavailable"].includes(v)) return "missing";
  return "partial";
}

function evidenceStatus(source: Record<string, unknown>): TrustStatus {
  const explicit = normalizeStatus(source.evidence_status ?? getPath(source, "explanation_metadata.evidence_status"));
  if (explicit) return explicit;

  const evidenceSources = source.evidence_sources;
  if (Array.isArray(evidenceSources) && evidenceSources.length > 0) return "verified";

  // A record can carry real evidence in explanation_metadata.source_data
  // (dataset/rows analyzed) even when evidence_sources is empty — an empty
  // array must not short-circuit past that. Records with neither fall
  // through to "missing" below.
  const explanationSources = getPath(source, "explanation_metadata.source_data");
  if (explanationSources && typeof explanationSources === "object") return "verified";

  if (Array.isArray(evidenceSources)) return "missing";

  const sourceInsight = source.source_insight_summary;
  return sourceInsight ? "partial" : "not_available";
}

function governanceStatus(source: Record<string, unknown>): TrustStatus {
  const explicit = normalizeStatus(
    source.governance_status
      ?? source.governance_gate_status
      ?? getPath(source, "governance_context.status")
      ?? getPath(source, "explanation_metadata.governance.status"),
  );
  if (explicit) return explicit;

  const status = String(source.decision_status ?? source.status ?? "").toLowerCase();
  if (["approved", "resolved", "completed"].includes(status)) return "verified";
  if (["pending", "in_review", "open"].includes(status)) return "partial";
  if (["rejected", "blocked"].includes(status)) return "blocked";
  return "not_available";
}

function lastVerified(source: Record<string, unknown>): string | null {
  return String(
    source.last_verified_at
      ?? source.updated_at
      ?? source.generated_at
      ?? source.created_at
      ?? source.ingested_at
      ?? "",
  ) || null;
}

function sourceQuality(source: Record<string, unknown>): string | null {
  const value = source.source_quality
    ?? source.confidence_grade
    ?? getPath(source, "explanation_metadata.evidence_classification")
    ?? source.decision_origin
    ?? source.source;
  return value == null ? null : String(value);
}

function datasetId(source: Record<string, unknown>): string | null {
  const value = source.dataset_id ?? getPath(source, "explanation_metadata.source_data.dataset_id");
  return value == null ? null : String(value);
}

function confidenceMeta(source: Record<string, unknown>) {
  const raw = normalizeConfidence(source.raw_confidence ?? source.confidence ?? source.confidence_score);
  const capped = normalizeConfidence(source.capped_confidence ?? source.confidence_at_decision ?? source.confidence);
  const reason = source.confidence_cap_reason;
  if (raw == null && capped == null && !reason) return null;
  return {
    raw_confidence: raw ?? undefined,
    capped_confidence: capped ?? raw ?? undefined,
    confidence_cap_reason: reason == null ? undefined : String(reason),
  };
}

function baseTrust(kind: TrustStripRecord["source"]["kind"], source: Record<string, unknown>, orgId?: string | null): TrustStripRecord {
  const meta = confidenceMeta(source);
  const value = meta?.capped_confidence ?? normalizeConfidence(source.confidence ?? source.confidence_score ?? source.confidence_at_decision);
  const org = orgId ?? source.organization_id;

  return {
    source: {
      kind,
      id: source.id == null ? null : String(source.id),
    },
    confidence: value == null ? null : {
      value,
      meta,
      isHeuristic: String(meta?.confidence_cap_reason ?? "").toLowerCase().includes("heuristic"),
    },
    iq: org ? { organizationId: String(org), datasetId: datasetId(source) } : null,
    evidenceStatus: evidenceStatus(source),
    governanceStatus: governanceStatus(source),
    sourceQuality: sourceQuality(source),
    lastVerifiedAt: lastVerified(source),
    proofLabel: evidenceStatus(source) === "verified" ? "Evidence linked" : null,
  };
}

export const trustFromAdvisory = (advisory: unknown, orgId?: string | null): TrustStripRecord =>
  baseTrust("advisory", asRecord(advisory), orgId);

export const trustFromDecision = (decision: unknown, orgId?: string | null): TrustStripRecord =>
  baseTrust("decision", asRecord(decision), orgId);

export const trustFromBoardroomItem = (item: unknown, orgId?: string | null): TrustStripRecord =>
  baseTrust("boardroom", asRecord(item), orgId);

export const trustFromExecutiveBrief = (brief: unknown, orgId?: string | null): TrustStripRecord =>
  baseTrust("brief", asRecord(brief), orgId);

export const trustFromOutcome = (outcome: unknown, orgId?: string | null): TrustStripRecord =>
  baseTrust("outcome", asRecord(outcome), orgId);
