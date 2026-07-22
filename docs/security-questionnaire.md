# Security Questionnaire — SIG/CAIQ Responses

**Prepared for:** Enterprise Procurement Review  
**Last Updated:** 2026-04-08  
**Platform:** Quantivis Decision Intelligence Platform

---

## 1. Access Control

### Q: How is user authentication implemented?
**A:** JWT-based authentication via Lovable Cloud Auth. Supports email/password, MFA (TOTP), WebAuthn/passkeys, and SSO (SAML 2.0/OIDC). Session tokens are short-lived with automatic refresh. Step-up re-authentication is required for sensitive operations (executive overrides) with a 5-minute validity window.

**Evidence:** `auth-guard.ts`, `exec_verify_step_up_auth` RPC, `SessionManagement.tsx`

### Q: How is authorization managed?
**A:** Role-Based Access Control (RBAC) with 6 roles: owner, admin, analyst, executive, steward, viewer. Permissions are enforced at three layers:
1. **Database:** Row Level Security (RLS) on 100% of data tables
2. **Edge Functions:** `is_org_member` and `exec_require_elevated_role` RPCs
3. **Client:** `PermissionGate` component for UI-level enforcement

**Evidence:** `has_permission` RPC, `organization_members` table, `role_permissions` table

### Q: Is multi-tenancy enforced at the database level?
**A:** Yes. Every data table includes an `organization_id` column with RLS policies that restrict access to authenticated users who are members of the organization. Cross-tenant data access is architecturally impossible through the application layer.

**Evidence:** RLS policies on all public tables verified via security scanner

---

## 2. Data Protection

### Q: Is data encrypted at rest?
**A:** Yes. AES-256 encryption at rest for all database storage and object storage (datasets, reports buckets). This is infrastructure-inherited from Lovable Cloud.

### Q: Is data encrypted in transit?
**A:** Yes. TLS 1.3 for all API communication. HSTS headers enforced. No plaintext endpoints exposed.

### Q: How is sensitive data handled?
**A:** 
- Passwords: Bcrypt hashed (never stored in plaintext)
- API keys/secrets: Stored in Lovable Cloud vault (never in codebase)
- SCIM tokens: Stored as SHA-256 hashes
- PII: Minimized; AI redaction layer strips PII before AI processing (`ai-redaction.ts`)

### Q: What is the data retention policy?
**A:** Configurable per-organization with automated enforcement:
- Execution events: 180 days (configurable, minimum 30)
- Predictions: 90 days for superseded entries
- Scores: 365 days
- Copilot messages: 30 days (automated cleanup)
- Audit logs: Indefinite (immutable, cannot be deleted)

**Evidence:** `exec_cleanup_old_data` RPC, `data_retention_policies` table, `retention-cleanup` edge function

---

## 3. Audit & Logging

### Q: Is there an audit trail?
**A:** Yes. Immutable audit log with database-level DENY policies on UPDATE and DELETE. All significant actions are logged including:
- Authentication events (with risk scoring)
- Data access and modifications
- Executive overrides (with before/after state diffs)
- Administrative actions (role changes, invitations)
- System operations (retention cleanup, bulk operations)

**Evidence:** `audit_log` table, `auth_events` table, `execution_overrides` table

### Q: Can audit logs be exported?
**A:** Yes. Via the `data-export` edge function and governance export functionality.

---

## 4. Infrastructure & Operations

### Q: Where is data hosted?
**A:** Lovable Cloud infrastructure. Database, edge functions, and storage are co-located.

### Q: Is there a disaster recovery plan?
**A:** Yes. Documented DR runbook with:
- RPO: ≤ 1 hour (continuous WAL archiving)
- RTO: ≤ 4 hours (full instance recovery)
- Quarterly PITR restore drills
- Edge function rollback from Git

**Evidence:** `disaster-recovery-runbook.md`

### Q: Is there an incident response plan?
**A:** Yes. Documented incident response playbook with:
- 4-tier severity classification (P0–P3)
- Response time SLAs (15 min for P0)
- Communication templates
- Post-mortem requirements
- Escalation matrix

**Evidence:** `incident-response-playbook.md`

### Q: How is system health monitored?
**A:** Multi-layer monitoring:
- Health-check edge function (5-min intervals)
- Per-action telemetry (P95 latency, error rate, throughput)
- Circuit breakers with automatic fallback
- Cron job health tracking (`cron_run_log`)
- Client-side error reporting pipeline

**Evidence:** `telemetry.ts`, `health-check` function, `circuit-breaker.ts`

---

## 5. Application Security

### Q: How is input validated?
**A:** All user input is validated at multiple layers:
- Client: React Hook Form with Zod schemas
- Edge functions: `input-validation.ts` utility (UUID, string length, type checks)
- Database: Typed columns, NOT NULL constraints, foreign key constraints

### Q: Is there rate limiting?
**A:** Yes. Tiered rate limiting per organization:
- Intelligence (AI): 20/min
- Queries: 60/min
- Mutations: 30/min
- Exports: 5/hour
- Simulations: 10/min
- Webhooks: 100/min

**Evidence:** `rate-guard.ts`

### Q: How are dependencies managed?
**A:** NPM for frontend dependencies with lockfile enforcement. Deno for edge functions with URL-based imports pinned to specific versions. Automated dependency scanning available.

---

## 6. Business Continuity

### Q: What is the uptime target?
**A:** 99.9% availability SLA target documented at `/sla`.

### Q: How are backups performed?
**A:** Continuous WAL archiving with PITR granularity. Daily full snapshots retained for 30 days. 7-day PITR window for transaction-level recovery.

### Q: Has DR been tested?
**A:** Edge function rollback tested (2026-04-08). PITR restore drill scheduled for Q2 2026. Full recovery simulation scheduled for Q3 2026.

---

## 7. Compliance

### Q: Is the platform GDPR/DSGVO compliant?
**A:** Yes. The platform implements:
- Right to erasure (`delete-account` edge function)
- Data portability (`data-export` edge function)
- Privacy dashboard for data subject access requests
- Cookie consent management
- Impressum (§ 5 DDG)
- Data processing documentation

### Q: Is SOC 2 Type II certification in progress?
**A:** Control mapping is complete at 84% coverage (36/43 criteria mapped with evidence). Formal audit engagement is the next step.

### Q: Are subprocessors documented?
**A:** Yes. Subprocessor list available at `/subprocessors` with:
- Lovable Cloud (infrastructure)
- Stripe (billing)
- Resend (transactional email)
- AI providers (via Lovable AI Gateway)
