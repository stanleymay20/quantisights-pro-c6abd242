# Quantivis E2E + Load Coverage Matrix

Status legend: **PW** = Playwright, **k6** = k6 API, **MOCK** = stubbed, **EXC** = excluded (with reason), **GAP** = not yet covered.

Last updated alongside plan v4.

---

## 1. Authentication pipeline
| Feature | Tool | File | Notes |
|---|---|---|---|
| Email login (happy path) | PW | `e2e/auth.spec.ts` | uses seeded loadtest user |
| Email login (wrong password → friendly error) | PW | `e2e/auth.spec.ts` | asserts the "Incorrect email or password" toast |
| Google OAuth initiation | PW (probe) | `e2e/auth.spec.ts` | clicks button, asserts `lovable.auth.signInWithOAuth` → `/~oauth/initiate` 302; **callback not driven** (provider out-of-scope) |
| `/auth/callback` PKCE single-exchange | PW | `e2e/auth-callback.spec.ts` | navigates with mocked `?code=` and asserts F-1 fix (one exchange only) |
| Session persistence across reload | PW | `e2e/auth-session.spec.ts` | reload after login → still authenticated |
| Expired session recovery | PW | `e2e/auth-session.spec.ts` | clears `sb-*` key, asserts redirect to `/login` without crash |
| Logout | PW | `e2e/auth-session.spec.ts` | asserts redirect to `/login` and tenant session cleared |
| Protected-route redirects | PW | `e2e/auth-guard.spec.ts` | `/dashboard /decisions /reports /settings/*` → `/login` when unauthenticated |
| Auth rate-limit | k6 | `load/scenarios/03-load-50.js` (sub-mix) | invokes `auth-rate-limiter` |
| Leaked-password HIBP | EXC | — | disabled at user request; covered by unit |

## 2. Onboarding / workspace pipeline
| Feature | Tool | File | Notes |
|---|---|---|---|
| First-login → `/onboarding` redirect | PW | `e2e/onboarding.spec.ts` | new user lacks `organization_id` |
| Profile create (full_name) | PW | `e2e/onboarding.spec.ts` | submits form, asserts profile row via REST |
| Organization create + role assignment | PW | `e2e/onboarding.spec.ts` | asserts `organizations` + `user_roles` (owner) |
| Workspace bootstrap | PW | `e2e/onboarding.spec.ts` | default workspace created |
| Onboarding completion → `/dashboard` | PW | `e2e/onboarding.spec.ts` | first dashboard load <3s |

## 3. Data pipeline
| Feature | Tool | File | Notes |
|---|---|---|---|
| Mock dataset upload (`pe_portfolio_demo.csv`) | PW | `e2e/data-pipeline.spec.ts` | uses bundled sample |
| Dataset listing | PW | `e2e/data-pipeline.spec.ts` | `/data-catalog` shows row |
| Validation errors (bad CSV) | PW | `e2e/data-pipeline.spec.ts` | malformed file → error banner, no crash |
| Empty state | PW | `e2e/data-pipeline.spec.ts` | brand-new workspace shows "No datasets yet" |
| Dashboard metrics refresh | PW | `e2e/data-pipeline.spec.ts` | KPIs appear after ingest |
| KPI compute load | k6 | `load/workflows/data-pipeline.js` | calls `compute-kpi` repeatedly |
| Live connector pulls | EXC | — | name-blocked (Salesforce/SAP/HubSpot/BigQuery/Snowflake/S3) — would hit external systems |

## 4. Decision pipeline
| Feature | Tool | File | Notes |
|---|---|---|---|
| Create decision | PW + k6 | `e2e/decisions.spec.ts`, `load/workflows/decisions.js` | already wired |
| Attach evidence | PW + k6 | `load/workflows/business-outcome.js` | `evidence_sources` row |
| Generate recommendation (mocked) | k6 | `load/workflows/decisions.js` | `executive-copilot` + `x-test-mock:1` → `mock-ai` |
| Confidence score recorded | PW + k6 | `load/lib/workflow-assert.js` | asserts non-null `confidence`/`calibration` |
| Approve / reject | PW | `e2e/decisions.spec.ts` | exercises lifecycle transitions |
| Decision ledger write | PW + k6 | `load/workflows/business-outcome.js` | row returned + queryable |
| Audit trail update | PW + k6 | `load/workflows/audit.js` | `audit_log` row matches decision id |
| Bulk decision write | k6 | `load/scenarios/04-load-100.js` | 20% write share |

