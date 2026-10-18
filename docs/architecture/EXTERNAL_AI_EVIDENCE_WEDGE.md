# External AI Evidence Wedge

Status: implemented on draft PR #59; merge is blocked until exact-head CI and forensic review pass.

## Product boundary

Quantivis is the vendor-neutral evidence and governance layer around AI decisions. It does not need to replace the customer's model, agent, Claude, ChatGPT, Gemini, rules engine, or internal workflow.

The implemented path is:

`external AI system → registered AI identity → machine credential → strict decision intake → append-only producer evidence → decision_ledger pending record → audit trail → existing governance/execution/outcome flow → external-AI Evidence Pack`

No existing Keep/Freeze/Cut function was removed in this change.

## Architecture decision

External producer provenance is **not** stored as mutable columns on `decision_ledger`.

Instead:

- `ai_systems` is the organization-scoped producer registry.
- `ai_system_credentials` stores only one-way SHA-256 token digests and is service-role only.
- `external_ai_decision_evidence` is append-only producer/event provenance.
- `decision_ledger` remains the canonical, evolving Quantivis governance record.
- `ingest_external_ai_decision(...)` writes ledger + evidence + audit atomically.

This separation is intentional: producer identity, model version, event time and integrity hashes are historical facts; approval, execution and outcome state can evolve after ingest.

## AI-system registry

`supabase/functions/ai-system-registry/index.ts`

Admin/owner-authenticated actions:

- `create_system` — creates the registry entry and issues the first machine credential.
- `rotate_credential` — generates a replacement token, then calls the service-role-only `rotate_ai_system_credential(...)` transaction. The database row-locks the AI system, revokes every currently active credential, inserts the replacement, and writes the rotation audit event atomically.
- `revoke_credential` — invalidates a credential.

The raw `qv_ai_...` token is returned only when it is issued. The database stores `sha256:<digest>` plus a non-secret prefix for identification.

Concurrent rotations for the same AI system serialize on the `ai_systems` row. The later committed rotation becomes the sole active credential rather than allowing two simultaneous requests to leave two valid tokens behind.

Registry metadata includes organization, name, provider, system/model identifier, version, system type, deployment environment, purpose, human owner, lifecycle state, optional customer-provided risk classification, and optional external identifier.

Quantivis deliberately does **not** infer a regulatory risk class.

### Data API boundary

The browser/Data API is intentionally read-only for this wedge:

- authenticated organization members may `SELECT` their `ai_systems` registry rows through tenant RLS;
- authenticated organization members may `SELECT` their `external_ai_decision_evidence` rows through tenant RLS;
- authenticated and anonymous clients receive no direct INSERT/UPDATE/DELETE grants for registry, credential, or evidence tables;
- credential-digest rows are never exposed to authenticated/anonymous clients;
- service-role grants are explicit for the audited Edge/RPC paths.

This prevents an admin client from bypassing `ai-system-registry` to create or mutate an unaudited AI-system record. The grants are explicit rather than relying on implicit public-schema Data API exposure.

## External decision intake

Endpoint implementation:

`supabase/functions/external-ai-decision-ingest/index.ts`

Protocol:

`quantivis.external-ai-decision.v1`

Authentication:

`Authorization: Bearer qv_ai_<64 lowercase hex chars>`

Example request:

```json
{
  "protocol_version": "quantivis.external-ai-decision.v1",
  "external_event_id": "decision-evt-123",
  "occurred_at": "2026-10-07T12:00:00.000Z",
  "input_hash": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  "output_hash": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  "decision": {
    "action": "hold_supplier_payment",
    "reason": "risk threshold exceeded"
  },
  "confidence": 0.91,
  "human_oversight_state": "required",
  "metadata": {
    "workflow": "supplier_payment"
  },
  "provenance": {
    "trace_id": "trace-123"
  },
  "idempotency_key": "customer-event-123"
}
```

The caller may **not** send `organization_id`, `ai_system_id`, or `credential_id`. Quantivis derives all three from the machine credential.

Raw prompts, raw inputs, tool arguments, and raw outputs are not required. Customers can retain sensitive content themselves while Quantivis records cryptographic integrity references.

## Validation and replay behavior

The intake contract:

- accepts only the documented top-level fields;
- requires an exact supported protocol version;
- validates timestamps, normalized confidence, object sizes and identifier lengths;
- normalizes SHA-256 references to `sha256:<64 lowercase hex>`;
- rejects malformed hashes;
- hashes the canonical validated payload;
- limits request size;
- rejects tenant/system identity in the body;
- rejects inactive/expired/revoked credentials and inactive systems.

