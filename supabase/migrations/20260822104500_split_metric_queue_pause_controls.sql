-- Separate overload admission control from deliberate worker maintenance.
-- Historically `paused` stopped both producers and the worker, so pausing an
-- overloaded queue also prevented the backlog from draining. `paused` now
-- means admission paused; `drain_paused` is the explicit maintenance control.

ALTER TABLE public.metric_ingest_queue_state
  ADD COLUMN IF NOT EXISTS drain_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

COMMENT ON COLUMN public.metric_ingest_queue_state.paused IS
  'Admission pause: producers reject new queued work, while workers continue draining existing backlog.';
COMMENT ON COLUMN public.metric_ingest_queue_state.drain_paused IS
  'Maintenance pause: queue workers stop draining. Use only when persistence processing itself must be suspended.';
COMMENT ON COLUMN public.metric_ingest_queue_state.pause_reason IS
  'Operator/system reason for the current admission pause.';
