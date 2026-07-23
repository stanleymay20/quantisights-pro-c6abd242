# Quantivis Enterprise Evidence Matrix (EE-1)

Every production pipeline listed below MUST produce a signed evidence artifact
(`tests/evidence/pipelines/<pipeline>.mjs`) before a release is promoted.
This matrix is the single source of truth — it is consumed by
`tests/evidence/run-all.mjs` and enforced by `docs/enterprise/RELEASE_GATE.md`.

Legend
- **Entry**: first observable action a user or system agent performs.
- **Exit**: terminal observable state that proves the pipeline succeeded.
- **Positive control**: a case that MUST succeed.
- **Negative control**: a case that MUST fail with the expected denial.
- **Evidence**: files written under `audit-artifacts/YYYY-MM-DD/<pipeline>/`.
- **Gate**: release-gate section that consumes this evidence.

---

## 1. Authentication

| Field | Value |
|---|---|
| Implementation status | **IMPLEMENTED (EE-1)** — see `tests/evidence/pipelines/authentication.mjs` |
| Controls | 15 (AUTH-001 … AUTH-015) declared in `tests/evidence/pipelines/lib/auth-controls.mjs` |
| Adapter | `tests/evidence/adapters/README-auth-adapter.md` — reads `$EVIDENCE_AUTH_RESULTS` JSON produced by the existing Playwright suite (`e2e/auth.spec.ts`) |
| Purpose | Prove human + machine identity before any tenant data is touched |
| Entry | `POST /auth/v1/token` (email+password) or `signInWithOAuth` |
| Exit | Supabase session with `aal1`, `access_token`, and profile row present |
| Dependencies | Supabase Auth, `profiles` table, `handle_new_user` trigger |
| Positive controls | Valid email/password issues session; new user auto-provisions profile; PKCE callback hydrates session; MFA challenge enforced when org requires it |
| Negative controls | Bad password → 400; unknown email → 400; disabled user → 401; bad_jwt purge recovers session; unauth `/dashboard` → `/login` |
| Expected outputs | JWT, refresh token, `profiles.user_id = auth.uid()`; adapter evidence per control (route, response_status, redirect_chain, session_state, auth_state, console_errors, network_failures, screenshots) |
| Failure conditions | Missing profile row, session without `aud=authenticated`, HIBP bypass, MFA bypass, logout leaves `sb-*` keys |
| Failure codes | `AUTH_FAILURE`, `SESSION_LEAK`, `OAUTH_FAILURE`, `PKCE_FAILURE`, `SESSION_LOSS`, `REFRESH_FAILURE`, `EXPIRED_SESSION_UNHANDLED`, `BAD_JWT_LOOP`, `AUTHZ_BYPASS`, `MFA_BYPASS`, `RESET_REQUEST_FAILURE`, `RESET_COMPLETE_FAILURE`, `RECOVERY_FLOW_FAILURE`, `HYDRATION_RACE`, `LOGOUT_CLEANUP_FAILURE` |
| Evidence artifacts | `audit-artifacts/YYYY-MM-DD/authentication/evidence.json` (standard schema) + adapter-referenced screenshots |
| Release gate | Authentication (hard-blocking on `SECURITY_FAILURE` or `FRAMEWORK_INVALID`) |

## 2. OAuth (Google)

| Field | Value |
|---|---|
| Purpose | Prove third-party identity federation and PKCE flow |
| Entry | `supabase.auth.signInWithOAuth({ provider: 'google' })` |
| Exit | Callback lands on `/auth/callback`, session hydrated via `onAuthStateChange` |
| Dependencies | Google OAuth client, `AuthCallback.tsx`, session storage state |
| Positive controls | Consent → session hydrated within 5s |
| Negative controls | Missing PKCE verifier → error surfaced; replayed code → 400 |
| Evidence artifacts | `oauth-round-trip.json`, `callback-console.log` |
| Release gate | Authentication |

