CREATE TABLE IF NOT EXISTS public.stripe_processed_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.stripe_processed_events TO service_role;

ALTER TABLE public.stripe_processed_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role only - no client access"
  ON public.stripe_processed_events
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_stripe_processed_events_processed_at
  ON public.stripe_processed_events(processed_at DESC);