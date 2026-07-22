-- ─── Auth rate limiting ───────────────────────────────────────────────────────
-- Supports the auth-rate-limiter edge function for server-side brute force protection.
-- Each row is a sliding window counter keyed by "ip:{address}" or "email:{email}".

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  key            text        PRIMARY KEY,        -- "ip:1.2.3.4" | "email:user@co.com"
  attempts       integer     NOT NULL DEFAULT 1,
  window_start   bigint      NOT NULL,           -- Unix epoch seconds
  window_seconds integer     NOT NULL DEFAULT 60,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS: service role only (edge function uses service key)
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- No public select/insert policies — this table is only accessible via service role
-- (edge function auth-rate-limiter)

-- Index for expiry cleanup
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated
  ON public.auth_rate_limits(updated_at);

-- Auto-delete records older than 1 day (cleanup)
CREATE OR REPLACE FUNCTION public.cleanup_auth_rate_limits()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM public.auth_rate_limits
  WHERE updated_at < now() - interval '1 day';
$$;

-- RPC for the rate limiter edge function to atomically increment counters
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  _key            text,
  _window_seconds integer DEFAULT 60
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _now bigint := extract(epoch from now())::bigint;
  _new_attempts integer;
BEGIN
  INSERT INTO public.auth_rate_limits (key, attempts, window_start, window_seconds, updated_at)
    VALUES (_key, 1, _now, _window_seconds, now())
  ON CONFLICT (key) DO UPDATE
    SET
      attempts = CASE
        WHEN (extract(epoch from now())::bigint - auth_rate_limits.window_start) > auth_rate_limits.window_seconds
          THEN 1  -- window expired, reset
        ELSE auth_rate_limits.attempts + 1  -- still in window, increment
      END,
      window_start = CASE
        WHEN (extract(epoch from now())::bigint - auth_rate_limits.window_start) > auth_rate_limits.window_seconds
          THEN _now  -- reset window
        ELSE auth_rate_limits.window_start  -- keep existing window
      END,
      updated_at = now()
  RETURNING attempts INTO _new_attempts;

  RETURN _new_attempts;
END;
$$;

-- Grant execute to service role only
REVOKE EXECUTE ON FUNCTION public.increment_rate_limit FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_rate_limit TO service_role;
GRANT  EXECUTE ON FUNCTION public.cleanup_auth_rate_limits TO service_role;
