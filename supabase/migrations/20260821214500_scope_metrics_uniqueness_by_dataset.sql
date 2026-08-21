-- Metric identity must be dataset-scoped. The previous organization-wide
-- uniqueness key allowed two projects/datasets with the same metric/date/
-- dimensions to collide and overwrite one another during upsert.
--
-- Keep NULL dataset_id streams supported for legacy/global ingestion, while
-- treating NULL as one explicit bucket so those streams remain deduplicated.

DROP INDEX IF EXISTS public.metrics_unique_series;

CREATE UNIQUE INDEX metrics_unique_series
  ON public.metrics (
    organization_id,
    dataset_id,
    metric_type,
    date,
    region,
    segment,
    source_id
  ) NULLS NOT DISTINCT;

COMMENT ON INDEX public.metrics_unique_series IS
  'Dataset-scoped metric identity. Prevents cross-project/dataset upsert collisions; NULL dataset streams remain deduplicated via NULLS NOT DISTINCT.';
