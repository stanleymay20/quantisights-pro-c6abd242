
-- 1. Mark dataset layer + provenance
ALTER TABLE public.datasets
  ADD COLUMN IF NOT EXISTS layer_type text NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS provenance jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.datasets
  ADD CONSTRAINT datasets_layer_type_check
  CHECK (layer_type IN ('client', 'internal', 'enrichment'));

CREATE INDEX IF NOT EXISTS idx_datasets_layer_type ON public.datasets(layer_type);

-- 2. Internal reference data — cross-client benchmarks, macro signals
CREATE TABLE IF NOT EXISTS public.internal_reference_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,            -- macro, supply_chain, industry_benchmark, regional, competitor
  metric_name text NOT NULL,         -- e.g. 'inflation_rate', 'shipping_cost_index'
  value numeric NOT NULL,
  unit text,                          -- '%', 'index', 'usd'
  region text,
  industry text,                      -- NAICS code or label
  period_start date,
  period_end date,
  source text NOT NULL,               -- 'fed_reserve', 'world_bank', 'internal_aggregation'
  source_url text,
  confidence_grade text DEFAULT 'B',  -- A/B/C/D
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_iref_category ON public.internal_reference_data(category);
CREATE INDEX IF NOT EXISTS idx_iref_metric ON public.internal_reference_data(metric_name);
CREATE INDEX IF NOT EXISTS idx_iref_region ON public.internal_reference_data(region);
CREATE INDEX IF NOT EXISTS idx_iref_industry ON public.internal_reference_data(industry);
CREATE INDEX IF NOT EXISTS idx_iref_period ON public.internal_reference_data(period_start, period_end);

ALTER TABLE public.internal_reference_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read reference data"
  ON public.internal_reference_data FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies — only service role can write

-- 3. Decision enrichment ledger — what internal context was applied
CREATE TABLE IF NOT EXISTS public.decision_enrichment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  advisory_id uuid REFERENCES public.advisory_instances(id) ON DELETE CASCADE,
  decision_id uuid REFERENCES public.decision_ledger(id) ON DELETE CASCADE,
  client_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,        -- summary of client data used
  internal_context jsonb NOT NULL DEFAULT '[]'::jsonb,        -- list of reference data points applied
  combined_interpretation text,
  client_confidence numeric,                                  -- 0-100 confidence from client data alone
  enriched_confidence numeric,                                -- 0-100 confidence after blending
  confidence_delta numeric,                                   -- change attributable to internal context
  blending_rule text,                                         -- which doctrine rule was applied
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_denrich_org ON public.decision_enrichment(organization_id);
CREATE INDEX IF NOT EXISTS idx_denrich_advisory ON public.decision_enrichment(advisory_id);
CREATE INDEX IF NOT EXISTS idx_denrich_decision ON public.decision_enrichment(decision_id);

ALTER TABLE public.decision_enrichment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their enrichment"
  ON public.decision_enrichment FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can insert enrichment"
  ON public.decision_enrichment FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));
