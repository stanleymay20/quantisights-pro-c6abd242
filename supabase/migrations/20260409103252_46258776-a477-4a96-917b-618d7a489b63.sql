
-- Add explanation fields to decision_ledger
ALTER TABLE public.decision_ledger
  ADD COLUMN IF NOT EXISTS explanation_metadata JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_insight_summary TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recommendation_logic_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS decision_origin TEXT NOT NULL DEFAULT 'ai_generated';

-- Add index for filtering by origin
CREATE INDEX IF NOT EXISTS idx_decision_ledger_origin ON public.decision_ledger (decision_origin);

COMMENT ON COLUMN public.decision_ledger.explanation_metadata IS 'Structured JSON containing: source_data, triggering_insight, reasoning, recommendation_logic, expected_impact_basis, assumptions, limitations';
COMMENT ON COLUMN public.decision_ledger.source_insight_summary IS 'Plain-English summary of the triggering pattern or anomaly';
COMMENT ON COLUMN public.decision_ledger.recommendation_logic_type IS 'Type of logic: trend_detection, threshold_breach, forecast_deviation, anomaly_detection, correlation_analysis';
COMMENT ON COLUMN public.decision_ledger.decision_origin IS 'Origin: ai_generated, manual, hybrid';
