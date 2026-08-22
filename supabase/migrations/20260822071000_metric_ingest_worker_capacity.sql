-- Bounded/tunable drain capacity for the durable metric queue.
-- These controls let staging tune throughput from measured evidence without
-- redeploying worker code or allowing an unbounded Edge Function invocation.

ALTER TABLE public.metric_ingest_queue_state
  ADD COLUMN IF NOT EXISTS worker_concurrency integer NOT NULL DEFAULT 5
    CHECK (worker_concurrency BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS max_chunks_per_run integer NOT NULL DEFAULT 1200
    CHECK (max_chunks_per_run BETWEEN 20 AND 5000),
  ADD COLUMN IF NOT EXISTS max_runtime_ms integer NOT NULL DEFAULT 45000
    CHECK (max_runtime_ms BETWEEN 10000 AND 120000);

COMMENT ON COLUMN public.metric_ingest_queue_state.worker_concurrency IS
  'Maximum queue messages processed concurrently inside one worker invocation.';
COMMENT ON COLUMN public.metric_ingest_queue_state.max_chunks_per_run IS
  'Hard cap on claimed/processed metric chunks per worker invocation.';
COMMENT ON COLUMN public.metric_ingest_queue_state.max_runtime_ms IS
  'Worker self-imposed wall-clock budget; leaves platform timeout headroom.';
