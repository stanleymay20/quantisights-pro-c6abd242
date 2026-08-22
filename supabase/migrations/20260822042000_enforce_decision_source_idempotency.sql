-- Make source-level decision idempotency the database default rather than an
-- opt-in convention for individual Edge Functions.

CREATE OR REPLACE FUNCTION public.set_decision_source_idempotency_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  source_kind text;
  source_id text;
BEGIN
  IF NULLIF(NEW.source_idempotency_key, '') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.advisory_instance_id IS NOT NULL THEN
    NEW.source_idempotency_key := 'advisory:' || NEW.advisory_instance_id::text;
    RETURN NEW;
  END IF;

  IF NEW.linked_aicis_prediction_id IS NOT NULL THEN
    NEW.source_idempotency_key := 'aicis_prediction:' || NEW.linked_aicis_prediction_id::text;
    RETURN NEW;
  END IF;

  IF NEW.linked_aicis_recommendation_id IS NOT NULL THEN
    NEW.source_idempotency_key := 'aicis_recommendation:' || NEW.linked_aicis_recommendation_id::text;
    RETURN NEW;
  END IF;

  source_kind := NEW.explanation_metadata->'source'->>'kind';
  source_id := NEW.explanation_metadata->'source'->>'id';
  IF source_kind IN ('advisory', 'insight') AND NULLIF(source_id, '') IS NOT NULL THEN
    NEW.source_idempotency_key := source_kind || ':' || source_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS decision_ledger_set_source_idempotency_key ON public.decision_ledger;
CREATE TRIGGER decision_ledger_set_source_idempotency_key
BEFORE INSERT OR UPDATE OF advisory_instance_id, linked_aicis_prediction_id,
  linked_aicis_recommendation_id, explanation_metadata, source_idempotency_key
ON public.decision_ledger
FOR EACH ROW
EXECUTE FUNCTION public.set_decision_source_idempotency_key();

COMMENT ON FUNCTION public.set_decision_source_idempotency_key() IS
  'Derives a stable decision source identity before persistence so concurrent/replayed decision pipelines cannot silently create duplicate source decisions.';
