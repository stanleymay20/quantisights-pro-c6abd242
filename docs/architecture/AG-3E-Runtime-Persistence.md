# AG-3E — Enterprise Runtime Persistence

## Purpose

AG-3E defines the storage-agnostic persistence boundary for the Quantivis Runtime. It provides durable execution storage, append-only runtime event storage, immutable audit persistence, queue snapshots for crash recovery, and deterministic replay support — without binding Quantivis to Supabase, Postgres, S3, or any other backend.

This phase ships the contract, a deterministic in-memory implementation, and compile-only scaffolds for future backends. It introduces no HTTP endpoints, no database SDK imports, no connectors, no UI work, and no changes to AG-1, AG-2, RTS-1, the Decision Engine, or earlier AG-3 phases.

## Architecture

```text
Runtime (AG-3A gateway, AG-3B service, AG-3C idempotency, AG-3D queue)
        │
        ▼
RuntimePersistence            ← service created via createRuntimePersistence(config)
  hashing, sequencing, lifecycle validation, audit chaining
        │
        ▼
RuntimePersistenceAdapter     ← the only storage contract the runtime knows
        │
        ├── MemoryRuntimePersistence      (deterministic, AG-3E)
        ├── SupabaseRuntimePersistence    (scaffold, throws NotImplementedError)
        └── PostgresRuntimePersistence    (scaffold, throws NotImplementedError)
```

- **Files**: `src/lib/runtime-persistence-types.ts` (contract + zod schemas), `src/lib/runtime-persistence.ts` (service + adapters), `src/test/runtime-persistence.test.ts` (deterministic suite).
- The runtime depends **only** on `RuntimePersistenceAdapter`. Concrete adapters are injected through `RuntimePersistenceConfig`; nothing in the runtime instantiates a backend directly.
- Adapters are dumb, deterministic storage. The persistence service computes every hash, identifier, sequence number, and lifecycle decision **before** a record reaches the adapter, so all backends persist identical bytes for identical inputs.
- All identifiers (`qv-evt-*`, `qv-aud-*`, `qv-snap-*`) and hashes are derived with a canonical FNV-1a hash (`stableRuntimeHash`) over sorted-key JSON. There is no randomness anywhere in AG-3E.
- Every read path is tenant-scoped. An execution, event chain, audit chain, or snapshot belonging to `tenant-a` is invisible to `tenant-b`.

Note: AG-3A defined a small gateway-local persistence port with the same interface name inside `runtime-types.ts`. That port is untouched by AG-3E; later phases migrate the gateway onto the AG-3E contract.

## Execution record

Each execution persists:

`execution_id`, `correlation_id`, `request_hash`, `idempotency_key`, `tenant_id`, `organization_id`, `status`, `runtime_version`, `gateway_version`, `schema_version`, `created_at`, `updated_at`, `completed_at`, `metadata`, `result`, `error`, `execution_hash`.

`execution_hash` is recomputed on every write from the full record content (excluding the hash itself), so any two executions with identical content always carry identical hashes, and every state change produces a new verifiable hash.

## Execution lifecycle

```text
CREATED → RECEIVED → VALIDATED → QUEUED → PROCESSING → COMPLETED
   │           │           │         │          │
   └───────────┴───────────┴─────────┴──────────┴──→ FAILED / CANCELLED / EXPIRED
```

- Forward-only movement along the primary chain; skipping intermediate states is allowed (e.g. `CREATED → PROCESSING`), moving backwards is rejected.
- `FAILED`, `CANCELLED`, and `EXPIRED` are reachable from any non-terminal state.
- `COMPLETED`, `FAILED`, `CANCELLED`, and `EXPIRED` are terminal: no further transitions are accepted, and `completed_at` is stamped when a terminal state is first reached.

## Runtime events and replay model

Runtime events are **append-only**. Each event carries `event_id`, `execution_id`, `correlation_id`, `tenant_id`, `organization_id`, `event_type`, `sequence_number`, `timestamp`, `payload_hash`, `payload`, and `runtime_version`.

- The service assigns `sequence_number` monotonically per execution starting at 1 and derives `event_id` deterministically from `(tenant_id, execution_id, sequence_number)`.
- The adapter contract requires `listRuntimeEvents()` to return events ordered by `sequence_number` ascending; `replayEvents()` exposes this to the runtime. Replaying a completed execution therefore reproduces the exact ordered event history.
- The in-memory adapter enforces append-only storage: any append whose sequence number is not exactly `last + 1` (including re-appending an existing event) throws.

## Audit model

Audit records form an **immutable hash-linked chain per tenant**:

- Each record carries `audit_id`, `execution_id`, `tenant_id`, `organization_id`, `actor`, `action`, `resource_type`, `resource_id`, `timestamp`, `audit_hash`, `previous_audit_hash`, and `metadata`.
- `audit_hash = stableRuntimeHash({ content, previous_audit_hash })`; the first record in a chain links to `null`.
- Adapters reject any record whose `previous_audit_hash` does not match the current chain tail, so the chain cannot be forked or rewritten.
- `verifyAuditChain(tenant_id)` walks the chain and recomputes every hash, reporting `{ valid, length, broken_at }`.
- Audit records are never deleted — not even by retention cleanup.

