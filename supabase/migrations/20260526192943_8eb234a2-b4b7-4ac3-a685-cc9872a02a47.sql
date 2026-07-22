-- =============================================================
-- Phase 5B+ : Procurement Evidence & Security Surfaces
-- =============================================================

-- ---------- 1. Subprocessor Registry ----------
CREATE TABLE public.subprocessor_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name text NOT NULL,
  purpose text NOT NULL,
  service_category text NOT NULL,
  hosting_region text NOT NULL,
  hosting_location text,
  data_categories text[] NOT NULL DEFAULT '{}',
  retention_policy text,
  dpa_status text NOT NULL DEFAULT 'signed',
  transfer_mechanism text,
  website_url text,
  security_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subprocessor_registry TO anon;
GRANT SELECT ON public.subprocessor_registry TO authenticated;
GRANT ALL ON public.subprocessor_registry TO service_role;

ALTER TABLE public.subprocessor_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subprocessors are public"
  ON public.subprocessor_registry FOR SELECT
  USING (active = true);

CREATE TRIGGER trg_subprocessors_updated
  BEFORE UPDATE ON public.subprocessor_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed current vendors
INSERT INTO public.subprocessor_registry
  (vendor_name, purpose, service_category, hosting_region, hosting_location, data_categories, retention_policy, dpa_status, transfer_mechanism, website_url, security_url, sort_order)
VALUES
  ('Amazon Web Services (AWS)', 'Cloud infrastructure, database hosting, file storage, backups', 'Infrastructure',
   'EU', 'eu-west-1 (Ireland)', ARRAY['All customer data (encrypted at rest)'], 'Per customer retention policy',
   'signed', 'EU-only (no transfer)', 'https://aws.amazon.com', 'https://aws.amazon.com/compliance/', 10),
  ('Supabase (Lovable Cloud)', 'Managed PostgreSQL, authentication, edge runtime, realtime', 'Infrastructure',
   'EU', 'Frankfurt', ARRAY['All operational data (RLS-isolated)'], 'Per customer retention policy',
   'signed', 'EU-only (no transfer)', 'https://supabase.com', 'https://supabase.com/security', 20),
  ('Lovable AB', 'Build platform and Cloud orchestration', 'Developer',
   'EU', 'Sweden', ARRAY['Application code, build metadata (no customer data)'], 'Lifetime of project',
   'signed', 'EU-only (no transfer)', 'https://lovable.dev', 'https://lovable.dev/security', 30),
  ('Google LLC (Gemini API)', 'LLM inference for diagnostics, advisory, copilot, narrative generation', 'AI/ML',
   'EU/US', 'Multi-region', ARRAY['Redacted operational metrics (PII redacted by default)'], 'Ephemeral; not retained for training',
   'signed', 'SCCs (EU Commission 2021/914)', 'https://cloud.google.com', 'https://cloud.google.com/security', 40),
  ('OpenAI, L.L.C.', 'Optional LLM inference (failover; disabled by default)', 'AI/ML',
   'US', 'United States', ARRAY['Redacted operational metrics if enabled'], '30-day zero-retention via API',
   'signed', 'SCCs (EU Commission 2021/914)', 'https://openai.com', 'https://openai.com/security', 50),
  ('Anthropic, PBC', 'Optional LLM inference (failover; disabled by default)', 'AI/ML',
   'US', 'United States', ARRAY['Redacted operational metrics if enabled'], 'Not retained for training; 30-day operational logs',
   'signed', 'SCCs (EU Commission 2021/914)', 'https://anthropic.com', 'https://anthropic.com/security', 60),
  ('Stripe, Inc.', 'Payment processing, subscription management, invoicing', 'Payments',
   'EU/US', 'Ireland / United States', ARRAY['Billing contact, payment method tokens'], 'Per Stripe retention policy',
   'signed', 'SCCs + PCI DSS Level 1', 'https://stripe.com', 'https://stripe.com/docs/security', 70),
  ('Resend, Inc.', 'Transactional email (password reset, alerts, briefs, invites)', 'Email',
   'US', 'United States', ARRAY['Email address, message content (operational only)'], '30-day delivery logs',
   'signed', 'SCCs + TLS / SPF / DKIM / DMARC', 'https://resend.com', 'https://resend.com/security', 80),
  ('Sentry (Functional Software)', 'Application error tracking and performance monitoring', 'Observability',
   'EU/US', 'Frankfurt / United States', ARRAY['Error stack traces with PII scrubbing applied'], '90 days',
   'signed', 'SCCs + PII scrubbing rules', 'https://sentry.io', 'https://sentry.io/security/', 90);

