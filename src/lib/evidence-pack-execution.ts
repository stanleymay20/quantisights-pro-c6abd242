import { canonicalHash } from "@/lib/evidence-pack";
import type { EvidencePack, EvidencePackSection } from "@/lib/evidence-pack-types";

const PROVIDER_EVIDENCE_PREFIX = "provider_evidence_";

export interface EvidencePackExecutionReceiptInput {
  id: string;
  execution_plan_id: string;
  decision_id: string;
  action_type: string;
  status: "claimed" | "succeeded" | "failed" | "uncertain" | string;
  response_status: number | null;
  response_metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  reconciled_at: string | null;
  reconciled_by: string | null;
  reconciliation_note: string | null;
  external_reference: string | null;
  attempt_count?: number | null;
  max_attempts?: number | null;
  last_attempt_at?: string | null;
  last_retry_reason?: string | null;
  retry_exhausted_at?: string | null;
}

export interface AttachExecutionEvidenceOptions {
  receipts?: EvidencePackExecutionReceiptInput[];
  readFailed?: boolean;
}

export type ProviderEvidenceVerification = "verified" | "mismatch" | "not_recorded";

interface VerifiedReceiptEvidence {
  receipt_id: string;
  execution_plan_id: string;
  action_type: string;
  current_status: string;
  created_at: string;
  completed_at: string | null;
  retry: {
    attempt_count: number | null;
    max_attempts: number | null;
    last_attempt_at: string | null;
    last_retry_reason: string | null;
    retry_exhausted_at: string | null;
  };
  provider_observation: {
    version: string | null;
    observed_status: string | null;
    response_status: number | null;
    response_metadata: Record<string, unknown>;
    error_message: string | null;
    external_reference: string | null;
    stored_digest: string | null;
    recomputed_digest: string | null;
    verification: ProviderEvidenceVerification;
  };
  reconciliation: null | {
    reconciled_at: string;
    reconciled_by: string | null;
    resolution: string;
    note: string | null;
    external_reference: string | null;
    evidence_hash: string;
    hash_scope: "derived-evidence-pack-fingerprint";
  };
}

function metadataOf(receipt: EvidencePackExecutionReceiptInput): Record<string, unknown> {
  return receipt.response_metadata && typeof receipt.response_metadata === "object"
    ? receipt.response_metadata
    : {};
}

function providerMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !key.startsWith(PROVIDER_EVIDENCE_PREFIX))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function verifyReceipt(receipt: EvidencePackExecutionReceiptInput): Promise<VerifiedReceiptEvidence> {
  const metadata = metadataOf(receipt);
  const cleanProviderMetadata = providerMetadata(metadata);
  const storedDigest = stringOrNull(metadata.provider_evidence_digest);
  const version = stringOrNull(metadata.provider_evidence_version);
  const observedStatus = stringOrNull(metadata.provider_evidence_observed_status);
  const observedResponseStatus = numberOrNull(metadata.provider_evidence_response_status);
  const observedError = stringOrNull(metadata.provider_evidence_error_message);
  const observedExternalReference = stringOrNull(metadata.provider_evidence_external_reference);

  let recomputedDigest: string | null = null;
  let verification: ProviderEvidenceVerification = "not_recorded";

  if (storedDigest && version && observedStatus) {
    const digest = await canonicalHash({
      receipt_id: receipt.id,
      version,
      observed_status: observedStatus,
      response_status: observedResponseStatus,
      response_metadata: cleanProviderMetadata,
      error_message: observedError,
      external_reference: observedExternalReference,
    });
    recomputedDigest = digest.replace(/^sha256-/, "");
    verification = recomputedDigest === storedDigest ? "verified" : "mismatch";
  }

  let reconciliation: VerifiedReceiptEvidence["reconciliation"] = null;
  if (receipt.reconciled_at) {
    const evidenceHash = await canonicalHash({
      receipt_id: receipt.id,
      provider_evidence_digest: storedDigest,
      reconciled_at: receipt.reconciled_at,
      reconciled_by: receipt.reconciled_by,
      resolution: receipt.status,
      reconciliation_note: receipt.reconciliation_note,
      external_reference: receipt.external_reference,
    });
    reconciliation = {
      reconciled_at: receipt.reconciled_at,
      reconciled_by: receipt.reconciled_by,
      resolution: receipt.status,
      note: receipt.reconciliation_note,
      external_reference: receipt.external_reference,
      evidence_hash: evidenceHash,
      hash_scope: "derived-evidence-pack-fingerprint",
    };
  }

  return {
    receipt_id: receipt.id,
    execution_plan_id: receipt.execution_plan_id,
    action_type: receipt.action_type,
    current_status: receipt.status,
    created_at: receipt.created_at,
    completed_at: receipt.completed_at,
    retry: {
      attempt_count: receipt.attempt_count ?? null,
      max_attempts: receipt.max_attempts ?? null,
      last_attempt_at: receipt.last_attempt_at ?? null,
      last_retry_reason: receipt.last_retry_reason ?? null,
      retry_exhausted_at: receipt.retry_exhausted_at ?? null,
    },
    provider_observation: {
      version,
      observed_status: observedStatus,
      response_status: observedResponseStatus,
      response_metadata: cleanProviderMetadata,
      error_message: observedError,
      external_reference: observedExternalReference,
      stored_digest: storedDigest,
      recomputed_digest: recomputedDigest,
      verification,
    },
    reconciliation,
  };
}

