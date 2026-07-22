ALTER TABLE public.aicis_sync_surface_status
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS circuit_breaker_until timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_aicis_surface_status_breaker
  ON public.aicis_sync_surface_status (organization_id, circuit_breaker_until);