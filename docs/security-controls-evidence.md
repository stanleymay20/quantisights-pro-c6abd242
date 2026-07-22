# Security Controls & Compliance Evidence Pack

**Document Owner:** Platform Engineering  
**Last Updated:** 2026-04-08  
**Classification:** Internal — Confidential  
**Applicable Frameworks:** SOC 2 Type II, ISO 27001, GDPR/DSGVO

---

## 1. SOC 2 Type II Control Mapping

### Trust Service Criteria Coverage

| Category | Controls Mapped | Evidence Available | Coverage |
|----------|----------------|-------------------|----------|
| **CC1 — Control Environment** | 4/5 | Partial | 80% |
| **CC2 — Communication & Information** | 3/4 | Yes | 75% |
| **CC3 — Risk Assessment** | 4/4 | Yes | 100% |
| **CC5 — Control Activities** | 6/7 | Yes | 86% |
| **CC6 — Logical & Physical Access** | 7/8 | Yes | 88% |
| **CC7 — System Operations** | 5/6 | Yes | 83% |
| **CC8 — Change Management** | 4/5 | Yes | 80% |
| **CC9 — Risk Mitigation** | 3/4 | Yes | 75% |
| **Overall** | **36/43** | | **84%** |

### Detailed Control Evidence

#### CC3 — Risk Assessment

| Control | Implementation | Evidence |
|---------|---------------|----------|
| CC3.1 — Risk identification | Execution engine risk scoring (`predict_risks`) with multi-factor model | `predictions.ts` — MODEL_VERSION 3, 8+ risk factors |
| CC3.2 — Risk analysis | Automated blocker inference, dependency graph analysis | `exec_infer_blockers` RPC, `getDependencyGraph` action |
| CC3.3 — Fraud/misconduct risk | Cognitive bias detection, calibration assessment | `cognitive-bias-detect` edge function, calibration models |
| CC3.4 — Change impact | Executive override audit trail, state diff capture | `exec_log_override` RPC with `previous_state`/`new_state` |

#### CC5 — Control Activities

| Control | Implementation | Evidence |
|---------|---------------|----------|
| CC5.1 — Segregation of duties | RBAC with 6 roles (owner, admin, analyst, executive, steward, viewer) | `organization_members.role`, `has_permission` RPC |
| CC5.2 — Access controls | RLS on 100% of data tables, org-scoped queries | Database RLS policies, `is_org_member` RPC |
| CC5.3 — Technology infrastructure | Edge functions with circuit breakers, rate limiting | `circuit-breaker.ts`, `rate-guard.ts` |
| CC5.5 — Authentication | MFA support, step-up auth, session management | `exec_verify_step_up_auth` RPC, `SessionManagement.tsx` |
| CC5.6 — Logical access security | JWT validation, org membership verification | `auth-guard.ts`, `verifyOrgMembership` |
| CC5.8 — Change management | Git-based deployments, immutable audit log | Audit log with DENY on UPDATE/DELETE |

#### CC6 — Logical & Physical Access

| Control | Implementation | Evidence |
|---------|---------------|----------|
| CC6.1 — Logical access provisioning | Invitation-based org membership with role assignment | `team_invitations` table, `accept_invitation` RPC |
| CC6.2 — User registration | Handle_new_user trigger creates org + profile + workspace atomically | `handle_new_user()` trigger function |
| CC6.3 — Elevated access | Step-up auth required for executive overrides | `exec_verify_step_up_auth` (5-min validity window) |
| CC6.4 — Access review | Auth event logging with risk scoring | `auth_events` table, `login-anomaly-detect` function |
| CC6.5 — Access revocation | Cascade delete on user removal | FK constraints with `ON DELETE CASCADE` |
| CC6.6 — System credentials | Secrets in Lovable Cloud vault, never in code | `.env` auto-managed, secrets tool |
| CC6.7 — Sensitive data | Encryption at rest (AES-256), TLS 1.3 in transit | Infrastructure-inherited (Lovable Cloud) |

#### CC7 — System Operations