## 3. Session recovery

| Field | Value |
|---|---|
| Purpose | Prove refresh + reload survives without user re-auth |
| Entry | Reload of `/decisions` with expired access token |
| Exit | Silent refresh, protected content rendered |
| Positive controls | Session restored, no redirect to `/login` |
| Negative controls | Revoked refresh token → redirect to `/login` (no hang) |
| Evidence artifacts | `recovery-trace.json` |
| Release gate | Authentication |

## 4. MFA

| Field | Value |
|---|---|
| Purpose | Enforce step-up when org policy requires it |
| Entry | Login of a user whose org has `require_mfa=true` |
| Exit | `aal2` session after TOTP verification |
| Positive controls | Verified factor → access granted |
| Negative controls | Bad TOTP → 401; unenrolled user → forced to `MFAEnroll` |
| Evidence artifacts | `mfa-challenge.json`, `mfa-enroll.json` |
| Release gate | Authentication |

## 5. Authorization & Tenant Isolation (EE-2)

| Field | Value |
|---|---|
| Implementation status | **IMPLEMENTED (EE-2)** — see `tests/evidence/pipelines/authorization.mjs` |
| Controls | 20 (AUTHZ-001 … AUTHZ-020) declared in `tests/evidence/pipelines/lib/authz-controls.mjs` |
| Adapter | `tests/evidence/adapters/authz-adapter.mjs` (README: `tests/evidence/adapters/README-authz-adapter.md`) — consumes `tests/tenant-isolation/run.mjs`, `tests/e2e/concurrent-browser-sessions.py`, and a route-probe JSON |
| Purpose | Prove protected routes, RLS, role gates, tenant isolation, edge-function and realtime authorization |
| Entry | Anonymous or seeded-tenant request against protected routes, PostgREST tables, edge functions, and realtime channels |
| Exit | Every own-tenant probe returns 2xx with expected rows; every cross-tenant probe returns empty array or documented denial class (401/403/`42501`) |
| Dependencies | Two seeded orgs (`tests/tenant-isolation/seed.mjs`), pre-minted browser session for `concurrent-browser-sessions.py`, edge-function `verify_jwt`, realtime publication + RLS |
| Positive controls | Tenant A own reads/writes; Tenant B own reads/writes; owner/admin allowed on privileged surfaces; member allowed where expected; every protected route reachable under valid session |
| Negative controls | Cross-tenant reads/writes denied; role escalation denied; anonymous denied and redirected to `/login`; expired/tampered JWT denied; edge function rejects missing/cross-tenant JWT; realtime subscriber receives no cross-tenant rows |
| Expected outputs | `audit-artifacts/YYYY-MM-DD/authorization/evidence.json` (standard artifact schema) with per-control `route`, `role`, `organization_id`, `user_id`, `table`, `policy`, `request`, `response`, `status_code`, `redirect_chain`, `console_errors`, `network_failures`, `screenshots`, `recommendation` |
| Failure codes | `PROTECTED_ROUTE_FAILURE`, `SESSION_STABILITY_FAILURE`, `AUTHZ_BYPASS`, `ADMIN_ROUTE_FAILURE`, `OWN_TENANT_READ_FAILURE`, `OWN_TENANT_WRITE_FAILURE`, `CROSS_TENANT_READ_LEAK`, `CROSS_TENANT_WRITE_LEAK`, `RLS_ENFORCEMENT_FAILURE`, `PERMISSION_HIERARCHY_FAILURE`, `ROLE_ESCALATION`, `EDGE_FUNCTION_AUTHZ_FAILURE`, `REALTIME_AUTHZ_LEAK` |
| Blocking semantics | Cross-tenant leak / role escalation / realtime leak → `CRITICAL_LEAK` (blocking). Own-tenant regressions and protected-route/edge-function failures → `SECURITY_FAILURE` (blocking). Missing adapter input → `SKIP` (degrades pipeline to `WARNING`, never `PASS`). Missing control / bad schema → `FRAMEWORK_INVALID` (blocking). |
| Release gate | Authorization (hard-blocking on `CRITICAL_LEAK`, `SECURITY_FAILURE`, `FRAMEWORK_INVALID`) |

