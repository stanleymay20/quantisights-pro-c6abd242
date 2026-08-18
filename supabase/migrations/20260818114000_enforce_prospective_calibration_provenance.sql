-- Separate prospective calibration evidence from retrospective/backfilled evaluations.
-- Historical outcomes remain queryable for diagnostics, but only prospectively
-- committed outcome tracking may contribute to calibration certification.

ALTER TABLE public.decision_outcomes
  ADD COLUMN IF NOT EXISTS evidence_regime TEXT,
  ADD COLUMN IF NOT EXISTS calibration_eligible BOOLEAN,
  ADD COLUMN IF NOT EXISTS eligibility_reason TEXT;

ALTER TABLE public.calibration_models
  ADD COLUMN IF NOT EXISTS evidence_regime TEXT,
  ADD COLUMN IF NOT EXISTS prospective_decisions_count INTEGER,
  ADD COLUMN IF NOT EXISTS excluded_decisions_count INTEGER;

-- Existing calibration snapshots were computed before provenance was enforced.
-- Mark them explicitly as legacy/mixed so downstream consumers can refuse to
-- treat them as prospective certification evidence.
UPDATE public.calibration_models
SET evidence_regime = COALESCE(evidence_regime, 'legacy_mixed'),
    prospective_decisions_count = COALESCE(prospective_decisions_count, 0),
    excluded_decisions_count = COALESCE(excluded_decisions_count, total_decisions_analyzed, 0)
WHERE evidence_regime IS NULL
   OR prospective_decisions_count IS NULL
   OR excluded_decisions_count IS NULL;

-- Classify existing outcome records conservatively. A record is prospective
-- only when it was scheduled close to the governed decision timestamp. The
-- 24-hour grace accommodates asynchronous approval/scheduling pipelines while
-- preventing long-after-the-fact backfills from qualifying.
UPDATE public.decision_outcomes AS o
SET evidence_regime = CASE
      WHEN d.decided_at IS NOT NULL
       AND o.created_at >= d.decided_at - INTERVAL '5 minutes'
       AND o.created_at <= d.decided_at + INTERVAL '24 hours'
        THEN 'prospective'
      ELSE 'retrospective'
    END,
    calibration_eligible = CASE
      WHEN d.decided_at IS NOT NULL
       AND o.created_at >= d.decided_at - INTERVAL '5 minutes'
       AND o.created_at <= d.decided_at + INTERVAL '24 hours'
        THEN TRUE
      ELSE FALSE
    END,
    eligibility_reason = CASE
      WHEN d.decided_at IS NULL
        THEN 'missing_decision_timestamp'
      WHEN o.created_at < d.decided_at - INTERVAL '5 minutes'
        THEN 'scheduled_before_governed_decision'
      WHEN o.created_at > d.decided_at + INTERVAL '24 hours'
        THEN 'scheduled_after_prospective_window'
      ELSE 'scheduled_within_prospective_window'
    END
FROM public.decision_ledger AS d
WHERE d.id = o.decision_id
  AND d.organization_id = o.organization_id;

UPDATE public.decision_outcomes
SET evidence_regime = COALESCE(evidence_regime, 'retrospective'),
    calibration_eligible = COALESCE(calibration_eligible, FALSE),
    eligibility_reason = COALESCE(eligibility_reason, 'unclassified_legacy_record');

ALTER TABLE public.decision_outcomes
  ALTER COLUMN evidence_regime SET DEFAULT 'retrospective',
  ALTER COLUMN evidence_regime SET NOT NULL,
  ALTER COLUMN calibration_eligible SET DEFAULT FALSE,
  ALTER COLUMN calibration_eligible SET NOT NULL;

ALTER TABLE public.calibration_models
  ALTER COLUMN evidence_regime SET DEFAULT 'legacy_mixed',
  ALTER COLUMN evidence_regime SET NOT NULL,
  ALTER COLUMN prospective_decisions_count SET DEFAULT 0,
  ALTER COLUMN prospective_decisions_count SET NOT NULL,
  ALTER COLUMN excluded_decisions_count SET DEFAULT 0,
  ALTER COLUMN excluded_decisions_count SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'decision_outcomes_evidence_regime_check'
      AND conrelid = 'public.decision_outcomes'::regclass
  ) THEN
    ALTER TABLE public.decision_outcomes
      ADD CONSTRAINT decision_outcomes_evidence_regime_check
      CHECK (evidence_regime IN ('prospective', 'retrospective'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calibration_models_evidence_regime_check'
      AND conrelid = 'public.calibration_models'::regclass
  ) THEN
    ALTER TABLE public.calibration_models
      ADD CONSTRAINT calibration_models_evidence_regime_check
      CHECK (evidence_regime IN ('prospective_only', 'legacy_mixed'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.classify_decision_outcome_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_decided_at TIMESTAMPTZ;
BEGIN
  SELECT decided_at
    INTO v_decided_at
  FROM public.decision_ledger
  WHERE id = NEW.decision_id
    AND organization_id = NEW.organization_id;

  IF v_decided_at IS NULL THEN
    NEW.evidence_regime := 'retrospective';
    NEW.calibration_eligible := FALSE;
    NEW.eligibility_reason := 'missing_decision_timestamp';
  ELSIF NEW.created_at >= v_decided_at - INTERVAL '5 minutes'
     AND NEW.created_at <= v_decided_at + INTERVAL '24 hours' THEN
    NEW.evidence_regime := 'prospective';
    NEW.calibration_eligible := TRUE;
    NEW.eligibility_reason := 'scheduled_within_prospective_window';
  ELSIF NEW.created_at < v_decided_at - INTERVAL '5 minutes' THEN
    NEW.evidence_regime := 'retrospective';
    NEW.calibration_eligible := FALSE;
    NEW.eligibility_reason := 'scheduled_before_governed_decision';
  ELSE
    NEW.evidence_regime := 'retrospective';
    NEW.calibration_eligible := FALSE;
    NEW.eligibility_reason := 'scheduled_after_prospective_window';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classify_decision_outcome_provenance
  ON public.decision_outcomes;
CREATE TRIGGER trg_classify_decision_outcome_provenance
BEFORE INSERT OR UPDATE OF decision_id, organization_id, created_at
ON public.decision_outcomes
FOR EACH ROW
EXECUTE FUNCTION public.classify_decision_outcome_provenance();

CREATE INDEX IF NOT EXISTS idx_decision_outcomes_calibration_eligibility
  ON public.decision_outcomes (organization_id, calibration_eligible, outcome_status);

COMMENT ON COLUMN public.decision_outcomes.evidence_regime IS
  'prospective when outcome tracking was committed within the governed decision window; retrospective otherwise';
COMMENT ON COLUMN public.decision_outcomes.calibration_eligible IS
  'true only for prospective outcome evidence eligible to train/certify calibration';
COMMENT ON COLUMN public.calibration_models.evidence_regime IS
  'prospective_only for models trained solely on eligible prospective evidence; legacy_mixed for pre-provenance snapshots';
