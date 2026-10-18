# Quantivis enterprise capability expansion — controlled supplier-risk pilot

**Status:** proposed implementation plan, NOT implemented or commercially certified  
**Date:** 2026-10-19  
**Canonical repository:** `stanleymay20/quantisights-pro-c6abd242`  
**Inspected baseline:** `d891f95aea383864c3a20df2733213b74cc05415`  
**Target:** existing Quantivis.io product; do not create a second application or replace its existing architecture.

## 1. Decision

Keep Quantivis the **trusted decision infrastructure for the AI enterprise**, not a generic chatbot, ERP, CRM, agent marketplace, or stand-alone workflow automation company.

Retain the canonical product loop:

`Trust -> Conflict -> Decide -> Govern -> Execute -> Measure -> Learn`

Build enterprise capability solutions **inside** that loop. An industry or functional module is a product *view and workflow* that reuses the same decision ledger, tenant governance, evidence provenance, action receipts, integrations, measurement and learning. Do not create disconnected per-product tenant identity, data stores, decision records, or payment ledgers.

First proposed commercial accelerator: **Supplier Decision Intelligence**, serving operations/procurement leaders at B2B distributors, manufacturers and similar firms. This is a **market hypothesis** awaiting 15–20 customer discovery interviews, verified process pain, buyer commitment and a controlled pilot agreement.

## 2. Capability map and build-vs-reuse

| Capability | Current repository evidence | Controlled next action |
|---|---|---|
| Decision intelligence | `src/pages/DecisionLedger.tsx`, `src/lib/decision-lifecycle.ts`, `src/lib/decision-recommendation.ts` | Reuse existing canonical decision lifecycle; add only necessary supplier context |
| Data quality/lineage | `src/pages/DataUpload.tsx`, `src/pages/DataLineage.tsx`, ingestion utilities | Validate source mapping/freshness/units on real sanitized examples |
| Supplier-risk signal intake | `src/lib/supplier-risk-runtime-pipeline.ts`, `supabase/functions/supplier-risk-runtime-ingest/index.ts` | Validate against actual staging database contracts and recorded provenance |
| Industrial context | `src/pages/IndustrialOperations.tsx`, `src/hooks/useIndustrialOperations.ts` | Reuse existing node/metric/template queries for grounded business context |
| Governed agent interface | `src/lib/agent-gateway.ts`, existing AG-3 interfaces | Complete documented durable adapters; do not mistake in-memory adapters for durability |
| Execution | `supabase/functions/execute-decision-action/index.ts`, `src/pages/ExecutionDashboard.tsx` | Prove approved-only execution and tenant authorization in staging |
| Receipt and reconciliation | `src/lib/evidence-pack-execution.ts`, current reconciliation migration | Prove original SQL against Supabase auth/RLS, real provider response, immutable receipt, later reconciliation |
| Reports/outcomes | `src/pages/EvidencePack.tsx`, `src/pages/Outcomes.tsx` | Verify measured outcomes and distinguish forecast/protected/realized value |
| Billing | `src/pages/Billing.tsx`, billing PR #52 (draft) | Do not promise subscriptions until successful staging + real-payment lifecycle evidence |
| Tenant/security | existing RLS, RBAC, authentication, audit, release controls | Existing tests are necessary but not sufficient for a commercial go decision |

The module naming ideas (Compass, Flow, Cash, Revenue, Ops, Edge, Brain, Customer, Knowledge, Twin, Guardian) are **marketing and information-architecture hypotheses**, not a mandate to create twelve codebases or duplicate shipped features. Consider names only after research and verified buyer comprehension.

## 3. First vertical slice: supplier decision to measurable business outcome

### 3.1 Buyer and job to be done

**Buyer:** COO / procurement or operations leader.  
**User:** authorized procurement analyst, operations manager, finance reviewer, approver.  
**Job:** Detect a materially changing supplier-delivery or quality risk, understand the evidence and uncertainty, compare viable responses, authorize a response and prove what actually happened.