function sectionStatus(
  base: EvidencePackSection,
  receipts: VerifiedReceiptEvidence[],
  readFailed: boolean,
): EvidencePackSection["status"] {
  if (readFailed) return base.status === "not_applicable" ? "unavailable" : "partial";
  if (receipts.length === 0) return base.status;

  const hasMismatch = receipts.some((receipt) => receipt.provider_observation.verification === "mismatch");
  const hasIncomplete = receipts.some((receipt) =>
    receipt.current_status === "claimed"
    || receipt.current_status === "uncertain"
    || receipt.provider_observation.verification === "not_recorded"
  );
  return hasMismatch || hasIncomplete ? "partial" : "complete";
}

function buildExecutionSection(
  base: EvidencePackSection,
  receipts: VerifiedReceiptEvidence[],
  readFailed: boolean,
): EvidencePackSection {
  const verifiedCount = receipts.filter((receipt) => receipt.provider_observation.verification === "verified").length;
  const mismatchCount = receipts.filter((receipt) => receipt.provider_observation.verification === "mismatch").length;
  const reconciliationCount = receipts.filter((receipt) => receipt.reconciliation !== null).length;
  const uncertainCount = receipts.filter((receipt) => receipt.current_status === "uncertain").length;

  let summary: string;
  if (readFailed) {
    summary =
      "Execution receipts could not be read when this pack was generated. Execution outcome evidence is therefore unknown; this does not mean no execution occurred.";
  } else if (receipts.length === 0) {
    summary = `${base.summary} No governed outbound execution receipt is recorded for this decision.`;
  } else if (mismatchCount > 0) {
    summary =
      `${receipts.length} governed execution receipt(s) are linked. ${mismatchCount} provider evidence digest mismatch(es) require investigation before this pack can be treated as complete.`;
  } else {
    summary =
      `${receipts.length} governed execution receipt(s) are linked; ${verifiedCount} provider observation(s) independently re-verified` +
      `${reconciliationCount > 0 ? ` and ${reconciliationCount} reconciliation event(s) separately fingerprinted` : ""}.` +
      `${uncertainCount > 0 ? ` ${uncertainCount} receipt(s) remain uncertain.` : ""}`;
  }

  return {
    status: sectionStatus(base, receipts, readFailed),
    title: "Runtime & Execution Evidence",
    summary,
    source: readFailed
      ? "list_execution_action_receipts RPC (read failed)"
      : "decision_ledger runtime linkage + tenant-scoped list_execution_action_receipts RPC",
    generated_from: readFailed
      ? [...base.generated_from]
      : [...new Set([...base.generated_from, ...(receipts.length > 0 ? ["list_execution_action_receipts"] : [])])],
    data: {
      runtime_linkage: base.data,
      execution_receipts_read_failed: readFailed,
      receipt_count: receipts.length,
      provider_evidence_verified_count: verifiedCount,
      provider_evidence_mismatch_count: mismatchCount,
      uncertain_receipt_count: uncertainCount,
      reconciliation_count: reconciliationCount,
      receipts,
      reconciliation_hash_note:
        "Reconciliation hashes are deterministic Evidence Pack fingerprints derived from the tenant-scoped receipt projection. They are separate from, and do not replace, the server-persisted provider evidence digest.",
    },
  };
}

async function rehashPack(pack: EvidencePack, runtimeMetadata: EvidencePackSection): Promise<EvidencePack> {
  const sections = {
    ...pack.sections,
    runtime_metadata: runtimeMetadata,
  };

  const { hashes: _hashes, digital_signature: _digitalSignature, ...sectionsWithoutHash } = sections;
  const evidencePackHash = await canonicalHash({
    schema_version: pack.schema_version,
    decision_id: pack.decision_id,
    organization_id: pack.organization_id,
    is_simulation: pack.is_simulation,
    sections: sectionsWithoutHash,
  });

  const hashes: EvidencePackSection = {
    status: "complete",
    title: "Hashes",
    summary: `Evidence pack hash: ${evidencePackHash}.`,
    source: "computed from all Evidence Pack sections (canonical JSON, SHA-256)",
    generated_from: Object.keys(sectionsWithoutHash),
    data: { evidence_pack_hash: evidencePackHash, algorithm: "sha256-canonical-json" },
  };

  return {
    ...pack,
    evidence_pack_hash: evidencePackHash,
    sections: {
      ...sections,
      hashes,
    },
  };
}

/**
 * EP execution extension.
 *
 * Adds governed outbound execution truth to the existing runtime_metadata
 * section without changing the Evidence Pack schema or opening direct client
 * access to execution_action_receipts. Provider observations are re-verified
 * against the server-persisted Tranche 1 digest. Later reconciliation is kept
 * separate and receives its own deterministic Evidence Pack fingerprint.
 */
export async function attachExecutionEvidence(
  pack: EvidencePack,
  options: AttachExecutionEvidenceOptions = {},
): Promise<EvidencePack> {
  const receipts = [...(options.receipts ?? [])].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const verified = await Promise.all(receipts.map(verifyReceipt));
  const runtimeMetadata = buildExecutionSection(pack.sections.runtime_metadata, verified, options.readFailed ?? false);
  return rehashPack(pack, runtimeMetadata);
}
