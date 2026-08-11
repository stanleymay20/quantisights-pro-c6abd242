// Daily cron — computes operational trust evidence and writes an immutable snapshot.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyCronSecret, cronSecretUnauthorized } from "../_shared/cron-secret.ts";

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface MetricProvenance {
  source_tables: string[];
  method: string;
  sample_size: number;
  scanned_at: string;
  confidence: "high" | "medium" | "low";
  notes?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!verifyCronSecret(req)) return cronSecretUnauthorized(corsHeaders);

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date();
  const provenance: Record<string, MetricProvenance> = {};

  // Query failures and empty evidence sets remain unknown. They must never be
  // converted into a favorable control value.
  const safeCount = async (table: string, filter?: (q: any) => any): Promise<number | null> => {
    try {
      let q = svc.from(table).select("*", { count: "exact", head: true });
      if (filter) q = filter(q);
      const { count, error } = await q;
      if (error) return null;
      return count ?? null;
    } catch { return null; }
  };
  const displayPct = (value: number | null) => value === null ? "unknown" : `${value}%`;
  const displayValue = (value: number | null) => value === null ? "unknown" : String(value);
  const thresholdStatus = (value: number | null, met: number, partial: number) =>
    value === null ? "missing" : value >= met ? "met" : value >= partial ? "partial" : "missing";

  // 1. RLS coverage - requires privileged production catalog evidence.
  const [decisionTotalResult, decisionsWithEvidenceResult] = await Promise.all([
    svc.from("decision_ledger").select("*", { count: "exact", head: true }),
    svc.from("decision_ledger").select("*", { count: "exact", head: true }).not("evidence_sources", "is", null),
  ]);
  const decisionTotal = decisionTotalResult.error ? null : decisionTotalResult.count;
  const decisionsWithEvidence = decisionsWithEvidenceResult.error ? null : decisionsWithEvidenceResult.count;
  const rls_coverage_pct = null;
  provenance.rls_coverage_pct = {
    source_tables: ["pg_policies", "pg_tables"],
    method: "Not computed by this Edge Function; requires a privileged catalog scan of every exposed table and policy",
    sample_size: 0, scanned_at: now.toISOString(), confidence: "low",
    notes: "Unknown until a production catalog scan is captured. Source-code policy presence is not production evidence.",
  };

  // 2. Audit coverage — fraction of mutating action types that hit audit_log in last 30d
  const auditRows = await safeCount("audit_log", (q) => q.gte("created_at", new Date(now.getTime() - 30 * 86400000).toISOString()));
  const audit_coverage_pct = null;
  provenance.audit_coverage_pct = {
    source_tables: ["audit_log"], method: "Coverage requires comparison of auditable mutation classes with observed audit event classes; row presence alone is insufficient",
    sample_size: auditRows ?? 0, scanned_at: now.toISOString(), confidence: "low",
    notes: "Unknown until the mutation-to-audit contract is enumerated and measured.",
  };

  // 3. Explainability coverage — decisions with evidence_sources / total
  const explainability_coverage_pct = decisionTotal !== null && decisionsWithEvidence !== null && decisionTotal > 0
    ? Math.round((decisionsWithEvidence / decisionTotal) * 1000) / 10
    : null;
  provenance.explainability_coverage_pct = {
    source_tables: ["decision_ledger"],
    method: "decisions WHERE evidence_sources IS NOT NULL ÷ total decisions",
    sample_size: decisionTotal ?? 0, scanned_at: now.toISOString(),
    confidence: decisionTotal !== null && decisionTotal >= 30 ? "high" : decisionTotal !== null && decisionTotal >= 8 ? "medium" : "low",
    notes: decisionTotal === 0 ? "No decisions in the evidence set; coverage is unknown, not 100%." : undefined,
  };

  // 4. Intervention traceability — interventions with learning row / resolved
  const resolvedInterventions = await safeCount("execution_interventions", (q) => q.eq("resolved", true));
  const learningRows = await safeCount("intervention_learning");
  const intervention_traceability_pct = resolvedInterventions !== null && learningRows !== null && resolvedInterventions > 0
    ? Math.min(100, Math.round((learningRows / resolvedInterventions) * 1000) / 10) : null;
  provenance.intervention_traceability_pct = {
    source_tables: ["execution_interventions", "intervention_learning"],
    method: "intervention_learning rows ÷ resolved interventions (trigger-driven writeback)",
    sample_size: resolvedInterventions ?? 0, scanned_at: now.toISOString(),
    confidence: resolvedInterventions !== null && resolvedInterventions >= 10 ? "high" : "low",
  };

  // 5. Failed auth 24h
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const failed_auth_24h = await safeCount(
    "auth_events", (q) => q.eq("event_type", "auth_failure").gte("created_at", since),
  );
  provenance.failed_auth_24h = {
    source_tables: ["auth_events"], method: "COUNT WHERE event_type='auth_failure' AND created_at > now()-24h",
    sample_size: failed_auth_24h ?? 0, scanned_at: now.toISOString(),
    confidence: failed_auth_24h === null ? "low" : "high",
    notes: failed_auth_24h === null ? "Auth-event query failed or table was unavailable; count is unknown." : undefined,
  };

  // 6. Retention compliance — datasets within freshness policy
  let retention_compliance_pct: number | null = null;
  let retentionSample = 0;
  try {
    const { data: ds, error: dsError } = await svc.from("datasets").select("is_stale").eq("status", "active");
    if (!dsError && ds && ds.length > 0) {
      retentionSample = ds.length;
      const fresh = ds.filter((d: any) => !d.is_stale).length;
      retention_compliance_pct = Math.round((fresh / ds.length) * 1000) / 10;
    }
  } catch { /* keep default */ }
  provenance.retention_compliance_pct = {
    source_tables: ["datasets"], method: "active datasets where is_stale=false ÷ active datasets",
    sample_size: retentionSample, scanned_at: now.toISOString(), confidence: retentionSample > 0 ? "high" : "low",
    notes: retentionSample === 0 ? "No active datasets or the evidence query failed; compliance is unknown." : undefined,
  };

  // 7. Unresolved critical incidents
  const unresolved_critical_incidents = await safeCount(
    "execution_interventions",
    (q) => q.eq("severity", "critical").eq("resolved", false),
  );
  provenance.unresolved_critical_incidents = {
    source_tables: ["execution_interventions"], method: "severity='critical' AND resolved=false",
    sample_size: unresolved_critical_incidents ?? 0, scanned_at: now.toISOString(),
    confidence: unresolved_critical_incidents === null ? "low" : "high",
    notes: unresolved_critical_incidents === null ? "Intervention query failed or table was unavailable; count is unknown." : undefined,
  };

  // 8. Connector health % — nothing ever writes to connector_health_snapshots
  // (no cron/edge function inserts rows there), so reading it always found
  // an empty result and silently fell back to the hardcoded 100 default,
  // regardless of real connector state. Switched to external_data_sources
  // .last_error, but that alone still isn't enough: sync-aicis-bridge
  // clears last_error on ANY surface landing, even if other surfaces keep
  // failing ("preserve partial-success semantics") -- so a real, ongoing
  // single-surface outage (e.g. /signals failing 221 times in a row while
  // other AICIS surfaces sync fine) never shows up as unhealthy here.
  // Fold in per-surface circuit-breaker state from aicis_sync_surface_status
  // too, same signal Bridge Health and Pipeline Observability already use.
  let connector_health_pct: number | null = null;
  let connectorSample = 0;
  try {
    const nowMs = Date.now();
    const [edsRes, aicisRes] = await Promise.all([
      svc.from("external_data_sources").select("last_error"),
      svc.from("aicis_sync_surface_status").select("consecutive_failures, circuit_breaker_until"),
    ]);
    const eds = edsRes.data ?? [];
    const aicisSurfaces = aicisRes.data ?? [];
    connectorSample = eds.length + aicisSurfaces.length;
    if (!edsRes.error && !aicisRes.error && connectorSample > 0) {
      const healthyEds = eds.filter((r: any) => !r.last_error).length;
      const healthyAicis = aicisSurfaces.filter((s: any) =>
        !((s.circuit_breaker_until && new Date(s.circuit_breaker_until).getTime() > nowMs) || (s.consecutive_failures ?? 0) >= 3)
      ).length;
      connector_health_pct = Math.round(((healthyEds + healthyAicis) / connectorSample) * 1000) / 10;
    }
  } catch { /* default */ }
  provenance.connector_health_pct = {
    source_tables: ["external_data_sources", "aicis_sync_surface_status"],
    method: "(sources WHERE last_error IS NULL) + (AICIS surfaces with closed circuit breaker) ÷ total",
    sample_size: connectorSample, scanned_at: now.toISOString(), confidence: connector_health_pct !== null ? "high" : "low",
    notes: connector_health_pct === null ? "No connector evidence or an evidence query failed; health is unknown." : undefined,
  };

  // 9. DQ confidence avg — from iq_dimension_scores
  let dq_confidence_avg: number | null = null;
  let dqSample = 0;
  try {
    const { data: iq, error: iqError } = await svc.from("iq_dimension_scores").select("score");
    if (!iqError && iq && iq.length > 0) {
      dqSample = iq.length;
      dq_confidence_avg = Math.round(
        (iq.reduce((s: number, r: any) => s + Number(r.score || 0), 0) / iq.length) * 10,
      ) / 10;
    }
  } catch { /* default */ }
  provenance.dq_confidence_avg = {
    source_tables: ["iq_dimension_scores"], method: "AVG(score) across all 7 IQ dimensions",
    sample_size: dqSample, scanned_at: now.toISOString(),
    confidence: dqSample > 30 ? "high" : dqSample > 0 ? "medium" : "low",
    notes: dqSample === 0 ? "No data-quality scores or the evidence query failed; score is unknown." : undefined,
  };

  // 10. Drift monitor coverage — orgs with fairness_drift_snapshots / total orgs
  let drift_monitor_coverage_pct: number | null = null;
  let driftSample = 0;
  try {
    const [orgResult, driftResult] = await Promise.all([
      svc.from("organizations").select("*", { count: "exact", head: true }),
      svc.from("fairness_drift_snapshots").select("organization_id"),
    ]);
    const orgs = orgResult.error ? null : orgResult.count;
    const driftOrgs = driftResult.error ? null : driftResult.data;
    const unique = new Set((driftOrgs ?? []).map((r: any) => r.organization_id)).size;
    driftSample = driftOrgs?.length ?? 0;
    if (!driftOrgs || orgs === null || orgs === 0) {
      drift_monitor_coverage_pct = null;
    } else {
      drift_monitor_coverage_pct = Math.round((unique / orgs) * 1000) / 10;
    }
  } catch { /* default */ }
  provenance.drift_monitor_coverage_pct = {
    source_tables: ["fairness_drift_snapshots", "organizations"],
    method: "DISTINCT orgs with drift snapshots ÷ total orgs",
    sample_size: driftSample, scanned_at: now.toISOString(), confidence: drift_monitor_coverage_pct === null ? "low" : "medium",
    notes: drift_monitor_coverage_pct === null ? "No organizations or the evidence query failed; coverage is unknown." : undefined,
  };

  const snapshot = {
    snapshot_date: now.toISOString().slice(0, 10),
    rls_coverage_pct,
    audit_coverage_pct,
    explainability_coverage_pct,
    intervention_traceability_pct,
    failed_auth_24h,
    retention_compliance_pct,
    unresolved_critical_incidents,
    connector_health_pct,
    dq_confidence_avg,
    drift_monitor_coverage_pct,
    provenance,
    evidence_generated_at: now.toISOString(),
    evidence_scope: "platform",
    evidence_version: "1.0",
    computed_at: now.toISOString(),
    computed_by: "cron:compute-trust-metrics",
  };

  const evidence_hash = await sha256(JSON.stringify({
    d: snapshot.snapshot_date,
    m: [
      rls_coverage_pct, audit_coverage_pct, explainability_coverage_pct,
      intervention_traceability_pct, failed_auth_24h, retention_compliance_pct,
      unresolved_critical_incidents, connector_health_pct, dq_confidence_avg,
      drift_monitor_coverage_pct,
    ],
  }));

  // Upsert by snapshot_date (one per day)
  const { data: existing } = await svc
    .from("trust_metrics_snapshots")
    .select("id")
    .eq("snapshot_date", snapshot.snapshot_date)
    .maybeSingle();

  let snapshotId = existing?.id;
  if (existing) {
    // Same date: leave the existing (immutable) snapshot — don't overwrite.
    return new Response(
      JSON.stringify({ ok: true, snapshot_id: snapshotId, skipped: "snapshot already exists for date" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: inserted, error } = await svc
    .from("trust_metrics_snapshots")
    .insert({ ...snapshot, evidence_hash })
    .select("id")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  snapshotId = inserted.id;

  // Refresh procurement readiness items (evidence-derived)
  const readiness = [
    {
      category: "GDPR", control_key: "gdpr_dpa_available", control_label: "DPA / AVV available on request",
      status: "met", evidence_ref: "/dpa",
    },
    {
      category: "GDPR", control_key: "gdpr_toms_published", control_label: "TOMs (Art. 32) published",
      status: "met", evidence_ref: "/toms",
    },
    {
      category: "GDPR", control_key: "gdpr_subprocessor_registry", control_label: "Sub-processor registry public",
      status: "met", evidence_ref: "/subprocessors",
    },
    {
      category: "GDPR", control_key: "gdpr_retention_compliance",
      control_label: `Retention compliance >= 90% (currently ${displayPct(retention_compliance_pct)})`,
      status: thresholdStatus(retention_compliance_pct, 90, 70),
      evidence_ref: "/data-retention",
      evidence_payload: { value: retention_compliance_pct },
    },
    {
      category: "EU AI Act", control_key: "aia_classification_documented",
      control_label: "AI system risk classification documented",
      status: "met", evidence_ref: "/ai-system-classification",
    },
    {
      category: "EU AI Act", control_key: "aia_human_oversight",
      control_label: "Human-in-the-loop on decision approval",
      status: "met", evidence_ref: "/ai-governance",
    },
    {
      category: "EU AI Act", control_key: "aia_explainability",
      control_label: `Explainability coverage >= 95% (currently ${displayPct(explainability_coverage_pct)})`,
      status: thresholdStatus(explainability_coverage_pct, 95, 70),
      evidence_ref: "/decision-accuracy",
      evidence_payload: { value: explainability_coverage_pct },
    },
    {
      category: "Security", control_key: "sec_rls_full",
      control_label: `RLS coverage 100% (currently ${displayPct(rls_coverage_pct)})`,
      status: thresholdStatus(rls_coverage_pct, 100, 1),
      evidence_ref: "/security-overview",
    },
    {
      category: "Security", control_key: "sec_security_txt", control_label: "security.txt published",
      status: "met", evidence_ref: "/.well-known/security.txt",
    },
    {
      category: "Security", control_key: "sec_disclosure_policy", control_label: "Vulnerability disclosure policy published",
      status: "met", evidence_ref: "/security-policy",
    },
    {
      category: "Security", control_key: "sec_incident_response", control_label: "Incident response playbook published",
      status: "met", evidence_ref: "/incident-response",
    },
    {
      category: "Auditability", control_key: "audit_immutable_log",
      control_label: "Immutable audit log (DENY UPDATE/DELETE)",
      status: audit_coverage_pct === null ? "missing" : audit_coverage_pct > 0 ? "met" : "partial",
      evidence_ref: "/auditability",
      evidence_payload: { audit_rows: auditRows },
    },
    {
      category: "Auditability", control_key: "audit_intervention_traceability",
      control_label: `Intervention traceability >= 95% (currently ${displayPct(intervention_traceability_pct)})`,
      status: thresholdStatus(intervention_traceability_pct, 95, 70),
      evidence_ref: "/interventions",
      evidence_payload: { value: intervention_traceability_pct },
    },
    {
      category: "Data Governance", control_key: "dg_dq_avg",
      control_label: `Data quality score avg >= 70 (currently ${displayValue(dq_confidence_avg)})`,
      status: thresholdStatus(dq_confidence_avg, 70, 1),
      evidence_ref: "/data-catalog",
      evidence_payload: { value: dq_confidence_avg, sample: dqSample },
    },
    {
      category: "AI Governance", control_key: "aig_confidence_capping",
      control_label: "Confidence capping by sample size (applyAdaptiveConfidence)",
      status: "met", evidence_ref: "/how-ai-is-used",
    },
    {
      category: "AI Governance", control_key: "aig_drift_monitoring",
      control_label: `Drift monitoring coverage >= 50% (currently ${displayPct(drift_monitor_coverage_pct)})`,
      status: thresholdStatus(drift_monitor_coverage_pct, 50, 1),
      evidence_ref: "/fairness",
      evidence_payload: { value: drift_monitor_coverage_pct },
    },
    {
      category: "Vendor Transparency", control_key: "vt_subprocessors_db",
      control_label: "Sub-processors live registry (DB-backed)",
      status: "met", evidence_ref: "/subprocessors",
    },
    {
      category: "Vendor Transparency", control_key: "vt_change_notice", control_label: "30-day sub-processor change notice",
      status: "met", evidence_ref: "/subprocessors",
    },
  ];

  for (const item of readiness) {
    await svc.from("procurement_readiness_items").upsert(
      {
        ...item,
        evidence_payload: (item as any).evidence_payload ?? {},
        last_verified_at: now.toISOString(),
        snapshot_id: snapshotId,
      },
      { onConflict: "control_key" },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, snapshot_id: snapshotId, evidence_hash, readiness_updated: readiness.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
