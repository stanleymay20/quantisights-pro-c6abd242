
-- Add canonical Insight Object field per Book Ch.3 schema
ALTER TABLE public.advisory_instances
ADD COLUMN IF NOT EXISTS insight_object JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.advisory_instances.insight_object IS 'Canonical Insight Object (SUDAL Ch.3): {metricName, currentValue, expectedValue, deviationMagnitude, deviationScore, severityLevel, detectionModel, modelParameters, labels}';
