# Phase 6 — Explainability Contract (Locked)

This contract is **frozen** before any code is written. Consolidation is a
composition layer over existing evidence components, **not** a new reasoning
system. Anything not listed here is out of scope for Phase 6.

---

## 1. Sections (fixed, in order)

Every intelligence artifact must expose these six sections — same labels, same
order, same component everywhere:

| # | Section | Purpose |
|---|---|---|
| 1 | **Why This Matters** | Deterministic bullets explaining business relevance |
| 2 | **Evidence** | Provenance + supporting data (dual-layer where available) |
| 3 | **Confidence** | Score, cap reason, IQ grade, sample size — no synthesis |
| 4 | **Alternatives Considered** | Other options surfaced by the source engine |
| 5 | **Risks & Tradeoffs** | Governance thresholds, risk signals |
| 6 | **Expected Impact** | Projected KPI movement / outcome estimate |

---

## 2. Hard Rules

- **No missing section.** If data is absent the section renders the literal
  fallback `Not Available` (typed exactly, no rephrasing).
- **No raw JSON** in any user-facing surface.
- **No LLM-generated explanations.** Bullets and labels come from deterministic
  fields in the existing schema.
- **No synthetic confidence.** Confidence values must be sourced from
  `capped_confidence`, `enriched_confidence`, or `calibration_models` —
  never invented client-side.
- **Confidence cap respected** (0.85 / 85%).
- **Label: value** format inside sections — anchored to stats when present.
- **Existing components only.** No new evidence engines, no new reasoning.

---

## 3. Component Surface

Three units only:

### `ExplainabilityPanel`
The container. Renders all six sections in fixed order. Accepts a single
`ExplainabilityRecord` and an optional `variant: "full" | "compact"`.

### `ExplainabilitySection`
Shared subcomponent. Owns the header, the `Not Available` fallback, and the
slot for body content. Never renders business logic itself.

### `explainability-adapter.ts`
Pure functions mapping existing records into the common
`ExplainabilityRecord` shape:

- `fromAdvisory(advisory: AdvisoryInstance): ExplainabilityRecord`
- `fromDecision(decision: DecisionLedger, ctx): ExplainabilityRecord`
- `fromBoardroomItem(item): ExplainabilityRecord`
- `fromExecutiveBrief(brief): ExplainabilityRecord`
- `fromOutcome(outcome, decision): ExplainabilityRecord`

Adapters are pure (no I/O). Callers fetch source records with existing hooks
and pass them in.

---

## 4. `ExplainabilityRecord` Shape

```ts
interface ExplainabilityRecord {
  source: {
    kind: "advisory" | "decision" | "boardroom" | "brief" | "outcome";
    id: string;
    title: string;
  };
  why: string[] | null;                 // deterministic bullets
  evidence: {
    dualLayer?: DualLayerEvidence | null;  // existing shape
    sources?: Array<{ label: string; value: string }>;
  } | null;
  confidence: {
    value: number | null;               // 0–100, already capped
    meta?: ConfidenceObject | null;     // existing shape
    iq?: { orgId: string; datasetId?: string | null } | null;
  } | null;
  alternatives: Array<{ label: string; rationale?: string }> | null;
  risks: Array<{ label: string; severity?: "low" | "moderate" | "high" }> | null;
  expectedImpact: {
    summary?: string | null;
    projectedChange?: { metric: string; delta: number; unit?: string } | null;
  } | null;
}
```

Any `null` field renders `Not Available`. Empty arrays also render
`Not Available`.

---

## 5. Mapping to Existing Components

| Section | Existing source | Adapter source field |
|---|---|---|
| Why This Matters | Composed bullets (deterministic) | `advisory.rationale` split, decision rationale, brief lede |
| Evidence | `DualLayerEvidencePanel` + extra rows | `advisory.{client,internal,combined}_*`, `source_evidence`, `evidence_sources` |
| Confidence | `ConfidenceBadge` + `IQScoreBadge` + trust snapshots | `capped_confidence`, `confidence_cap_reason`, `data_quality_index`, `variance_score` |
| Alternatives | Advisory playbook alternatives / decision rules | `advisory.playbook_steps`, `decision_rules` |
| Risks | Governance thresholds + risk signals | `governance_thresholds`, `executive_risk_index`, advisory category |
| Expected Impact | Advisory + decision projections | `advisory.expected_impact`, `advisory.impact_score`, `decision_outcomes.expected_change` |

The graph-specific `WhyThisMattersPanel` (operational graph nodes) is
**not** replaced; it remains the source for graph node pages, which can
embed `ExplainabilityPanel` alongside it.

`DecisionEvidencePanel` (full decision trace with tabs) is **not** replaced;
it remains the deep-dive view for `/decisions/:id`. `ExplainabilityPanel` is
the at-a-glance contract used everywhere else.

---

## 6. Migration Matrix

| Surface | Current component | Replacement | Status |
|---|---|---|---|
| Advisory cards (dashboard, /advisories) | inline confidence + rationale text | `<ExplainabilityPanel variant="compact" record={fromAdvisory(a)} />` | Replace |
| Decision card preview (in queues) | scattered badges | `<ExplainabilityPanel variant="compact" record={fromDecision(d)} />` | Replace |
| `/decisions/:id` full page | `DecisionEvidencePanel` | **Keep** `DecisionEvidencePanel` + add `<ExplainabilityPanel>` above it | Augment |
| AI Boardroom item | inline perspective text | `<ExplainabilityPanel record={fromBoardroomItem(item)} />` | Replace |
| Executive Brief item | varies | `<ExplainabilityPanel variant="compact" record={fromExecutiveBrief(b)} />` | Replace |
| Outcome detail | inline outcome stats | `<ExplainabilityPanel record={fromOutcome(o, d)} />` | Replace |
| Operational graph node | `WhyThisMattersPanel` | **Keep** + embed `<ExplainabilityPanel>` underneath | Augment |
| Dual-layer evidence (standalone) | `DualLayerEvidencePanel` | **Keep** as Evidence-section internal | Reused |

No component is deleted in Phase 6. Replacements happen incrementally in the
later phases that touch each surface (Command Center, Decision Logging,
Boardroom Lenses).

---

## 7. Success Criteria

When Phase 6 ships:

1. Opening any recommendation, decision, boardroom item, brief, or outcome
   shows the **same six sections** in the **same order** with the **same
   labels**.
2. Missing data renders `Not Available` — never a hallucinated value.
3. No new tables, no new edge functions, no new reasoning code.
4. All six adapter functions have unit-test-shaped pure signatures and can
   be exercised without Supabase calls.

This consistency is the deliverable. Net-new intelligence is **not** in
scope.
