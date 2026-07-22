# Quantivis Release Gate

Two-tier verification policy. **No production publish proceeds unless every tier passes.**

## Tier 1 — Normal CI (every commit / PR)

```bash
npm run test        # full vitest suite (unit + integration + light certification)
npm run lint
npm run build
```

The default `vitest run` already executes `src/lib/certification/certification.test.ts`
in fast mode (scaled-down Manufacturing slices: 5k / 25k rows). This catches
regressions in correctness, governance, schema evolution, PII, and industry
classification on every commit without blowing the CI budget.

## Tier 2 — Release Gate (pre-publish only)

```bash
npm run release-gate
```

Equivalent to:

```bash
npm run test          # unit + integration + light certification
npm run certify:full  # QV_CERTIFY_FULL=1 — 100k / 500k / 1M Manufacturing rows
npm run build         # production bundle must compile
```

`certify:full` writes the official markdown report to
`/mnt/documents/quantivis-certification-report.md`. Overall Status **must be
`PASS`** for the release to proceed.

### Pass criteria (enforced by the harness)

| Check | Rule |
|-------|------|
| Performance | 100k < 30s, 500k < 60s, 1M < 120s parse budget |
| Memory regression | ≤ 15% over recorded baseline |
| Industry classification | ≥ 95% accuracy across all packs |
| PII detection | All expected columns flagged, level == `high` for HR pack |
| Schema evolution | Drift report must capture every add/remove/rename; confidence ≤ 0.95 |
| Governance | `datasets`, `dataset_versions`, `schema_evolution_log`, `audit_log`, `data_lineage`, `pipeline_runs` payloads correctly scoped by `organization_id` + `dataset_id` |
| Build | `vite build` succeeds with no type errors |

### Failure handling

If `release-gate` fails:

1. Inspect `/mnt/documents/quantivis-certification-report.md` for the failing pack.
2. Fix the underlying ingestion / governance code — **never weaken the harness
   to make the gate pass**.
3. Re-run `npm run release-gate` until Overall Status is `PASS`.

## Convention

- `certify` (fast) — what developers run locally before pushing.
- `certify:full` (heavy) — what release engineers run before publishing.
- `release-gate` — the single command CI must run before promoting a build
  to production.

Ontology freeze note: the gate only **observes** ingestion behaviour. No new
node types, edges, pressure dimensions, or reasoning layers may be introduced
to make a failing certification pass.
