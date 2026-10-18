# Quantivis — Disposable PostgreSQL proof for governed reconciliation

Date: 2026-10-18
Authority: issue #63, Tranche 4 merged main SHA `8bc1b74052f06726585b4f9f56a9019d84e75057`.

## Purpose

Tranche 4 introduced a real PostgreSQL migration, but its existing Vitest tests primarily inspected source text. This gate executes the **unchanged original migration** against a disposable PostgreSQL 17 service rather than assuming parse/behavior from string assertions. It does not connect to a hosted Supabase instance.

The workflow is `.github/workflows/reconciliation-postgres-proof.yml`. It executes, in order:

1. `tests/postgres/reconciliation-fixtures.sql`: creates minimal synthetic roles, `auth.uid()` fixture, organizational memberships, receipt/event/audit tables, and pgcrypto installed in a non-public `extensions` schema.
2. `supabase/migrations/20261017153000_add_reconciliation_source_evidence.sql`: the same checked-in migration planned for staging.
3. `tests/postgres/verify-reconciliation.sql`: functional/authorization/immutability assertions, exiting nonzero on unexpected behavior.

The test specifically rejects cross-tenant read/reconciliation, non-admin reconciliation, replay of resolved receipts, digest mismatch, post-reconciliation mutation, missing event/audit evidence, disclosure of idempotency/request fingerprints, and direct authenticated table/trigger-helper access.

## Strict boundaries

- Synthetic data only; credentials are disposable and local to the GitHub Actions PostgreSQL service.
- No Supabase project credentials, no real tokens, no external provider calls, and no remote database access.
- The fixture is a **minimal contract substitute** for earlier migrations, not the live Quantivis schema. It proves execution and select critical semantics but **does not establish end-to-end release readiness**.
- Production and staging feature flags remain off; no deployment or schema apply occurs.
- Exact-head PR proof and merged-main proof are separately required.

## Remaining release blocker

The actual Quantivis staging Supabase project is `cmnihsbdbpubznlkmjbc` (verified in repo staging config). The currently connected Supabase account cannot access it. The Tranche 4 migration must still be applied to a correctly authorized **staging** environment and exercised with real Supabase auth/RLS contracts, both positive and negative cases, source digests, and advisors before any commercial rollout or CRM writes.

Do not run these CI fixture scripts on staging or production: they create synthetic roles/tables and are destructive to any real schema with matching names.
