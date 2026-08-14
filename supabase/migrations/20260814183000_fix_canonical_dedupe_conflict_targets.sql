-- Align canonical ingestion dedupe indexes with PostgREST `on_conflict` column targets.
--
-- The original event/metric unique indexes normalized nullable keys with COALESCE expressions.
-- PostgREST cannot name those expressions in an `on_conflict=col1,col2,...` target, so canonical
-- upserts could not reliably infer the intended unique index. Generated columns preserve the exact
-- null-equivalence semantics while giving PostgREST real columns it can target.

ALTER TABLE public.canonical_events
  ADD COLUMN IF NOT EXISTS external_id_dedupe text
  GENERATED ALWAYS AS (COALESCE(external_id, '')) STORED;

ALTER TABLE public.canonical_metrics
  ADD COLUMN IF NOT EXISTS connector_id_dedupe uuid
  GENERATED ALWAYS AS (
    COALESCE(connector_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED;

DROP INDEX IF EXISTS public.uq_cev_dedupe;
CREATE UNIQUE INDEX uq_cev_dedupe
  ON public.canonical_events (
    organization_id,
    source_type,
    event_type,
    external_id_dedupe,
    occurred_at
  );

DROP INDEX IF EXISTS public.uq_cmet_dedupe;
CREATE UNIQUE INDEX uq_cmet_dedupe
  ON public.canonical_metrics (
    organization_id,
    metric_key,
    period_start,
    period_grain,
    connector_id_dedupe,
    dimensions
  );

COMMENT ON COLUMN public.canonical_events.external_id_dedupe IS
  'Generated COALESCE(external_id, '''') key used by canonical event upsert conflict inference.';

COMMENT ON COLUMN public.canonical_metrics.connector_id_dedupe IS
  'Generated normalized connector key used by canonical metric upsert conflict inference.';
