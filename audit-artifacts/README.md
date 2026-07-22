# audit-artifacts (Enterprise Evidence)

This directory holds evidence produced by `tests/evidence/run-all.mjs`.

Layout:

```
audit-artifacts/
  YYYY-MM-DD/
    <pipeline>/
      evidence.json    canonical record (schema in tests/evidence/lib/artifact.mjs)
      logs             per-pipeline logs
      screenshots      Playwright captures
      timings          performance measurements
      summary          human-readable summary
    RELEASE_GATE.md    gate roll-up for the day (produced at release time)
  baselines/
    performance-baseline.json   see docs/enterprise/PERFORMANCE_BUDGETS.md
```

Rules:

- Never overwrite a prior day.
- Never commit evidence for production runs — production is not a valid target.
- Retention follows the compliance policy in `docs/security-controls-evidence.md`.
