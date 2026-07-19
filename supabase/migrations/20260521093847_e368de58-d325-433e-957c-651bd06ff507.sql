
-- Prevent duplicate memory rows per (route, item)
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_memory_route_item_unique
  ON public.intelligence_memory (route_id, intelligence_item_id)
  WHERE route_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.intel_writeback_on_decision_resolved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _route record;
  _outcome text;
  _effectiveness int;
  _delta numeric;
BEGIN
  -- Only fire on terminal/resolved transitions
  IF NOT (
    (NEW.execution_status IS DISTINCT FROM OLD.execution_status
       AND NEW.execution_status IN ('completed','failed','cancelled'))
    OR (NEW.outcome_measured_at IS DISTINCT FROM OLD.outcome_measured_at
       AND NEW.outcome_measured_at IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  -- Find the intelligence route that produced this decision
  SELECT r.id AS route_id, r.intelligence_item_id, r.organization_id
  INTO _route
  FROM public.intelligence_routes r
  WHERE r.target_table = 'decision_ledger'
    AND r.target_id = NEW.id
    AND r.organization_id = NEW.organization_id
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF _route.route_id IS NULL THEN
    RETURN NEW;
  END IF;

  _outcome := COALESCE(
    NULLIF(NEW.execution_status, ''),
    CASE WHEN NEW.outcome_measured_at IS NOT NULL THEN 'measured' ELSE 'resolved' END
  );

  _delta := COALESCE(NEW.outcome_delta, 0);
  -- Map delta + status into 0..100 effectiveness
  _effectiveness := CASE
    WHEN NEW.execution_status = 'completed' AND _delta > 0 THEN LEAST(100, 60 + ROUND(LEAST(_delta, 40)::numeric))
    WHEN NEW.execution_status = 'completed' THEN 60
    WHEN NEW.execution_status = 'failed' THEN 15
    WHEN NEW.execution_status = 'cancelled' THEN 25
    WHEN _delta > 0 THEN 55
    WHEN _delta < 0 THEN 30
    ELSE 50
  END;

  INSERT INTO public.intelligence_memory (
    organization_id, intelligence_item_id, route_id,
    observed_outcome, effectiveness_rating, attribution_notes,
    recorded_by, recorded_at
  ) VALUES (
    _route.organization_id, _route.intelligence_item_id, _route.route_id,
    _outcome, _effectiveness,
    'Auto-recorded from decision ' || NEW.id::text
      || ' (status=' || COALESCE(NEW.execution_status,'n/a')
      || ', delta=' || COALESCE(NEW.outcome_delta::text,'n/a') || ')',
    NEW.decided_by, now()
  )
  ON CONFLICT (route_id, intelligence_item_id) DO UPDATE
  SET observed_outcome = EXCLUDED.observed_outcome,
      effectiveness_rating = EXCLUDED.effectiveness_rating,
      attribution_notes = EXCLUDED.attribution_notes,
      recorded_at = now();

  -- Close lifecycle: mark intelligence item resolved
  UPDATE public.aicis_intelligence_items
     SET status = 'resolved',
         resolution_status = _outcome,
         resolution_notes = 'Decision ' || NEW.id::text || ' ' || _outcome
   WHERE id = _route.intelligence_item_id
     AND status <> 'resolved';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_intel_writeback_on_decision_resolved ON public.decision_ledger;
CREATE TRIGGER trg_intel_writeback_on_decision_resolved
AFTER UPDATE ON public.decision_ledger
FOR EACH ROW
EXECUTE FUNCTION public.intel_writeback_on_decision_resolved();
