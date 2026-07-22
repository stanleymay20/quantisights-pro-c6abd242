// On-demand: builds a versioned ZIP procurement bundle and records the version row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore — esm.sh typing
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256(input: Uint8Array | string): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date();

  // Fetch latest trust snapshot for evidence anchoring
  const { data: snapshot } = await svc
    .from("trust_metrics_snapshots")
    .select("*")
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: subprocessors } = await svc.rpc("get_active_subprocessors");
  const { data: readiness } = await svc.rpc("get_procurement_readiness");

  const version = `${fmt(now)}.${Math.floor(now.getTime() / 1000) % 100000}`;
  const header = `Quantivis Global · Procurement Pack\nVersion: ${version}\nGenerated: ${now.toISOString()}\nEvidence snapshot: ${snapshot?.snapshot_date ?? "n/a"} (hash: ${snapshot?.evidence_hash ?? "n/a"})\n\n`;

  const files: Record<string, string> = {
    "README.txt": header +
      `This bundle is a point-in-time evidence pack. All trust metrics inside reflect\nthe operational state at the timestamp above. Verify integrity via manifest.json\n(sha256 per file) and the bundle_integrity_id recorded in procurement_pack_versions.\n`,
    "DPA-AVV.md":
      header + `# Data Processing Agreement (Auftragsverarbeitungsvertrag)\n\nThe full DPA / AVV template is available on request from legal@quantivis.io.\nKey terms include: Art. 28 GDPR scope, Standard Contractual Clauses for any\nnon-EU sub-processor, sub-processor registry (see Subprocessor-Registry.csv),\nand 30-day advance change notice.\n`,
    "TOMs.md":
      header + `# Technical & Organizational Measures (Art. 32 GDPR)\n\n- AES-256 encryption at rest; TLS 1.3 in transit\n- Row-Level Security on 100% of public-schema tables\n- Immutable audit log (database-level DENY on UPDATE/DELETE)\n- Multi-AZ resilience (EU-West-1)\n- MFA + WebAuthn/Passkey\n- SAML SSO with domain enforcement\n- PII redaction before LLM inference (default on)\n\nFull TOMs: https://www.quantivis.io/toms\n`,
    "AI-Governance.md":
      header + `# AI Governance\n\nClassification: Limited-Risk under EU AI Act.\n- Deterministic core (no LLM math)\n- 7-layer explainability\n- Confidence capped by sample size (applyAdaptiveConfidence)\n- Art. 14 human-in-the-loop on every approval\n- Calibration runs every 12h (Bayesian)\n\nFull doc: https://www.quantivis.io/ai-governance\nClassification matrix: https://www.quantivis.io/ai-system-classification\n`,
    "Incident-Response.md":
      header + `# Incident Response\n\n- Sev-1 ack within 30 minutes\n- GDPR Art. 33 notification within 72 hours\n- 24/7 on-call escalation\n\nFull playbook: https://www.quantivis.io/incident-response\n`,
    "Auditability.md":
      header + `# Auditability\n\n- Immutable audit log\n- Versioned Decision Ledger\n- Data lineage from source → calibration\n- Calibration history (every 12h)\n\nFull doc: https://www.quantivis.io/auditability\n`,
    "Security-Overview.md":
      header + `# Security Overview\n\n- Auth: email/password, MFA (TOTP + WebAuthn), SAML SSO\n- RBAC: owner, admin, analyst, executive, viewer\n- Tenant isolation: org_id-scoped RLS\n- Secrets: Supabase Vault\n- Rate limiting + 3-state circuit breakers on all edge functions\n- Dead-letter queues on async jobs\n\nFull doc: https://www.quantivis.io/security-overview\n`,
    "AI-Usage-Transparency.md":
      header + `# How AI Is Used\n\nDeterministic: ml-engine.ts (Holt's, ARIMA, K-Means, Isolation Forest)\nStatistical: anomaly detection, calibration, fairness\nAI narrative: LLM only for natural-language generation, never for scoring\nHuman-controlled: every decision approval requires a named approver\nAutonomous: 7 cron jobs with advisory locks + cron_run_log\n\nFull doc: https://www.quantivis.io/how-ai-is-used\n`,
    "Subprocessor-Registry.csv":
      "vendor_name,purpose,category,region,location,retention,dpa_status,transfer_mechanism\n" +
      (subprocessors ?? [])
        .map((s: any) =>
          [s.vendor_name, s.purpose, s.service_category, s.hosting_region, s.hosting_location,
            s.retention_policy, s.dpa_status, s.transfer_mechanism]
            .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
        ).join("\n"),
    "Trust-Metrics-Snapshot.json": JSON.stringify(((): Record<string, unknown> => {
      if (!snapshot) return {};
      // Public procurement pack: expose only attested coverage/posture fields.
      // Internal operational KPIs (raw failure counts, unresolved incidents) are withheld.
      const SAFE_KEYS = new Set([
        "id", "snapshot_date", "evidence_hash",
        "rls_coverage_pct", "audit_coverage_pct", "connector_health_pct",
        "drift_monitor_coverage_pct", "encryption_at_rest", "encryption_in_transit",
        "mfa_enforced", "sso_available", "region", "data_residency",
      ]);
      const redacted: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(snapshot)) {
        if (SAFE_KEYS.has(k)) redacted[k] = v;
      }
      return redacted;
    })(), null, 2),
    "Procurement-Readiness.json": JSON.stringify(readiness ?? [], null, 2),
  };

  // Per-file hashes
  const fileHashes: Record<string, string> = {};
  for (const [name, content] of Object.entries(files)) {
    fileHashes[name] = await sha256(content);
  }

  const manifest = {
    version,
    generated_at: now.toISOString(),
    evidence_snapshot_id: snapshot?.id ?? null,
    evidence_snapshot_date: snapshot?.snapshot_date ?? null,
    evidence_hash: snapshot?.evidence_hash ?? null,
    files: fileHashes,
    integrity_method: "sha256",
  };

  // Build ZIP
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const zipBytes: Uint8Array = await zip.generateAsync({ type: "uint8array" });
  const bundle_sha256 = await sha256(zipBytes);
  const bundle_integrity_id = `qvs-pp-${version}-${bundle_sha256.slice(0, 16)}`;

  // Record version (immutable)
  await svc.from("procurement_pack_versions").insert({
    version,
    trust_snapshot_id: snapshot?.id ?? null,
    manifest,
    bundle_sha256,
    bundle_integrity_id,
    signature_algorithm: "unsigned",
    size_bytes: zipBytes.byteLength,
  });

  return new Response(zipBytes, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="quantivis-procurement-pack-${version}.zip"`,
      "X-Bundle-Integrity-Id": bundle_integrity_id,
      "X-Bundle-Sha256": bundle_sha256,
      "X-Bundle-Version": version,
    },
  });
});
