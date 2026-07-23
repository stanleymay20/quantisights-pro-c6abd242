---
name: Explainability Panel Contract
description: Phase 6 locked contract — six-section ExplainabilityPanel composition over existing evidence components
type: feature
---
Phase 6 ships a single reusable `<ExplainabilityPanel>` at `src/components/explainability/`. Strict composition over existing components — no new reasoning, no LLM prose.

**Six sections, fixed order, fixed labels (`ExplainabilitySection`):**
1. Why This Matters
2. Evidence
3. Confidence
4. Alternatives Considered
5. Risks & Tradeoffs
6. Expected Impact

**Hard rules:**
- Missing data renders literal `"Not Available"` via `NOT_AVAILABLE` constant. Empty arrays count as missing (`hasExplainabilityContent`).
- No raw JSON, no LLM-generated text, no synthetic confidence.
- Confidence comes from `capped_confidence` / `enriched_confidence` / `calibration_models` only — never invented client-side. 0.85 cap respected.
- "Label: value" format inside sections.

**Adapters (pure, no I/O)** in `explainability-adapter.ts`:
`fromAdvisory`, `fromDecision`, `fromOutcome`, `fromExecutiveBrief`, `fromBoardroomItem` → `ExplainabilityRecord`.

**Reused components (never duplicated):**
- `DualLayerEvidencePanel` → Evidence section body
- `ConfidenceBadge` + `IQScoreBadge` → Confidence section
- Graph-specific `WhyThisMattersPanel` is NOT replaced (graph node pages embed both)
- `DecisionEvidencePanel` (full trace) is NOT replaced — `/decisions/:id` keeps it and adds `ExplainabilityPanel` above

**Contract doc:** `.lovable/phase-6-explainability-contract.md` (migration matrix included). Each later phase that touches a surface (Command Center, Decision Logging, Boardroom Lenses) is responsible for swapping in `ExplainabilityPanel` per the matrix.