| Control | Implementation | Evidence |
|---------|---------------|----------|
| CC7.1 — Infrastructure monitoring | Health-check edge function, SLO dashboards | `health-check` function, `telemetry_stats` action |
| CC7.2 — Incident detection | Error reporting pipeline, circuit breaker alerts | `error-reporter.ts`, `circuit-breaker.ts` |
| CC7.3 — Incident response | Documented playbook with severity matrix | `incident-response-playbook.md` |
| CC7.4 — Data backup | Continuous WAL archiving, daily snapshots | Lovable Cloud PITR (7-day window) |
| CC7.5 — Recovery testing | DR runbook with test schedule | `disaster-recovery-runbook.md` §6 |

---

## 2. Data Residency & Processing Documentation

### Data Flow Map

```
User Browser (EU/US)
    │
    ▼
Lovable Cloud CDN (Edge)
    │
    ├─► Edge Functions (Deno runtime)
    │       │
    │       ├─► Lovable AI Gateway (AI processing)
    │       ├─► Stripe API (billing — US)
    │       └─► Resend API (email — US)
    │
    └─► PostgreSQL Database (Lovable Cloud)
            │
            ├─► WAL Archive (backup storage)
            └─► Object Storage (datasets, reports)
```

### Data Categories & Locations

| Data Category | Storage Location | Encryption | Retention |
|---------------|-----------------|------------|-----------|
| User credentials | Lovable Cloud Auth | Bcrypt hashed | Account lifetime |
| Organization data | PostgreSQL | AES-256 at rest | Account lifetime |
| Execution plans/scores | PostgreSQL | AES-256 at rest | Configurable (default 365 days) |
| Uploaded datasets | Object Storage (`datasets` bucket) | AES-256 at rest | Configurable |
| Audit logs | PostgreSQL (immutable) | AES-256 at rest | Indefinite |
| Copilot messages | PostgreSQL | AES-256 at rest | 30 days (auto-cleanup) |
| Decision embeddings | PostgreSQL (pgvector) | AES-256 at rest | Account lifetime |

### GDPR/DSGVO Compliance

| Requirement | Implementation | Article |
|------------|---------------|---------|
| Lawful basis | Consent + legitimate interest | Art. 6 |
| Data minimization | Only required fields collected | Art. 5(1)(c) |
| Right to erasure | `delete-account` edge function | Art. 17 |
| Data portability | `data-export` edge function (JSON/CSV) | Art. 20 |
| Privacy by design | RLS, encryption, audit trails | Art. 25 |
| DPO designation | Contact: see Impressum | Art. 37 |
| Cross-border transfers | Data processing within Lovable Cloud | Art. 44 |
| Breach notification | Incident response playbook (72-hr target) | Art. 33 |

---

## 3. Architecture & Control Evidence

### Security Boundaries

