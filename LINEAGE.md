# Quantivis Repository Lineage

This document records the repository-family evidence used to identify `quantisights-pro-c6abd242` as the maintained Quantivis lineage while preserving meaningful work from predecessor/snapshot repositories.

## Canonical repository

`stanleymay20/quantisights-pro-c6abd242`

This is the maintained Quantivis repository. New product development should target this repository unless a controlled handoff explicitly states otherwise.

## `quantisights-pro`

Status: **historical predecessor / substantive history embedded in canonical**.

Evidence:

- The March 2026 production-infrastructure/security-hardening commit `b799bbae7e3077818dad35698cbb65601581aee3` is directly reachable from the canonical repository.
- Therefore the meaningful predecessor history represented by that commit is already preserved in canonical Git history.
- The predecessor repository remains useful as lineage/reference, but should not be treated as the maintained production codebase.

## `quantisights-pro-e4e7e290`

Status: **historical snapshot / substantive May lineage embedded in canonical**.

Evidence:

- The May 2026 schema-repair commit `82e3dffad260e07ccdf58e4a9e545a9b5ce2803b` is directly reachable from the canonical repository.
- This establishes that the substantive late-May branch lineage is represented in canonical history.
- The repository may remain as historical evidence, but new development should not be added there.

## `quantisights-pro-ff2bbabf`

Status: **historical feature/research snapshot — preserve as a unique-work source; do not use for new development**.

Evidence is mixed:

- The July 2026 audit fix commit `28a6a08b80cebbe9a3250e2781eb6e743d1fdd37` is directly reachable from the canonical repository, proving that part of this branch was integrated.
- The later homepage live-trust commit `7a4948edf2f6c5d80a0f6f72580064377493efef` is **not** reachable from canonical history.
- The structured-ingestion Phase 2 design/migration proposal commit `74366d7b3eccee8633701e0ed658d76e0a17cfae` is **not** reachable from canonical history.

### Unique-work review — resolved 2026-09-12

The preservation review is now closed with two explicit decisions.

#### 1. Homepage live-trust work: preserve concept, reimplement against current canonical

The July branch replaced illustrative homepage decision/metric surfaces with real trust-snapshot data from `get_latest_trust_metrics`. The current canonical homepage still contains the illustrative `DL-2847` decision ledger, so this branch-only work has **not** been functionally superseded.

However, the old implementation must not be cherry-picked unchanged. Since that branch was created, canonical hardened `get_latest_trust_metrics` from the earlier `SECURITY DEFINER` posture to `SECURITY INVOKER` and added explicit security verification around public evidence RPCs. Any future homepage-live-metrics work must therefore be rebuilt on current canonical code and current RLS/security assumptions, with canonical tests and release gates proving the result.

Decision: **preserve the old commit as design/implementation evidence; reimplement deliberately in canonical if the live-homepage feature is prioritized. Do not merge the historical commit wholesale.**

#### 2. Phase 2 structured-ingestion persistence: preserve architecture, do not apply historical migration

Commit `74366d7b3eccee8633701e0ed658d76e0a17cfae` contains a substantial persistence architecture proposal, SQL migration and rollback artifact. Its own commit record explicitly states that the migration was **NOT APPLIED** to the real Quantivis database and was tested only against a disposable local PostgreSQL environment.

Canonical does not currently expose the proposal's named controls such as `client_attempt_key`, `dataset_field_current_mapping`, or the proposed PII `redaction_status` design. That means the work has not simply been absorbed under the same schema contract.

Decision: **preserve the design, migration and rollback artifacts as research/architecture evidence. Do not copy or apply the historical SQL to canonical. If structured-ingestion persistence is resumed, perform a fresh schema diff against the then-current canonical migrations and redesign/revalidate the proposal before any production migration.**

### Archive consequence

`quantisights-pro-ff2bbabf` is **not a safe archive candidate yet** because it remains the authoritative historical location for two unique workstreams that have not been deliberately reimplemented or retired in canonical. It may be clearly marked historical and frozen for development, but it should remain preserved until those workstreams have an explicit canonical disposition with evidence.

## Dependency audit repair provenance — 2026-09-12

PR #45 exposed five dependency advisories through the repository's fail-closed `npm audit --audit-level=moderate` gate. The repair was deliberately kept narrow instead of accepting the much broader Dependabot maintenance bundle.

Because npm 10.9.8 hit an internal Arborist `edgesOut` resolver error while attempting lockfile regeneration, a temporary one-shot workflow used npm 11.6.0 only to regenerate `package-lock.json` from a reviewed security contract. That temporary workflow then switched back to the repository's normal npm 10.9.8 for permanent validation before it was allowed to commit anything.

Permanent validation on npm 10.9.8 passed with the repaired lockfile:

- `npm ci` installed 649 packages and reported **0 vulnerabilities**;
- `@humanfs/node` resolved to `0.16.8`;
- `js-yaml` resolved to `4.3.2`;
- the `jspdf` dependency path resolved `fflate` to `0.8.3`;
- the `posthog-js` dependency path resolved `fflate` to `0.4.9`;
- `vitest` and `@vitest/mocker` resolved to `4.1.11`;
- `npm audit --audit-level=moderate` passed with **0 vulnerabilities**;
- the temporary writer removed itself after committing only the repaired lockfile and its own deletion.

This is dependency-security remediation only. It does not alter Quantivis runtime behavior, database migrations, RLS/security policy, deployment configuration, or the lineage decisions above. The ordinary PR CI at the final user-authored head remains the merge authority.

## Consolidation rule

Do not merge repositories merely to make the repository count smaller.

Before archiving or deleting any Quantivis predecessor/snapshot:

1. confirm all unique production-worthy code has either been superseded, deliberately reimplemented, or explicitly retired;
2. preserve controlled migrations, audit evidence, research/design documents and rollback artifacts that remain useful;
3. do not re-apply historical database proposals to the canonical backend without a fresh schema review;
4. keep repository status language honest: canonical lineage does not imply every historical experiment was merged.

## Current family decision

- `quantisights-pro-c6abd242` — **CANONICAL / LINEAGE RESOLVED**.
- `quantisights-pro` — **HISTORICAL PREDECESSOR / SUPERSEDED**.
- `quantisights-pro-e4e7e290` — **HISTORICAL SNAPSHOT / SUPERSEDED FOR DEVELOPMENT**.
- `quantisights-pro-ff2bbabf` — **HISTORICAL FEATURE/RESEARCH SNAPSHOT / PRESERVE / UNIQUE-WORK REVIEW RESOLVED**.

Canonical identity is resolved. The `ff2bbabf` review is also resolved: preserve it as frozen historical evidence until the live-homepage and Phase-2 persistence workstreams are deliberately reimplemented or retired in canonical; do not treat it as a disposable duplicate.