## 6. Tenant isolation

| Field | Value |
|---|---|
| Purpose | Prove no cross-org read or write is possible |
| Entry | Seeded users in Org A + Org B (`tests/tenant-isolation/seed.mjs`) |
| Exit | All cross-tenant probes return empty arrays or RLS denials |
| Positive controls | Same-tenant read returns seeded canary row |
| Negative controls | Cross-tenant read returns `200 + []`; cross-tenant write returns 401/403/`42501` |
| Evidence artifacts | `probes.json`, `verdicts.json` (from `tests/tenant-isolation/run.mjs`) |
| Release gate | Tenant isolation |

## 7. Decision creation

Status: **IMPLEMENTED (EE-3)** — Decision Lifecycle pipeline. See `tests/evidence/pipelines/decision-lifecycle.mjs`, `tests/evidence/pipelines/lib/decision-controls.mjs` (25 controls DEC-001…DEC-025), and adapter `tests/evidence/adapters/decision-adapter.mjs`.

| Field | Value |
|---|---|
| Purpose | Prove a decision row is committed with governance metadata |
| Entry | Authenticated `POST /rest/v1/decision_ledger` |
| Exit | Row present with `status='pending'`, `organization_id`, `created_by` |
| Positive controls | DEC-001…DEC-005 (create, validate, org, owner, initial status) |
| Negative controls | DEC-002 (validation), DEC-012 (invalid transition), DEC-025 (delete denied) |
| Evidence artifacts | `evidence.json` (folded from decision-adapter workflow/audit/report/browser inputs) |
| Release gate | Decision pipeline |

## 8. Decision editing

Status: **IMPLEMENTED (EE-3)** — covered by DEC-012 (status transition valid) and DEC-013 (audit trail generated) under the Decision Lifecycle pipeline.

| Field | Value |
|---|---|
| Purpose | Prove edits preserve audit lineage |
| Entry | `PATCH /rest/v1/decision_ledger?id=eq.<id>` |
| Exit | Row updated, `audit_log` row appended |
| Negative controls | DEC-012 rejects illegal transitions; DEC-011 blocks approval-history tamper |
| Evidence artifacts | Folded into Decision Lifecycle `evidence.json` |
| Release gate | Decision pipeline |

## 9. Decision approval

Status: **IMPLEMENTED (EE-3)** — DEC-008 (human review), DEC-009 (approval recorded), DEC-011 (approval history immutable), DEC-012 (transition valid).

| Field | Value |
|---|---|
| Purpose | Approvals move status `pending → approved` atomically |
| Entry | Approver invokes approval RPC |
| Exit | `status='approved'`, approval stage recorded, approver_id persisted |
| Negative controls | Duplicate approval denied (DEC-012); approval history tamper denied (DEC-011) |
| Evidence artifacts | Folded into Decision Lifecycle `evidence.json` |
| Release gate | Decision pipeline |

## 10. Decision rejection

Status: **IMPLEMENTED (EE-3)** — DEC-010 (rejection recorded with reason + rejecter_id).

| Field | Value |
|---|---|
| Purpose | Rejections halt lifecycle and require rationale |
| Entry | Approver rejects with reason |
| Exit | `status='rejected'`, reason persisted, notification emitted |
| Evidence artifacts | Folded into Decision Lifecycle `evidence.json` |
| Release gate | Decision pipeline |


## 11. Evidence attachment

Status: **IMPLEMENTED (EE-4)** — EVD-001 (attachment link) and EVD-003 (chain integrity). Consumed by `tests/evidence/pipelines/evidence-attachment.mjs` from adapter output at `$EVIDENCE_AUDIT_RESULTS`.

