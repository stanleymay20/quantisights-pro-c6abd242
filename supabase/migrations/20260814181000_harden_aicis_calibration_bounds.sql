-- Harden AICIS probability calibration at the database boundary.
--
-- Brier scoring is defined for probabilities and binary outcomes in [0,1].
-- Earlier manual-feedback code could persist a monetary/business impact as
-- aicis_outcomes.actual_value, creating mathematically invalid calibration rows.
-- Do not guess how to reinterpret those historical values: clear invalid
-- calibration fields, then enforce bounded values for all future writes.

UPDATE public.aicis_outcomes
SET actual_value = NULL,
    brier_score = NULL,
    error_margin = NULL
WHERE actual_value IS NOT NULL
  AND (actual_value < 0 OR actual_value > 1);

UPDATE public.aicis_outcomes
SET predicted_value = NULL,
    brier_score = NULL,
    error_margin = NULL
WHERE predicted_value IS NOT NULL
  AND (predicted_value < 0 OR predicted_value > 1);

UPDATE public.aicis_outcomes
SET brier_score = NULL
WHERE brier_score IS NOT NULL
  AND (brier_score < 0 OR brier_score > 1);

UPDATE public.aicis_outcomes
SET error_margin = NULL
WHERE error_margin IS NOT NULL
  AND (error_margin < 0 OR error_margin > 1);

ALTER TABLE public.aicis_outcomes
  DROP CONSTRAINT IF EXISTS aicis_outcomes_actual_value_probability_check,
  DROP CONSTRAINT IF EXISTS aicis_outcomes_predicted_value_probability_check,
  DROP CONSTRAINT IF EXISTS aicis_outcomes_brier_score_check,
  DROP CONSTRAINT IF EXISTS aicis_outcomes_error_margin_check;

ALTER TABLE public.aicis_outcomes
  ADD CONSTRAINT aicis_outcomes_actual_value_probability_check
    CHECK (actual_value IS NULL OR actual_value BETWEEN 0 AND 1),
  ADD CONSTRAINT aicis_outcomes_predicted_value_probability_check
    CHECK (predicted_value IS NULL OR predicted_value BETWEEN 0 AND 1),
  ADD CONSTRAINT aicis_outcomes_brier_score_check
    CHECK (brier_score IS NULL OR brier_score BETWEEN 0 AND 1),
  ADD CONSTRAINT aicis_outcomes_error_margin_check
    CHECK (error_margin IS NULL OR error_margin BETWEEN 0 AND 1);

COMMENT ON COLUMN public.aicis_outcomes.actual_value IS
  'Binary calibration target in [0,1]. Business/monetary impact must be stored outside this probability-calibration field.';
