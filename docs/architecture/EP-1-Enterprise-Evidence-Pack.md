# EP-1 — Enterprise Decision Evidence Pack

## Purpose

The Evidence Pack is the official enterprise artifact that explains exactly why a decision was recommended and approved — the record an auditor, executive, regulator, or customer would receive.

EP-1 is a **presentation/export layer only**. It reads a decision that already exists in Quantivis (a `decision_ledger` row, plus its `audit_log` entries where available) and packages that data into one deterministic, auditor-facing document. It does not call a model, a runtime, a queue, or a connector, and it never invents a value that isn't already present on the source record.

## Architecture

```text
decision_ledger row (+ optional audit_log rows)
        │
        ▼
buildEvidencePack()            ← src/lib/evidence-pack.ts (pure, deterministic)
  reuses existing computations:
    - trustFromDecision            (src/components/trust/trust-adapter.ts)
    - getExecutiveApprovalChecklist(src/components/decisions/executive-decision-review-utils.ts)
    - getExecutiveRiskLevel, getReviewRisks, getEvidenceSignalCount,
      getEstimatedExecutionTimeline, formatEuro, formatPercent
                                    (src/components/decisions/executive-review-flow.ts)
        │
        ▼
EvidencePack                    ← src/lib/evidence-pack-types.ts
  20 sections + decision timeline + evidence_pack_hash
        │
        ├── evidencePackToJSON()      → deterministic JSON export
        ├── evidencePackToHtml()      → deterministic printable HTML export
        └── evidencePackToPdfModel()  → structured PDF-ready block model (no PDF bytes)
        │
        ▼
EvidencePackPreview             ← src/components/decisions/EvidencePackPreview.tsx
        │
        ▼
EvidencePack page (/evidence-pack/:decisionId)  ← src/pages/EvidencePack.tsx
```

EP-1 deliberately duplicates a small canonical-hash utility (`canonicalHash` in `evidence-pack.ts`) rather than importing AG-3's persistence hashing helper, so this module has zero dependency on runtime/persistence internals. It imports only from existing UX-2 and trust-adapter presentation helpers — all pure, already-computed values, never re-derived business logic.

## Pack structure

Every Evidence Pack has exactly 20 sections (`EVIDENCE_PACK_SECTION_KEYS` in `evidence-pack-types.ts`):

| # | Section | Typical source |
|---|---|---|
| 1 | Decision Summary | `decision_ledger` |
| 2 | Business Context | `source_insight_summary` / `notes` |
| 3 | Decision Recommendation | `recommended_action`, `chosen_action`, `explanation_metadata.reasoning` |
| 4 | Confidence | `capped_confidence` / `confidence_at_decision` / `raw_confidence` |
| 5 | Risk Assessment | computed from confidence + predicted ROI (UX-2 `getExecutiveRiskLevel`) |
| 6 | Business Impact | `predicted_net_impact`, `predicted_roi_probability` |
| 7 | Evidence Summary | `explanation_metadata` + trust adapter |
| 8 | Verified Facts | `linked_aicis_prediction_id` (reference only) |
| 9 | Supporting Signals | `explanation_metadata.source_data` / `triggering_insight` |
| 10 | Contradictions | `explanation_metadata.contradictions` |
| 11 | Alternatives Considered | always `not_applicable` — no alternative-action records are persisted |
| 12 | Governance Checklist | UX-2 `getExecutiveApprovalChecklist` |
| 13 | Approval Information | `decision_status`, `decided_by`, `decided_at` |
| 14 | Audit Trail | `audit_log` rows supplied by the caller |
| 15 | Runtime Metadata | always `not_applicable` unless a runtime execution reference exists |
| 16 | Gateway Metadata | always `not_applicable` unless a gateway decision reference exists |
| 17 | Decision Timeline | derived lifecycle stage list (see below) |
| 18 | Outcome Prediction | `predicted_net_impact`, `predicted_roi_probability`, `outcome_delta`, `outcome_measured_at` |
| 19 | Hashes | `evidence_pack_hash` over sections 1–18 |
| 20 | Digital Signature | placeholder — signing is not implemented in EP-1 |

Every section is a uniform `EvidencePackSection`:

```ts
interface EvidencePackSection {
  status: "complete" | "partial" | "unavailable" | "not_applicable";
  title: string;
  summary: string;
  source: string;          // where this section's data came from
  generated_from: string[]; // the specific fields/records used
  data: Record<string, unknown>;
}
```

`decision_ledger` carries no direct reference to an AG-2 gateway decision or an AG-3 runtime execution, so **Runtime Metadata** and **Gateway Metadata** are honestly reported as `not_applicable` for the vast majority of decisions today. **Alternatives Considered** is likewise always `not_applicable`: only the recommended (and, if changed, chosen) action is persisted — no discrete alternative-action records exist to package, so EP-1 says so rather than reusing the illustrative alternative text shown in the UX-2 review flow (which is generic UI copy, not decision-specific data, and would violate "never invent information" if placed in an audit artifact).