| Field | Value |
|---|---|
| Purpose | Attachments bind to a decision + org |
| Entry | Insert into `evidence_sources` linked to decision |
| Exit | Attachment evidence record present with chain hash and decision/org linkage |
| Negative controls | Evidence chain tamper must be denied or surfaced as failure |
| Evidence artifacts | Folded into Evidence/Audit `evidence.json` |
| Release gate | Evidence pipeline |

## 12. Evidence retrieval

Status: **IMPLEMENTED (EE-4)** — EVD-002 (retrieval), EVD-004 (citation preservation), EVD-010 (missing evidence detection).

| Field | Value |
|---|---|
| Purpose | Retrieval honors org scope and dataset scope |
| Entry | Read via `useDecisionEvidencePanel` hook |
| Exit | Expected evidence and citations return without mutation |
| Negative controls | Missing referenced evidence is detected and fails closed |
| Evidence artifacts | Folded into Evidence/Audit `evidence.json` |
| Release gate | Evidence pipeline |

## 13. Evidence export

Status: **IMPLEMENTED (EE-4)** — EVD-008 (export availability).

| Field | Value |
|---|---|
| Purpose | GDPR Art. 15/20 — data portability |
| Entry | `POST /functions/v1/data-export` |
| Exit | JSON bundle, `audit_log` action_type=`data_export` |
| Negative controls | Non-admin → 403; rate limit >5/h → 429 |
| Evidence artifacts | Folded into Evidence/Audit `evidence.json` |
| Release gate | Evidence pipeline |

## 14. AI recommendation

Status: **IMPLEMENTED (EE-5)** — AI-001 (recommendation), AI-005 (citation preservation), AI-006 (malformed response), AI-007 (timeout), AI-008 (429), AI-009 (fallback), AI-010 (hallucination guard), AI-011 (mocked AI mode). Consumed by `tests/evidence/pipelines/ai-recommendation.mjs` from mocked adapter output at `$EVIDENCE_AI_RESULTS`.

| Field | Value |
|---|---|
| Purpose | Recommendations are deterministic & carry evidence contract |
| Entry | Mocked AI evidence JSON produced by `tests/evidence/adapters/ai-adapter.mjs` |
| Exit | Mocked recommendation evidence present with citations and deterministic fallback paths |
| Negative controls | Malformed response, timeout, 429, fallback failure, and missing citations fail closed |
| Evidence artifacts | Folded into mocked AI `evidence.json` |
| Release gate | AI pipeline |

## 15. AI explanation

Status: **IMPLEMENTED (EE-5)** — AI-002 (explanation), AI-005 (citation preservation), AI-010 (hallucination guard), AI-011 (mocked AI mode).

| Field | Value |
|---|---|
| Purpose | Every recommendation has 7-layer explanation |
| Entry | Mocked AI evidence JSON produced by `tests/evidence/adapters/ai-adapter.mjs` |
| Exit | Structured mocked explanation evidence present and citation-backed |
| Evidence artifacts | Folded into mocked AI `evidence.json` |
| Release gate | AI pipeline |

## 16. Confidence scoring

Status: **IMPLEMENTED (EE-5)** — AI-003 (score stored), AI-004 (bounded 0–100), AI-011 (mocked AI mode).

| Field | Value |
|---|---|
| Purpose | Confidence score stored and bounded to the 0–100 evidence contract |
| Entry | Mocked AI evidence JSON produced by `tests/evidence/adapters/ai-adapter.mjs` |
| Exit | Confidence score evidence persisted and validated within 0–100 |
| Evidence artifacts | Folded into mocked AI `evidence.json` |
| Release gate | AI pipeline |

## 17. Decision ledger

| Field | Value |
|---|---|
| Purpose | Ledger is the source of truth for decisions |
| Entry | Read `/decisions` with authenticated org |
| Exit | Rows scoped to org, no other org visible |
| Evidence artifacts | `ledger.json` |
| Release gate | Decision pipeline |

