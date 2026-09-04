# Quantivis Agent Engineering Layer

This directory defines the repository-native orchestration layer used above Quantivis's existing engineering controls.

It is inspired by strong ideas from ECC—specialized roles, test-first repair, fresh-context review, durable learning, and agent-configuration security—but it does **not** replace Quantivis CI, Playwright, tenant-isolation controls, evidence artifacts, staging workflows, or GA gates.

## Architecture

```text
Agent orchestration
    ↓
Quantivis engineering constitution (AGENTS.md)
    ↓
Tests / tenant isolation / security controls
    ↓
Exact-head CI
    ↓
Exact-SHA staging
    ↓
Acceptance evidence
    ↓
GA verdict
    ↓
Production promotion and post-deploy verification
```

## The eight roles

The detailed contracts are in `AGENT_CONTRACTS.md`:

1. **Repo Architect Agent** — understands architecture, dependencies, environments, and risk before modification.
2. **Implementation Agent** — implements only the approved scope and does not self-certify.
3. **TDD/Test Agent** — establishes RED evidence where feasible and builds meaningful regression/integration/E2E coverage.
4. **Security Reviewer** — reviews trust boundaries, RLS, auth, tenancy, billing, secrets, Edge Functions, webhooks, migrations, and agent configuration.
5. **Independent Code Reviewer** — reviews from fresh context with confidence filtering and concrete failure scenarios.
6. **Evidence Agent** — collects and labels exact-SHA evidence without converting absence into certainty.
7. **GA Gate Agent** — returns only PASS, FAIL, BLOCKED, or INSUFFICIENT EVIDENCE.
8. **Learning Agent** — preserves verified lessons while keeping session memory untrusted and non-authoritative.

These are logical roles. A harness may implement them as subagents, separate sessions, separate worktrees, or explicit review passes. Role separation matters more than the specific agent framework.

## Required workflow for material changes

```text
UNDERSTAND
  ↓
PLAN
  ↓
RED / ACCEPTANCE CONTRACT
  ↓
IMPLEMENT
  ↓
TDD / INTEGRATION / SECURITY TESTS
  ↓
INDEPENDENT REVIEW
  ↓
EXACT-HEAD CI
  ↓
STAGING / EXTERNAL ACCEPTANCE IF REQUIRED
  ↓
EVIDENCE PACKAGE
  ↓
GA OR CHANGE GATE
  ↓
LEARN
```

## What this layer does not do

It does not:

- install ECC wholesale;
- automatically trust AI-generated reviews;
- replace GitHub as execution-state authority;
- replace repository tests with agent opinions;
- turn memory into policy;
- grant agents production or secret access;
- weaken existing staging-first release controls;
- make an 80% code-coverage number a substitute for meaningful evidence.

## Key files

- `../../AGENTS.md` — authoritative repository constitution.
- `../../CLAUDE.md` — Claude Code entrypoint pointing to the same constitution.
- `AGENT_CONTRACTS.md` — narrow authority and outputs for the eight roles.
- `REVIEW_PROTOCOL.md` — independent review confidence/evidence rules.
- `LEARNING_PROTOCOL.md` — memory trust boundary and knowledge promotion process.
- `HANDOFF_TEMPLATE.md` — cross-agent/session handoff template.
- `../../.agent-memory/README.md` — local untracked memory boundary.
- `../../scripts/verify-agent-engineering-layer.mjs` — deterministic policy verifier.

## Rollout model

### Phase 1 — repo-native controls

Commit the constitution, role contracts, learning/review protocols, PR template, and deterministic policy check. No third-party agent runtime is required.

### Phase 2 — harness adapters

Configure Claude Code, Codex, Lovable-assisted workflows, or other harnesses to consume the same contracts without duplicating policy.

### Phase 3 — optional scanner/tooling adoption

Only after a supply-chain review, consider an agent-configuration scanner such as AgentShield or an ECC memory runtime. Any adoption must be separately reviewed and must not broaden production access.

## Operating principle

The most important rule is simple:

> The system that creates a change is not sufficient evidence that the change is correct.

Quantivis therefore separates implementation, review, evidence collection, and release judgment.
