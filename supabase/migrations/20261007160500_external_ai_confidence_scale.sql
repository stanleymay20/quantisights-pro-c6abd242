-- External ingest protocol uses normalized confidence in [0,1]. Existing
-- decision_ledger UX and evidence-pack formatting use percentage points in
-- [0,100]. Preserve the caller's normalized value in immutable external
-- evidence while adapting only the derived decision-ledger projection.

CREATE OR REPLACE FUNCTION public.normalize_external_ai_ledger_confidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.decision_type = 'external_ai'
     AND NEW.confidence_at_decision IS NOT NULL
     AND NEW.confidence_at_decision >= 0
     AND NEW.confidence_at_decision <= 1
  THEN
    NEW.confidence_at_decision := NEW.confidence_at_decision * 100;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_external_ai_ledger_confidence
  ON public.decision_ledger;
CREATE TRIGGER normalize_external_ai_ledger_confidence
  BEFORE INSERT ON public.decision_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_external_ai_ledger_confidence();
