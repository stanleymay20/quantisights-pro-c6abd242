CREATE SCHEMA IF NOT EXISTS billing_control;
REVOKE ALL ON SCHEMA billing_control FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA billing_control TO service_role;

ALTER TABLE public.stripe_processed_events
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS claim_token uuid;

ALTER TABLE public.stripe_processed_events
  ALTER COLUMN processed_at DROP NOT NULL;

UPDATE public.stripe_processed_events
   SET status = COALESCE(status, 'processed'),
       attempts = COALESCE(attempts, 1)
 WHERE status IS NULL OR attempts IS NULL;

ALTER TABLE public.stripe_processed_events
  ALTER COLUMN status SET DEFAULT 'processed',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN attempts SET DEFAULT 1,
  ALTER COLUMN attempts SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'stripe_processed_events_status_check'
       AND conrelid = 'public.stripe_processed_events'::regclass
  ) THEN
    ALTER TABLE public.stripe_processed_events
      ADD CONSTRAINT stripe_processed_events_status_check
      CHECK (status IN ('processing', 'processed', 'failed'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION billing_control.claim_stripe_event(
  p_event_id text,
  p_event_type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, billing_control
AS $$
DECLARE
  v_status text;
  v_started timestamptz;
  v_claim_token uuid := gen_random_uuid();
BEGIN
  IF NULLIF(btrim(p_event_id), '') IS NULL OR NULLIF(btrim(p_event_type), '') IS NULL THEN
    RAISE EXCEPTION 'stripe_event_identity_required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stripe_processed_events (
    event_id, event_type, status, processed_at, processing_started_at, attempts, last_error, claim_token
  ) VALUES (
    p_event_id, p_event_type, 'processing', NULL, clock_timestamp(), 1, NULL, v_claim_token
  )
  ON CONFLICT (event_id) DO NOTHING;

  IF FOUND THEN
    RETURN jsonb_build_object('state', 'claimed', 'claim_token', v_claim_token);
  END IF;

  SELECT status, processing_started_at
    INTO v_status, v_started
    FROM public.stripe_processed_events
   WHERE event_id = p_event_id
   FOR UPDATE;

  IF v_status = 'processed' THEN
    RETURN jsonb_build_object('state', 'duplicate');
  END IF;

  IF v_status = 'processing'
     AND v_started IS NOT NULL
     AND v_started > clock_timestamp() - interval '5 minutes' THEN
    RETURN jsonb_build_object('state', 'busy');
  END IF;

  UPDATE public.stripe_processed_events
     SET event_type = p_event_type,
         status = 'processing',
         processed_at = NULL,
         processing_started_at = clock_timestamp(),
         attempts = attempts + 1,
         last_error = NULL,
         claim_token = v_claim_token
   WHERE event_id = p_event_id;

  RETURN jsonb_build_object('state', 'claimed', 'claim_token', v_claim_token);
END;
$$;

CREATE OR REPLACE FUNCTION billing_control.complete_stripe_event(
  p_event_id text,
  p_claim_token uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, billing_control
AS $$
BEGIN
  UPDATE public.stripe_processed_events
     SET status = 'processed',
         processed_at = clock_timestamp(),
         processing_started_at = NULL,
         last_error = NULL,
         claim_token = NULL
   WHERE event_id = p_event_id
     AND status = 'processing'
     AND claim_token = p_claim_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stripe_event_claim_not_owned' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION billing_control.fail_stripe_event(
  p_event_id text,
  p_claim_token uuid,
  p_error text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, billing_control
AS $$
BEGIN
  UPDATE public.stripe_processed_events
     SET status = 'failed',
         processed_at = NULL,
         processing_started_at = NULL,
         last_error = left(COALESCE(p_error, 'unknown_error'), 2000),
         claim_token = NULL
   WHERE event_id = p_event_id
     AND status = 'processing'
     AND claim_token = p_claim_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stripe_event_claim_not_owned' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION billing_control.claim_stripe_event(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION billing_control.complete_stripe_event(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION billing_control.fail_stripe_event(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION billing_control.claim_stripe_event(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION billing_control.complete_stripe_event(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION billing_control.fail_stripe_event(text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_stripe_event(p_event_id text, p_event_type text)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT billing_control.claim_stripe_event(p_event_id, p_event_type);
$$;

CREATE OR REPLACE FUNCTION public.complete_stripe_event(p_event_id text, p_claim_token uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT billing_control.complete_stripe_event(p_event_id, p_claim_token);
$$;

CREATE OR REPLACE FUNCTION public.fail_stripe_event(p_event_id text, p_claim_token uuid, p_error text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT billing_control.fail_stripe_event(p_event_id, p_claim_token, p_error);
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_event(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_stripe_event(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_stripe_event(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_stripe_event(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_stripe_event(text, uuid, text) TO service_role;
