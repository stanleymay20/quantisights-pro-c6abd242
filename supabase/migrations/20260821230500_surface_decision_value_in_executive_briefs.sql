-- Surface commercial value inside the existing Executive Intelligence brief.
-- This does not create a second dashboard and never upgrades modeled estimates
-- into verified/measured claims.

CREATE OR REPLACE FUNCTION public.augment_executive_brief_decision_value()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_rows bigint := 0;
  modeled_rows bigint := 0;
  verified_rows bigint := 0;
  measured_rows bigint := 0;
  currency_rows bigint := 0;
  ccy text;
  modeled_cost numeric := 0;
  modeled_roi numeric := 0;
  verified_var numeric := 0;
  realized_net numeric := 0;
  maturity numeric := 0;
  commercial_line text;
  value_payload jsonb;
BEGIN
  IF NEW.role_type IS DISTINCT FROM 'ceo' OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE attribution_status = 'modeled'),
    count(*) FILTER (WHERE attribution_status = 'verified'),
    count(*) FILTER (WHERE attribution_status = 'measured'),
    count(DISTINCT currency)
  INTO total_rows, modeled_rows, verified_rows, measured_rows, currency_rows
  FROM public.decision_value_attributions
  WHERE organization_id = NEW.organization_id;

  maturity := CASE
    WHEN total_rows = 0 THEN 0
    ELSE round(100.0 * (verified_rows + measured_rows) / total_rows, 2)
  END;

  IF currency_rows = 1 THEN
    SELECT
      max(currency),
      COALESCE(sum(modeled_cost), 0),
      COALESCE(sum(modeled_roi), 0),
      COALESCE(sum(verified_value_at_risk), 0),
      COALESCE(sum(realized_net_value), 0)
    INTO ccy, modeled_cost, modeled_roi, verified_var, realized_net
    FROM public.decision_value_attributions
    WHERE organization_id = NEW.organization_id;
  END IF;

  value_payload := jsonb_build_object(
    'decisions_attributed', total_rows,
    'modeled_decisions', modeled_rows,
    'verified_decisions', verified_rows,
    'measured_decisions', measured_rows,
    'evidence_maturity_pct', maturity,
    'currency', CASE WHEN currency_rows = 1 THEN ccy ELSE NULL END,
    'modeled_cost', CASE WHEN currency_rows = 1 THEN modeled_cost ELSE NULL END,
    'modeled_roi', CASE WHEN currency_rows = 1 THEN modeled_roi ELSE NULL END,
    'verified_value_at_risk', CASE WHEN currency_rows = 1 THEN verified_var ELSE NULL END,
    'realized_net_value', CASE WHEN currency_rows = 1 THEN realized_net ELSE NULL END,
    'claim_policy', jsonb_build_object(
      'modeled', 'scenario estimate only',
      'verified', 'evidence-backed financial exposure or benefit',
      'measured', 'observed post-decision value'
    )
  );

  NEW.summary_json := COALESCE(NEW.summary_json, '{}'::jsonb)
    || jsonb_build_object('decision_value', value_payload);

  -- Add one concise commercial line to the field the current UI already shows.
  -- Prefer measured evidence, then verified exposure, then explicitly-modelled economics.
  IF currency_rows = 1 AND measured_rows > 0 AND realized_net <> 0 THEN
    commercial_line := format(
      ' Measured decision value: %s %s net across %s measured decision%s.',
      ccy, to_char(realized_net, 'FM999G999G999G990D00'), measured_rows,
      CASE WHEN measured_rows = 1 THEN '' ELSE 's' END
    );
  ELSIF currency_rows = 1 AND verified_rows > 0 AND verified_var > 0 THEN
    commercial_line := format(
      ' Verified financial exposure tracked: %s %s; modeled estimates remain scenario-only until measured.',
      ccy, to_char(verified_var, 'FM999G999G999G990D00')
    );
  ELSIF currency_rows = 1 AND modeled_rows > 0 AND (modeled_roi <> 0 OR modeled_cost <> 0) THEN
    commercial_line := format(
      ' Modeled decision economics: %s %s estimated ROI against %s %s estimated action cost; not yet verified.',
      ccy, to_char(modeled_roi, 'FM999G999G999G990D00'),
      ccy, to_char(modeled_cost, 'FM999G999G999G990D00')
    );
  ELSIF total_rows > 0 THEN
    commercial_line := format(
      ' Decision-value evidence maturity: %s%% across %s attributed decision%s.',
      maturity, total_rows, CASE WHEN total_rows = 1 THEN '' ELSE 's' END
    );
  ELSE
    commercial_line := ' Decision-value attribution has not yet been established; no monetary benefit claim is made.';
  END IF;

  NEW.summary_json := jsonb_set(
    NEW.summary_json,
    '{likely_business_impact}',
    to_jsonb(trim(COALESCE(NEW.summary_json->>'likely_business_impact', '') || commercial_line)),
    true
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_augment_executive_brief_decision_value ON public.executive_briefs;
CREATE TRIGGER trg_augment_executive_brief_decision_value
BEFORE INSERT OR UPDATE OF summary_json
ON public.executive_briefs
FOR EACH ROW
EXECUTE FUNCTION public.augment_executive_brief_decision_value();

REVOKE ALL ON FUNCTION public.augment_executive_brief_decision_value() FROM PUBLIC;