## 5. AI pipeline
| Feature | Tool | File | Notes |
|---|---|---|---|
| Default mock AI | MOCK | `supabase/functions/mock-ai/` | toggled via `x-test-mock: 1` |
| Timeout simulation | k6 | `load/scenarios/06-ai-chaos.js` | mock-ai delays 30s |
| Malformed JSON | k6 | `load/scenarios/06-ai-chaos.js` | mock-ai returns garbage |
| Provider 429 | k6 | `load/scenarios/06-ai-chaos.js` | rotated response code |
| 503 unavailable | k6 | `load/scenarios/06-ai-chaos.js` | rotated response code |
| Fallback path asserted | PW | `e2e/ai-fallback.spec.ts` | UI surfaces graceful error, audit row written |
| Confidence/citation propagation | PW + k6 | `load/lib/workflow-assert.js` | citations array length ≥1 in mocked response |
| Live LLM calls | EXC by default | — | requires `LOAD_AI=live` + `LOAD_AI_BUDGET_USD` |

## 6. Governance pipeline
| Feature | Tool | File | Notes |
|---|---|---|---|
| Evidence chain integrity | PW + integrity | `load/integrity/verify-integrity.mjs` | orphan-check across `decision_ledger` ↔ `evidence_sources` |
| Decision ledger surface | PW | `e2e/governance.spec.ts` | `/decisions` lifecycle states render |
| Trust score read | PW | `e2e/governance.spec.ts` | `/security-overview` trust badges |
| Governance timeline | PW | `e2e/governance.spec.ts` | append-only `intelligence_audit_trail` view |
| Risk mapping | PW | `e2e/governance.spec.ts` | risk register row created with decision |
| Compliance mapping | PW | `e2e/governance.spec.ts` | EU AI Act class shown |
| Immutable audit trail | integrity | `load/integrity/verify-integrity.mjs` | DENY-UPDATE/DELETE policy regression check |

## 7. Reporting / export pipeline
| Feature | Tool | File | Notes |
|---|---|---|---|
| Executive report render | PW | `e2e/reports.spec.ts` | `/reports` loads |
| Board report render | PW | `e2e/reports.spec.ts` | `/board-report` loads |
| PDF export | PW | `e2e/reports.spec.ts` | download captured, magic bytes `%PDF` |
| PPTX export | PW | `e2e/reports.spec.ts` | download captured, magic bytes `PK\x03\x04` |
| Export failure handling | PW | `e2e/reports.spec.ts` | toggles `?force_error=1` mock → toast, no crash |
| Real `data-export` mass run | EXC | — | name-blocked; would email and consume storage |

## 8. Team / permissions pipeline
| Feature | Tool | File | Notes |
|---|---|---|---|
| Invite user (mock email) | PW | `e2e/permissions.spec.ts` | uses fake-TLD address; mailer stubbed |
| Role change owner→admin→viewer | PW | `e2e/permissions.spec.ts` | RPC + UI |
| Unauthorized access (viewer hits owner-only) | PW | `e2e/permissions.spec.ts` | expects 403 surface |
| Tenant isolation org A vs org B | k6 | `load/workflows/tenant-isolation.js` | already wired; hard-fail criterion |
| Cross-tenant write blocked | k6 | `load/workflows/tenant-isolation.js` | POST as A into B → reject |

## 9. Billing / pricing pipeline
| Feature | Tool | File | Notes |
|---|---|---|---|
| Pricing page render | PW | `e2e/billing.spec.ts` | `/pricing` (or BusinessModel) |
| Checkout entry (intent only) | PW | `e2e/billing.spec.ts` | clicks CTA; asserts redirect URL host = `checkout.stripe.com`; does **not** complete |
| Subscription status read | PW | `e2e/billing.spec.ts` | `subscriptions` row fetched (mocked tier) |
| Failed payment / empty state | PW | `e2e/billing.spec.ts` | `?mock_billing=failed` |
| Real payment | EXC | — | never executed |

## 10. Notifications / status pipeline
| Feature | Tool | File | Notes |
|---|---|---|---|
| Notification creation | PW | `e2e/notifications.spec.ts` | seed via authenticated REST insert |
| Read/unread toggle | PW | `e2e/notifications.spec.ts` | bell badge decrements |
| System status page | PW | `e2e/notifications.spec.ts` | `/system-health` + `public-system-status` |
| Error banners | PW | `e2e/notifications.spec.ts` | forced-error route surface |
| Loading skeletons | PW | `e2e/notifications.spec.ts` | asserts no FOUC |