## Timeline model

The Decision Timeline section always lists the same nine lifecycle stages, in this fixed order, regardless of what the decision contains:

```text
Signal Received
  ↓
Evidence Verified
  ↓
Fact Promoted
  ↓
Decision Candidate
  ↓
Agent Gateway
  ↓
Runtime Gateway
  ↓
Executive Review
  ↓
Approved
  ↓
Outcome Prediction
```

Each step is independently marked `recorded`, `pending`, or `not_recorded` based on what's actually present on the decision (e.g. `Decision Candidate` is always `recorded` because the `decision_ledger` row itself is that candidate; `Fact Promoted` is always `not_recorded` today because no `enterprise_verified_fact` linkage column exists on `decision_ledger`). The step order itself never changes — only each step's status and detail do.

## Hash model

`evidence_pack_hash` is a deterministic FNV-1a hash over a canonical (recursively key-sorted) JSON encoding of every section **except** `hashes` and `digital_signature` (to avoid self-reference), plus `schema_version`, `decision_id`, `organization_id`, and `is_simulation`. It intentionally excludes `generated_at`, so re-running the pack builder against the same decision at a different time produces the same hash — verified by the "identical hashes" and "deterministic output" tests. Any change to the underlying decision content changes the hash.

The `Digital Signature` section is a placeholder object (`{ algorithm: null, signature: null, signed_by: null, signed_at: null }`) documenting where a future signature over `evidence_pack_hash` will attach. No cryptography is implemented in EP-1.

## Export model

Three deterministic export forms are supported; no PDF bytes are produced:

- **JSON** — `evidencePackToJSON(pack)`: `JSON.stringify(pack, null, 2)`. Round-trips exactly.
- **Printable HTML** — `evidencePackToHtml(pack)`: a self-contained `<!doctype html>` string (no external assets) listing every section's status, summary, and source, for printing or emailing.
- **PDF-ready data model** — `evidencePackToPdfModel(pack)`: an ordered array of typed blocks (`heading`, `status_line`, `paragraph`, `key_values`, `list`, `timeline`) that a future PDF renderer can consume directly. No PDF generation happens in EP-1.

## Preview UI

`EvidencePackPreview` renders a curated read of the full pack: Executive Summary (decision, impact, confidence, risk, evidence quality at a glance), Evidence Quality, Timeline, Business Impact, Decision, Approval, Audit, and Hashes — each section carries a status badge (`complete` / `partial` / `unavailable` / `not_applicable`) so a reader immediately sees what is and isn't backed by real data. "Download JSON" and "Download Printable HTML" trigger client-side blob downloads; no PDF/signing controls exist yet.

## Page

`/evidence-pack/:decisionId` loads the decision (and, best-effort, its `audit_log` entries — a denied or empty read from RLS simply yields an `unavailable` Audit Trail section, it never blocks the rest of the pack) and renders the preview. If the decision cannot be found, the page shows **"Evidence Pack unavailable"** with an explanation — it never fabricates a pack from missing data. The demo decision introduced in UX-2 (`DEMO_DECISION`, `decision_origin: "demo"`) is supported end-to-end and is always labelled as a simulation (`pack.is_simulation = true`), both in the pack data and with a banner in the preview.

## Future PDF support

`evidencePackToPdfModel()` already produces the block-structured input a PDF renderer needs. A later phase adds a rendering step (e.g. a headless-browser print of `evidencePackToHtml()`, or a block-to-PDF library) behind an explicit "Generate PDF" action — deliberately out of scope for EP-1.

## Future signed export

The `Digital Signature` section placeholder defines the target shape (`algorithm`, `signature`, `signed_by`, `signed_at`). A later phase signs `evidence_pack_hash` with an org- or platform-level signing key (mirroring the `SigningAdapter` pattern already used by the runtime gateway) and populates this section — again deliberately out of scope for EP-1, which ships no cryptographic signing.

## Future regulatory export

Once Runtime Metadata and Gateway Metadata have real linkage columns (an AG-2 `gateway_decision_id` / AG-3 `runtime_execution_id` on `decision_ledger`), the same section builders in `evidence-pack.ts` already know how to render them as `partial`/`complete` instead of `not_applicable` — no structural change is needed. A future regulatory export profile can select a subset of sections (e.g. omit internal governance-checklist detail) and layer jurisdiction-specific formatting on top of the existing JSON/HTML/PDF-model exports.

## Verification

```bash
npm exec vitest run src/test/evidence-pack.test.ts
npm test
npm run build
git diff --check
```
