# Quantivis Ingestion Certification Harness (Phase 7)

Permanent release gate that validates ingestion correctness, performance,
governance, lineage, schema evolution, and PII/industry classification
before any Decision Intelligence change ships.

## Layout

```
src/lib/certification/
├── generators/      Synthetic fixture generators (deterministic, seeded)
├── fixtures/        Static expected snapshots (industry, PII, schema)
├── assertions/      Reusable assertion helpers
├── benchmarks/      Performance budgets and timers
├── reports/         Markdown release-gate report writer
└── certification.test.ts   Single vitest entry — the release gate
```

## Running

```bash
# Default certification: 10k / 50k slices of the heavy packs (fast CI).
bunx vitest run src/lib/certification/certification.test.ts

# Full certification: 100k / 500k / 1M Manufacturing rows.
QV_CERTIFY_FULL=1 bunx vitest run src/lib/certification/certification.test.ts
```

The harness writes a markdown report to
`/mnt/documents/quantivis-certification-report.md` after each run.

## Release rule

No production release proceeds unless the report's **Overall Status** is `PASS`.

## Performance budgets

| Rows  | Parse budget |
|-------|--------------|
| 100k  | 30s          |
| 500k  | 60s          |
| 1M    | 120s         |

Memory regression > 15% over the recorded baseline fails the gate.

## Ontology freeze compliance

This harness only **observes** ingestion behaviour. It introduces no new
node types, edge semantics, pressure dimensions, or reasoning layers
(see core memory: ontology freeze).