## 18. Audit trail

Status: **IMPLEMENTED (EE-4)** — EVD-005 (audit record creation), EVD-006 (audit immutability), EVD-007 (timeline ordering), EVD-009 (tamper attempts denied).

| Field | Value |
|---|---|
| Purpose | Every mutating action produces an `audit_log` row |
| Entry | Any CUD via UI or edge fn |
| Exit | Row present with actor_id, action_type, payload, monotonic timeline ordering |
| Negative controls | UPDATE/DELETE/tamper attempts on audit or evidence records are denied |
| Evidence artifacts | Folded into Evidence/Audit `evidence.json` |
| Release gate | Audit pipeline |

## 19. Governance workflow

| Field | Value |
|---|---|
| Purpose | Approval chain stages execute in order |
| Entry | Decision with governance profile |
| Exit | Ordered stage transitions in `context_governance_audit` |
| Evidence artifacts | `governance-run.json` |
| Release gate | Governance pipeline |

## 20. Reports

| Field | Value |
|---|---|
| Purpose | Deterministic PDF/CSV output |
| Entry | `/reports` generation trigger |
| Exit | Artifact stored, checksum recorded |
| Evidence artifacts | `report.pdf.sha256`, `report-metadata.json` |
| Release gate | Reporting pipeline |

## 21. Executive exports

| Field | Value |
|---|---|
| Purpose | Board-mode exports include disclaimer + provenance |
| Entry | `/board-report` export button |
| Exit | PPTX with slides matching template |
| Evidence artifacts | `pptx.sha256`, `slides.json` |
| Release gate | Reporting pipeline |

## 22. Dashboard loading

| Field | Value |
|---|---|
| Purpose | Dashboard renders under budget with no console errors |
| Entry | Navigate to `/dashboard` |
| Exit | LCP < budget, all widgets scoped to org |
| Evidence artifacts | `dashboard-timings.json`, `console.log` |
| Release gate | System health |

## 23. Notifications

| Field | Value |
|---|---|
| Purpose | Notifications are org-scoped and rate-limited |
| Entry | Trigger event that emits `notification_log` |
| Exit | Recipient scoped, cooldown respected |
| Evidence artifacts | `notify.json` |
| Release gate | Notifications |

## 24. Billing

| Field | Value |
|---|---|
| Purpose | Stripe entitlements match `subscriptions` table |
| Entry | Read subscription for org |
| Exit | Plan matches Stripe webhook state |
| Negative controls | Downgrade past limit → feature gated |
| Evidence artifacts | `billing.json` |
| Release gate | Billing |

## 25. Credits

| Field | Value |
|---|---|
| Purpose | Credit counters decrement per usage; refund on failure |
| Entry | AI call in mock mode |
| Exit | `credit_ledger` row appended |
| Evidence artifacts | `credits.json` |
| Release gate | Billing |

## 26. Data import

| Field | Value |
|---|---|
| Purpose | CSV ingestion produces `datasets` + `dataset_versions` |
| Entry | Upload via `useChunkedIngestion` |
| Exit | Rows in `datasets`, PII flagged, industry classified |
| Negative controls | Malformed CSV → error, no partial write |
| Evidence artifacts | `import.json`, `pii-report.json` |
| Release gate | Decision pipeline |

## 27. Dataset versioning

| Field | Value |
|---|---|
| Purpose | Every ingest creates a version; drift captured |
| Entry | Second ingest of same dataset with new column |
| Exit | `schema_evolution_log` row present |
| Evidence artifacts | `versions.json`, `drift.json` |
| Release gate | Decision pipeline |

## 28. Rollback

| Field | Value |
|---|---|
| Purpose | Prior dataset version restorable |
| Entry | Rollback RPC |
| Exit | Active version pointer moved, audit row written |
| Evidence artifacts | `rollback.json` |
| Release gate | Recovery |

