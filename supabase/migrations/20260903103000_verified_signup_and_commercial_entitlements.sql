-- First-paying-customer readiness: verified self-serve signup + entitlement sync.
-- Returning/migrated users remain fail-closed; this does not restore historical tenants.

CREATE SCHEMA IF NOT EXISTS tenant_control;
REVOKE ALL ON SCHEMA tenant_control FROM PUBLIC;
REVOKE ALL ON SCHEMA tenant_control FROM anon;
REVOKE ALL ON SCHEMA tenant_control FROM authenticated;

CREATE TABLE IF NOT EXISTS tenant_control.signup_intents (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '30 minutes'),
  consumed_at timestamptz,
  consumed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  CHECK (expires_at > created_at)
);

ALTER TABLE tenant_control.signup_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tenant_control.signup_intents FROM PUBLIC, anon, authenticated;

-- The browser may request an opaque intent, but it cannot write/read the backing
-- table. The intent is only useful if the eventual authenticated user was itself
-- created after this server-issued intent and before it expires.
CREATE OR REPLACE FUNCTION public.begin_signup_intent()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, tenant_control
AS $$
DECLARE
  v_token uuid;
BEGIN
  DELETE FROM tenant_control.signup_intents
   WHERE expires_at < clock_timestamp() - interval '1 day';

  INSERT INTO tenant_control.signup_intents DEFAULT VALUES
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_signup_intent() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_signup_intent() TO anon, authenticated;

-- One-time transactional tenant creation for a genuinely fresh Auth identity.
-- Existing/returning identities are older than the intent and therefore cannot
-- turn a sign-in into replacement tenant creation.
CREATE OR REPLACE FUNCTION public.provision_verified_signup(p_intent_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, tenant_control
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user auth.users%ROWTYPE;
  v_intent tenant_control.signup_intents%ROWTYPE;
  v_org_id uuid;
  v_workspace_id uuid;
  v_display_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_intent
    FROM tenant_control.signup_intents
   WHERE token = p_intent_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'signup_intent_invalid' USING ERRCODE = '22023';
  END IF;

  IF v_intent.consumed_at IS NOT NULL THEN
    IF v_intent.consumed_by = v_uid
       AND v_intent.organization_id IS NOT NULL
       AND v_intent.workspace_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'provisioned', true,
        'idempotent', true,
        'organization_id', v_intent.organization_id,
        'workspace_id', v_intent.workspace_id
      );
    END IF;
    RAISE EXCEPTION 'signup_intent_consumed' USING ERRCODE = '22023';
  END IF;

  IF v_intent.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'signup_intent_expired' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_user FROM auth.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'authenticated_user_missing' USING ERRCODE = '42501';
  END IF;

  IF v_user.email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'email_confirmation_required' USING ERRCODE = '42501';
  END IF;

  -- Allow a small clock/transaction skew, but reject identities that pre-date
  -- the server intent. This is the returning-user boundary.
  IF v_user.created_at < (v_intent.created_at - interval '15 seconds')
     OR v_user.created_at > v_intent.expires_at THEN
    RAISE EXCEPTION 'existing_identity_requires_restoration' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'existing_tenant_relationship' USING ERRCODE = '42501';
  END IF;

  v_display_name := left(
    COALESCE(
      NULLIF(btrim(v_user.raw_user_meta_data->>'full_name'), ''),
      NULLIF(split_part(COALESCE(v_user.email, ''), '@', 1), ''),
      'New customer'
    ),
    180
  );

  INSERT INTO public.organizations (name, created_by)
  VALUES (v_display_name || '''s Organization', v_uid)
  RETURNING id INTO v_org_id;

  INSERT INTO public.profiles (user_id, full_name, organization_id)
  VALUES (v_uid, v_display_name, v_org_id);

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_uid, 'owner');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.workspaces (organization_id, name, slug, created_by)
  VALUES (v_org_id, 'Default', 'default', v_uid)
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_uid, 'workspace_admin');

  -- Essentials-compatible baseline until onboarding grants the Governance pilot.
  INSERT INTO public.workspace_quotas (
    workspace_id,
    max_datasets,
    max_simulations_per_day,
    max_copilot_queries_per_day,
    max_team_seats
  )
  VALUES (v_workspace_id, 5, 5, 20, 5)
  ON CONFLICT (workspace_id) DO UPDATE SET
    max_datasets = EXCLUDED.max_datasets,
    max_simulations_per_day = EXCLUDED.max_simulations_per_day,
    max_copilot_queries_per_day = EXCLUDED.max_copilot_queries_per_day,
    max_team_seats = EXCLUDED.max_team_seats,
    updated_at = now();

  UPDATE tenant_control.signup_intents
     SET consumed_at = clock_timestamp(),
         consumed_by = v_uid,
         organization_id = v_org_id,
         workspace_id = v_workspace_id
   WHERE token = p_intent_token;

  RETURN jsonb_build_object(
    'provisioned', true,
    'idempotent', false,
    'organization_id', v_org_id,
    'workspace_id', v_workspace_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_verified_signup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_verified_signup(uuid) TO authenticated;

-- Keep operational workspace limits aligned with the paid/pilot tier. Only the
-- fields that are explicitly sold in the product are changed here; unadvertised
-- ingestion/API limits keep their existing values.
CREATE OR REPLACE FUNCTION tenant_control.sync_subscription_workspace_quotas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, tenant_control
AS $$
DECLARE
  v_datasets integer;
  v_simulations integer;
  v_copilot integer;
  v_seats integer;
BEGIN
  IF NEW.status NOT IN ('active', 'trialing', 'past_due') THEN
    RETURN NEW;
  END IF;

  CASE NEW.tier
    WHEN 'starter' THEN
      v_datasets := 5;
      v_simulations := 5;
      v_copilot := 20;
      v_seats := 5;
    WHEN 'growth' THEN
      v_datasets := 50;
      v_simulations := 50;
      v_copilot := 2147483647;
      v_seats := 15;
    WHEN 'enterprise' THEN
      v_datasets := 2147483647;
      v_simulations := 2147483647;
      v_copilot := 2147483647;
      v_seats := 2147483647;
    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO public.workspace_quotas (
    workspace_id,
    max_datasets,
    max_simulations_per_day,
    max_copilot_queries_per_day,
    max_team_seats
  )
  SELECT w.id, v_datasets, v_simulations, v_copilot, v_seats
    FROM public.workspaces w
   WHERE w.organization_id = NEW.organization_id
  ON CONFLICT (workspace_id) DO UPDATE SET
    max_datasets = EXCLUDED.max_datasets,
    max_simulations_per_day = EXCLUDED.max_simulations_per_day,
    max_copilot_queries_per_day = EXCLUDED.max_copilot_queries_per_day,
    max_team_seats = EXCLUDED.max_team_seats,
    updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION tenant_control.sync_subscription_workspace_quotas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_subscription_workspace_quotas ON public.subscriptions;
CREATE TRIGGER sync_subscription_workspace_quotas
AFTER INSERT OR UPDATE OF tier, status ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION tenant_control.sync_subscription_workspace_quotas();

COMMENT ON FUNCTION public.begin_signup_intent() IS
  'Issues a short-lived server capability for a prospective self-serve signup; it does not create tenant state.';
COMMENT ON FUNCTION public.provision_verified_signup(uuid) IS
  'Creates one tenant only when Auth identity creation is proven to post-date a valid signup intent.';
