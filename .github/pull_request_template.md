## Objective

What problem or capability does this PR address?

## Risk class

- [ ] Standard
- [ ] High
- [ ] Critical

Critical includes auth, authorization/RLS/tenancy, billing/entitlements, secrets, privileged Edge Functions, migrations/destructive data work, webhooks, deployment/release controls, or historical restoration.

## Controlled scope

- Base branch/SHA:
- Head SHA:
- Environments touched:
- Production touched: `yes/no`
- Explicit non-goals:

## Plan / architecture evidence

What repository/current-environment evidence informed the plan?

## RED / acceptance contract

For behavior changes, record the failing regression/acceptance condition before implementation where reasonably possible.

- Failing test/reproduction:
- Why it failed:
- If no RED evidence, why not:

## Implementation

What changed and why is the change bounded?

## Test evidence

- [ ] Unit/static tests
- [ ] Integration tests
- [ ] Tenant/security tests where relevant
- [ ] Browser/E2E where relevant
- [ ] Error/negative paths

Commands/suites and results:

## Independent review

### TDD/Test Agent

Result / gaps:

### Security Reviewer

Required for Critical security/trust-boundary changes.

Result / findings:

### Independent Code Reviewer

Reviewer/context must be independent of the implementation pass for material changes.

Result / findings:

## Exact-SHA CI

- Candidate SHA:
- CI run:
- Result:

A green run for an older SHA does not satisfy this gate.

## Staging / external-system acceptance

Required when the claim depends on OAuth, Stripe, email, webhooks, database behavior, connectors, deployment, browser behavior, or other external systems.

- Staging SHA/deploy:
- Evidence:
- Result:

## Evidence Agent matrix

| Claim | Required evidence | Observed evidence | SHA/environment | Status |
|---|---|---|---|---|
| | | | | |

## Data / migration safety

If applicable:

- target scope proven;
- identity/tenant mappings explicitly verified;
- counts/integrity checked;
- rollback/recovery path documented;
- no fabricated or duplicate records used to hide mismatches.

## Remaining blockers / insufficient evidence

- 

## Gate verdict

`PASS | FAIL | BLOCKED | INSUFFICIENT EVIDENCE`

Explain why. A PR-level PASS is not automatically a broad-commercial GA verdict.