## 29. Edge functions

| Field | Value |
|---|---|
| Purpose | Every edge fn returns CORS, auth guard, request id |
| Entry | `curl` (or `supabase--curl_edge_functions`) each fn |
| Exit | 200/expected 4xx with headers |
| Evidence artifacts | `edge-function-matrix.csv` |
| Release gate | System health |

## 30. Realtime

| Field | Value |
|---|---|
| Purpose | Realtime channels respect RLS |
| Entry | Subscribe to `decision_ledger` for Org A |
| Exit | Org B insert does NOT deliver |
| Evidence artifacts | `realtime.json` |
| Release gate | Tenant isolation |

## 31. Background jobs

| Field | Value |
|---|---|
| Purpose | pg_cron jobs run under advisory lock |
| Entry | Read `cron_run_log` |
| Exit | Recent success + no overlap |
| Evidence artifacts | `cron.json` |
| Release gate | System health |

## 32. Organization management

| Field | Value |
|---|---|
| Purpose | Owner-only ops enforced |
| Entry | Owner + member call each admin RPC |
| Negative controls | Member call → 403 |
| Evidence artifacts | `org-admin.json` |
| Release gate | Authorization |

## 33. User management

| Field | Value |
|---|---|
| Purpose | Invite, role change, deactivation flow |
| Evidence artifacts | `users.json` |
| Release gate | Authorization |

## 34. Settings

| Field | Value |
|---|---|
| Purpose | Settings persist per org, redact secrets |
| Evidence artifacts | `settings.json` |
| Release gate | Authorization |

## 35. Search

| Field | Value |
|---|---|
| Purpose | Search scoped to org; no cross-tenant hits |
| Evidence artifacts | `search.json` |
| Release gate | Tenant isolation |

## 36. System health

| Field | Value |
|---|---|
| Purpose | `/system-health` SLO probes all green |
| Evidence artifacts | `slo.json` |
| Release gate | System health |

## 37. Recovery

| Field | Value |
|---|---|
| Purpose | DR runbook executable in staging |
| Entry | Restore snapshot to staging |
| Exit | Row counts match; audit intact |
| Evidence artifacts | `recovery.json` |
| Release gate | Recovery |

<!-- AUTO-GENERATED:GATES:START (do not edit — run npm run evidence:docs:write) -->

## Gate mapping (generated from `tests/evidence/lib/gates.mjs`)

This section is auto-generated. Do not hand-edit.

| Gate key | Label | Weight | Pipelines |
|---|---|---:|---|
| `authentication` | Authentication | 10 | `authentication`, `mfa`, `oauth`, `session-recovery` |
| `authorization` | Authorization | 10 | `authorization` |
| `tenant_isolation` | Tenant Isolation | 15 | `tenant-isolation`, `edge-functions`, `realtime` |
| `decision_pipeline` | Decision Pipeline | 10 | `decision-lifecycle` |
| `evidence_pipeline` | Evidence Pipeline | 10 | `evidence-attachment`, `evidence-retrieval`, `evidence-export` |
| `governance` | Governance | 10 | `governance-workflow`, `confidence-scoring` |
| `ai` | AI Pipeline | 10 | `ai-recommendation`, `ai-explanation` |
| `audit` | Audit | 0 | `audit-trail` |
| `reports` | Reports | 5 | `reports`, `executive-exports` |
| `notifications` | Notifications | 0 | `notifications` |
| `billing` | Billing | 0 | `billing`, `credits` |
| `scalability` | Scalability | 10 | `dashboard-loading`, `background-jobs` |
| `recovery` | Recovery | 10 | `recovery`, `rollback` |
| `system_health` | System Health | 10 | `deployment-verification`, `system-health`, `search`, `data-import`, `dataset-versioning` |

<!-- AUTO-GENERATED:GATES:END -->
