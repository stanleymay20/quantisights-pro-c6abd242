# Quantivis Learning and Memory Protocol

Quantivis should learn from engineering work, but memory must never silently become authority.

## Trust model

Agent/session memory is **unreviewed context**.

It can help a future agent remember where to look, but it must not override:

- repository source;
- current migrations and workflows;
- GitHub PR/CI state;
- current hosting/provider configuration;
- live staging/production evidence;
- approved architecture/runbooks;
- `AGENTS.md`.

## Local memory boundary

Use `.agent-memory/` for local session notes and handoff scratch material.

The directory is configured to remain untracked except for its guard files. Do not commit normal memory entries.

Never store:

- passwords;
- API keys or tokens;
- cookies/session credentials;
- private keys;
- full environment files;
- sensitive personal data;
- customer payloads or production dumps;
- raw authentication or payment secrets.

## What is worth remembering

Good candidates include:

- a verified environment mismatch and how it manifests;
- a provider-specific callback requirement;
- a recurring Lovable/regeneration regression;
- a release-gate ordering dependency;
- a migration pitfall confirmed by tests/staging;
- a repository-specific security invariant;
- a durable debugging technique.

Do not preserve ephemeral facts as durable rules, such as a branch head, deploy ID, temporary outage, transient user count, or current CI run. Link to the authoritative source instead.

## Learning workflow

1. **Observe** — identify a repeated or high-value engineering lesson.
2. **Verify** — confirm it against source/tests/provider evidence.
3. **Classify** — decide whether it is ephemeral context or durable knowledge.
4. **Store locally** — if useful for continuity but not yet governed, put a short note in `.agent-memory/`.
5. **Propose promotion** — if durable, change the correct canonical artifact through a reviewed PR.
6. **Encode where possible** — prefer a regression test, policy check, migration constraint, or workflow gate over prose alone.
7. **Supersede** — when the environment/architecture changes, remove or update stale governed guidance.

## Promotion destinations

A verified lesson should be promoted to the narrowest authoritative location:

- security/release doctrine → `AGENTS.md`;
- agent role behavior → `docs/agent-engineering/`;
- code invariant → test/type/schema/constraint;
- deployment/recovery procedure → runbook/workflow;
- architecture choice → architecture decision/design document;
- commercial/legal fact → verified product/legal configuration;
- active execution state → GitHub PR/issue, not memory.

## Memory entry format

Use this compact structure for local notes:

```text
Title:
Status: unreviewed
Observed:
Verified evidence:
Affected area:
Why it matters:
Likely expiry/supersession condition:
Recommended canonical destination:
```

## Handoffs

For work that another agent/session must continue, use `HANDOFF_TEMPLATE.md` rather than dumping a transcript.

A handoff should preserve only what is necessary to continue safely:

- exact objective;
- current branch/SHA/environment;
- verified evidence;
- unresolved ambiguity;
- blockers and risks;
- next concrete action;
- prohibited/unsafe actions.

## Important principle

A memory that says “this was fixed” is never sufficient evidence that it is still fixed.

Re-verify release-critical facts against the current candidate and environment.
