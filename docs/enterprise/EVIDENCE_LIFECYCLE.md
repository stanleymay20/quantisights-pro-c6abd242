# Enterprise Evidence — Producer / Archive / Review / Gate

This document explains the lifecycle of evidence in Quantivis.

## 1. How evidence is produced

- Each pipeline in `docs/enterprise/EVIDENCE_MATRIX.md` has a matching module
  in `tests/evidence/pipelines/<name>.mjs`.
- A pipeline module owns its own positive and negative controls. The runner
  never assumes success on a pipeline's behalf.
- Produce evidence with:

  ```bash
  npm run evidence:run              # requires EVIDENCE_ENV=staging|preview
  ```

- The runner refuses any environment that is not on the allow-list
  (`staging`, `preview`). Production is never a valid target.

## 2. How evidence is archived

- Artifacts land in `audit-artifacts/<YYYY-MM-DD>/<pipeline>/`.
- `evidence.json` is the canonical record; auxiliary files (logs,
  screenshots, timings) live in the same folder.
- In CI, the entire `audit-artifacts/<date>/` folder should be uploaded as a
  build artifact. Retention is per `docs/security-controls-evidence.md`.
- Prior days are never overwritten by the runner.

## 3. How evidence is reviewed

For each pipeline in the day's folder:

1. `status` must be `PASS`, `WARNING`, or `EXPECTED_DENIAL` (for negative
   controls). Any other value blocks the release.
2. All positive controls must be `PASS`.
3. All negative controls must be `EXPECTED_DENIAL`.
4. All files listed in `evidence_files` must exist on disk.
5. `commit_sha` must match the release-candidate SHA.
6. `environment` must be on the allow-list.

The gate roll-up at `audit-artifacts/<date>/RELEASE_GATE.md` (generated at
release time) maps pipelines to the gates in
`docs/enterprise/RELEASE_GATE.md`.

## 4. How evidence blocks releases

Blocking statuses (defined in `tests/evidence/lib/taxonomy.mjs`):

- `FRAMEWORK_INVALID`
- `API_FAILURE`
- `PERFORMANCE_FAILURE`
- `SECURITY_FAILURE`
- `CRITICAL_LEAK`
- `CRITICAL_FAILURE`

Any single blocking status on any pipeline = release halted. `WARNING` does
not block but must be acknowledged in the release ticket. `EXPECTED_DENIAL`
on a negative control is a PASS for that control.

## 5. Producer's checklist (per pipeline)

When wiring a pipeline module, ensure:

- [ ] `meta.name` matches the row in the evidence matrix.
- [ ] `meta.gate` matches the gate in `RELEASE_GATE.md`.
- [ ] Positive controls are exercised — do not stub them.
- [ ] Negative controls actually attempt the forbidden action and confirm denial.
- [ ] `evidence_files` are written under the same folder as `evidence.json`.
- [ ] No production endpoints are called.
- [ ] No real emails, charges, or SMS are triggered.