Two independent replay identities are enforced:

1. `(organization, ai_system, idempotency_key)`
2. `(organization, ai_system, external_event_id)`

Same identity + same canonical payload returns the original decision/evidence IDs as an idempotent replay.

Same identity + different payload fails with HTTP 409 and never overwrites the original evidence.

Concurrent retries are serialized before the replay lookup, so simultaneous copies of the same accepted event converge on one evidence record rather than racing the uniqueness constraint.

## Governance boundary

Every newly ingested external AI event creates a normal `decision_ledger` row with:

- `decision_type = 'external_ai'`
- `decision_status = 'pending'`
- `execution_status = 'not_started'`

External AI output therefore cannot arrive as `approved` or `executable`.

Existing Quantivis approval and `execute-decision-action` controls remain the authority for any governed outbound side effect.

The external protocol represents confidence in normalized `[0,1]` form. The immutable evidence keeps that normalized value; a narrow insert trigger converts the derived ledger projection to Quantivis's existing `[0,100]` display convention.

## Append-only evidence

`external_ai_decision_evidence` contains:

- producer/system snapshot;
- model/deployment version;
- external event ID;
- event time and ingestion time separately;
- input/output SHA-256 references;
- canonical payload hash;
- decision descriptor;
- confidence and human-oversight state;
- safe metadata/provenance;
- protocol version;
- the linked Quantivis decision.

RLS allows organization members to read their evidence. There are no client insert/update/delete policies. A database trigger rejects normal UPDATE and DELETE so the producer record cannot silently drift after acceptance.

The only evidence deletion exception is organization erasure. A database trigger on the owning organization deletes the external-AI subtree in dependency order inside the same PostgreSQL transaction. The evidence mutation guard accepts deletion only while that exact organization-erasure transaction is active. If the parent organization deletion rolls back, the evidence cleanup rolls back with it.

This exception does not make ordinary service-role deletion legal and does not weaken append-only behavior during normal operation.

## Privileged database functions

The ingest, credential-rotation, and organization-erasure functions are privileged database boundaries. They:

- use `SECURITY DEFINER` only where elevated access is required;
- use an empty `search_path` and schema-qualified relations;
- revoke execution from `PUBLIC`, `anon`, and `authenticated` where callable;
- grant execution only to `service_role` for the machine-ingest and rotation RPCs.

## Evidence Pack extension

The existing `quantivis.evidence-pack.v2` schema remains unchanged for compatibility.

`src/lib/external-ai-evidence-pack.ts` composes that stable pack with an `External AI Provenance` section in a versioned envelope:

`quantivis.external-ai-evidence-pack.v1`

The envelope hash covers:

- the existing evidence-pack hash;
- producer identity;
- model/system version;
- external event identity;
- event and ingestion timestamps;
- input/output hashes;
- canonical payload hash;
- oversight state and provenance.

The builder fails closed if the evidence row points to a different decision or organization.

Hashes are integrity references, not proof that the underlying content is truthful. The pack explicitly states that it can support governance/regulatory obligations but is **not** a certification of legal compliance.

## AgentShield

See `AGENTSHIELD_QUANTIVIS_EVIDENCE_CONTRACT.md`.

AgentShield uses the same generic ingest protocol. `ALLOW`, `REVIEW`, and `BLOCK` are evidence-bearing policy outcomes; none receives a privileged path around Quantivis governance.

## Security/test gates

Added tests cover:

- valid payload normalization;
- malformed hash rejection;
- unsupported schema rejection;
- rejection of caller-selected tenant/system identity;
- canonical hashing stability;
- append-only/RLS/security invariants;
- organization-erasure-only evidence deletion;
- idempotency and external-event uniqueness contracts;
- serialized concurrent retry handling;
- service-role-only atomic ingest;
- one-way credential storage;
- atomic, serialized credential rotation;
- explicit Data API grants and denial of direct client writes;
- empty-search-path hardening for privileged database functions;
- pending-only ledger projection;
- deterministic external evidence-pack construction;
- decision/tenant mismatch fail-closed behavior;
- evidence-pack integrity changes when immutable producer evidence changes;
- explicit evidentiary/compliance limitations.

## Destructive cleanup gate

The 44 Claude-labelled `Cut` functions and 44 `Freeze` functions remain untouched.

No destructive cleanup should begin until:

1. this vertical slice passes exact-head CI;
2. database migration behavior is validated in a safe environment;
3. a real registered AI system can ingest a decision and reproduce the external-AI Evidence Pack;
4. the complete 127-function triage is available for forensic review.
