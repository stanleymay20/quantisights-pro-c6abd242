# Quantivis 10/10 Execution Plan

This plan turns Quantivis from a powerful early product into a focused enterprise-grade AI Decision Governance platform.

## North Star

Quantivis must be immediately understood as:

> Enterprise AI Decision Governance: every AI recommendation, every human approval, every business outcome, automatically tracked and audited.

The product should not feel like a general AI dashboard. It should feel like the system of record for AI-assisted business decisions.

---

## Phase 1 — Category Clarity

Goal: make every page reinforce one category: AI Decision Governance.

### Implement

- Replace broad AI-platform language with decision-governance language.
- Reduce visible feature overload on first screens.
- Prioritize Recommendation → Decision → Outcome → Governance loop.
- Replace engineering metrics with business trust metrics where possible.
- Ensure homepage, dashboard, Decision Ledger, Trust Center, and pitch materials use the same vocabulary.

### Done when

A first-time visitor can explain Quantivis in one sentence after 10 seconds.

---

## Phase 2 — Landing Page Conversion

Goal: make the public site sell one clear enterprise outcome.

### Implement

- Hero: one sharp value proposition.
- CTA: one primary action — Request Demo.
- Mobile-first layout and touch-friendly forms.
- Replace technical proof such as route counts or migration counts with buyer-facing proof.
- Add screenshots of Decision Brief, Decision Ledger, and Trust Center.
- Add concise buyer sections for COO, Compliance, Risk, and Operations.

### Done when

A COO or professor can understand the value without reading the full page.

---

## Phase 3 — Executive Workspace

Goal: make the dashboard feel like a daily decision command center.

### Implement

- Default dashboard should open with Today’s Decision Brief.
- First card answers: what needs attention, why it matters, what action to take.
- Reduce widget clutter.
- Add strong empty states.
- Make pending decisions, evidence, and approval trail the main workflow.

### Done when

The dashboard feels like a CEO/COO operating cockpit, not a generic analytics dashboard.

---

## Phase 4 — Decision Ledger Excellence

Goal: make `/decisions` the core product surface.

### Implement

- Decision title, owner, confidence, evidence strength, risk, status, and outcome.
- Evidence trail and approval history visible in one click.
- Exportable audit trail.
- Outcome tracking and calibration feedback.
- Clear empty state and sample data isolation.

### Done when

The Decision Ledger can be shown to an enterprise buyer as the main product demo.

---

## Phase 5 — Trust Center and Compliance

Goal: make governance credible to enterprise procurement.

### Implement

- Replace 0% metrics with Not Configured / Awaiting Data where appropriate.
- Prioritize Audit Coverage, Explainability, Traceability, RLS, MFA, and Data Residency.
- Add Security Center: MFA status, recent logins, active sessions, domain controls.
- Add downloadable procurement pack, DPA/AVV, subprocessors, and security overview.

### Done when

A compliance officer can understand what is governed, what is configured, and what remains pending.

---

## Phase 6 — Auth and Tenant Security

Goal: enterprise-ready access control.

### Implement

- Admin MFA enforcement.
- Step-up auth for sensitive areas.
- Auth event audit log.
- Strong demo isolation.
- Branded OAuth when BYOK is ready.
- SSO-ready placeholders for Enterprise tier.

### Done when

No real user can accidentally enter demo state, demo data cannot affect real organizations, and sensitive actions are logged.

---

## Phase 7 — Page-by-Page Craft

Goal: remove AI-generated feel across the app.

### Implement per page

- Loading skeletons.
- Premium empty states.
- Clear error states.
- Consistent heading hierarchy.
- Accessible labels.
- Reduced buzzwords.
- Clear primary action per page.

Priority order:

1. `/executive-intelligence`
2. `/trust-center`
3. `/decisions`
4. `/board-report`
5. `/team`
6. `/settings/security`
7. `/data-upload`
8. `/reports`

---

## Phase 8 — Customer Validation Layer

Goal: make the product commercially credible.

### Implement

- Demo request flow tracking.
- Discovery interview capture.
- LOI status tracker.
- Pipeline board for pilot prospects.
- Customer validation evidence export for EXIST.

### Done when

Quantivis can show customer interest, pilot discussions, and validation evidence directly inside the platform.

---

## Phase 9 — AI Cost and Model Routing

Goal: reduce AI spend without reducing enterprise quality.

### Implement

- AI router: local/open-source for low-risk tasks, premium model for executive/compliance outputs.
- Cache repeated generations.
- Usage budgets by organization.
- Model selection audit log.
- RAG before model fine-tuning.

### Done when

The app can explain why a model was used, how much it cost, and whether a cheaper model was suitable.

---

## Phase 10 — Enterprise Readiness Score

Goal: make readiness measurable.

### Implement

Create an internal Enterprise Readiness Score from:

- Auth/security maturity
- Governance coverage
- Evidence coverage
- UX completeness
- Reliability
- Customer validation
- Compliance documentation

### Done when

Quantivis can show its own readiness score, just as it scores customer decision governance.

---

## Immediate next commits

1. Homepage category clarity and buyer-facing proof.
2. Executive Intelligence polish.
3. Trust Center 0% metric handling.
4. Security Center / auth audit polish.
5. Customer validation tracker.