## 11. Admin / security pipeline
| Feature | Tool | File | Notes |
|---|---|---|---|
| MFA gate (AAL2) | PW | `e2e/security.spec.ts` | gate triggers on `/admin/*` if MFA enabled |
| Audit log read | PW | `e2e/security.spec.ts` | `/admin/governance-audit` |
| Security settings | PW | `e2e/security.spec.ts` | `/settings/security` renders |
| API keys / SCIM tokens | PW | `e2e/security.spec.ts` | listing only; never creates live key |
| Access denial states | PW | `e2e/security.spec.ts` | viewer hits admin → 403 surface |
| Step-up auth | PW | `e2e/security.spec.ts` | `useStepUpAuth` challenge on destructive action |

## 12. Performance / load stages
| Stage | Tool | Where | Notes |
|---|---|---|---|
| 1-user full feature journey | PW | `e2e/full-journey.spec.ts` | new stage walks §1–§11 happy paths end-to-end |
| 10-user browser subset | PW | `e2e/auth-session.spec.ts --workers=10` | existing |
| 50-user API mix | k6 | `load/scenarios/03-load-50.js` | feature mix (data 30/decisions 30/governance 20/reports 10/notifications 10) |
| 100-user API mix | k6 | `load/scenarios/04-load-100.js` | same mix, higher RPS |
| 1000-user API stress | k6 | `load/scenarios/05-stress-1000.js` | read 80 / write 20, hard cap (10 min, 150k iters) |
| AI chaos | k6 | `load/scenarios/06-ai-chaos.js` | provider failure rotation |
| Long browser session | PW | `e2e/long-session.spec.ts` | 30–60 min memory leak watch |

---

## Pass / fail thresholds

| Metric | 50 VU | 100 VU | 1000 VU |
|---|---|---|---|
| p95 read | <800ms | <1.2s | <2.5s |
| p95 write | <1.5s | <2s | <4s |
| Error rate | <0.5% | <1% | <3% |
| 5xx | 0 | 0 | <0.5% |
| `cross_tenant_leaks` | **0** | **0** | **0** |
| `workflow_success_rate` | ≥99% | ≥98% | ≥95% |
| PW console errors | 0 | 0 | n/a |

Hard fails (any stage, any count):
- cross-tenant leak
- audit-trail UPDATE/DELETE permitted
- secret leak in logs
- step-up auth bypass

## Data cleanup strategy

1. **Scope** — all writes carry `organization_id IN (LOAD_ORG_A_ID, LOAD_ORG_B_ID)` (both flagged `is_demo=true`).
2. **Tagging** — every row inserted by load tests stamps `metadata.test_run_id = $LOAD_RUN_ID` (uuid generated per invocation).
3. **Teardown** — `npm run load:teardown` deletes by `(organization_id IN loadtest, metadata->>test_run_id = $LOAD_RUN_ID)` from: `decision_ledger`, `evidence_sources`, `audit_log`, `intelligence_audit_trail`, `reports`, `notification_log`, `copilot_messages`, `copilot_sessions`, `metrics`, `insights`.
4. **Auth users** — `auth.users` with `loadtest-*@quantivis.test` purged via admin API.
5. **Verification** — `npm run load:verify-teardown` asserts zero remaining rows; non-zero → exit 1 and blocks release gate.
6. **Storage** — uploads scoped to bucket prefix `loadtest/<run_id>/`; teardown removes prefix.
7. **No prod writes** — production locked unless `LOAD_TARGET=production && LOAD_CONFIRM_PROD=I_UNDERSTAND` (intentionally awkward).

## Remaining gaps (explicit)

| Gap | Why open | Resolution |
|---|---|---|
| Google OAuth full round-trip | requires real Google account + consent screen automation | leave as PW probe asserting initiation only |
| Live AI provider behaviour | cost + nondeterminism | optional `LOAD_AI=live` stage with budget cap |
| Connector pulls (Salesforce/SAP/HubSpot/BigQuery/Snowflake/S3) | external systems, side effects, secrets | name-blocked; covered by per-connector contract tests outside this framework |
| Real Stripe checkout completion | regulatory + payment | never automated |
| Email delivery (Resend) | would spam inboxes | suppressed via fake TLD + sender block-list |
| Mobile Safari + Firefox matrix | scope | future stage, Playwright project config only |
| Staging seed user creation in this environment | `SUPABASE_SERVICE_ROLE_KEY` not exposed on Lovable Cloud | seed must run from external CI with the key, or be replaced by per-org self-service signup script |
