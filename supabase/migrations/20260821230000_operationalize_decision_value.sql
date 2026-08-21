-- Keep value attribution current for future AICIS recommendation-driven decisions
-- and expose a tenant-safe aggregate suitable for executive/commercial surfaces.

CREATE OR REPLACE FUNCTION public.sync_aicis_decision_value_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.aicis_recommendations%ROWTYPE;
  normalized_confidence numeric;
BEGIN
  IF NEW.linked_aicis_recommendation_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO r
  FROM public.aicis_recommendations ar
  WHERE ar.id = NEW.linked_aicis_recommendation_id
    AND ar.organization_id = NEW.organization_id;

  IF NOT FOUND OR (r.estimated_cost_eur IS NULL AND r.estimated_roi_eur IS NULL) THEN
    RETURN NEW;
  END IF;

  normalized_confidence := CASE
    WHEN r.confidence IS NULL THEN NULL
    WHEN r.confidence <= 1 THEN r.confidence * 100
    ELSE LEAST(r.confidence, 100)
  END;

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
    evidence,
    updated_at
  ) VALUES (
    NEW.organization_id,
    NEW.id,
    'aicis_recommendation',
    'EUR',
    r.estimated_cost_eur,
    r.estimated_roi_eur,
    'modeled',
    'aicis_recommendation_estimate',
    normalized_confidence,
    jsonb_build_object(
      'aicis_recommendation_id', r.id,
      'external_id', r.external_id,
      'country_iso3', r.country_iso3,
      'domain', r.domain,
      'generated_at', r.generated_at,
      'note', 'Modelled AICIS estimate; verification required before realised-value claims'
    ),
    now()
  )
  ON CONFLICT (organization_id, decision_id) DO UPDATE SET
    modeled_cost = EXCLUDED.modeled_cost,
    modeled_roi = EXCLUDED.modeled_roi,
    confidence = EXCLUDED.confidence,
    evidence = CASE
      WHEN public.decision_value_attributions.attribution_status = 'modeled'
        THEN EXCLUDED.evidence
      ELSE public.decision_value_attributions.evidence
    END,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_aicis_decision_value_attribution ON public.decision_ledger;
CREATE TRIGGER trg_sync_aicis_decision_value_attribution
AFTER INSERT OR UPDATE OF linked_aicis_recommendation_id
ON public.decision_ledger
FOR EACH ROW
WHEN (NEW.linked_aicis_recommendation_id IS NOT NULL)
EXECUTE FUNCTION public.sync_aicis_decision_value_attribution();

REVOKE ALL ON FUNCTION public.sync_aicis_decision_value_attribution() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_decision_value_summary(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'organization_id', p_organization_id,
    'decisions_attributed', count(*),
    'modeled_decisions', count(*) FILTER (WHERE attribution_status = 'modeled'),
    'verified_decisions', count(*) FILTER (WHERE attribution_status = 'verified'),
    'measured_decisions', count(*) FILTER (WHERE attribution_status = 'measured'),
    'evidence_maturity_pct', round(
      100.0 * count(*) FILTER (WHERE attribution_status IN ('verified','measured'))
      / NULLIF(count(*), 0), 2
    ),
    'currencies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'currency', grouped.currency,
        'modeled_cost', grouped.modeled_cost,
        'modeled_roi', grouped.modeled_roi,
        'verified_value_at_risk', grouped.verified_value_at_risk,
        'realized_benefit', grouped.realized_benefit,
        'realized_cost', grouped.realized_cost,
        'realized_net_value', grouped.realized_net_value,
        'rows', grouped.rows
      ) ORDER BY grouped.currency)
      FROM (
        SELECT
          currency,
          round(COALESCE(sum(modeled_cost), 0), 2) AS modeled_cost,
          round(COALESCE(sum(modeled_roi), 0), 2) AS modeled_roi,
          round(COALESCE(sum(verified_value_at_risk), 0), 2) AS verified_value_at_risk,
          round(COALESCE(sum(realized_benefit), 0), 2) AS realized_benefit,
          round(COALESCE(sum(realized_cost), 0), 2) AS realized_cost,
          round(COALESCE(sum(realized_net_value), 0), 2) AS realized_net_value,
          count(*) AS rows
        FROM public.decision_value_attributions
        WHERE organization_id = p_organization_id
        GROUP BY currency
      ) grouped
    ), '[]'::jsonb),
    'latest_evidence_at', max(updated_at),
    'claim_policy', jsonb_build_object(
      'modeled', 'Scenario estimate only; not realised business value',
      'verified', 'Financial exposure/benefit backed by recorded evidence',
      'measured', 'Observed post-decision value backed by recorded evidence'
    )
  ) INTO result
  FROM public.decision_value_attributions
  WHERE organization_id = p_organization_id;

  RETURN COALESCE(result, jsonb_build_object(
    'organization_id', p_organization_id,
    'decisions_attributed', 0,
    'modeled_decisions', 0,
    'verified_decisions', 0,
    'measured_decisions', 0,
    'evidence_maturity_pct', 0,
    'currencies', '[]'::jsonb,
    'latest_evidence_at', NULL,
    'claim_policy', jsonb_build_object(
      'modeled', 'Scenario estimate only; not realised business value',
      'verified', 'Financial exposure/benefit backed by recorded evidence',
      'measured', 'Observed post-decision value backed by recorded evidence'
    )
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_decision_value_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_decision_value_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_decision_value_summary(uuid) TO service_role;
