-- Commercial boundary hardening discovered during first-paying-customer audit.
-- Fail closed on unknown entitlement/quota state, make Stripe webhook idempotency
-- recoverable, and restore the public demo without re-enabling generic Auth tenant
-- auto-provisioning.

-- ---------------------------------------------------------------------------
-- 1) Recoverable Stripe event idempotency
-- ---------------------------------------------------------------------------
ALTER TABLE public.stripe_processed_events
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer,
  ADD COLUMN IF NOT EXISTS last_error text;

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

CREATE OR REPLACE FUNCTION public.claim_stripe_event(
  p_event_id text,
  p_event_type text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text;
  v_started timestamptz;
BEGIN
  IF NULLIF(btrim(p_event_id), '') IS NULL OR NULLIF(btrim(p_event_type), '') IS NULL THEN
    RAISE EXCEPTION 'stripe_event_identity_required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stripe_processed_events (
    event_id,
    event_type,
    status,
    processed_at,
    processing_started_at,
    attempts,
    last_error
  ) VALUES (
    p_event_id,
    p_event_type,
    'processing',
    NULL,
    clock_timestamp(),
    1,
    NULL
  )
  ON CONFLICT (event_id) DO NOTHING;

  IF FOUND THEN
    RETURN 'claimed';
  END IF;

  SELECT status, processing_started_at
    INTO v_status, v_started
    FROM public.stripe_processed_events
   WHERE event_id = p_event_id
   FOR UPDATE;

  IF v_status = 'processed' THEN
    RETURN 'duplicate';
  END IF;

  IF v_status = 'processing'
     AND v_started IS NOT NULL
     AND v_started > clock_timestamp() - interval '5 minutes' THEN
    RETURN 'busy';
  END IF;

  UPDATE public.stripe_processed_events
     SET event_type = p_event_type,
         status = 'processing',
         processed_at = NULL,
         processing_started_at = clock_timestamp(),
         attempts = attempts + 1,
         last_error = NULL
   WHERE event_id = p_event_id;

  RETURN 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_stripe_event(p_event_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.stripe_processed_events
     SET status = 'processed',
         processed_at = clock_timestamp(),
         processing_started_at = NULL,
         last_error = NULL
   WHERE event_id = p_event_id;
$$;

CREATE OR REPLACE FUNCTION public.fail_stripe_event(
  p_event_id text,
  p_error text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.stripe_processed_events
     SET status = 'failed',
         processed_at = NULL,
         processing_started_at = NULL,
         last_error = left(COALESCE(p_error, 'unknown_error'), 2000)
   WHERE event_id = p_event_id
     AND status <> 'processed';
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_event(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_stripe_event(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_stripe_event(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_stripe_event(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_stripe_event(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Demo identity authority: app_metadata is server-owned; user_metadata is not.
--    This narrowly restores the public demo path after generic auth-user tenant
--    provisioning was disabled. Only confirmed demo-<8 hex>@demo.quantivis.io
--    identities explicitly created with the demo marker qualify.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_control.demo_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE tenant_control.demo_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tenant_control.demo_users FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION tenant_control.enforce_trusted_demo_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, tenant_control
AS $$
DECLARE
  v_marker_requested boolean;
  v_trusted_email boolean;
BEGIN
  v_marker_requested :=
    COALESCE(NEW.raw_user_meta_data->>'is_demo', 'false') = 'true'
    OR COALESCE(NEW.raw_app_meta_data->>'is_demo', 'false') = 'true'
    OR (TG_OP = 'UPDATE' AND COALESCE(OLD.raw_app_meta_data->>'is_demo', 'false') = 'true');

  v_trusted_email :=
    NEW.email_confirmed_at IS NOT NULL
    AND lower(COALESCE(NEW.email, '')) ~ '^demo-[0-9a-f]{8}@demo\.quantivis\.io$';

  IF v_marker_requested AND v_trusted_email THEN
    NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('is_demo', true, 'quantivis_demo', true);
    NEW.raw_user_meta_data := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('is_demo', true);
  ELSE
    -- A normal user may edit user_metadata, but cannot manufacture demo authority.
    NEW.raw_user_meta_data := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb) - 'is_demo';
    NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) - 'is_demo' - 'quantivis_demo';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tenant_control.provision_trusted_demo_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, tenant_control
AS $$
DECLARE
  v_org_id uuid;
  v_workspace_id uuid;
BEGIN
  IF NEW.email_confirmed_at IS NULL
     OR lower(COALESCE(NEW.email, '')) !~ '^demo-[0-9a-f]{8}@demo\.quantivis\.io$'
     OR COALESCE(NEW.raw_app_meta_data->>'is_demo', 'false') <> 'true' THEN
    RETURN NEW;
  END IF;

  SELECT organization_id
    INTO v_org_id
    FROM public.profiles
   WHERE user_id = NEW.id;

  IF v_org_id IS NOT NULL THEN
    SELECT id
      INTO v_workspace_id
      FROM public.workspaces
     WHERE organization_id = v_org_id
     ORDER BY created_at
     LIMIT 1;

    INSERT INTO tenant_control.demo_users (user_id, organization_id, workspace_id)
    VALUES (NEW.id, v_org_id, v_workspace_id)
    ON CONFLICT (user_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      workspace_id = EXCLUDED.workspace_id;
    RETURN NEW;
  END IF;

  INSERT INTO public.organizations (name, created_by)
  VALUES ('Acme Corp (Demo)', NEW.id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.profiles (user_id, full_name, organization_id)
  VALUES (NEW.id, 'Demo User', v_org_id);

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, NEW.id, 'owner');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.workspaces (organization_id, name, slug, created_by)
  VALUES (v_org_id, 'Default', 'default', NEW.id)
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, NEW.id, 'workspace_admin');

  INSERT INTO public.workspace_quotas (
    workspace_id,
    max_datasets,
    max_rows_per_day,
    max_api_calls_per_day,
    max_simulations_per_day,
    max_copilot_queries_per_day,
    max_team_seats
  ) VALUES (
    v_workspace_id,
    50,
    2147483647,
    2147483647,
    50,
    2147483647,
    15
  )
  ON CONFLICT (workspace_id) DO UPDATE SET
    max_datasets = EXCLUDED.max_datasets,
    max_rows_per_day = EXCLUDED.max_rows_per_day,
    max_api_calls_per_day = EXCLUDED.max_api_calls_per_day,
    max_simulations_per_day = EXCLUDED.max_simulations_per_day,
    max_copilot_queries_per_day = EXCLUDED.max_copilot_queries_per_day,
    max_team_seats = EXCLUDED.max_team_seats,
    updated_at = now();

  INSERT INTO tenant_control.demo_users (user_id, organization_id, workspace_id)
  VALUES (NEW.id, v_org_id, v_workspace_id)
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    workspace_id = EXCLUDED.workspace_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_trusted_demo_metadata ON auth.users;
CREATE TRIGGER enforce_trusted_demo_metadata
BEFORE INSERT OR UPDATE OF email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data
ON auth.users
FOR EACH ROW EXECUTE FUNCTION tenant_control.enforce_trusted_demo_metadata();

DROP TRIGGER IF EXISTS provision_trusted_demo_user ON auth.users;
CREATE TRIGGER provision_trusted_demo_user
AFTER INSERT OR UPDATE OF email_confirmed_at, raw_app_meta_data
ON auth.users
FOR EACH ROW EXECUTE FUNCTION tenant_control.provision_trusted_demo_user();

REVOKE ALL ON FUNCTION tenant_control.enforce_trusted_demo_metadata() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tenant_control.provision_trusted_demo_user() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Subscription feature access: tenant-bound and fail-closed for unknown keys.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_feature_access(
  _org_id uuid,
  _feature_key text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _sub record;
  _feat record;
  _now timestamptz := now();
  _effective_tier text;
BEGIN
  IF _org_id IS NULL OR NULLIF(btrim(_feature_key), '') IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_feature_request');
  END IF;

  IF auth.role() <> 'service_role'
     AND (auth.uid() IS NULL OR NOT public.is_org_member(auth.uid(), _org_id)) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'tenant_membership_required');
  END IF;

  SELECT tier, status, current_period_end, grace_period_end, payment_failed_at, is_trial, trial_end
    INTO _sub
    FROM public.subscriptions
   WHERE organization_id = _org_id
   ORDER BY
     CASE
       WHEN status = 'active' THEN 0
       WHEN status = 'trialing' AND trial_end IS NOT NULL AND trial_end > _now THEN 1
       WHEN grace_period_end IS NOT NULL AND grace_period_end > _now THEN 2
       ELSE 3
     END,
     created_at DESC
   LIMIT 1;

  IF _sub IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_subscription',
      'message', 'No active subscription for this organization'
    );
  END IF;

  IF _sub.status = 'active' THEN
    _effective_tier := _sub.tier;
  ELSIF _sub.status = 'trialing' THEN
    IF _sub.trial_end IS NULL OR _sub.trial_end <= _now THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'trial_expired',
        'status', _sub.status,
        'trial_end', _sub.trial_end,
        'message', 'Trial or pilot access has expired'
      );
    END IF;
    _effective_tier := _sub.tier;
  ELSIF _sub.grace_period_end IS NOT NULL AND _sub.grace_period_end > _now THEN
    _effective_tier := _sub.tier;
  ELSE
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'subscription_inactive',
      'status', _sub.status,
      'message', 'Subscription is no longer active'
    );
  END IF;

  SELECT is_allowed, quota_limit, quota_period
    INTO _feat
    FROM public.tier_features
   WHERE tier = _effective_tier
     AND feature_key = _feature_key;

  IF _feat IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'tier', _effective_tier,
      'reason', 'feature_not_configured',
      'feature', _feature_key,
      'message', 'This feature is not configured for the current subscription tier'
    );
  END IF;

  IF NOT _feat.is_allowed THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'tier_insufficient',
      'tier', _effective_tier,
      'feature', _feature_key,
      'message', 'Your current tier does not include ' || _feature_key
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'tier', _effective_tier,
    'feature', _feature_key,
    'quota_limit', _feat.quota_limit,
    'in_grace_period', (_sub.grace_period_end IS NOT NULL AND _sub.grace_period_end > _now AND _sub.status NOT IN ('active','trialing'))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_feature_access(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_feature_access(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Workspace usage quota: tenant-bound, allow-listed and fail-closed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_workspace_quota(
  _workspace_id uuid,
  _metric_name text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_org_id uuid;
  v_current_usage bigint := 0;
  v_quota_limit bigint;
BEGIN
  IF _workspace_id IS NULL
     OR _metric_name NOT IN ('datasets_created', 'rows_ingested', 'api_calls', 'simulations', 'copilot_queries') THEN
    RETURN jsonb_build_object(
      'current_usage', 0,
      'quota_limit', 0,
      'allowed', false,
      'remaining', 0,
      'reason', 'invalid_quota_metric'
    );
  END IF;

  SELECT organization_id
    INTO v_org_id
    FROM public.workspaces
   WHERE id = _workspace_id;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'current_usage', 0,
      'quota_limit', 0,
      'allowed', false,
      'remaining', 0,
      'reason', 'workspace_not_found'
    );
  END IF;

  IF auth.role() <> 'service_role'
     AND (auth.uid() IS NULL OR NOT public.is_org_member(auth.uid(), v_org_id)) THEN
    RETURN jsonb_build_object(
      'current_usage', 0,
      'quota_limit', 0,
      'allowed', false,
      'remaining', 0,
      'reason', 'tenant_membership_required'
    );
  END IF;

  SELECT GREATEST(COALESCE(metric_value, 0), 0)
    INTO v_current_usage
    FROM public.usage_metering
   WHERE workspace_id = _workspace_id
     AND period_date = CURRENT_DATE
     AND metric_name = _metric_name;

  v_current_usage := COALESCE(v_current_usage, 0);

  SELECT CASE _metric_name
           WHEN 'datasets_created' THEN q.max_datasets
           WHEN 'rows_ingested' THEN q.max_rows_per_day
           WHEN 'api_calls' THEN q.max_api_calls_per_day
           WHEN 'simulations' THEN q.max_simulations_per_day
           WHEN 'copilot_queries' THEN q.max_copilot_queries_per_day
         END
    INTO v_quota_limit
    FROM public.workspace_quotas q
   WHERE q.workspace_id = _workspace_id;

  IF v_quota_limit IS NULL OR v_quota_limit < 0 THEN
    RETURN jsonb_build_object(
      'current_usage', v_current_usage,
      'quota_limit', 0,
      'allowed', false,
      'remaining', 0,
      'reason', 'quota_not_configured'
    );
  END IF;

  RETURN jsonb_build_object(
    'current_usage', v_current_usage,
    'quota_limit', v_quota_limit,
    'allowed', v_current_usage < v_quota_limit,
    'remaining', GREATEST(v_quota_limit - v_current_usage, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_workspace_usage(
  _workspace_id uuid,
  _org_id uuid,
  _metric_name text,
  _increment bigint DEFAULT 1
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_workspace_org uuid;
BEGIN
  IF _workspace_id IS NULL OR _org_id IS NULL THEN
    RAISE EXCEPTION 'workspace_and_organization_required' USING ERRCODE = '22023';
  END IF;

  IF _metric_name NOT IN ('datasets_created', 'rows_ingested', 'api_calls', 'simulations', 'copilot_queries') THEN
    RAISE EXCEPTION 'invalid_quota_metric' USING ERRCODE = '22023';
  END IF;

  IF _increment IS NULL OR _increment <= 0 THEN
    RAISE EXCEPTION 'usage_increment_must_be_positive' USING ERRCODE = '22023';
  END IF;

  SELECT organization_id
    INTO v_workspace_org
    FROM public.workspaces
   WHERE id = _workspace_id;

  IF v_workspace_org IS NULL OR v_workspace_org <> _org_id THEN
    RAISE EXCEPTION 'workspace_organization_mismatch' USING ERRCODE = '42501';
  END IF;

  IF auth.role() <> 'service_role'
     AND (auth.uid() IS NULL OR NOT public.is_org_member(auth.uid(), _org_id)) THEN
    RAISE EXCEPTION 'tenant_membership_required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.usage_metering (
    workspace_id,
    organization_id,
    period_date,
    metric_name,
    metric_value
  ) VALUES (
    _workspace_id,
    _org_id,
    CURRENT_DATE,
    _metric_name,
    _increment
  )
  ON CONFLICT (workspace_id, period_date, metric_name)
  DO UPDATE SET
    metric_value = public.usage_metering.metric_value + EXCLUDED.metric_value,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.check_workspace_quota(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_workspace_usage(uuid, uuid, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_workspace_quota(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_workspace_usage(uuid, uuid, text, bigint) TO authenticated, service_role;
