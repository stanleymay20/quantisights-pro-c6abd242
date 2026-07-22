# Incident Response Playbook

**Document Owner:** Platform Engineering  
**Last Updated:** 2026-04-08  
**Classification:** Internal — Confidential

---

## 1. Incident Severity Classification

| Severity | Criteria | Examples | SLA |
|----------|----------|----------|-----|
| **P0 — Critical** | System-wide outage, data integrity risk, security breach | Database down, auth failure, data corruption | 15-min response, 4-hr resolution |
| **P1 — High** | Major feature unavailable, performance severely degraded | Edge functions failing, execution engine down | 30-min response, 8-hr resolution |
| **P2 — Medium** | Feature partially degraded, workaround available | Slow queries, intermittent errors, stale data | 4-hr response, 24-hr resolution |
| **P3 — Low** | Minor impact, cosmetic issues | UI glitch, non-critical log errors | Next business day |

---

## 2. Incident Response Flow

```
Detection → Triage → Containment → Investigation → Resolution → Post-Mortem
```

### 2.1 Detection Sources

| Source | Signal | Alert Threshold |
|--------|--------|-----------------|
| Health-check edge function | HTTP 5xx or timeout | 3 consecutive failures |
| Edge function logs | Error rate spike | >5% error rate over 5 minutes |
| `execution_run_log` | Failed run status | >3 consecutive failures per run_type |
| Database metrics | Connection pool exhaustion | >80% pool utilization |
| Client error reporter | `window.onerror` / unhandled rejection | >10 unique errors in 5 minutes |
| Telemetry stats | P95 latency spike | >2x baseline for any action |
| Circuit breaker | Breaker trips to OPEN | Any circuit breaker activation |

### 2.2 Triage Checklist

1. **Classify severity** using the matrix above
2. **Identify blast radius** — which orgs/users affected?
3. **Check recent changes** — deployments, migrations, config changes in last 24h
4. **Open incident channel** — Slack #incident-YYYY-MM-DD-title
5. **Assign incident commander** (IC) and communicator

### 2.3 Containment Actions

| Scenario | Immediate Action |
|----------|-----------------|
| Edge function failure | Rollback to last known-good deployment |
| Database overload | Kill long-running queries; check for missing indexes |
| Auth system failure | Verify Lovable Cloud auth service status |
| Data corruption | Halt writes; initiate PITR assessment |
| Security breach | Rotate affected credentials; isolate compromised scope |
| Rate limiter failure | Apply emergency static limits via edge function config |

---

## 3. Communication Templates

### P0/P1 — Initial Notification
```
INCIDENT: [Title]
SEVERITY: P[0/1]
STATUS: Investigating
IMPACT: [Description of user impact]
STARTED: [Timestamp]
NEXT UPDATE: [Timestamp + 30 min]
IC: [Name]
```

### Status Update
```
INCIDENT UPDATE: [Title]
STATUS: [Investigating/Identified/Monitoring/Resolved]
IMPACT: [Current user impact]
ROOT CAUSE: [If identified]
MITIGATION: [Actions taken]
NEXT UPDATE: [Timestamp]
```

### Resolution
```
INCIDENT RESOLVED: [Title]
DURATION: [Total time]
ROOT CAUSE: [Summary]
RESOLUTION: [What fixed it]
POST-MORTEM: [Scheduled date]
FOLLOW-UP: [Action items]
```

---

## 4. Post-Mortem Template

### Required Sections
1. **Summary** — What happened, duration, impact
2. **Timeline** — Minute-by-minute reconstruction
3. **Root Cause** — Technical root cause (5 Whys)
4. **Impact Assessment** — Users affected, data impact, SLA breach
5. **Resolution** — What fixed the issue
6. **Detection** — How was it detected, could we detect faster?
7. **Prevention** — What systemic changes prevent recurrence?
8. **Action Items** — Specific tasks with owners and deadlines

### Post-Mortem Schedule
- P0: Within 24 hours
- P1: Within 72 hours
- P2: Within 1 week
- P3: Optional

---

## 5. Monitoring & Alert Configuration

### Health Signals

| Signal | Source | Check Interval | Alert Channel |
|--------|--------|----------------|---------------|
| Edge function availability | `health-check` function | 5 minutes | Slack #alerts |
| Database connectivity | Health-check DB probe | 5 minutes | Slack #alerts + PagerDuty |
| Auth service status | Auth health endpoint | 5 minutes | Slack #alerts |
| Error rate by action | `telemetry_stats` action | 5 minutes | Slack #engineering |
| P95 latency by action | `telemetry_stats` action | 5 minutes | Slack #engineering |
| Circuit breaker status | `telemetry_stats` action | 5 minutes | Slack #alerts |
| Cron job health | `cron_run_log` table | 15 minutes | Slack #engineering |
| Disk usage growth | Table size monitoring | Daily | Slack #engineering |

### SLO Definitions

| SLO | Target | Measurement | Alert Threshold |
|-----|--------|-------------|-----------------|
| Availability | 99.9% | Successful health checks / total checks | <99.5% over 1 hour |
| Latency (P95) | <500ms | Execution engine action latency | >1s over 5 minutes |
| Error Rate | <1% | Failed actions / total actions | >5% over 5 minutes |
| Data Freshness | <1 hour | Time since last successful cron run | >2 hours |

---

## 6. Runbook Cross-References

| Scenario | Runbook |
|----------|---------|
| Database restore | [disaster-recovery-runbook.md](./disaster-recovery-runbook.md) §3.1 |
| Full instance recovery | [disaster-recovery-runbook.md](./disaster-recovery-runbook.md) §3.2 |
| Edge function rollback | [disaster-recovery-runbook.md](./disaster-recovery-runbook.md) §3.3 |
| Data archival | [disaster-recovery-runbook.md](./disaster-recovery-runbook.md) §7 |
| Security incident | [security-controls-evidence.md](./security-controls-evidence.md) §5 |
