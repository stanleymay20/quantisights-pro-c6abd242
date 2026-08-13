
CREATE TABLE IF NOT EXISTS public.canonical_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  external_id text NOT NULL,
  connector_id uuid,
  source_type text NOT NULL,
  display_name text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  natural_key text GENERATED ALWAYS AS (entity_type || ':' || external_id) STORED,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_type, entity_type, external_id)
);
CREATE INDEX IF NOT EXISTS idx_ce_org_type ON public.canonical_entities (organization_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_ce_natkey ON public.canonical_entities (organization_id, natural_key);

CREATE TABLE IF NOT EXISTS public.canonical_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_type text NOT NULL,
  entity_id uuid REFERENCES public.canonical_entities(id) ON DELETE SET NULL,
  connector_id uuid,
  source_type text NOT NULL,
  external_id text,
  occurred_at timestamptz NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cev_dedupe ON public.canonical_events (organization_id, source_type, event_type, coalesce(external_id,''), occurred_at);
CREATE INDEX IF NOT EXISTS idx_cev_org_time ON public.canonical_events (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cev_entity ON public.canonical_events (entity_id);

CREATE TABLE IF NOT EXISTS public.canonical_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  metric_key text NOT NULL,
  entity_id uuid REFERENCES public.canonical_entities(id) ON DELETE SET NULL,
  connector_id uuid,
  source_type text NOT NULL,
  period_start date NOT NULL,
  period_grain text NOT NULL DEFAULT 'day',
  value numeric NOT NULL,
  unit text,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cmet_dedupe ON public.canonical_metrics (organization_id, metric_key, period_start, period_grain, coalesce(connector_id,'00000000-0000-0000-0000-000000000000'::uuid), dimensions);
CREATE INDEX IF NOT EXISTS idx_cmet_org_key_time ON public.canonical_metrics (organization_id, metric_key, period_start DESC);

CREATE TABLE IF NOT EXISTS public.canonical_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  dimension_key text NOT NULL,
  value text NOT NULL,
  label text,
  parent_dimension_id uuid REFERENCES public.canonical_dimensions(id) ON DELETE SET NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dimension_key, value)
);

CREATE TABLE IF NOT EXISTS public.connector_dq_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  connector_id uuid NOT NULL,
  stream_key text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  freshness_score numeric NOT NULL DEFAULT 0,
  completeness_score numeric NOT NULL DEFAULT 0,
  schema_stability_score numeric NOT NULL DEFAULT 0,
  anomaly_score numeric NOT NULL DEFAULT 0,
  null_rate numeric NOT NULL DEFAULT 0,
  duplicate_rate numeric NOT NULL DEFAULT 0,
  confidence_score numeric NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_dq_connector_time ON public.connector_dq_scores (connector_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS public.connector_circuit_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  connector_id uuid NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'closed',
  consecutive_failures integer NOT NULL DEFAULT 0,
  failure_threshold integer NOT NULL DEFAULT 5,
  retry_budget_per_hour integer NOT NULL DEFAULT 60,
  retries_used_window integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  next_probe_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.canonical_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_dq_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_circuit_state ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'canonical_entities','canonical_events','canonical_metrics','canonical_dimensions',
    'connector_dq_scores','connector_circuit_state'
  ]) LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_org_member(auth.uid(), organization_id) AND public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.is_org_member(auth.uid(), organization_id) AND public.has_role(auth.uid(), ''admin''::app_role))', t || '_admin_manage', t);
  END LOOP;
END$$;
