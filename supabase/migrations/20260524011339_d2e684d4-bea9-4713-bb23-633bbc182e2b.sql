
CREATE OR REPLACE FUNCTION public.intv_writeback_learning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _outcome text;
  _ttr_hours numeric;
  _eff int;
  _false_positive boolean := false;
  _recurrence int := 0;
  _conf_adj numeric := 0;
BEGIN
  -- Only fire on terminal status transitions
  IF NOT (NEW.status IS DISTINCT FROM OLD.status
          AND NEW.status IN ('resolved','dismissed','deferred')) THEN
    RETURN NEW;
  END IF;

  _outcome := NEW.status::text;
  _false_positive := (NEW.status = 'dismissed');

  IF NEW.resolved_at IS NOT NULL THEN
    _ttr_hours := ROUND(EXTRACT(EPOCH FROM (NEW.resolved_at - NEW.created_at)) / 3600.0, 2);
  ELSE
    _ttr_hours := ROUND(EXTRACT(EPOCH FROM (now() - NEW.created_at)) / 3600.0, 2);
  END IF;

  -- Recurrence: prior resolved/dismissed interventions from the same source
  IF NEW.source_id IS NOT NULL THEN
    SELECT COUNT(*) INTO _recurrence
    FROM public.executive_interventions
    WHERE organization_id = NEW.organization_id
      AND source_type = NEW.source_type
      AND source_id = NEW.source_id
      AND id <> NEW.id
      AND status IN ('resolved','dismissed','deferred');
  END IF;

  -- Effectiveness mapping
  _eff := CASE
    WHEN NEW.outcome_score IS NOT NULL THEN NEW.outcome_score
    WHEN NEW.status = 'resolved' THEN 70
    WHEN NEW.status = 'deferred' THEN 40
    WHEN NEW.status = 'dismissed' THEN 15
    ELSE 50
  END;

  -- Confidence adjustment: reward successful resolutions, penalise dismissals & recurrences
  _conf_adj := CASE
    WHEN NEW.status = 'resolved' THEN  0.05
    WHEN NEW.status = 'deferred' THEN -0.02
    WHEN NEW.status = 'dismissed' THEN -0.08
    ELSE 0
  END - (_recurrence * 0.01);

  INSERT INTO public.intervention_learning (
    organization_id, intervention_id, outcome, time_to_resolution_hours,
    effectiveness_score, recurrence_count, false_positive,
    recommendation_confidence_adjustment, notes, recorded_at
  ) VALUES (
    NEW.organization_id, NEW.id, _outcome, _ttr_hours,
    _eff, _recurrence, _false_positive,
    GREATEST(-0.5, LEAST(0.5, _conf_adj)),
    'Auto-recorded on transition to ' || _outcome
      || COALESCE(' · ' || NEW.resolution_notes, ''),
    now()
  )
  ON CONFLICT (intervention_id) DO UPDATE
  SET outcome = EXCLUDED.outcome,
      time_to_resolution_hours = EXCLUDED.time_to_resolution_hours,
      effectiveness_score = EXCLUDED.effectiveness_score,
      recurrence_count = EXCLUDED.recurrence_count,
      false_positive = EXCLUDED.false_positive,
      recommendation_confidence_adjustment = EXCLUDED.recommendation_confidence_adjustment,
      notes = EXCLUDED.notes,
      recorded_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_intv_writeback_learning ON public.executive_interventions;
CREATE TRIGGER trg_intv_writeback_learning
  AFTER UPDATE OF status ON public.executive_interventions
  FOR EACH ROW
  EXECUTE FUNCTION public.intv_writeback_learning();