-- ---------- 2. Trust Metrics Snapshots (immutable) ----------
CREATE TABLE public.trust_metrics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL UNIQUE,
  -- Headline metrics (kept flat for easy querying)
  rls_coverage_pct numeric,
  audit_coverage_pct numeric,
  explainability_coverage_pct numeric,
  intervention_traceability_pct numeric,
  failed_auth_24h int,
  retention_compliance_pct numeric,
  unresolved_critical_incidents int,
  connector_health_pct numeric,
  dq_confidence_avg numeric,
  drift_monitor_coverage_pct numeric,
  -- Per-metric provenance: { metric_key: { source_query, source_tables[], method, sample_size, scanned_at, confidence } }
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Immutability anchors
  evidence_hash text NOT NULL,
  evidence_generated_at timestamptz NOT NULL DEFAULT now(),
  evidence_scope text NOT NULL DEFAULT 'platform',
  evidence_version text NOT NULL DEFAULT '1.0',
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_by text NOT NULL DEFAULT 'cron:compute-trust-metrics'
);

GRANT SELECT ON public.trust_metrics_snapshots TO anon;
GRANT SELECT ON public.trust_metrics_snapshots TO authenticated;
GRANT ALL ON public.trust_metrics_snapshots TO service_role;

ALTER TABLE public.trust_metrics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trust snapshots are public"
  ON public.trust_metrics_snapshots FOR SELECT USING (true);

-- Immutability: deny UPDATE and DELETE for everyone except service_role (which bypasses RLS)
CREATE POLICY "No updates to trust snapshots"
  ON public.trust_metrics_snapshots FOR UPDATE USING (false);
CREATE POLICY "No deletes of trust snapshots"
  ON public.trust_metrics_snapshots FOR DELETE USING (false);

CREATE INDEX idx_trust_snapshots_date ON public.trust_metrics_snapshots(snapshot_date DESC);

-- ---------- 3. Procurement Pack Versions ----------
CREATE TABLE public.procurement_pack_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid,
  trust_snapshot_id uuid REFERENCES public.trust_metrics_snapshots(id),
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  bundle_sha256 text NOT NULL,
  bundle_integrity_id text NOT NULL,
  bundle_signature text,
  signature_algorithm text DEFAULT 'unsigned',
  download_count int NOT NULL DEFAULT 0,
  size_bytes bigint
);

GRANT SELECT ON public.procurement_pack_versions TO anon;
GRANT SELECT ON public.procurement_pack_versions TO authenticated;
GRANT ALL ON public.procurement_pack_versions TO service_role;

ALTER TABLE public.procurement_pack_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Procurement packs are public"
  ON public.procurement_pack_versions FOR SELECT USING (true);
CREATE POLICY "No updates to procurement packs"
  ON public.procurement_pack_versions FOR UPDATE USING (false);
CREATE POLICY "No deletes of procurement packs"
  ON public.procurement_pack_versions FOR DELETE USING (false);

CREATE INDEX idx_procurement_packs_generated ON public.procurement_pack_versions(generated_at DESC);

-- ---------- 4. Procurement Readiness Items (evidence-derived) ----------
CREATE TABLE public.procurement_readiness_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,             -- GDPR, EU AI Act, Security, Auditability, Data Governance, AI Governance, Vendor Transparency
  control_key text NOT NULL UNIQUE,
  control_label text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',  -- met | partial | missing | unknown
  evidence_ref text,                  -- table, edge fn, page path, etc.
  evidence_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz,
  snapshot_id uuid REFERENCES public.trust_metrics_snapshots(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.procurement_readiness_items TO anon;
GRANT SELECT ON public.procurement_readiness_items TO authenticated;
GRANT ALL ON public.procurement_readiness_items TO service_role;

ALTER TABLE public.procurement_readiness_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Readiness items are public"
  ON public.procurement_readiness_items FOR SELECT USING (true);

CREATE TRIGGER trg_readiness_updated
  BEFORE UPDATE ON public.procurement_readiness_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 5. RPCs ----------
CREATE OR REPLACE FUNCTION public.get_latest_trust_metrics()
RETURNS public.trust_metrics_snapshots
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.trust_metrics_snapshots
  ORDER BY snapshot_date DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_active_subprocessors()
RETURNS SETOF public.subprocessor_registry
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.subprocessor_registry
  WHERE active = true
  ORDER BY sort_order, vendor_name
$$;

CREATE OR REPLACE FUNCTION public.get_procurement_readiness()
RETURNS SETOF public.procurement_readiness_items
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.procurement_readiness_items
  ORDER BY category, control_label
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_trust_metrics() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_subprocessors() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_procurement_readiness() TO anon, authenticated;