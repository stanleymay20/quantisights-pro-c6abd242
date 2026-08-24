-- Zero-tolerance truth semantics: an in-flight/unmeasured sync has an unknown
-- record count, not a measured zero. Genuine completed zero-row syncs remain 0.
ALTER TABLE public.data_sync_jobs
  ALTER COLUMN records_synced DROP DEFAULT;

UPDATE public.data_sync_jobs
SET records_synced = NULL
WHERE status IN ('pending', 'running')
  AND records_synced = 0;

COMMENT ON COLUMN public.data_sync_jobs.records_synced IS
  'Verified records persisted by a sync run. NULL means the count is unknown/not yet measured; 0 is a verified zero-row result.';
