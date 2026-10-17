# Quantivis 10/10 Hardening — Tranche 4: Source-Persisted Reconciliation Evidence

Date: 2026-10-17

## Objective

Strengthen governed reconciliation so an ambiguous provider observation and the later human resolution form two separate, independently verifiable evidence records.

Tranche 1 made the original provider observation immutable and SHA-256 fingerprinted. Tranche 2 included execution truth in the Decision Evidence Pack. Tranche 3 captured real provider-native references when providers actually returned them. Tranche 4 now moves reconciliation integrity to the source transaction itself rather than relying only on an Evidence-Pack-derived fingerprint.

## Invariant

A later reconciliation must never rewrite what the provider originally returned.

For an execution receipt that was originally observed as `uncertain`:

1. the Tranche 1 `provider_evidence_digest` continues to attest the original provider/transport observation;
2. the governed reconciliation RPC persists a separate `reconciliation_evidence_material` and `reconciliation_evidence_digest`;
3. the reconciliation envelope binds itself to the original `provider_evidence_digest`;
4. the Evidence Pack independently re-hashes the persisted reconciliation material and cross-checks its parsed fields against the current receipt projection; and
5. compensation remains a separate lifecycle object and does not rewrite either evidence record.

## Persisted reconciliation evidence

`execution_action_receipts` gains three nullable fields:

- `reconciliation_evidence_version`
- `reconciliation_evidence_material`
- `reconciliation_evidence_digest`

They are all-or-none. Version `v1` is the only accepted version in this tranche. The digest is lowercase SHA-256 hex. The exact text material is retained so verifiers hash the same bytes that the database hashed instead of attempting to reproduce PostgreSQL JSON text serialization in another runtime.

The source material includes:

- evidence version;
- receipt ID;
- original provider evidence digest, when one exists;
- reconciliation timestamp;
- reconciler user ID;
- final resolution (`succeeded` or `failed`);
- reviewed reconciliation note; and
- bounded external reference.

The database hashes the exact persisted material atomically in the same transaction that resolves the `uncertain` receipt.

## SECURITY DEFINER boundary

The reconciliation and receipt-read RPCs remain `SECURITY DEFINER`, but they are pinned to an empty `search_path` and use fully qualified application relations. The reconciliation RPC still requires:

- an authenticated caller;
- membership in the target organization;
- `owner` or `admin` role;
- an existing receipt in that organization;
- current receipt status `uncertain`;
- a resolution of only `succeeded` or `failed`;
- a bounded non-trivial reconciliation note; and
- a bounded external reference.

`PUBLIC` and `anon` execution remain revoked. The internal trigger helper also has direct client execution revoked.

## pgcrypto handling

The migration does not create or relocate `pgcrypto`. Quantivis already enables it in earlier schema history.

Because extension schemas can differ between environments, the reconciliation RPC resolves the installed `pgcrypto` schema from `pg_catalog.pg_extension` / `pg_catalog.pg_namespace`, then calls the resolved `digest(..., 'sha256')` function through dynamic SQL. The function does not trust a mutable application `search_path` to find the extension.

## Immutability

Once `reconciliation_evidence_digest` exists, a trigger prevents later mutation of:

- reconciliation evidence version;
- reconciliation evidence material;
- reconciliation evidence digest;
- reconciled timestamp;
- reconciler identity;
- reconciliation note;
- external reference; and
- resolved receipt status.

This intentionally does not fold compensation into reconciliation. Compensation remains separately governed and auditable.

## Server-owned reconciliation metadata

The reconciliation RPC also appends a convenience `response_metadata.reconciliation` block for operational readers. That block is **not** part of the original provider observation.

The canonical executor now treats top-level `reconciliation` as server-owned metadata, just like the `provider_evidence_*` namespace. Adapter-supplied reconciliation metadata is stripped before provider hashing and persistence.

The Evidence Pack likewise removes the server-owned `reconciliation` block before re-computing the original provider digest. This fixes a real false-tamper edge case in which a legitimate later reconciliation could otherwise make a valid original provider digest appear mismatched.

## Evidence Pack verification

For each reconciled receipt, the Evidence Pack now distinguishes:

- `verified` — persisted source material hashes to the stored reconciliation digest **and** every attested field semantically matches the receipt projection;
- `mismatch` — digest bytes or attested receipt semantics do not match; or
- `not_recorded` — a legacy reconciliation predates source-persisted evidence.

A source reconciliation mismatch forces Runtime & Execution Evidence to `partial`. A legacy reconciliation without source evidence is also `partial`; Quantivis does not retroactively invent attestation that never existed.

The previous deterministic Evidence-Pack-derived reconciliation fingerprint remains as a secondary export-integrity value, but is no longer presented as the primary source attestation.

## Tenant boundary

The underlying `execution_action_receipts` table remains service-role-only. The browser continues to use the existing tenant-checking `list_execution_action_receipts(organization_id, decision_id)` RPC.

The RPC projection adds only the reconciliation evidence fields needed for independent verification and continues to exclude idempotency keys and request fingerprints.

## Security / non-scope

This tranche does not:

- create a new execution endpoint;
- re-dispatch an uncertain action;
- change outbound provider behavior;
- weaken idempotency, retry, authorization or destination controls;
- expose service-role credentials;
- open direct browser access to execution receipt tables;
- create autonomous reconciliation;
- deploy production; or
- establish GA/10/10 readiness by itself.

## Required verification

Before merge:

1. exact-head CI passes;
2. merge compatibility against current `main` passes;
3. lint, application typecheck, strict trusted-kernel typecheck and privileged Edge/Deno checks pass;
4. execution receipt, reconciliation, and Evidence Pack regression tests pass;
5. security configuration checks pass;
6. production frontend build passes;
7. dependency audit remains clean at the enforced threshold;
8. the migration receives staging/database execution validation before any production application; and
9. merged-main CI passes again before the next tranche begins.

## Next controlled slice

After this tranche is code-proven and database/staging validated:

1. select one low-risk CRM provider/action already adjacent to Quantivis architecture;
2. implement the write only through `execute-decision-action`;
3. prove sandbox/staging write → durable receipt → provider-native reference → provider read-back verification;
4. link post-write verification and compensation evidence into the Decision Evidence Pack; and
5. only then consider expanding governed write capability.
