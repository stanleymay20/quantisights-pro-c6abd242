# ST-1 — Enterprise Scenario Template Framework

## Purpose

A Scenario Template answers one question: **"what business problem is Quantivis solving?"**

It is not a mock decision, and it does not execute anything. It is a structured enterprise playbook — the business context, the kind of evidence involved, the decisions an executive would make, the governance required, and exactly which parts of the platform are real today. This is the enterprise onboarding and pilot framework: every enterprise decision should begin from a template like these, not a blank form.

## Architecture

```text
scenario-template-types.ts     ← ScenarioTemplate, ScenarioCapabilityUsage,
                                  ScenarioDecisionFlowStage, ScenarioReadinessLevel
        │
        ▼
scenario-template.ts            ← 6 template seeds (playbook content only)
  resolveCapabilityUsage()         resolves capability keys against the LIVE
                                    Trust Center capability matrix — never a
                                    hand-typed status
  computeScenarioReadiness()       derives readiness purely from resolved statuses
  getScenarioDecisionFlow()        the one shared 7-stage flow, statuses read
                                    from Trust Center capability + evidence data
  getScenarioTemplates()
  getScenarioTemplate(id)
        │
        ▼
components/scenarios/
  ScenarioGallery.tsx           ← renders every template, fixed order
  ScenarioCard.tsx              ← category, industry, readiness, business value, owner
  ScenarioOverview.tsx          ← the 9 Scenario Detail sections
  ScenarioReadiness.tsx         ← ScenarioReadinessBadge + ScenarioReadinessPanel
        │
        ▼
pages/
  ScenarioTemplates.tsx          /enterprise/scenarios
  ScenarioTemplateDetail.tsx     /enterprise/scenarios/:templateId
```

`scenario-template.ts` imports **only** `getCapabilityMatrix()` and `getEvidenceIntegrity()` from `trust-center.ts` — read functions, never a factory or processor from AG-1/AG-2/AG-3/RTS-1/Evidence Pack. This is enforced by a dedicated test, mirroring the equivalent guard in `trust-center.test.ts`. Trust Center itself is not modified: its capability matrix does not yet list "Scenario Templates" as `Implemented` even though this framework now exists, because updating `trust-center.ts` was explicitly out of scope for ST-1 (see Outstanding roadmap in the report).

### Route placement: `/enterprise/scenarios`, not `/scenarios`

`/scenarios` is already a live, heavily-linked feature — a financial what-if scenario simulator (`src/pages/Scenarios.tsx`, with charts, forecasting, and dashboard links pointing to it). Mounting the new Scenario Template gallery at the literal `/scenarios` path would have silently broken that feature for every existing link. Following the same precedent set for `/trust` vs. `/enterprise/trust` in TC-1, this framework is mounted at `/enterprise/scenarios` and `/enterprise/scenarios/:templateId` instead. `src/pages/Scenarios.tsx` and its route are untouched.

## Template model

Every template has exactly 18 fields: `template_id`, `title`, `category`, `industry`, `executive_summary`, `business_problem`, `typical_signals`, `verified_facts`, `expected_decisions`, `business_impact`, `typical_risks`, `governance_requirements`, `success_metrics`, `expected_outcomes`, `estimated_time_to_decision`, `recommended_roles`, `required_capabilities`, `implementation_status`.

`required_capabilities` is a list of capability keys from the Trust Center's capability matrix (e.g. `"rts_1"`, `"connector_framework"`, `"signing"`). `implementation_status` is **computed, not authored** — `getScenarioTemplates()` resolves every required key against `getCapabilityMatrix()` at read time via `resolveCapabilityUsage()`, so a template's claimed status can never drift from what Trust Center reports, and an unrecognized capability key resolves to `"Unknown"` rather than silently disappearing.

`business_impact` is a qualitative band (`Low`/`Medium`/`High`/`Critical`) with a rationale explicitly labelled "Illustrative" — this describes the *type* of business problem the template addresses (a real, expected characteristic of that class of decision), not a fabricated live metric pulled from any customer's data. No template contains a concrete dollar figure, percentage, or precision number presented as measured.

## The six templates

| Template | Category | Readiness (as computed today) |
|---|---|---|
| Supplier Risk | Supply Chain | Ready for Demonstration |
| Inventory Shortage | Operations | Ready for Demonstration |
| Pricing Decision | Commercial | Ready for Demonstration |
| Revenue Decline | Finance | Ready for Demonstration |
| Compliance Investigation | Compliance | **Requires Additional Capability** |
| Cybersecurity Incident | Security | Ready for Demonstration |

Five templates land on "Ready for Demonstration" because every one of them depends on RTS-1 and Evidence Pack, both `Partially Implemented` today (see TC-1). **Compliance Investigation** is the one template that explicitly requires `signing` — cryptographic, tamper-evident evidence for regulator/auditor defensibility — which is `Not Implemented` anywhere in the codebase (only non-cryptographic mock hashes exist). That template is therefore capped at "Requires Additional Capability," and its Known Limitations section states this plainly rather than implying the capability exists.

## Readiness model

Readiness is computed purely from the resolved statuses of a template's required capabilities — never authored by hand, never based on anything except what Trust Center currently reports:

```text
any status is "Not Implemented" or "Unknown"          → Requires Additional Capability
all statuses are "Implemented"                          → Ready for Pilot
otherwise (mix including "Partially Implemented")       → Ready for Demonstration
```

No template is hard-coded to a particular readiness tier. If a future change to `trust-center.ts` upgrades a capability from `Partially Implemented` to `Implemented`, every template that depends on it re-computes to a higher tier automatically the next time `getScenarioTemplates()` is called — there is nothing to keep in sync by hand.

## Decision Flow

Every template shares the exact same 7-stage flow — templates describe a business problem, not a bespoke pipeline, and no new runtime stage is invented here:

```text
Signal → Verified Fact → Decision Candidate → Executive Review → Evidence Pack → Outcome → Learning
```

Each stage's status is read directly from already-verified Trust Center findings:

- **Signal** ← RTS-1 capability status (`Partially Implemented`)
- **Verified Fact** ← Trust Center's Evidence Integrity "Verified facts" finding (`Not Implemented` — no `enterprise_verified_fact` table exists)
- **Decision Candidate** ← RTS-1 capability status, noting explicitly that live decisions are created manually in the Decision Ledger today, not via RTS-1's candidate-generation path
- **Executive Review** ← Executive Review capability status (`Implemented`)
- **Evidence Pack** ← Evidence Pack capability status (`Partially Implemented`)
- **Outcome** / **Learning** ← Outcome Learning capability status (`Implemented`)

## Future custom templates

The seed list (`SCENARIO_TEMPLATE_SEEDS` in `scenario-template.ts`) is a static array today. A future phase could let an organization define its own template (same 18-field shape) and persist it — the readiness/decision-flow machinery already operates on the `ScenarioTemplate` shape generically and would need no change; only a storage and authoring UI would be new work.

## Future AI-generated templates

None of ST-1 calls a model. A future phase might draft a candidate template from an organization's own decision history (e.g. summarizing a recurring `decision_type` pattern into a playbook) — but any such draft would need explicit human review and approval before being added to the gallery, exactly as this framework requires evidence and governance for every decision it describes. No such generation exists today, and none is implied by this implementation.

## Verification

```bash
npm exec vitest run src/test/scenario-template.test.ts
npm test
npm run build
git diff --check
```
