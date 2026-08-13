# First-client pilot operations

This runbook governs the first controlled Quantivis customer pilot. It is an
operational checklist, not evidence of GA readiness, certification, an SLA, or
a production control unless the referenced evidence has been captured.

## Entry criteria

Do not invite the client until all critical items below are complete:

- The intended production commit is identifiable on the live site.
- CI, production build, dependency audit, and security-configuration checks pass.
- The live CSP contains neither `unsafe-eval` nor an unexplained exception.
- Supabase migrations and Edge Functions for the commit are deployed and verified.
- Tenant isolation has been exercised with two organizations and negative tests.
- A pilot organization, named owner, support contact, and rollback owner exist.
- The customer has approved the sanitized pilot dataset and permitted use cases.
- Known limitations have been disclosed in writing.

If any critical item is unknown, status is **Not ready**. Local success alone is
not production verification.

## Supported pilot scope

The pilot may use only capabilities verified in the target production deployment:

- account login, invitation, and role-based access;
- organization-scoped dataset upload and validation;
- mapping, transformation, analysis, and dashboard workflows;
- decision review and outcome recording;
- evidence views and currently deployed export formats.

Treat SSO, scheduled automation, connector ingestion, backup recovery, PDF/PPTX
generation, or compliance-specific workflows as unsupported until separately
verified for the client. Do not represent planned capabilities as available.

## Customer inputs

Obtain before setup:

- legal organization name and pilot owner;
- authorized users, roles, and email domains;
- permitted business question and success criteria;
- sanitized CSV/XLSX sample with a data dictionary;
- field definitions, units, date formats, and expected row count;
- prohibited data classes and retention/deletion instructions;
- escalation contacts and agreed pilot review cadence.

Do not accept credentials, secrets, special-category personal data, or production
customer records through email or chat. Use the approved secure transfer path.

## Internal setup

1. Record the live deployment ID, commit SHA, migration version, and verification time.
2. Create exactly one pilot organization using the approved customer name.
3. Create an internal administrator and a least-privileged pilot user.
4. Confirm each user belongs only to the intended organization.
5. Configure retention and access settings that have actually been approved.
6. Upload the sanitized sample and record its checksum, row count, and schema.
7. Complete the acceptance test below before sending a customer invitation.

## Acceptance test

Capture pass/fail evidence for every step:

1. Invite and authenticate both pilot roles; verify logout and session recovery.
2. Attempt cross-tenant reads and writes from a second test organization; all fail.
3. Upload the approved sample; invalid type, size, and malformed-file cases fail safely.
4. Map fields, run validation, correct a flagged issue, and repeat the analysis.
5. Open dashboards and confirm values against a manually calculated sample.
6. Create, review, approve, and record the outcome of one test decision.
7. Open trust, governance, and evidence views; missing evidence displays as unknown.
8. Exercise every enabled export and verify content, authorization, and download type.
9. Test empty, stale, partial, permission-denied, timeout, retry, and cancellation states.
10. Confirm audit records identify the actor, organization, action, and timestamp.

Any tenant-isolation, authentication, data-loss, false-evidence, or unhandled-upload
failure is a pilot stop condition.

## Go/no-go decision

Use only these statuses:

- **Go:** all critical entry and acceptance checks are verified in production.
- **Conditional go:** only documented noncritical limitations remain, with owner and workaround.
- **No-go:** any critical check failed, is stale, or remains unknown.

The release owner records the decision, evidence links, limitations, approver, and
time. A successful local test or green CI run cannot substitute for live evidence.

## Daily pilot checks

- Confirm the live deployment identity has not changed unexpectedly.
- Review authentication, ingestion, function, scheduler, and application errors.
- Check scheduled evidence timestamps and mark stale or missing evidence unknown.
- Review failed uploads, data-quality exceptions, and unresolved support requests.
- Confirm no unexplained administrative, membership, or policy changes occurred.
- Record customer progress toward the approved success criteria.

## Support and incidents

Classify pilot events as:

- **P0:** suspected cross-tenant exposure, credential compromise, or destructive data loss.
- **P1:** authentication unavailable, primary workflow unavailable, or materially incorrect output.
- **P2:** degraded workflow with a safe workaround.
- **P3:** cosmetic issue or product question.

For P0, stop the pilot, preserve logs, revoke affected access, notify the security
owner, and do not resume until containment and verification are documented. For
P1, pause the affected workflow and assign an engineering owner. Response targets
must not be described as contractual SLAs unless signed terms establish them.

## Rollback and recovery

1. Stop new pilot activity and capture the current deployment and migration state.
2. Prefer a forward fix for database changes; never destructively roll back customer data.
3. Redeploy the last verified application commit when schema compatibility permits.
4. Validate authentication, tenant isolation, ingestion, and evidence integrity.
5. Resume only after the release owner records a new go decision.

Backup existence, restore success, RPO, and RTO remain **Not verified** until a
dated production restore exercise supplies evidence.

## Pilot success evidence

Measure observable outcomes rather than readiness percentages:

- invited users who completed authentication;
- approved datasets ingested without manual engineering intervention;
- time from approved upload to first validated insight;
- decisions reviewed and outcomes recorded;
- critical defects, unresolved P1/P2 issues, and support response history;
- customer-confirmed usefulness against the agreed business question.

At pilot close, export the evidence record, disclose limitations, confirm deletion
or retention instructions, and decide whether to extend, stop, or prepare a broader rollout.
