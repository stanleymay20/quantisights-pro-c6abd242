# ECC-Inspired Adoption Notes

This document records the engineering ideas Quantivis intentionally adopted from the official `affaan-m/ECC` project and, equally importantly, what Quantivis did **not** import.

This is an architectural provenance note, not a dependency declaration. Quantivis does not currently depend on the ECC runtime.

## Adopted principles

### 1. Specialized engineering roles

A single AI context should not be planner, implementer, reviewer, evidence collector, and release authority at the same time.

Quantivis implements this as eight logical roles in `AGENT_CONTRACTS.md` rather than importing the full ECC agent catalog.

### 2. Fresh-context independent review

Review is separated from implementation. High-confidence findings require a concrete failure mode and evidence. Zero findings is valid.

Quantivis strengthens this by connecting review to exact-SHA CI, tenant/security controls, staging acceptance, and GA evidence.

### 3. Test-first repair

For bugs and behavior changes, prefer RED → GREEN → refactor with meaningful regression evidence.

Quantivis does not use a blanket coverage percentage as a release proxy. Critical paths require behavior-level evidence appropriate to their risk.

### 4. Memory is untrusted context

Session memory may preserve continuity but is not policy or authority. Important claims must be re-verified; stable lessons are promoted into tests, runbooks, architecture, or repository policy through normal review.

### 5. Agent configuration is a security surface

Prompts, hooks, MCP servers, workflow permissions, agent files, and third-party agent tooling can execute or influence privileged work. They require security review like other supply-chain/configuration changes.

## Quantivis controls that remain authoritative

The agent layer sits **above**, not instead of:

- tenant-isolation and authorization tests;
- RLS/database controls;
- Playwright/client acceptance;
- security configuration verification;
- evidence artifacts and evidence matrices;
- exact-head CI;
- exact-SHA staging deployment/validation;
- GA readiness workflows;
- production post-deploy verification.

An agent opinion never replaces these controls.

## Deliberately not imported

At this stage Quantivis does **not** install or copy wholesale:

- the full ECC agent catalog;
- the full ECC skill/command catalog;
- ECC hooks;
- ECC Memory Vault runtime;
- AgentShield or its GitHub Action;
- ECC MCP configuration;
- unofficial ECC forks, mirrors, or similarly named packages.

Reasons:

- unnecessary context/tool surface can reduce rather than improve reliability;
- hooks and MCP servers are executable/security-sensitive configuration;
- additional packages/actions create supply-chain responsibility;
- Quantivis already has more domain-specific release evidence than a generic agent framework can provide;
- a small governed layer is easier to audit and maintain.

## Optional future adoption gate

Any future ECC/AgentShield/runtime adoption should be a separate PR that:

1. verifies the official distribution/source;
2. pins the exact package/action version or immutable action SHA where possible;
3. audits requested filesystem/shell/network/MCP permissions;
4. proves no secrets are introduced;
5. runs in read-only/report-only mode first where possible;
6. captures baseline findings before enforcing a new CI failure policy;
7. receives Security Reviewer and Independent Code Reviewer approval;
8. does not gain production credentials merely because it is an engineering tool.

## Quantivis-specific orchestration

```text
Repo Architect
      ↓
TDD/Test contract
      ↓
Implementation
      ↓
Security Review ──┐
Independent Review ├─> exact-head CI
                  │       ↓
                  └─> Evidence Agent
                          ↓
                 exact-SHA staging/acceptance
                          ↓
                       GA Gate
                          ↓
                    production (if PASS)
                          ↓
                    Learning Agent
```

This is the intended synthesis: stronger agent orchestration without weakening Quantivis's existing evidence discipline.