Use a narrow initial business scenario:
1. An authorized data source reports a late delivery or supplier performance exception.
2. Quantivis validates field types, source identity, observation time, units and data quality.
3. Contradictory observations are displayed as conflicts; unknown values stay unknown.
4. The existing signal/decision pipeline generates a candidate only when its decision-grade prerequisites are satisfied.
5. A qualified user inspects source records, alternatives, assumptions, risk and estimated exposure.
6. Authorized approvers approve, reject or defer under the **existing** policy state machine.
7. A confirmed executable decision creates an attributable execution plan.
8. A bounded, allowlisted, idempotent external action is requested *only after approval*.
9. A provider-native reference and immutable outbound observation are recorded. Timeouts and ambiguous responses are **uncertain**, never silently successful.
10. Reconciliation checks an independent source of truth. The evidence pack verifies stored/recomputed digests.
11. An outcome owner records actual delivery and impact measures, with a distinct timestamp and provenance.
12. The original hypothesis is evaluated against realized results; model calibration and organizational learning update only on eligible observed evidence.

### 3.2 Contract boundaries

- **Identity:** derive tenant, organization, actor and role from verified authentication and persisted membership. Never trust user-provided tenant metadata as authorization.
- **Source:** require stable connector/source record identity and observed-at timestamp. Detect duplicate/replayed events durably and reject conflicts.
- **Provenance:** preserve raw observation reference, schema/version, validation result, source checksum/fingerprint, ingest time and source freshness.
- **Inference:** maintain separate categories for observed fact, association, hypothesis, forecast and causal claim. Confidence must have data-based semantics.
- **Decision:** no decision-grade promotion without required evidence, policy checks and ownership. Missing risk/exposure remains unknown; no invented ROI.
- **Action:** only existing executable state and allowed actor may initiate; return and persist explicit statuses (claimed / succeeded / failed / uncertain).
- **Connector:** signed/authorized allowlisted destination; protect from SSRF and arbitrary dynamic credential use. Never expose secret keys in clients or logs.
- **Receipt:** atomic idempotency; outbound result includes sanitized provider reference, status, attempt/HTTP information and immutable hashed observation.
- **Reconciliation:** source evidence is separate and attributable; immutable original receipt must not be overwritten. Verification failure must be surfaced.
- **Outcome:** predicted savings, capacity released, influenced revenue, avoided risk, and realized cash/economic value must not be conflated.
- **Recovery:** retry, compensation, timeouts and unknown delivery status need visible operator runbooks and no duplicate consequential action.
- **AICIS:** use only a validated forecasting/scenario contract, with explicit uncertainty and limited decision authority. No autonomous approval.

### 3.3 Customer-facing UI — reuse existing routes

Do not create a parallel navigation tree. Starting locations to audit and adapt:
- `/industrial-operations` — supplier/operational context and data quality.
- `/intelligence-inbox` — actionable incoming exception.
- `/decisions` and `/decisions/:id/room` — decision owner, evidence, conflicts, alternatives and approvals.
- `/execution` — action state, blocked/uncertain work and accountable owner.
- `/evidence-pack/:decisionId` — observed input, approval and execution-reconciliation evidence.
- `/outcomes` — recorded realized value and learning.

For the first pilot, make one clear **Supplier Risk** entry into the relevant existing journeys; add customer-facing links only after route tests demonstrate that the complete path works. No new high-level product menu is justified yet.

### 3.4 Minimal source-mapped pilot data

Use fabricated **synthetic** fixture data for development, not customer business records:

| Record | Minimum grounded fields |
|---|---|
| Supplier | organization-scoped supplier ID, human label, external system/source reference |
| Order/commitment | source record ID, supplier ID, ordered quantity, unit, committed date, currency where relevant |
| Observation | source event ID, type, observation time, source system, received time, evidence hash, data quality |
| Exception | observed delay/quality deviation, rule version, affected order references, missing-data status |
| Decision | actor, owner, policy, alternatives, evidence IDs, state and approval record |
| Execution | plan/action IDs, provider, idempotency key, raw-result fingerprint, state and reconciliation |
| Outcome | baseline, target direction, post-action actual, capture time, verifier/source, attribution limitations |

**Do not invent new physical tables** merely because this list exists; compare against the exact canonical Supabase schema first. Proposed fields are logical contracts to map onto actual models, migration versions and permissible extensions.

## 4. First customer pilot acceptance

A pilot **cannot begin** while the common GA/staging infrastructure is blocked. Once the existing runbooks' entry criteria pass, prove these end-to-end acceptance cases against one exact staging candidate:

