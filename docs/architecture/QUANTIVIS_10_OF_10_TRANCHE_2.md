# Quantivis 10/10 Hardening — Tranche 2: Execution Evidence in the Decision Evidence Pack

Date: 2026-10-17

## Objective

Make governed outbound execution truth part of the deterministic Enterprise Decision Evidence Pack without introducing a second execution system, weakening tenant boundaries, or changing the existing 21-section Evidence Pack schema.

This tranche builds directly on Tranche 1, where `execute-decision-action` began persisting a server-owned SHA-256 provider-observation digest in `execution_action_receipts.response_metadata`.

## Architecture decision

The existing `runtime_metadata` Evidence Pack section is extended into **Runtime & Execution Evidence**. This preserves the Evidence Pack v2 section contract while adding execution truth to the hash-covered pack.

The browser does **not** read `execution_action_receipts` directly. The table remains service-role-only. The Evidence Pack page uses the already-existing tenant-checking `list_execution_action_receipts(organization_id, decision_id)` SECURITY DEFINER RPC, which verifies authenticated organization membership before returning the bounded receipt projection.

A failed RPC read is represented as `execution_receipts_read_failed: true` and an `unavailable`/`partial` section. It is never converted to an empty receipt list. Therefore, "could not verify" cannot silently become "nothing executed."

## Provider observation verification

For each completed receipt carrying Tranche 1 evidence fields, the Evidence Pack reconstructs the immutable provider-observation envelope from:

- receipt ID;
- evidence version;
- original observed status;
- original provider/HTTP status;
- provider response metadata after removing the reserved `provider_evidence_*` namespace;
- original bounded error evidence;
- original bounded provider-native external reference.

It recomputes the canonical SHA-256 digest and compares it with `provider_evidence_digest`.

Verification states are:

- `verified` — stored and recomputed digests match;
- `mismatch` — the durable provider observation no longer matches its stored digest;
- `not_recorded` — the receipt predates the evidence contract or is still only claimed.

A digest mismatch forces the execution section to `partial` and is explicitly surfaced for investigation.

## Reconciliation evidence

Reconciliation is intentionally separate from the immutable provider observation.

If an originally `uncertain` receipt is later resolved through governed reconciliation, the pack keeps:

- the original provider-observed status and provider evidence digest; and
- the later reconciliation status, actor, timestamp, note, and external reference.

The reconciliation envelope receives its own deterministic SHA-256 fingerprint. That fingerprint is an Evidence Pack-derived integrity value, not a replacement for the server-persisted provider observation digest. Its envelope also includes the original provider evidence digest so the resolution is cryptographically bound to the observation it resolves.

## Deterministic pack hashing

After execution evidence is attached, the Evidence Pack hash is recomputed over the same canonical v2 hash contract used by the core pack builder. The execution section therefore becomes part of `evidence_pack_hash` and changes to provider evidence, reconciliation evidence, receipt ordering, or read-failure state are reflected in the pack digest.

Receipts are sorted deterministically by `created_at`, then `id`, before hashing.

## User-facing evidence

The Evidence Pack page now displays an Execution Integrity card that shows:

- action and receipt identity;
- immutable provider-observed outcome;
- current receipt status;
- HTTP/provider status;
- provider evidence verification state;
- provider evidence digest; and
- reconciliation fingerprint when reconciliation occurred.

The full structured evidence remains in the JSON Evidence Pack and is included in the pack hash.

## Security boundaries preserved

This tranche does not:

- grant client table access to `execution_action_receipts`;
- create a new execution endpoint;
- change outbound dispatch behavior;
- change secrets or credentials;
- add a database migration;
- change Supabase environments;
- deploy production;
- create new autonomous execution capability; or
- make a GA-readiness claim.

## Required verification

Before merge:

1. Exact-head CI must pass.
2. Application and trusted-kernel TypeScript checks must pass.
3. Privileged Edge/Deno checks must pass.
4. Unit tests and Evidence Framework tests must pass.
5. Security configuration verification must pass.
6. Production frontend build must pass.
7. Dependency audit must pass without suppressing findings.
8. Merge compatibility against current `main` must pass.
9. The merged `main` SHA must pass CI again before the next tranche begins.

## Next controlled slice

After this tranche is proven on merged `main`:

1. capture provider-native external references automatically for Slack/webhook adapters where safely available;
2. prove one low-risk CRM write adapter through the canonical `execute-decision-action` path;
3. perform sandbox/staging provider write + receipt + post-write read-back verification;
4. add compensation evidence to the Evidence Pack; and
5. only then consider expanding governed write capability.