## Queue snapshots and crash recovery

`saveQueueSnapshot()` persists a point-in-time copy of the AG-3D queue messages for a tenant, with a deterministic `snapshot_id` and `snapshot_hash` over the message set. `loadQueueSnapshot()` returns the latest snapshot (ordered by `captured_at`, tie-broken by `snapshot_id`).

Crash recovery flow (wired in a later phase): on restart, the runtime loads the latest snapshot, re-seeds the queue adapter with the captured messages, and replays runtime events past the snapshot point to reconcile in-flight executions.

## Retention and expired-execution cleanup

`deleteExpiredExecutions(now, retention_ms)` removes:

- any execution whose status is `EXPIRED`, immediately; and
- any other terminal execution once `completed_at` (falling back to `updated_at`) is older than the retention window (default 24 h).

Deleting an execution prunes its runtime event chain as retention housekeeping. Audit records are exempt: the compliance chain survives execution cleanup.

## Failure handling

Service methods never throw for storage failures. Adapter errors are captured and surfaced as result objects (`status: "FAILED"` with an `errors` array), matching the AG-3C/AG-3D result conventions. Duplicate executions, unknown executions, and invalid lifecycle transitions are reported as `REJECTED` with a reason rather than as thrown errors.

## Future SQL schema

```sql
create table runtime_executions (
  execution_id     text not null,
  tenant_id        text not null,
  organization_id  text not null,
  correlation_id   text not null,
  request_hash     text not null,
  idempotency_key  text not null,
  status           text not null,
  runtime_version  text not null,
  gateway_version  text not null,
  schema_version   text not null,
  created_at       timestamptz not null,
  updated_at       timestamptz not null,
  completed_at     timestamptz,
  metadata         jsonb not null default '{}',
  result           jsonb,
  error            jsonb,
  execution_hash   text not null,
  primary key (tenant_id, execution_id)
);

create table runtime_events (
  event_id         text not null,
  tenant_id        text not null,
  execution_id     text not null,
  correlation_id   text not null,
  organization_id  text not null,
  event_type       text not null,
  sequence_number  bigint not null,
  timestamp        timestamptz not null,
  payload_hash     text not null,
  payload          jsonb not null,
  runtime_version  text not null,
  primary key (tenant_id, execution_id, sequence_number)
);

create table runtime_audit_records (
  audit_id            text not null,
  tenant_id           text not null,
  execution_id        text not null,
  organization_id     text not null,
  actor               text not null,
  action              text not null,
  resource_type       text not null,
  resource_id         text not null,
  timestamp           timestamptz not null,
  audit_hash          text not null,
  previous_audit_hash text,
  metadata            jsonb not null default '{}',
  primary key (tenant_id, audit_hash)
);

create table runtime_queue_snapshots (
  snapshot_id      text not null,
  tenant_id        text not null,
  captured_at      timestamptz not null,
  runtime_version  text not null,
  messages         jsonb not null,
  snapshot_hash    text not null,
  primary key (tenant_id, snapshot_id)
);
```

Append-only guarantees translate to: insert-only privileges on `runtime_events` and `runtime_audit_records`, the composite sequence primary key, and a trigger (or RLS policy) asserting `previous_audit_hash` equals the current tenant chain tail.

## Future Supabase implementation

`SupabaseRuntimePersistence` (scaffolded, all methods throw `NotImplementedError`) will bind the contract to the tables above via the Supabase client, with row-level security enforcing tenant isolation (`tenant_id = auth.jwt() ->> 'tenant_id'`), insert-only policies on the event and audit tables, and a scheduled task invoking `deleteExpiredExecutions`. The client instance will be injected through its config — the runtime itself stays SDK-free.

## Future Postgres implementation

`PostgresRuntimePersistence` (scaffolded, all methods throw `NotImplementedError`) will execute the same schema over an injected connection: `insert ... on conflict do nothing` for idempotent creation, `select ... order by sequence_number` for replay, and a serializable transaction wrapping the audit chain-tail check and insert.

## Future S3 archival

Retention cleanup currently deletes expired executions and prunes their event chains. A later phase archives before deletion: serialize the execution record, its ordered event chain, and the relevant audit slice into a content-addressed object (`s3://…/{tenant_id}/{execution_id}/{execution_hash}.json`) so replay and compliance review remain possible after hot storage is pruned.

## Verification

```bash
npm exec vitest run src/test/runtime-persistence.test.ts
npm test
npm run build
git diff --check
```

The AG-3E suite covers execution creation/update/retrieval, append + replay ordering, append-only and audit-chain enforcement, queue snapshot persistence, tenant isolation, missing-execution handling, expired-execution cleanup and retention, adapter failure handling, scaffold behavior, and deterministic execution hashes.