1. Two independent organizations: one authorized, one negative-control tenant. Cross-tenant reads, writes, ingestion and action attempts are rejected.
2. Correct valid supplier event creates one canonical candidate with provenance. Replaying the source event does not duplicate a consequential decision.
3. Missing/ambiguous timestamp, missing numeric exposure and unverified source identity remain unknown; no fabricated monetary claim or decision-grade approval.
4. Conflicting supplier reports are visible with source/freshness differences and do not silently resolve themselves.
5. Policy rejection blocks execution, including direct Edge Function/API attempts with manually supplied decision IDs.
6. Authorized approval produces exactly one execution intent and durable receipt.
7. Timeout, 5xx, retry, provider success, provider duplicate and uncertain-result scenarios are each handled as defined; no false success or duplicate action.
8. Receipt and reconciliation evidence hashes independently verify. Tampered evidence is flagged; original observation cannot be mutated by reconciliation.
9. Non-owner users cannot invoke privileged reconciliation, approve restricted decisions, escalate role, or change tenant scope.
10. Customer-visible timeline accurately shows stale, missing, blocked and unknown states on desktop and mobile.
11. Actual outcomes display their measured observation window and source. Estimated impact is never rendered as realized benefit.
12. Auth, invitation, logout/recovery, logs, rate limits, backups/restore, email delivery and production deployment identity pass the existing general client-acceptance controls.

**No-GO on any missing critical proof.** Do not substitute a mocked runtime, frontend walkthrough, local PostgreSQL fixture, green CI check or a screenshot for hosted positive/negative integration evidence.

## 5. Commercial evidence and pricing test

Do not publish unverified savings claims or firm prices. Discovery and paid-pilot experiments should establish:
- Baseline exception-handling minutes per event, frequency, manual error/rework and response SLA.
- Cost of delay or missed delivery *only when sourced from real, permitted data*.
- Time to verified detection, decision, approval and action.
- Rate of valid completed actions, uncertain receipts, escalations and customer overrides.
- Realized labor/cost/value attributable to a verified process improvement, with competing explanations disclosed.
- Unit economics: AI/token consumption, integration maintenance, storage/observability and support.
- Buyer willingness to pay, implementation time, retention hypothesis and constraints on sensitive data.

Initial packaging hypothesis: **quantified pilot engagement + governed recurring access to the same platform**, with connector and integration costs transparently scoped. Test 15–20 interviews and seek 2–3 committed pilots before widening the product.

## 6. Sequence and hard release gates

**P0 — restore authority and baseline:** Follow `docs/readiness/QUANTIVIS_STAGING_RECOVERY_2026-10-19.md`. Freeze new hosted changes until the target environment and credentials are proven. Keep current AI/GA feature flags off.

**P1 — inventory and trace:** Trace the signal -> decision -> approved execution -> immutable receipt -> reconciliation -> outcome IDs and storage boundaries on the exact main SHA. Identify missing durable adapters instead of adding a new orchestration framework.

**P2 — implement minimum missing pieces:** Only after live staging authority is restored, use a controlled branch to implement a *single vertical slice*, including least privilege, migrated database contracts, observability, and tests. Do not alter other domain modules.

**P3 — certify staging:** Validate full source/hosted schema parity and all above acceptance cases; fix issues at root cause and record the exact head SHA. Keep production unchanged.

**P4 — limited customer validation:** Obtain informed customer pilot approval, instrument outcomes and incident rollback; no broad GA announcement.

**P5 — general release:** Only with complete exact-SHA CI, staging, client acceptance, recovery and production verification. PR merge and prod promotion require separately recorded review.

## 7. Anti-drift and agent handoff rules

- Do not scaffold new Quantivis apps, backends, autonomous agents, or generic business software.
- Do not create marketing claims based solely on repository presence or demo data.
- Do not bypass P0/P1 blockers to ship the proposed vertical.
- Do not alter production credentials, project access controls, databases, customer data, paid billing or deployed features without separately approved, evidenced change control.
- Preserve organization isolation, approval, evidence, RLS, CI strictness, audit and immutable action semantics.
- Every successor records **base SHA, modified paths, actual validations, exact test SHA, unresolved blockers and no-go scope**. Unknown stays unknown.
