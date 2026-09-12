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

Status: **historical feature/research snapshot — preserve; not a disposable duplicate**.

Evidence is mixed:

- The July 2026 audit fix commit `28a6a08b80cebbe9a3250e2781eb6e743d1fdd37` is directly reachable from the canonical repository, proving that at least part of this branch was integrated.
- The later homepage live-trust commit `7a4948edf2f6c5d80a0f6f72580064377493efef` is **not** reachable from the canonical repository.
- The structured-ingestion Phase 2 design/migration proposal commit `74366d7b3eccee8633701e0ed658d76e0a17cfae` is **not** reachable from the canonical repository.

Those later branch-only commits include research/design work that should not be silently discarded. In particular, the Phase 2 persistence migration was explicitly a proposal and was not applied to a production database; its value is architectural/research evidence, not proof that canonical production schema should receive it unchanged.

## Consolidation rule

Do not merge repositories merely to make the repository count smaller.

Before archiving or deleting any Quantivis predecessor/snapshot:

1. confirm all unique production-worthy code has either been superseded or deliberately migrated;
2. preserve controlled migrations, audit evidence, research/design documents and rollback artifacts that remain useful;
3. do not re-apply historical database proposals to the canonical backend without a fresh schema review;
4. keep repository status language honest: canonical lineage does not imply every historical experiment was merged.

## Current family decision

- `quantisights-pro-c6abd242` — **CANONICAL**.
- `quantisights-pro` — **HISTORICAL PREDECESSOR / SUPERSEDED**.
- `quantisights-pro-e4e7e290` — **HISTORICAL SNAPSHOT / SUPERSEDED FOR DEVELOPMENT**.
- `quantisights-pro-ff2bbabf` — **HISTORICAL FEATURE/RESEARCH SNAPSHOT / PRESERVE UNTIL UNIQUE-WORK REVIEW CLOSES**.

This resolves the canonical repository identity while intentionally leaving the `ff2bbabf` unique-work preservation gate open.