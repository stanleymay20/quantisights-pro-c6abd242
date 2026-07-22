-- ──────────────────────────────────────────────────────────────
-- AICIS Layer C/D Projection Schema
-- ──────────────────────────────────────────────────────────────

-- 1. PREDICTIONS
CREATE TABLE IF NOT EXISTS public.aicis_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  country_iso3 text,
  domain text,
  risk_probability numeric NOT NULL,
  confidence_lower numeric,
  confidence_upper numeric,
  horizon_days integer,
  evidence_count integer,
  rank_position integer,
  model_version text,
  factors jsonb,
  generated_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  source_record_id uuid REFERENCES public.aicis_ingested_records(id) ON DELETE CASCADE,
  UNIQUE (organization_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_aicis_pred_org_risk ON public.aicis_predictions (organization_id, risk_probability DESC);
CREATE INDEX IF NOT EXISTS idx_aicis_pred_country ON public.aicis_predictions (organization_id, country_iso3);
CREATE INDEX IF NOT EXISTS idx_aicis_pred_domain ON public.aicis_predictions (organization_id, domain);

-- 2. RECOMMENDATIONS
CREATE TABLE IF NOT EXISTS public.aicis_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  country_iso3 text,
  domain text,
  intervention_type text,
  intervention_title text,
  rationale_md text,
  urgency_hours integer,
  urgency_window text,
  confidence numeric,
  estimated_cost_eur numeric,
  estimated_roi_eur numeric,
  expected_roi_lower numeric,
  expected_roi_upper numeric,
  status text,
  generated_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  source_record_id uuid REFERENCES public.aicis_ingested_records(id) ON DELETE CASCADE,
  UNIQUE (organization_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_aicis_rec_org_urgency ON public.aicis_recommendations (organization_id, urgency_hours);
CREATE INDEX IF NOT EXISTS idx_aicis_rec_country ON public.aicis_recommendations (organization_id, country_iso3);

-- 3. INFLUENCE GRAPH (cross_border + cross_domain unified as directed edges)
CREATE TABLE IF NOT EXISTS public.aicis_influence_graph (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  edge_kind text NOT NULL, -- 'cross_border' | 'cross_domain'
  source_node text NOT NULL,
  target_node text NOT NULL,
  domain text,
  weight numeric NOT NULL DEFAULT 0,
  lag_days integer,
  sample_size integer,
  region text,
  description text,
  detected_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  source_record_id uuid REFERENCES public.aicis_ingested_records(id) ON DELETE CASCADE,
  UNIQUE (organization_id, external_id, target_node)
);
CREATE INDEX IF NOT EXISTS idx_aicis_graph_src ON public.aicis_influence_graph (organization_id, source_node);
CREATE INDEX IF NOT EXISTS idx_aicis_graph_tgt ON public.aicis_influence_graph (organization_id, target_node);
CREATE INDEX IF NOT EXISTS idx_aicis_graph_kind ON public.aicis_influence_graph (organization_id, edge_kind, weight DESC);

-- 4. OUTCOMES
CREATE TABLE IF NOT EXISTS public.aicis_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  prediction_external_id text,
  country_iso3 text,
  domain text,
  predicted_value numeric,
  actual_value numeric,
  error_margin numeric,
  brier_score numeric,
  evaluated_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  source_record_id uuid REFERENCES public.aicis_ingested_records(id) ON DELETE CASCADE,
  UNIQUE (organization_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_aicis_out_pred ON public.aicis_outcomes (organization_id, prediction_external_id);

-- ──────────────────────────────────────────────────────────────
-- RLS — read-only for org members, writes via service role only
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.aicis_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aicis_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aicis_influence_graph ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aicis_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aicis_pred_select" ON public.aicis_predictions FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "aicis_rec_select" ON public.aicis_recommendations FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "aicis_graph_select" ON public.aicis_influence_graph FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "aicis_out_select" ON public.aicis_outcomes FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

-- ──────────────────────────────────────────────────────────────
-- Decision ledger linkage (back-trace to AICIS sources)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.decision_ledger
  ADD COLUMN IF NOT EXISTS linked_aicis_prediction_id uuid REFERENCES public.aicis_predictions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_aicis_recommendation_id uuid REFERENCES public.aicis_recommendations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dl_aicis_pred ON public.decision_ledger (linked_aicis_prediction_id) WHERE linked_aicis_prediction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dl_aicis_rec ON public.decision_ledger (linked_aicis_recommendation_id) WHERE linked_aicis_recommendation_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- Projection trigger — payload → typed tables (idempotent)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.aicis_project_to_typed_tables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p jsonb := NEW.payload;
  affected text;
BEGIN
  IF NEW.surface = 'predictions' THEN
    INSERT INTO public.aicis_predictions (
      organization_id, external_id, country_iso3, domain, risk_probability,
      confidence_lower, confidence_upper, horizon_days, evidence_count,
      rank_position, model_version, factors, generated_at, source_record_id
    ) VALUES (
      NEW.organization_id, NEW.external_id,
      COALESCE(p->>'country_iso3', NEW.country_iso3),
      COALESCE(p->>'domain', NEW.domain),
      COALESCE((p->>'risk_probability')::numeric, 0),
      NULLIF(p->>'confidence_lower','')::numeric,
      NULLIF(p->>'confidence_upper','')::numeric,
      NULLIF(p->>'horizon_days','')::integer,
      NULLIF(p->>'evidence_count','')::integer,
      NULLIF(p->>'rank_position','')::integer,
      p->>'model_version',
      p->'factors',
      NULLIF(p->>'generated_at','')::timestamptz,
      NEW.id
    )
    ON CONFLICT (organization_id, external_id) DO UPDATE SET
      risk_probability = EXCLUDED.risk_probability,
      confidence_lower = EXCLUDED.confidence_lower,
      confidence_upper = EXCLUDED.confidence_upper,
      horizon_days = EXCLUDED.horizon_days,
      evidence_count = EXCLUDED.evidence_count,
      rank_position = EXCLUDED.rank_position,
      model_version = EXCLUDED.model_version,
      factors = EXCLUDED.factors,
      generated_at = EXCLUDED.generated_at,
      source_record_id = EXCLUDED.source_record_id;

  ELSIF NEW.surface = 'recommendations' THEN
    INSERT INTO public.aicis_recommendations (
      organization_id, external_id, country_iso3, domain, intervention_type,
      intervention_title, rationale_md, urgency_hours, urgency_window, confidence,
      estimated_cost_eur, estimated_roi_eur, expected_roi_lower, expected_roi_upper,
      status, generated_at, source_record_id
    ) VALUES (
      NEW.organization_id, NEW.external_id,
      COALESCE(p->>'country_iso3', NEW.country_iso3),
      COALESCE(p->>'domain', NEW.domain),
      p->>'intervention_type',
      p->>'intervention_title',
      p->>'rationale_md',
      NULLIF(p->>'urgency_hours','')::integer,
      p->>'urgency_window',
      NULLIF(p->>'confidence','')::numeric,
      NULLIF(p->>'estimated_cost_eur','')::numeric,
      NULLIF(p->>'estimated_roi_eur','')::numeric,
      NULLIF(p->>'expected_roi_lower','')::numeric,
      NULLIF(p->>'expected_roi_upper','')::numeric,
      p->>'status',
      NULLIF(p->>'generated_at','')::timestamptz,
      NEW.id
    )
    ON CONFLICT (organization_id, external_id) DO UPDATE SET
      intervention_type = EXCLUDED.intervention_type,
      intervention_title = EXCLUDED.intervention_title,
      rationale_md = EXCLUDED.rationale_md,
      urgency_hours = EXCLUDED.urgency_hours,
      urgency_window = EXCLUDED.urgency_window,
      confidence = EXCLUDED.confidence,
      estimated_cost_eur = EXCLUDED.estimated_cost_eur,
      estimated_roi_eur = EXCLUDED.estimated_roi_eur,
      expected_roi_lower = EXCLUDED.expected_roi_lower,
      expected_roi_upper = EXCLUDED.expected_roi_upper,
      status = EXCLUDED.status,
      generated_at = EXCLUDED.generated_at,
      source_record_id = EXCLUDED.source_record_id;

  ELSIF NEW.surface = 'cross_border' THEN
    -- explode affected_iso3 array into one edge per target
    IF p ? 'affected_iso3' AND jsonb_typeof(p->'affected_iso3') = 'array' THEN
      FOR affected IN SELECT jsonb_array_elements_text(p->'affected_iso3')
      LOOP
        INSERT INTO public.aicis_influence_graph (
          organization_id, external_id, edge_kind, source_node, target_node,
          domain, weight, description, detected_at, source_record_id
        ) VALUES (
          NEW.organization_id, NEW.external_id, 'cross_border',
          UPPER(p->>'origin_iso3'), UPPER(affected),
          p->>'domain',
          COALESCE((p->>'intensity')::numeric, 0),
          p->>'description',
          NULLIF(p->>'detected_at','')::timestamptz,
          NEW.id
        )
        ON CONFLICT (organization_id, external_id, target_node) DO UPDATE SET
          weight = EXCLUDED.weight,
          domain = EXCLUDED.domain,
          description = EXCLUDED.description,
          detected_at = EXCLUDED.detected_at,
          source_record_id = EXCLUDED.source_record_id;
      END LOOP;
    END IF;

  ELSIF NEW.surface = 'cross_domain' THEN
    INSERT INTO public.aicis_influence_graph (
      organization_id, external_id, edge_kind, source_node, target_node,
      domain, weight, lag_days, sample_size, region, detected_at, source_record_id
    ) VALUES (
      NEW.organization_id, NEW.external_id, 'cross_domain',
      p->>'source_domain', p->>'target_domain',
      COALESCE(p->>'target_domain', p->>'source_domain'),
      COALESCE((p->>'transfer_strength')::numeric, 0),
      NULLIF(p->>'lag_days','')::integer,
      NULLIF(p->>'sample_size','')::integer,
      p->>'region',
      NULLIF(p->>'computed_at','')::timestamptz,
      NEW.id
    )
    ON CONFLICT (organization_id, external_id, target_node) DO UPDATE SET
      weight = EXCLUDED.weight,
      lag_days = EXCLUDED.lag_days,
      sample_size = EXCLUDED.sample_size,
      region = EXCLUDED.region,
      detected_at = EXCLUDED.detected_at,
      source_record_id = EXCLUDED.source_record_id;

  ELSIF NEW.surface = 'outcomes' THEN
    INSERT INTO public.aicis_outcomes (
      organization_id, external_id, prediction_external_id,
      country_iso3, domain, predicted_value, actual_value,
      error_margin, brier_score, evaluated_at, source_record_id
    ) VALUES (
      NEW.organization_id, NEW.external_id,
      p->>'prediction_id',
      COALESCE(p->>'country_iso3', NEW.country_iso3),
      COALESCE(p->>'domain', NEW.domain),
      NULLIF(p->>'predicted_value','')::numeric,
      NULLIF(p->>'actual_value','')::numeric,
      NULLIF(p->>'error_margin','')::numeric,
      NULLIF(p->>'brier_score','')::numeric,
      NULLIF(p->>'evaluated_at','')::timestamptz,
      NEW.id
    )
    ON CONFLICT (organization_id, external_id) DO UPDATE SET
      predicted_value = EXCLUDED.predicted_value,
      actual_value = EXCLUDED.actual_value,
      error_margin = EXCLUDED.error_margin,
      brier_score = EXCLUDED.brier_score,
      evaluated_at = EXCLUDED.evaluated_at,
      source_record_id = EXCLUDED.source_record_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aicis_project ON public.aicis_ingested_records;
CREATE TRIGGER trg_aicis_project
AFTER INSERT OR UPDATE ON public.aicis_ingested_records
FOR EACH ROW
EXECUTE FUNCTION public.aicis_project_to_typed_tables();

-- ──────────────────────────────────────────────────────────────
-- Backfill from existing 4,920 ingested rows
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.aicis_ingested_records
    WHERE surface IN ('predictions','recommendations','cross_border','cross_domain','outcomes')
    ORDER BY ingested_at
  LOOP
    UPDATE public.aicis_ingested_records SET updated_at = updated_at WHERE id = r.id;
  END LOOP;
END $$;