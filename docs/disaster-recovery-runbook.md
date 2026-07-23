# Disaster Recovery Runbook

**Document Owner:** Platform Engineering  
**Last Updated:** 2026-04-08  
**Classification:** Internal — Confidential  
**Review Cadence:** Quarterly

---

## 1. Recovery Objectives

| Metric | Target | Rationale |
|--------|--------|-----------|
| **RPO** (Recovery Point Objective) | ≤ 1 hour | Lovable Cloud provides continuous WAL archiving with PITR granularity |
| **RTO** (Recovery Time Objective) | ≤ 4 hours | Includes detection, decision, restore, validation, and DNS cutover |
| **MTTR** (Mean Time to Repair) | ≤ 2 hours | Target for P0/P1 incidents with on-call response |

---

## 2. Backup Architecture

### 2.1 Database Backups
- **Method:** Continuous WAL (Write-Ahead Log) archiving via Lovable Cloud
- **PITR Granularity:** Per-transaction (sub-second)
- **Retention:** 7 days of PITR capability
- **Daily Snapshots:** Automated daily full snapshots retained for 30 days
- **Storage:** Encrypted at rest (AES-256) in separate availability zone

### 2.2 Application State
- **Edge Functions:** Version-controlled in Git; redeployable from any commit
- **Storage Buckets:** `datasets` and `reports` — backed up with database snapshots
- **Configuration:** `supabase/config.toml` in version control
- **Secrets:** Managed via Lovable Cloud secret store (not in codebase)

### 2.3 What Is NOT Backed Up
- In-memory rate limiter state (reconstructs on cold start)
- In-memory telemetry rolling windows (reconstructs from `execution_run_log`)
- Browser session state (client-side, ephemeral)

---

## 3. Recovery Procedures

### 3.1 Procedure A: Database Point-in-Time Recovery

**When:** Data corruption, accidental bulk deletion, schema migration failure

1. **Assess** — Identify the exact timestamp before corruption
2. **Notify** — Alert incident commander and stakeholders
3. **Initiate PITR** — Via Lovable Cloud Advanced Settings → Restore to point-in-time
4. **Validate** — Run integrity checks:
   ```sql
   -- Verify row counts on critical tables
   SELECT 'execution_plans' as t, count(*) FROM execution_plans
   UNION ALL SELECT 'execution_scores', count(*) FROM execution_scores
   UNION ALL SELECT 'audit_log', count(*) FROM audit_log
   UNION ALL SELECT 'decision_ledger', count(*) FROM decision_ledger;
   ```
5. **Verify Edge Functions** — Redeploy all edge functions from current Git HEAD
6. **Smoke Test** — Execute integration test suite against restored instance
7. **Confirm** — Update status page, notify stakeholders

**Expected Duration:** 1–3 hours

### 3.2 Procedure B: Full Instance Recovery

**When:** Complete infrastructure failure, region outage

1. **Detect** — Health-check alerts trigger within 5 minutes
2. **Escalate** — P0 incident declared, war room opened
3. **Provision** — Lovable Cloud provisions replacement instance
4. **Restore** — Apply latest snapshot + WAL replay to target timestamp
5. **Redeploy** — All edge functions from Git
6. **DNS** — Update DNS to new instance (automated via Lovable Cloud)
7. **Validate** — Full E2E test suite + manual smoke test
8. **Confirm** — Status page updated, post-incident review scheduled

**Expected Duration:** 2–4 hours

### 3.3 Procedure C: Edge Function Recovery

**When:** Function deployment failure, runtime regression

1. **Identify** — Check edge function logs for error patterns
2. **Rollback** — Redeploy from last known-good Git commit
3. **Validate** — Run `supabase--test_edge_functions` for affected functions
4. **Monitor** — Watch error rates for 30 minutes post-deploy

**Expected Duration:** 15–30 minutes

---

## 4. Data Integrity Verification

### Post-Recovery Checklist

| Check | Query / Method | Pass Criteria |
|-------|---------------|---------------|
| Audit log immutability | `SELECT count(*) FROM audit_log` | Count matches pre-incident baseline |
| Organization integrity | `SELECT count(*) FROM organizations` | All orgs present |
| Execution plan state | `SELECT status, count(*) FROM execution_plans GROUP BY status` | No orphaned states |
| Score consistency | `SELECT count(*) FROM execution_scores WHERE score < 0 OR score > 100` | Returns 0 |
| Prediction active flags | `SELECT count(*) FROM execution_predictions WHERE is_active = true AND superseded_at IS NOT NULL` | Returns 0 |
| RLS enforcement | Attempt unauthenticated query via anon key | Returns empty/denied |
| Index health | `SELECT indexrelname, idx_scan FROM pg_stat_user_indexes WHERE schemaname='public' ORDER BY idx_scan` | All critical indexes show scans |

---

## 5. Communication Plan

| Audience | Channel | Timing |
|----------|---------|--------|
| Engineering team | Slack #incidents | Immediate |
| Executive stakeholders | Email + Slack | Within 15 minutes |
| Affected customers | Status page + email | Within 30 minutes |
| All customers | Status page update | Within 1 hour |
| Post-incident report | Email + documentation | Within 48 hours |

---

## 6. DR Test Schedule

| Test Type | Frequency | Last Tested | Next Scheduled |
|-----------|-----------|-------------|----------------|
| PITR restore drill | Quarterly | — | Q2 2026 |
| Edge function rollback | Monthly | 2026-04-08 | 2026-05-08 |
| Full recovery simulation | Semi-annually | — | Q3 2026 |
| Runbook review | Quarterly | 2026-04-08 | 2026-07-08 |

---

## 7. Data Archival Strategy

### High-Volume Tables (Current Sizes)

| Table | Current Size | Growth Rate | Archival Strategy |
|-------|-------------|-------------|-------------------|
| `metrics` | 205 MB | ~50 MB/month | Partition by `date` (monthly); archive >12 months to cold storage |
| `raw_records` | 176 MB | ~40 MB/month | Partition by `created_at` (monthly); archive >6 months |
| `metric_aggregates` | 9 MB | ~2 MB/month | Retain indefinitely (pre-computed summaries) |
| `execution_events` | <1 MB | Variable | `exec_cleanup_old_data` RPC (180-day retention) |
| `execution_predictions` | <1 MB | Variable | Superseded predictions cleaned at 90 days |
| `execution_scores` | <1 MB | Variable | Retained for 365 days |
| `execution_run_log` | <1 MB | Variable | Cleaned at 90 days |
| `cron_run_log` | 1 MB | ~200 KB/month | Clean entries >90 days |

### Partitioning Roadmap
1. **Phase 1 (Current):** Retention RPCs handle cleanup for execution tables
2. **Phase 2 (Q3 2026):** Implement `pg_partman` for `metrics` and `raw_records` tables
3. **Phase 3 (Q4 2026):** Cold-storage archival pipeline for partitions >12 months

---

## 8. Escalation Matrix

| Severity | Definition | Response Time | Resolver |
|----------|-----------|---------------|----------|
| **P0 — Critical** | Full system down, data loss risk | 15 minutes | On-call + Engineering Lead |
| **P1 — High** | Major feature degraded, no data loss | 30 minutes | On-call engineer |
| **P2 — Medium** | Minor feature impacted | 4 hours | Engineering team |
| **P3 — Low** | Cosmetic / non-urgent | Next business day | Engineering backlog |
