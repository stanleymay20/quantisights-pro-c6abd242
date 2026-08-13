
-- 1. IQ Dimension Scores (Ch 14)
CREATE TABLE public.iq_dimension_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE CASCADE,
  dimension text NOT NULL CHECK (dimension IN ('accuracy','completeness','consistency','timeliness','relevance','accessibility','believability')),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  sample_size integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_iq_scores_org_dataset ON public.iq_dimension_scores(organization_id, dataset_id, dimension, computed_at DESC);
ALTER TABLE public.iq_dimension_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iq_scores_select" ON public.iq_dimension_scores FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "iq_scores_insert" ON public.iq_dimension_scores FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), organization_id));

CREATE OR REPLACE FUNCTION public.get_iq_composite_score(_org_id uuid, _dataset_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH latest AS (
    SELECT DISTINCT ON (dimension) dimension, score, sample_size, computed_at, details
    FROM public.iq_dimension_scores
    WHERE organization_id = _org_id AND dataset_id IS NOT DISTINCT FROM _dataset_id
    ORDER BY dimension, computed_at DESC
  )
  SELECT jsonb_build_object(
    'composite', COALESCE(ROUND(AVG(score))::int, 0),
    'dimensions_measured', COUNT(*),
    'min_sample_size', COALESCE(MIN(sample_size), 0),
    'last_computed_at', MAX(computed_at),
    'grade', CASE
      WHEN COUNT(*) = 0 THEN 'NOT_RATED'
      WHEN AVG(score) >= 90 THEN 'A'
      WHEN AVG(score) >= 80 THEN 'B'
      WHEN AVG(score) >= 70 THEN 'C'
      WHEN AVG(score) >= 60 THEN 'D'
      ELSE 'F'
    END,
    'dimensions', COALESCE(jsonb_object_agg(dimension, jsonb_build_object('score', score, 'sample_size', sample_size, 'details', details, 'computed_at', computed_at)) FILTER (WHERE dimension IS NOT NULL), '{}'::jsonb)
  )
  FROM latest;
$$;

-- 2. Intelligence Product Verifications (Ch 14.4.2)
CREATE TABLE public.intelligence_product_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('decision','advisory','insight','report','prediction')),
  entity_id uuid NOT NULL,
  verification_hash text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  transformations jsonb NOT NULL DEFAULT '[]'::jsonb,
  inputs_hash text,
  output_summary text,
  is_reproducible boolean NOT NULL DEFAULT true,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ipv_entity ON public.intelligence_product_verifications(organization_id, entity_type, entity_id, verified_at DESC);
CREATE UNIQUE INDEX idx_ipv_hash ON public.intelligence_product_verifications(organization_id, entity_type, entity_id, verification_hash);
ALTER TABLE public.intelligence_product_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ipv_select" ON public.intelligence_product_verifications FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "ipv_insert" ON public.intelligence_product_verifications FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), organization_id));

-- 3. Concept Associations (Ch 11)
CREATE TABLE public.concept_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  concept_a text NOT NULL,
  concept_b text NOT NULL,
  co_occurrences integer NOT NULL DEFAULT 0,
  support numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  lift numeric NOT NULL DEFAULT 0,
  corpus_size integer NOT NULL DEFAULT 0,
  source_window_days integer NOT NULL DEFAULT 30,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  computed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (concept_a < concept_b)
);
CREATE UNIQUE INDEX idx_concept_pair ON public.concept_associations(organization_id, concept_a, concept_b);
CREATE INDEX idx_concept_lift ON public.concept_associations(organization_id, lift DESC, last_seen_at DESC);
ALTER TABLE public.concept_associations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "concept_select" ON public.concept_associations FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "concept_insert" ON public.concept_associations FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), organization_id));

-- 4. Declarative Match Functions Registry (Ch 2)
CREATE TABLE public.entity_match_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  attribute_path text NOT NULL,
  match_kind text NOT NULL CHECK (match_kind IN ('exact','exact_ci','prefix','soundex','metaphone','edit_distance','jaro_winkler','nickname','token_set')),
  threshold numeric,
  weight numeric NOT NULL DEFAULT 1.0 CHECK (weight >= 0),
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_emf_name ON public.entity_match_functions(organization_id, name);
CREATE INDEX idx_emf_active ON public.entity_match_functions(organization_id, is_active);
ALTER TABLE public.entity_match_functions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emf_select" ON public.entity_match_functions FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "emf_owner_admin_write" ON public.entity_match_functions FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));
CREATE TRIGGER trg_emf_touch BEFORE UPDATE ON public.entity_match_functions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
