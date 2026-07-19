-- Reset signals surface failure state so the new smaller page size gets a fresh attempt.
UPDATE public.aicis_sync_surface_status
SET consecutive_failures = 0,
    circuit_breaker_until = NULL,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_page_size', 50, 'breaker_reset_at', now())
WHERE surface = 'signals';