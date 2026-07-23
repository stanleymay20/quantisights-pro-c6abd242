# TC-1 — Enterprise Trust Center

## Purpose

The Trust Center is Quantivis's operational transparency layer. It exists to answer one question honestly: **what, exactly, is real today?**

Its purpose is explicitly *not* to look impressive. It never invents a health metric, never simulates uptime, and never infers that a capability is "done" from the mere existence of a file. If a subsystem cannot yet report health, the page says **NOT AVAILABLE** or **NOT IMPLEMENTED** — never a green indicator.

TC-1 is a read-only presentation layer over facts gathered by directly reading the current implementation (real exported version constants, real route registrations, and manually cited file paths). It does not call a model, a runtime, a queue, or a live monitoring endpoint — because none of those endpoints exist yet for the subsystems it reports on.

## Architecture

```text
trust-center-types.ts        ← CapabilityStatus, HealthLabel, and all row shapes
        │
        ▼
trust-center.ts               ← eight pure builder functions, one per section
  getPlatformOverview()          reads import.meta.env.MODE; everything else is a
                                  literal "not available" — no build-time injection exists
  getCapabilityMatrix()          18 subsystems, each with one cited status
  getRuntimeHealth()             6 entries, always NOT AVAILABLE / NOT IMPLEMENTED
  getEvidenceIntegrity()         7 entries
  getGovernanceStatus()          5 entries
  getVersionMatrix()             12 entries, versions imported from their real source modules
  getKnownLimitations()          derived automatically from the capability matrix
  getEnterpriseReadinessMatrix() 8 rows, assessment text + cited sources, no score
        │
        ▼
buildTrustCenterData()         ← aggregates all eight into one TrustCenterData object
        │
        ▼
components/trust/
  TrustCenterOverview.tsx      ← Platform Overview card
  CapabilityMatrix.tsx         ← capability table + shared StatusBadge
  SystemHealthCard.tsx         ← one runtime health card (never renders "healthy")
  VersionMatrix.tsx            ← version table
        │
        ▼
pages/TrustCenter.tsx           /enterprise/trust — assembles all eight sections
```

`trust-center.ts` imports **only version constants** from AG-1/AG-2/AG-3/RTS-1/Evidence Pack modules (e.g. `RUNTIME_PERSISTENCE_VERSION`, `AGENT_GATEWAY_VERSION`) — never a factory function, a processor, or any behavior. This is enforced by a dedicated test (`"only imports version constants, never behavior..."` in `trust-center.test.ts`) so a future edit can't accidentally turn this transparency layer into a second caller of runtime logic.

### A note on `/trust` vs `/enterprise/trust`

TC-1's file list specifies `src/pages/TrustCenter.tsx`, which collided with an existing, heavily-linked public marketing/security page already living at that path (footer, sidebar, landing page, procurement pack, `page-metadata.ts`, `copilot-answer-engine.ts`, and more all reference `/trust`). To avoid silently rewriting a live public page's content, that existing file was renamed to `src/pages/SecurityTrustCenter.tsx` (component renamed to `SecurityTrustCenter`, content otherwise untouched) and `/trust` now points to it — so nothing about `/trust`'s rendered content changed. `src/pages/TrustCenter.tsx` was then written fresh for TC-1 and wired to the new `/enterprise/trust` route. A pre-existing test (`enterprise-readiness-foundation.test.ts`) that asserted against the old file path was updated to read `SecurityTrustCenter.tsx` instead — its assertions are otherwise unchanged.

## Capability model

Every subsystem gets **exactly one** of five statuses, each requiring a specific standard of evidence before it can be claimed:

| Status | Requires |
|---|---|
| `Implemented` | Coded, tested, **and** reachable from a live page, hook, or edge function |
| `Partially Implemented` | Coded and tested, but missing a real backend, not wired into a live path, or covering only part of the described capability |
| `Planned` | Referenced in prior task instructions or docs, but no code exists yet |
| `Not Implemented` | No code and no forward reference exists |
| `Unknown` | Could not be verified from the current implementation |

