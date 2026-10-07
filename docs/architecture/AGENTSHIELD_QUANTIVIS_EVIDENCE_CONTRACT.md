# AgentShield → Quantivis Evidence Contract

Status: interface contract only. This change does **not** couple or deploy AgentShield.

## Purpose

AgentShield remains the action/policy control plane. Quantivis remains the durable evidence and governance plane.

Target chain:

`agent/tool intent → AgentShield ALLOW|REVIEW|BLOCK → Quantivis ingest → review/approval → governed execution → measured outcome → Evidence Pack`

## Stable mapping

AgentShield registers once as an `ai_systems` entry with `system_type = 'rules_engine'` or `agent`, depending on the deployment.

For each policy decision it POSTs the standard Quantivis external-AI decision protocol. No AgentShield-specific endpoint is required.

```json
{
  "protocol_version": "quantivis.external-ai-decision.v1",
  "external_event_id": "agentshield:<policy-decision-id>",
  "occurred_at": "2026-10-07T12:00:00.000Z",
  "input_hash": "sha256:<64-hex-request-digest>",
  "output_hash": "sha256:<64-hex-policy-result-digest>",
  "decision": {
    "action": "agent_policy_verdict",
    "verdict": "REVIEW",
    "agent_id": "customer-agent-id",
    "tool": "payments.create",
    "requested_action": "release_supplier_payment",
    "reason_codes": ["AMOUNT_THRESHOLD", "HUMAN_APPROVAL_REQUIRED"]
  },
  "confidence": null,
  "human_oversight_state": "required",
  "metadata": {
    "policy_id": "policy-17",
    "policy_version": "3",
    "tool_target": "payments.create"
  },
  "provenance": {
    "source": "agentshield",
    "trace_id": "trace-123"
  },
  "idempotency_key": "agentshield:<policy-decision-id>"
}
```

## Verdict semantics

| AgentShield verdict | Quantivis meaning |
|---|---|
| `ALLOW` | Policy engine did not require AgentShield review. Quantivis still records the decision as `pending`; `ALLOW` never bypasses Quantivis approval/execution gates. |
| `REVIEW` | Human oversight is explicitly required. The evidence record carries `human_oversight_state = 'required'`. |
| `BLOCK` | AgentShield denied the attempted action. Quantivis records the denial as evidence; it does not create or replay the blocked side effect. |

## Security invariants

- AgentShield cannot choose `organization_id`, `ai_system_id`, or `credential_id` in the request body. Quantivis derives identity from the machine credential.
- Raw prompts, tool arguments, secrets, and model outputs are not required. Hashes are sufficient for integrity references; safe metadata can be attached explicitly.
- An idempotency key may never be reused with a different canonical payload.
- An external event ID may never be reused with a different canonical payload.
- Quantivis stores only the SHA-256 digest of the machine credential.
- Every externally ingested decision enters the normal Quantivis ledger as `pending`, never `approved` or `executable`.
- Evidence Packs may support governance/regulatory obligations but are not compliance certificates.

This contract intentionally uses the generic external-AI protocol so AgentShield is an adapter, not a special-case dependency in Quantivis core.
