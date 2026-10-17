# Quantivis 10/10 Hardening — Tranche 3: Provider-Native Execution References

Date: 2026-10-17

## Objective

Strengthen the existing governed outbound execution receipt so the provider-observation evidence can carry a real provider-native message/request reference when the remote system actually returns one.

This tranche stays inside the canonical `supabase/functions/execute-decision-action` path. It does not create another executor, connector gateway, queue, or write surface.

## Slack

`notify_slack` already calls Slack `chat.postMessage` through the configured connector gateway. A successful Slack response can include the provider-returned channel ID and message timestamp (`ts`).

The executor now derives an external reference only when **both provider-returned values are present and valid**:

`slack-message:<provider-channel-id>:<provider-message-ts>`

The caller-supplied channel value is never substituted for a missing provider channel ID. Missing or malformed provider identifiers therefore remain `null` rather than becoming synthetic evidence.

The reference is passed into the existing `completeExecutionReceipt(...)` function and is therefore covered by the Tranche 1 immutable provider-observation digest.

## Generic webhooks

Generic HTTPS webhooks do not have a universal provider object/message ID. Quantivis therefore does not invent one from the URL, HTTP status, timestamp, payload, or local receipt ID.

The executor only accepts a bounded opaque identifier from this explicit response-header allowlist, in priority order:

1. `x-request-id`
2. `x-correlation-id`
3. `x-trace-id`
4. `request-id`

When present and valid, the reference is recorded as:

`webhook-response:<header-name>:<opaque-id>`

`Location`, cookies, authorization-like headers, arbitrary response headers, and URL-like values are intentionally excluded to reduce secret/token leakage risk.

## Validation

Provider reference components are rejected when they are:

- empty;
- longer than their bounded limit;
- whitespace-bearing;
- control/path/URL-like;
- delimiter-bearing in a way that could alter the reference format; or
- malformed for the expected Slack message timestamp shape.

Values are rejected rather than silently truncated into a different identifier.

## Evidence semantics

The external reference does not prove business success by itself. It is one immutable element inside the provider-observation envelope alongside:

- observed receipt status;
- provider/HTTP response status;
- bounded response metadata;
- bounded error evidence; and
- receipt identity.

Ambiguous transport/provider outcomes continue to use `uncertain`. The presence of a request/correlation ID does not convert an uncertain result into success.

## Security boundaries preserved

This tranche does not:

- create a new outbound endpoint;
- bypass executable-decision or active-plan gates;
- alter owner/admin authorization;
- weaken idempotency or retry controls;
- weaken SSRF/approved-destination controls;
- change credentials or secrets;
- add a database migration;
- change Supabase environments;
- deploy production; or
- expand autonomous execution capability.

## Verification requirements

Before merge:

1. exact-head CI must pass;
2. merge compatibility against current `main` must pass;
3. privileged Edge/Deno typecheck must cover the modified executor and helper;
4. provider-reference regression tests must pass;
5. application tests and Evidence Framework tests must remain green;
6. security configuration and production build must remain green;
7. dependency audit must remain clean at the enforced threshold;
8. merged-main CI must pass again before the next tranche.

## Next controlled slice

After this tranche is proven on merged `main`:

1. persist stronger source-side reconciliation integrity evidence while preserving the immutable original provider observation;
2. select one low-risk CRM provider/action;
3. implement that write through `execute-decision-action`, not a parallel path;
4. prove sandbox/staging write → receipt → provider read-back verification;
5. record compensation evidence; and
6. only then consider broader governed write capability.
