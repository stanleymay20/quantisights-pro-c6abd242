-- Enforce the mathematical domain of AICIS probability calibration.
--
-- aicis_outcomes.predicted_value is a probability of an adverse event.
-- aicis_outcomes.actual_value is the realized binary adverse-event target.
-- Brier score and absolute probability error are therefore also bounded [0,1].
--
-- Older application code could accidentally write business/monetary impact to
-- actual_value. Clear invalid calibration fields rather than guessing how those
-- values should be reinterpreted, then fail closed for future writes.

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
  DROP CONSTRAINT IF EXISTS aicis_outcomes_actual_value_binary_check,
  DROP CONSTRAINT IF EXISTS aicis_outcomes_predicted_value_probability_check,
  DROP CONSTRAINT IF EXISTS aicis_outcomes_brier_score_probability_check,
  DROP CONSTRAINT IF EXISTS aicis_outcomes_error_margin_probability_check;

ALTER TABLE public.aicis_outcomes
  ADD CONSTRAINT aicis_outcomes_actual_value_binary_check
    CHECK (actual_value IS NULL OR actual_value IN (0, 1)),
  ADD CONSTRAINT aicis_outcomes_predicted_value_probability_check
    CHECK (predicted_value IS NULL OR predicted_value BETWEEN 0 AND 1),
  ADD CONSTRAINT aicis_outcomes_brier_score_probability_check
    CHECK (brier_score IS NULL OR brier_score BETWEEN 0 AND 1),
  ADD CONSTRAINT aicis_outcomes_error_margin_probability_check
    CHECK (error_margin IS NULL OR error_margin BETWEEN 0 AND 1);

COMMENT ON COLUMN public.aicis_outcomes.actual_value IS
  'Binary adverse-risk-event calibration target (0 or 1). Business impact belongs on the decision/outcome measurement record, not in this field.';
