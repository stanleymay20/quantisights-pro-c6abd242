# Quantivis Independent Review Protocol

The purpose of review is to find real defects, not produce a large list.

## Fresh-context requirement

The final independent review of a material change must not be performed solely by the same narrow agent context that implemented the change.

A fresh reviewer should begin from:

- the PR objective and risk class;
- the actual diff;
- surrounding source and call sites;
- relevant tests and migrations;
- current CI/staging evidence.

Do not begin from the implementer's conclusion that the issue is fixed.

## Confidence filter

Report a defect when the reviewer is more than 80% confident it is real.

Below that threshold:

- gather more evidence;
- label it advisory/uncertain if it is useful;
- or omit it.

Zero findings is a valid review result.

## Pre-report gate

Before reporting a HIGH or CRITICAL finding, answer all of these:

1. **Where is it?** Give exact file and line/range.
2. **What triggers it?** Name the concrete input/state/sequence.
3. **What bad outcome occurs?** Name the data loss, security bypass, billing error, runtime failure, misleading evidence, or regression.
4. **Why do current guards fail?** Explain why types, validation, RLS, caller checks, idempotency, tests, or framework behavior do not already prevent it.

If any answer is unavailable, gather more evidence or reduce severity.

## Severity

### CRITICAL

A credible path to cross-tenant access, authentication/authorization bypass, secret exposure, destructive production/data corruption, incorrect payment attribution, uncontrolled privileged execution, or release of materially unsafe code/data.

### HIGH

A material user/business failure, data-integrity problem, entitlement/quota bypass, serious race/idempotency defect, broken release gate, or significant regression in a critical flow.

### MEDIUM

A real defect with bounded impact, incomplete error handling, maintainability risk likely to cause future bugs, or insufficient test coverage around meaningful behavior.

### LOW / ADVISORY

Non-blocking improvements. Avoid stylistic preferences unless they violate established project conventions or materially increase risk.

## Review order

Review in this order:

1. environment and scope correctness;
2. auth/authorization/tenant/security boundaries;
3. data integrity and migration behavior;
4. billing/subscription/quota/entitlement behavior;
5. external integration/idempotency/error recovery;
6. product behavior and accessibility;
7. tests and evidence quality;
8. maintainability/performance;
9. style.

## AI-generated-code checks

Pay special attention to:

- fake certainty or invented fallback values;
- old/stale assumptions copied from comments or memory;
- duplicate authority paths after a security refactor;
- client-controlled values crossing a server trust boundary;
- success returned before all required mutations complete;
- events marked processed before business state is durable;
- 'newest row' selection where effective/current state is required;
- fail-open behavior on unknown roles/features/quotas;
- tests that assert source strings rather than behavior;
- concurrent branch/automation changes that invalidate the reviewed diff;
- evidence collected against a previous SHA.

## Output format

For each blocking finding:

```text
[SEVERITY] Short title
File: path/to/file:line
Confidence: 0-100%
Trigger: exact input/state/sequence
Outcome: concrete bad result
Why guards fail: explanation
Required repair: bounded recommendation
Required regression evidence: test/staging proof
```

Finish with:

```text
Review summary
CRITICAL: N
HIGH: N
MEDIUM: N
LOW/ADVISORY: N

Verdict: APPROVE | WARNING | BLOCK
```

### Verdict rules

- `APPROVE`: no CRITICAL/HIGH findings remain.
- `WARNING`: no CRITICAL findings; one or more HIGH findings require explicit resolution/decision before merge.
- `BLOCK`: one or more CRITICAL findings, or evidence proves the change unsafe.

Independent code-review approval is **not** a GA verdict. Release certification remains the GA Gate Agent's responsibility.
