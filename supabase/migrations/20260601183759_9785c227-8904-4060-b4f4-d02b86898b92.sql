ALTER TABLE public.dataset_versions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_dataset_versions_metadata
  ON public.dataset_versions USING gin (metadata);