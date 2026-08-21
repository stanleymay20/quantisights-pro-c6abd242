-- Evidence-based commercial value attribution for governed decisions.
-- Monetary claims are separated by evidence maturity so heuristic/legacy
-- predicted_net_impact values are never presented as verified business value.

CREATE TABLE IF NOT EXISTS public.decision_value_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES public.decision_ledger(id) ON DELETE CASCADE,
  source_kind text NOT NULL DEFAULT 'manual'
    CHECK (source_kind IN ('aicis_prediction','aicis_recommendation','manual','other')),
  currency text NOT NULL DEFAULT 'EUR'
    CHECK (currency ~ '^[A-Z]{3}$'),

  -- Modelled values are useful for prioritisation and sales demonstrations,
  -- but are explicitly not verified financial outcomes.
  modeled_cost numeric,
  modeled_roi numeric,
  modeled_value_at_risk numeric,

  -- Verified/measured fields require evidence and are the only values that
  -- should be described to customers as realised or verified business value.
  verified_value_at_risk numeric,
  realized_benefit numeric,
  realized_cost numeric,
  realized_net_value numeric,

  attribution_status text NOT NULL DEFAULT 'modeled'
    CHECK (attribution_status IN ('modeled','verified','measured')),
  attribution_method text,
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100)),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  measured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, decision_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_value_attributions_org_status
  ON public.decision_value_attributions (organization_id, attribution_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_value_attributions_decision
  ON public.decision_value_attributions (decision_id);

ALTER TABLE public.decision_value_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "decision value readable by org members" ON public.decision_value_attributions;
CREATE POLICY "decision value readable by org members"
  ON public.decision_value_attributions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = decision_value_attributions.organization_id
      AND om.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "decision value managed by org admins" ON public.decision_value_attributions;
CREATE POLICY "decision value managed by org admins"
  ON public.decision_value_attributions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = decision_value_attributions.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = decision_value_attributions.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin')
  ));

GRANT SELECT, INSERT, UPDATE ON public.decision_value_attributions TO authenticated;
GRANT ALL ON public.decision_value_attributions TO service_role;

-- Seed only clearly-labelled modelled values from AICIS recommendations.
-- estimated_roi_eur and estimated_cost_eur remain "modeled"; no verified or
-- realised monetary value is fabricated during backfill.
INSERT INTO public.decision_value_attributions (
  organization_id,
  decision_id,
  source_kind,
  currency,
  modeled_cost,
  modeled_roi,
  attribution_status,
  attribution_method,
  confidence,
  evidence
)
SELECT
  d.organization_id,
  d.id,
  'aicis_recommendation',
  'EUR',
  r.estimated_cost_eur,
  r.estimated_roi_eur,
  'modeled',
  'aicis_recommendation_estimate',
  CASE
    WHEN r.confidence IS NULL THEN NULL
    WHEN r.confidence <= 1 THEN r.confidence * 100
    ELSE LEAST(r.confidence, 100)
  END,
  jsonb_build_object(
    'aicis_recommendation_id', r.id,
    'external_id', r.external_id,
    'country_iso3', r.country_iso3,
    'domain', r.domain,
    'generated_at', r.generated_at,
    'note', 'Modelled estimate imported from AICIS; not verified realised value'
  )
FROM public.decision_ledger d
JOIN public.aicis_recommendations r
  ON r.id = d.linked_aicis_recommendation_id
 AND r.organization_id = d.organization_id
WHERE d.linked_aicis_recommendation_id IS NOT NULL
  AND (r.estimated_cost_eur IS NOT NULL OR r.estimated_roi_eur IS NOT NULL)
ON CONFLICT (organization_id, decision_id) DO NOTHING;

-- Controlled RPC for recording evidence-backed value. The caller must be an
-- owner/admin; "verified" and "measured" states require non-empty evidence.
CREATE OR REPLACE FUNCTION public.record_decision_value_attribution(
  p_organization_id uuid,
  p_decision_id uuid,
  p_currency text DEFAULT 'EUR',
  p_verified_value_at_risk numeric DEFAULT NULL,
  p_realized_benefit numeric DEFAULT NULL,
  p_realized_cost numeric DEFAULT NULL,
  p_status text DEFAULT 'verified',
  p_method text DEFAULT NULL,
  p_confidence numeric DEFAULT NULL,
  p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS public.decision_value_attributions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  out_row public.decision_value_attributions;
  v_net numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_status NOT IN ('verified','measured') THEN
    RAISE EXCEPTION 'status must be verified or measured';
  END IF;
  IF p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'currency must be ISO-4217 style 3-letter code';
  END IF;
  IF p_confidence IS NOT NULL AND (p_confidence < 0 OR p_confidence > 100) THEN
    RAISE EXCEPTION 'confidence must be between 0 and 100';
  END IF;
  IF p_evidence = '{}'::jsonb THEN
    RAISE EXCEPTION 'evidence is required for verified/measured value';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.decision_ledger d
    WHERE d.id = p_decision_id AND d.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'decision not found in organization';
  END IF;

  v_net := CASE
    WHEN p_realized_benefit IS NULL AND p_realized_cost IS NULL THEN NULL
    ELSE COALESCE(p_realized_benefit, 0) - COALESCE(p_realized_cost, 0)
  END;

  INSERT INTO public.decision_value_attributions (
    organization_id, decision_id, source_kind, currency,
    verified_value_at_risk, realized_benefit, realized_cost, realized_net_value,
    attribution_status, attribution_method, confidence, evidence, measured_at, updated_at
  ) VALUES (
    p_organization_id, p_decision_id, 'manual', upper(p_currency),
    p_verified_value_at_risk, p_realized_benefit, p_realized_cost, v_net,
    p_status, p_method, p_confidence, p_evidence,
    CASE WHEN p_status = 'measured' THEN now() ELSE NULL END, now()
  )
  ON CONFLICT (organization_id, decision_id) DO UPDATE SET
    currency = EXCLUDED.currency,
    verified_value_at_risk = EXCLUDED.verified_value_at_risk,
    realized_benefit = EXCLUDED.realized_benefit,
    realized_cost = EXCLUDED.realized_cost,
    realized_net_value = EXCLUDED.realized_net_value,
    attribution_status = EXCLUDED.attribution_status,
    attribution_method = EXCLUDED.attribution_method,
    confidence = EXCLUDED.confidence,
    evidence = EXCLUDED.evidence,
    measured_at = EXCLUDED.measured_at,
    updated_at = now()
  RETURNING * INTO out_row;

  RETURN out_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_decision_value_attribution(uuid,uuid,text,numeric,numeric,numeric,text,text,numeric,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_decision_value_attribution(uuid,uuid,text,numeric,numeric,numeric,text,text,numeric,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_decision_value_attribution(uuid,uuid,text,numeric,numeric,numeric,text,text,numeric,jsonb) TO service_role;
