# Quantivis 10/10 — Tranche 1: Prove the Governed Action Loop

## Objective

Quantivis already has a canonical governed outbound execution path in `supabase/functions/execute-decision-action`.

Verified current capabilities include:

- execution plans linked to decisions;
- owner/admin authorization for sensitive outbound actions;
- executable-decision gating before side effects;
- approved webhook destinations and SSRF protections;
- Slack and HTTPS webhook dispatch;
- durable idempotency receipts claimed before dispatch;
- bounded retry handling;
- explicit `uncertain` state when an external outcome cannot be proven;
- manual reconciliation support;
- compensation infrastructure;
- execution events and audit-log evidence.

Therefore Tranche 1 must **harden the canonical executor**, not create a second action system.

## Current gap

A successful outbound execution receipt records provider status and structured response metadata, but the recorded provider observation did not have its own deterministic evidence digest. This weakens forensic comparison and later Evidence Pack linkage: the receipt is durable, but the provider-response evidence inside it was not independently fingerprinted.

## Tranche 1 change

Every call to `completeExecutionReceipt(...)` now records an immutable provider-observation envelope and derives a deterministic SHA-256 digest from:

- receipt ID;
- observed outcome at dispatch completion (`succeeded`, `failed`, or `uncertain`);
- HTTP/provider response status;
- bounded response metadata selected by the action adapter;
- the bounded recorded error message, when present;
- the bounded provider-native external reference, when present.

The evidence envelope is persisted inside `response_metadata` using server-owned `provider_evidence_*` fields, including:

```json
{
  "provider_evidence_version": "v1",
  "provider_evidence_observed_status": "succeeded|failed|uncertain",
  "provider_evidence_response_status": 200,
  "provider_evidence_error_message": null,
  "provider_evidence_external_reference": null,
  "provider_evidence_digest": "<sha256>"
}
```

The complete `provider_evidence_*` namespace is server-owned. Adapter metadata using that prefix is removed before hashing and persistence, so provider-controlled metadata cannot spoof or poison Quantivis evidence fields.

The provider observation is intentionally distinct from later reconciliation. If a transport result is recorded as `uncertain` and a governed reconciliation later resolves the receipt to `succeeded` or `failed`, the immutable `provider_evidence_*` envelope remains the original observation. Reconciliation is separate governance evidence and must not rewrite history.

The original non-reserved response metadata is preserved. Raw provider response bodies, credentials, bearer tokens, service-role credentials, or connector secrets are not added to the receipt.

`completeExecutionReceipt(...)` accepts a bounded `externalReference` for adapters that can prove a provider-native receipt or object identifier. Existing reconciliation supports a later external reference separately when the initial provider result was ambiguous.

## Non-negotiable invariants

1. **One canonical executor.** New outbound integrations extend `execute-decision-action`; parallel execution paths are prohibited.
2. **No implicit autonomy.** External side effects require the existing execution and approval gates.
3. **Tenant authority is server-derived.** Browser-supplied organization/decision/plan identifiers never override database ownership checks.
4. **Executable decision required.** Outbound execution remains blocked until the parent decision reaches the governed `executable` state.
5. **Privileged role required.** Sensitive outbound actions continue to require owner/admin authority.
6. **Idempotency before side effect.** A durable receipt is claimed before any provider call; duplicate dispatch is suppressed.
7. **Unknown stays unknown.** Timeouts/ambiguous provider outcomes remain `uncertain` until separately reconciled.
8. **Evidence, not claims.** Completed receipts contain a deterministic provider-evidence fingerprint over the immutable observed provider result.
9. **Evidence fields are server-owned.** Provider metadata cannot override any `provider_evidence_*` field.
10. **Observation ≠ reconciliation.** Post-hoc resolution does not rewrite the original provider observation.
11. **No secret leakage.** Evidence metadata stays bounded and intentionally selected by adapters.
12. **Compensation remains explicit.** Reversal/compensation is governed separately and never inferred from a successful write.

## 10/10 acceptance path

This tranche is only the first step. Quantivis reaches the enterprise-action target when one connector-specific, reversible or otherwise safely compensatable business write proves the full immutable chain in staging:

`executable decision -> execution plan -> receipt claim -> provider write -> provider-native reference -> immutable provider observation -> Quantivis receipt -> provider-evidence digest -> follow-up verification/reconciliation -> Evidence Pack -> measured outcome`

Recommended first enterprise pilot: a low-risk CRM task/update action rather than a destructive ERP or financial transaction.

## Next controlled slices

1. **This PR:** deterministic immutable provider-observation fingerprints on the existing receipt path.
2. Capture provider-native external references automatically for Slack/webhook responses where safely available.
3. Link execution receipts and their evidence digests directly into the Decision Evidence Pack.
4. Add separately fingerprinted reconciliation evidence for `uncertain` receipts.
5. Implement one connector-specific CRM write adapter through `execute-decision-action` with exact-head tests.
6. Validate the adapter against provider sandbox/staging with real receipt round-trip evidence.
7. Add post-write verification rather than trusting the initial HTTP response alone.
8. Only after those proofs, expose bounded autonomy for narrowly pre-approved reversible action classes.

Tracked by issue #63.
