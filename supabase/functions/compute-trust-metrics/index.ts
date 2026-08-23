import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyCronSecret, cronSecretUnauthorized } from "../_shared/cron-secret.ts";

interface MetricProvenance {
  source_tables: string[];
  method: string;
  sample_size: number;
  scanned_at: string;
  confidence: "high" | "medium" | "low";
  notes?: string;
}

type Row = Record<string, unknown>;
type EvidenceStatus = "met" | "partial" | "missing";

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function thresholdStatus(value: number | null, met: number, partial: number): EvidenceStatus {
  return value === null ? "missing" : value >= met ? "met" : value >= partial ? "partial" : "missing";
}

function displayPct(value: number | null): string {
  return value === null ? "unknown" : `${value}%`;
}

function displayValue(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

function unknownControl(
  category: string,
  control_key: string,
  control_label: string,
  evidence_ref: string,
  reason: string,
) {
  return {
    category,
    control_key,
    control_label,
    status: "missing" as const,
    evidence_ref,
    evidence_payload: {
      verified: false,
      reason,
      doctrine: "Control is not marked met until runtime or independently captured evidence verifies it.",
    },
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!verifyCronSecret(req)) return cronSecretUnauthorized(corsHeaders);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return new Response(JSON.stringify({ error: "Trust-metrics service unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const svc = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date();
  const scannedAt = now.toISOString();
  const provenance: Record<string, MetricProvenance> = {};

  const safeCount = async (
    table: string,
    filter?: (query: ReturnType<ReturnType<typeof svc.from>["select"]>) => unknown,
  ): Promise<number | null> => {
    try {
      let query = svc.from(table).select("*", { count: "exact", head: true });
      if (filter) query = filter(query) as typeof query;
      const { count, error } = await query;
      return error ? null : count ?? null;
    } catch {
      return null;
    }
  };

  const safeRows = async <T extends Row>(
    table: string,
    columns: string,
    filter?: (query: ReturnType<ReturnType<typeof svc.from>["select"]>) => unknown,
  ): Promise<T[] | null> => {
    try {
      let query = svc.from(table).select(columns);
      if (filter) query = filter(query) as typeof query;
      const { data, error } = await query;
      return error || !Array.isArray(data) ? null : data as unknown as T[];
    } catch {
      return null;
    }
  };

  const [decisionTotal, decisionsWithEvidence] = await Promise.all([
    safeCount("decision_ledger"),
    safeCount("decision_ledger", (query) => (query as any).not("evidence_sources", "is", null)),
  ]);

  // RLS and audit-coverage controls require independent catalog/contract probes.
  // Row counts are not proof, so these remain explicitly unknown here.
  const rls_coverage_pct: number | null = null;
  provenance.rls_coverage_pct = {
    source_tables: ["pg_policies", "pg_tables"],
    method: "Requires privileged catalog scan of exposed tables and effective policies",
    sample_size: 0,
    scanned_at: scannedAt,
    confidence: "low",
    notes: "Not inferred from source code or the existence of policy rows.",
  };

  const auditRows = await safeCount(
    "audit_log",
    (query) => (query as any).gte("created_at", new Date(now.getTime() - 30 * 86400000).toISOString()),
  );
  const audit_coverage_pct: number | null = null;
  provenance.audit_coverage_pct = {
    source_tables: ["audit_log"],
    method: "Requires comparison of enumerated mutation classes with required and observed audit events",
    sample_size: auditRows ?? 0,
    scanned_at: scannedAt,
    confidence: "low",
    notes: "Audit-row presence alone is not control coverage.",
  };

  const explainability_coverage_pct = decisionTotal !== null && decisionsWithEvidence !== null && decisionTotal > 0
    ? Math.round((decisionsWithEvidence / decisionTotal) * 1000) / 10
    : null;
  provenance.explainability_coverage_pct = {
    source_tables: ["decision_ledger"],
    method: "decisions with evidence_sources ÷ total decisions",
    sample_size: decisionTotal ?? 0,
    scanned_at: scannedAt,
    confidence: decisionTotal !== null && decisionTotal >= 30 ? "high" : decisionTotal !== null && decisionTotal >= 8 ? "medium" : "low",
    notes: decisionTotal === 0 ? "No decision evidence set exists; coverage is unknown." : undefined,
  };

  const [resolvedInterventions, learningRows] = await Promise.all([
    safeCount("execution_interventions", (query) => (query as any).eq("resolved", true)),
    safeCount("intervention_learning"),
  ]);
  const intervention_traceability_pct = resolvedInterventions !== null && learningRows !== null && resolvedInterventions > 0
    ? Math.min(100, Math.round((learningRows / resolvedInterventions) * 1000) / 10)
    : null;
  provenance.intervention_traceability_pct = {
    source_tables: ["execution_interventions", "intervention_learning"],
    method: "learning rows ÷ resolved interventions",
    sample_size: resolvedInterventions ?? 0,
    scanned_at: scannedAt,
    confidence: resolvedInterventions !== null && resolvedInterventions >= 10 ? "high" : "low",
  };

  const failed_auth_24h = await safeCount(
    "auth_events",
    (query) => (query as any)
      .eq("event_type", "auth_failure")
      .gte("created_at", new Date(now.getTime() - 24 * 3600 * 1000).toISOString()),
  );
  provenance.failed_auth_24h = {
    source_tables: ["auth_events"],
    method: "auth_failure events in trailing 24 hours",
    sample_size: failed_auth_24h ?? 0,
    scanned_at: scannedAt,
    confidence: failed_auth_24h === null ? "low" : "high",
    notes: failed_auth_24h === null ? "Auth-event evidence query failed or is unavailable." : undefined,
  };

  const activeDatasets = await safeRows<{ is_stale?: boolean | null }>(
    "datasets",
    "is_stale",
    (query) => (query as any).eq("status", "active"),
  );
  const retention_compliance_pct = activeDatasets && activeDatasets.length > 0
    ? Math.round((activeDatasets.filter((row) => row.is_stale !== true).length / activeDatasets.length) * 1000) / 10
    : null;
  provenance.retention_compliance_pct = {
    source_tables: ["datasets"],
    method: "active datasets with is_stale != true ÷ active datasets",
    sample_size: activeDatasets?.length ?? 0,
    scanned_at: scannedAt,
    confidence: activeDatasets?.length ? "high" : "low",
    notes: !activeDatasets?.length ? "No active-dataset evidence or query failed; compliance is unknown." : undefined,
  };

  const unresolved_critical_incidents = await safeCount(
    "execution_interventions",
    (query) => (query as any).eq("severity", "critical").eq("resolved", false),
  );
  provenance.unresolved_critical_incidents = {
    source_tables: ["execution_interventions"],
    method: "critical unresolved execution interventions",
    sample_size: unresolved_critical_incidents ?? 0,
    scanned_at: scannedAt,
    confidence: unresolved_critical_incidents === null ? "low" : "high",
  };

  const [externalSources, aicisSurfaces] = await Promise.all([
    safeRows<{ last_error?: string | null }>("external_data_sources", "last_error"),
    safeRows<{ consecutive_failures?: number | null; circuit_breaker_until?: string | null }>(
      "aicis_sync_surface_status",
      "consecutive_failures,circuit_breaker_until",
    ),
  ]);
  const connectorSample = externalSources !== null && aicisSurfaces !== null
    ? externalSources.length + aicisSurfaces.length
    : 0;
  const connector_health_pct = externalSources !== null && aicisSurfaces !== null && connectorSample > 0
    ? Math.round((
        externalSources.filter((row) => !row.last_error).length
        + aicisSurfaces.filter((row) => {
          const breakerActive = row.circuit_breaker_until
            ? new Date(row.circuit_breaker_until).getTime() > Date.now()
            : false;
          return !breakerActive && Number(row.consecutive_failures ?? 0) < 3;
        }).length
      ) / connectorSample * 1000) / 10
    : null;
  provenance.connector_health_pct = {
    source_tables: ["external_data_sources", "aicis_sync_surface_status"],
    method: "healthy external sources plus AICIS surfaces with closed circuit breakers ÷ total connector evidence",
    sample_size: connectorSample,
    scanned_at: scannedAt,
    confidence: connector_health_pct === null ? "low" : "high",
  };

  const iqScores = await safeRows<{ score?: number | string | null }>("iq_dimension_scores", "score");
  const usableIq = iqScores?.map((row) => Number(row.score)).filter(Number.isFinite) ?? [];
  const dq_confidence_avg = usableIq.length
    ? Math.round((usableIq.reduce((sum, score) => sum + score, 0) / usableIq.length) * 10) / 10
    : null;
  provenance.dq_confidence_avg = {
    source_tables: ["iq_dimension_scores"],
    method: "AVG of finite IQ dimension scores",
    sample_size: usableIq.length,
    scanned_at: scannedAt,
    confidence: usableIq.length > 30 ? "high" : usableIq.length > 0 ? "medium" : "low",
  };

  const [organizationCount, driftRows] = await Promise.all([
    safeCount("organizations"),
    safeRows<{ organization_id?: string | null }>("fairness_drift_snapshots", "organization_id"),
  ]);
  const driftOrgCount = driftRows
    ? new Set(driftRows.map((row) => row.organization_id).filter((id): id is string => typeof id === "string")).size
    : 0;
  const drift_monitor_coverage_pct = organizationCount !== null && organizationCount > 0 && driftRows !== null
    ? Math.round((driftOrgCount / organizationCount) * 1000) / 10
    : null;
  provenance.drift_monitor_coverage_pct = {
    source_tables: ["fairness_drift_snapshots", "organizations"],
    method: "distinct organizations with drift snapshots ÷ total organizations",
    sample_size: driftRows?.length ?? 0,
    scanned_at: scannedAt,
    confidence: drift_monitor_coverage_pct === null ? "low" : "medium",
  };

  const snapshot = {
    snapshot_date: scannedAt.slice(0, 10),
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
    evidence_generated_at: scannedAt,
    evidence_scope: "platform",
    evidence_version: "2.0",
    computed_at: scannedAt,
    computed_by: "cron:compute-trust-metrics",
  };

  const evidenceHash = await sha256(JSON.stringify({
    date: snapshot.snapshot_date,
    metrics: [
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
    ],
    provenance,
  }));

  const { data: existingSnapshot, error: existingError } = await svc
    .from("trust_metrics_snapshots")
    .select("id,evidence_hash")
    .eq("snapshot_date", snapshot.snapshot_date)
    .maybeSingle();
  if (existingError) {
    return new Response(JSON.stringify({ error: `Trust snapshot lookup failed: ${existingError.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let snapshotId: string;
  let persistedEvidenceHash = evidenceHash;
  let snapshotCreated = false;
  if (existingSnapshot?.id) {
    snapshotId = existingSnapshot.id;
    persistedEvidenceHash = existingSnapshot.evidence_hash ?? evidenceHash;
  } else {
    const { data: inserted, error: insertError } = await svc
      .from("trust_metrics_snapshots")
      .insert({ ...snapshot, evidence_hash: evidenceHash })
      .select("id")
      .single();
    if (insertError || !inserted?.id) {
      return new Response(JSON.stringify({ error: `Trust snapshot persistence failed: ${insertError?.message ?? "missing id"}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    snapshotId = inserted.id;
    snapshotCreated = true;
  }

  // Static legal/security/control-page claims are deliberately NOT marked met
  // here. This cron does not possess independent evidence that a document is
  // complete, current, contractually valid, or that a control is effective.
  const readiness = [
    unknownControl("GDPR", "gdpr_dpa_available", "DPA / AVV available on request", "/dpa", "No independent DPA validity/availability evidence captured by this snapshot."),
    unknownControl("GDPR", "gdpr_toms_published", "TOMs (Art. 32) published", "/toms", "No runtime verification of TOM completeness/current publication."),
    unknownControl("GDPR", "gdpr_subprocessor_registry", "Sub-processor registry public", "/subprocessors", "Public-route presence is not sufficient proof of registry completeness/currentness."),
    {
      category: "GDPR",
      control_key: "gdpr_retention_compliance",
      control_label: `Retention compliance >= 90% (currently ${displayPct(retention_compliance_pct)})`,
      status: thresholdStatus(retention_compliance_pct, 90, 70),
      evidence_ref: "/data-retention",
      evidence_payload: { value: retention_compliance_pct, sample: activeDatasets?.length ?? 0 },
    },
    unknownControl("EU AI Act", "aia_classification_documented", "AI system risk classification documented", "/ai-system-classification", "Documentation existence alone is not independently verified by this runtime evidence scan."),
    unknownControl("EU AI Act", "aia_human_oversight", "Human-in-the-loop on decision approval", "/ai-governance", "Requires certification probe of effective approval enforcement, not a page or source-code claim."),
    {
      category: "EU AI Act",
      control_key: "aia_explainability",
      control_label: `Explainability coverage >= 95% (currently ${displayPct(explainability_coverage_pct)})`,
      status: thresholdStatus(explainability_coverage_pct, 95, 70),
      evidence_ref: "/decision-accuracy",
      evidence_payload: { value: explainability_coverage_pct, sample: decisionTotal },
    },
    {
      category: "Security",
      control_key: "sec_rls_full",
      control_label: `RLS coverage 100% (currently ${displayPct(rls_coverage_pct)})`,
      status: thresholdStatus(rls_coverage_pct, 100, 1),
      evidence_ref: "/security-overview",
      evidence_payload: { value: rls_coverage_pct, verified: false },
    },
    unknownControl("Security", "sec_security_txt", "security.txt published", "/.well-known/security.txt", "Public endpoint has not been independently fetched and validated by this snapshot."),
    unknownControl("Security", "sec_disclosure_policy", "Vulnerability disclosure policy published", "/security-policy", "Policy content/currentness is not independently verified by this snapshot."),
    unknownControl("Security", "sec_incident_response", "Incident response playbook published", "/incident-response", "Playbook effectiveness/currentness is not independently verified by this snapshot."),
    unknownControl("Auditability", "audit_immutable_log", "Immutable audit log (DENY UPDATE/DELETE)", "/auditability", "Requires database privilege/trigger/policy certification; audit row count is not immutability evidence."),
    {
      category: "Auditability",
      control_key: "audit_intervention_traceability",
      control_label: `Intervention traceability >= 95% (currently ${displayPct(intervention_traceability_pct)})`,
      status: thresholdStatus(intervention_traceability_pct, 95, 70),
      evidence_ref: "/interventions",
      evidence_payload: { value: intervention_traceability_pct, sample: resolvedInterventions },
    },
    {
      category: "Data Governance",
      control_key: "dg_dq_avg",
      control_label: `Data quality score avg >= 70 (currently ${displayValue(dq_confidence_avg)})`,
      status: thresholdStatus(dq_confidence_avg, 70, 1),
      evidence_ref: "/data-catalog",
      evidence_payload: { value: dq_confidence_avg, sample: usableIq.length },
    },
    unknownControl("AI Governance", "aig_confidence_capping", "Confidence capping by sample size", "/how-ai-is-used", "Requires execution/certification evidence that every inference surface enforces the cap."),
    {
      category: "AI Governance",
      control_key: "aig_drift_monitoring",
      control_label: `Drift monitoring coverage >= 50% (currently ${displayPct(drift_monitor_coverage_pct)})`,
      status: thresholdStatus(drift_monitor_coverage_pct, 50, 1),
      evidence_ref: "/fairness",
      evidence_payload: { value: drift_monitor_coverage_pct, organizations: organizationCount },
    },
    unknownControl("Vendor Transparency", "vt_subprocessors_db", "Sub-processors live registry (DB-backed)", "/subprocessors", "Registry backing/completeness is not independently verified by this snapshot."),
    unknownControl("Vendor Transparency", "vt_change_notice", "30-day sub-processor change notice", "/subprocessors", "Contractual notice process has not been independently evidenced by this snapshot."),
  ];

  let readinessUpdated = 0;
  for (const item of readiness) {
    const { error } = await svc.from("procurement_readiness_items").upsert(
      {
        ...item,
        last_verified_at: scannedAt,
        snapshot_id: snapshotId,
      },
      { onConflict: "control_key" },
    );
    if (error) {
      return new Response(JSON.stringify({
        error: `Procurement readiness persistence failed at ${item.control_key}: ${error.message}`,
        snapshot_id: snapshotId,
        snapshot_created: snapshotCreated,
        readiness_updated: readinessUpdated,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    readinessUpdated += 1;
  }

  return new Response(JSON.stringify({
    ok: true,
    snapshot_id: snapshotId,
    snapshot_created: snapshotCreated,
    evidence_hash: persistedEvidenceHash,
    readiness_updated: readinessUpdated,
    readiness_total: readiness.length,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});