# Quantivis Performance Budgets (EE-1)

Every pipeline in `EVIDENCE_MATRIX.md` that has a latency dimension is
measured against a budget here. A run that exceeds budget is
`PERFORMANCE_FAILURE` (see `FAILURE_TAXONOMY` in `tests/evidence/lib/taxonomy.mjs`).

All budgets are measured on **staging or preview**, single VU unless noted.

| Surface | Metric | Budget | Notes |
|---|---|---|---|
| Page load — public route | LCP | < 2.5 s | Landing, /login |
| Page load — authenticated shell | LCP | < 3.0 s | /dashboard first paint |
| Decision creation | p95 end-to-end | < 1.5 s | POST → ledger row visible |
| AI response (mock mode) | p95 | < 800 ms | Deterministic mock |
| AI response (live, non-gated) | p95 | < 6.0 s | Measured separately, not on gate |
| Dashboard hydration | Time-to-interactive | < 4.0 s | All widgets scoped to org |
| Report generation (PDF) | p95 | < 8.0 s | Executive brief |
| Report generation (PPTX) | p95 | < 12.0 s | Board slide deck |
| Search | p95 | < 400 ms | Org-scoped search |
| Edge function (control-plane) | p95 | < 500 ms | No external calls |
| Edge function (data-plane) | p95 | < 1.5 s | With Supabase reads |
| Database query — indexed read | p95 | < 150 ms | RLS in path |
| Database query — analytical | p95 | < 2.5 s | Rollups, aggregates |
| Realtime message | Delivery lag | < 750 ms | Same-tenant broadcast |
| Data import — 100k rows | Total | < 30 s | Chunked worker |
| Data import — 1M rows | Total | < 120 s | Release-gate certify:full |

## Regression rule

A measured p95 more than **15% over the recorded baseline** is a
`PERFORMANCE_FAILURE`, even if it is under the absolute budget.
Baselines live in `audit-artifacts/baselines/performance-baseline.json`
and are updated only by an explicit release-gate run with sign-off.

## Excluded from the gate

- Live LLM latency (variable by provider).
- Third-party OAuth round-trip.
- Cold-start of edge functions after redeploy (first invocation excluded).