```
┌─────────────────────────────────────────────────────┐
│                    PUBLIC INTERNET                    │
│  ┌───────────────────────────────────────────────┐   │
│  │              TLS 1.3 TERMINATION               │   │
│  └───────────────────┬───────────────────────────┘   │
│                      │                               │
│  ┌───────────────────▼───────────────────────────┐   │
│  │           EDGE FUNCTION LAYER                  │   │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────────┐  │   │
│  │  │Auth Guard│ │Rate Guard│ │Circuit Breaker│  │   │
│  │  └────┬────┘ └─────┬────┘ └──────┬────────┘  │   │
│  │       │            │             │            │   │
│  │  ┌────▼────────────▼─────────────▼────────┐   │   │
│  │  │         ACTION MODULES                  │   │   │
│  │  │  Interventions │ Scoring │ Predictions  │   │   │
│  │  │  Overrides │ Intelligence │ Telemetry   │   │   │
│  │  └────────────────┬───────────────────────┘   │   │
│  └───────────────────┼───────────────────────────┘   │
│                      │                               │
│  ┌───────────────────▼───────────────────────────┐   │
│  │           DATABASE LAYER                       │   │
│  │  ┌──────┐ ┌───────────┐ ┌──────────────────┐ │   │
│  │  │ RLS  │ │ Atomic RPCs│ │ Immutable Audit  │ │   │
│  │  └──────┘ └───────────┘ └──────────────────┘ │   │
│  │  ┌──────────────────────────────────────────┐ │   │
│  │  │  AES-256 Encryption at Rest              │ │   │
│  │  └──────────────────────────────────────────┘ │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Security Controls Summary

| Layer | Control | Type | Verification |
|-------|---------|------|-------------|
| Network | TLS 1.3 | Preventive | Infrastructure-inherited |
| Network | CORS allowlist | Preventive | `cors.ts` — origin validation |
| Network | Cloudflare enterprise response headers | Preventive | `npm run cloudflare:verify`; checks CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, CORP |
| Network | CSP headers | Preventive | Cloudflare response header transform rule; local config mirrored in `_headers`, `_worker.js`, and `vercel.json` |
| Auth | JWT validation | Preventive | `auth-guard.ts` — `getUser()` |
| Auth | Org membership | Preventive | `is_org_member` RPC |
| Auth | Step-up auth | Preventive | `exec_verify_step_up_auth` (5-min window) |
| Auth | MFA support | Preventive | Supabase Auth MFA |
| Auth | Login anomaly detection | Detective | `login-anomaly-detect` function |
| Access | RBAC (6 roles) | Preventive | `organization_members.role` |
| Access | RLS on all tables | Preventive | 100% coverage verified |
| Access | Permission system | Preventive | `has_permission` RPC |
| Data | Encryption at rest | Preventive | AES-256 (infrastructure) |
| Data | Input validation | Preventive | `input-validation.ts`, Zod schemas |
| Data | Audit trail (immutable) | Detective | `audit_log` with DENY UPDATE/DELETE |
| Ops | Rate limiting (tiered) | Preventive | `rate-guard.ts` — 6 tiers |
| Ops | Circuit breakers | Preventive | `circuit-breaker.ts` — 3-state |
| Ops | Error isolation | Preventive | Per-action try/catch in router |
| Ops | Telemetry | Detective | Per-action P95, error rate, throughput |
| Recovery | PITR backups | Corrective | 7-day continuous WAL |
| Recovery | Retention cleanup | Corrective | `exec_cleanup_old_data` RPC |

---

## 4. Pen Test Scope & Remediation Tracking

### Scope Definition

| Area | In Scope | Testing Method |
|------|----------|---------------|
| Edge function endpoints | All 40+ functions | API fuzzing, auth bypass attempts |
| Database RLS policies | All public tables | Privilege escalation testing |
| Authentication flows | Login, MFA, step-up, SSO | Session hijacking, token manipulation |
| Storage access | `datasets`, `reports` buckets | Path traversal, unauthorized access |
| Client-side | React SPA | XSS, CSRF, open redirect |
| Third-party integrations | Stripe webhooks, AI gateway | Webhook spoofing, injection |

### Known Findings & Remediation Status

| ID | Finding | Severity | Status | Target Date |
|----|---------|----------|--------|-------------|
| PT-001 | Realtime channel authorization missing | High | Identified | Q2 2026 |
| PT-002 | Storage bucket not scoped to workspace | Medium | Identified | Q2 2026 |
| PT-003 | SCIM token DELETE not creator-scoped | Low | Identified | Q3 2026 |
| PT-004 | Slack webhook URL in notification_preferences | Low | Identified | Q3 2026 |
| PT-005 | Some RLS policies use `USING(true)` for INSERT | Warn | Under review | Q2 2026 |

---

## 5. Security Incident Response

### Classification

| Type | Severity | Example |
|------|----------|---------|
| Data breach | P0 | Unauthorized data access confirmed |
| Auth bypass | P0 | Authentication mechanism circumvented |
| Privilege escalation | P1 | User accessing data outside their org/role |
| Data exfiltration attempt | P1 | Anomalous export patterns detected |
| Credential exposure | P1 | Secret leaked in logs or code |
| Brute force attack | P2 | Sustained auth failures from single source |
| Vulnerability disclosure | P2 | External researcher reports finding |

### Response Steps

1. **Contain** — Isolate affected accounts/services
2. **Assess** — Determine scope and data impacted
3. **Preserve** — Capture logs, audit trail, forensic evidence
4. **Notify** — Per GDPR Art. 33: supervisory authority within 72 hours
5. **Remediate** — Apply fix, rotate credentials, update controls
6. **Report** — Post-incident report with root cause and prevention
