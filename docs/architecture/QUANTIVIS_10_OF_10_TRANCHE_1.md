# Quantivis 10/10 — Tranche 1: Governed Enterprise Action Loop

## Objective

Quantivis already has strong decision governance, evidence, forecasting, simulation, and execution tracking. The first 10/10 tranche is deliberately narrower: introduce a truthful, auditable contract for turning an approved Quantivis decision into an external enterprise action without pretending unsupported connector write paths already exist.

## Non-negotiable invariants

1. **No implicit autonomy.** External actions default to `dry_run` / approval-required. A caller cannot bypass approval by calling a connector directly through the governed path.
2. **Tenant authority is server-derived.** The authenticated user must be an active member of the organization that owns both the decision and connector.
3. **Approved decision required.** An external action must reference an approved `decision_ledger` record unless the connector policy explicitly allows a reversible pre-approved class in a later release.
4. **Connector capability is explicit.** Read-only connectors are never treated as write-capable. Unsupported actions fail closed.
5. **Idempotency is mandatory.** Every action request carries an idempotency key unique within the organization/connector/action boundary.
6. **Receipts, not claims.** A successful external action must return and persist a provider receipt/identifier or an explicit verifiable response digest. No UI may report success before that receipt exists.
7. **Audit every state transition.** Requested, approval-gated, attempted, succeeded, failed, and compensated states are append-only audit events.
8. **No secret leakage.** Raw connector credentials, bearer tokens, provider response bodies containing secrets, and service-role credentials never enter browser-visible payloads or logs.
9. **Compensation-aware.** Action definitions declare whether reversal is supported and, when supported, the compensating action contract.
10. **Unknown stays unknown.** If provider state cannot be verified, Quantivis records `unknown`, never `succeeded`.

## Initial capability levels

- `observe`: ingest/read only.
- `recommend`: Quantivis may propose an action but cannot execute it.
- `approve_execute`: a human-approved decision may execute through a supported write adapter.
- `bounded_autonomy`: reserved for a later release and only for explicitly pre-approved reversible action classes.

All current connector types remain `observe` or `recommend` until a connector-specific write adapter has exact-head tests and staging proof.

## Canonical action request

```ts
type GovernedActionRequest = {
  organization_id: string;
  decision_id: string;
  connector_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  dry_run?: boolean; // defaults true
};
```

The server must derive user identity from the verified JWT and must re-read organization, decision, membership, connector, and connector policy state before any provider call.

## Canonical result

```ts
type GovernedActionResult = {
  status: "dry_run" | "approval_required" | "executed" | "failed" | "unknown";
  action_id: string;
  provider_receipt_id?: string;
  response_digest?: string;
  reversible: boolean;
  verified_at?: string;
};
```

## GA acceptance for this tranche

This tranche is complete only when one real connector write path proves, on staging, the full immutable chain:

`approved decision -> governed action request -> provider write -> provider receipt -> Quantivis persisted receipt -> audit event -> follow-up provider verification -> evidence pack linkage`.

Until that exists, Quantivis must present the action layer as **governed execution infrastructure under implementation**, not as broad autonomous enterprise write-back.

## Next implementation slices

1. Add the server-side action contract and capability registry.
2. Add persistence for action request/status/receipt/idempotency and append-only audit events.
3. Implement one reversible pilot adapter (recommended first target: a low-risk CRM task/update action, not a financial or destructive ERP transaction).
4. Add exact-head unit/security tests.
5. Validate migration and RLS on Quantivis staging.
6. Run a real provider sandbox/staging action and verify the receipt round-trip.
7. Only then expose the action in the Execution Command Center.

Tracked by issue #63.