Critically, **"the file exists" is not sufficient for `Implemented`.** Verification for TC-1 included grepping for every consumer of `agent-gateway.ts`, `runtime-gateway.ts`, `runtime-queue.ts`, `runtime-persistence.ts`, and the RTS-1 modules outside their own test suites. The result: **none of these modules are imported by any live page, hook, or edge function today.** They are fully coded, documented, and tested reference implementations — but the live product's actual decision-creation and approval path (`decision_ledger`, `decision-lifecycle.ts`, and the `aicis-auto-decisions` / `intelligence-advisory-engine` edge functions) is a separate code path that does not run through RTS-1, the Agent Gateway, or the Runtime Gateway. TC-1 reports this plainly as `Partially Implemented` rather than letting the presence of well-tested code imply production use.

## Health model

The Runtime Health section covers exactly the six subsystems TC-1 specifies: Runtime Gateway, Queue, Persistence, Evidence, Audit, Replay Protection. For every one of them, **`getRuntimeHealth()` returns `NOT AVAILABLE` or `NOT IMPLEMENTED` today** — there is no OpenTelemetry integration, no metrics endpoint, and no live process for the browser to query for any of these six. `SystemHealthCard` physically cannot render a "healthy" state — its style/icon map only has entries for the two honest labels.

This is deliberately distinct from `/system-health`'s pre-existing, genuinely live cron-job health (backed by the real `cron_run_log` table and `useSystemHealth` hook) — that page reports real operational data for a different set of subsystems (scheduled jobs like outcome evaluation and calibration). TC-1's Runtime Health cards say so explicitly rather than silently duplicating or being confused with that page.

## Limitations philosophy

`getKnownLimitations()` is **derived, not authored** — it filters the capability matrix for every entry that is not `Implemented` and maps it directly into a limitation. This means:

- A limitation can never silently fall out of sync with the capability matrix (they're the same data).
- Nothing can be marked `Implemented` in the matrix while quietly omitted from limitations, or vice versa — enforced by a dedicated test.

As of this writing, known limitations include: RTS-1 → Agent Gateway → Runtime Gateway → Queue → Persistence are not wired into a live traffic path; Scenario Templates and HTTP Runtime have no code at all; Signing is mock-only (no cryptography); Evidence Pack has no PDF rendering or signed export; Observability covers error tracking (Sentry) but not metrics/tracing.

## Enterprise readiness

`getEnterpriseReadinessMatrix()` returns eight rows (Architecture, Runtime, Governance, Evidence, Operations, Security, Pilot Readiness, Production Readiness) — **a matrix, never a score.** No row computes a percentage, a weighted average, or any numeric rating; each is a plain-language sentence describing what is verifiably true today, plus the file paths that back it. `Production Readiness` is reported as `UNKNOWN` with no cited sources, because production readiness depends on infrastructure and operational factors outside what a client-side codebase can verify — TC-1 refuses to assume it.

## Future observability integration

The `RuntimeHealthEntry.health` type is deliberately typed as a union (`HealthLabel`) rather than a boolean, so a future live integration (e.g. a `/api/health` endpoint the Runtime Gateway/Queue/Persistence services expose once deployed) has a natural place to add real states like `healthy`/`degraded` without restructuring this module. Until such an endpoint exists, `getRuntimeHealth()` remains the single place that decides every entry is `NOT AVAILABLE` — changing that determination for one subsystem is a one-line change once real telemetry exists.

## Future OpenTelemetry integration

No OpenTelemetry SDK, exporter, or collector is present anywhere in this codebase today (verified by search). A future phase would instrument the Runtime Gateway, Queue, and Persistence reference implementations with spans/metrics once they are wired into a live request path, export them to a collector, and have `getRuntimeHealth()` read real span/metric data instead of returning a static `NOT AVAILABLE`. Sentry's existing error-tracking integration (`src/lib/sentry.ts`) would remain complementary — it covers exceptions, not throughput/latency/queue-depth metrics.

## Verification

```bash
npm exec vitest run src/test/trust-center.test.ts
npm test
npm run build
git diff --check
```
