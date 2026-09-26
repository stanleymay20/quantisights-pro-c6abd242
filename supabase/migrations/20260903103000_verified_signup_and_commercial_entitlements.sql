-- First-paying-customer readiness: verified self-serve signup + entitlement sync.
-- Returning/migrated users remain fail-closed; this does not restore historical tenants.

CREATE SCHEMA IF NOT EXISTS tenant_control;
REVOKE ALL ON SCHEMA tenant_control FROM PUBLIC;
REVOKE ALL ON SCHEMA tenant_control FROM anon;
REVOKE ALL ON SCHEMA tenant_control FROM authenticated;

CREATE TABLE IF NOT EXISTS tenant_control.signup_intents (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '24 hours'),
  consumed_at timestamptz,
  consumed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_signup_intents_expires_at
  ON tenant_control.signup_intents(expires_at);

ALTER TABLE tenant_control.signup_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tenant_control.signup_intents FROM PUBLIC, anon, authenticated;

-- Intent issuance crosses an unauthenticated boundary, so the browser never
-- receives direct EXECUTE on a SECURITY DEFINER database function. The public
-- begin-signup-intent Edge Function calls this internal RPC with service_role.
CREATE OR REPLACE FUNCTION public.issue_signup_intent_internal()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, tenant_control
AS $issue$
DECLARE
  v_token uuid;
BEGIN
  DELETE FROM tenant_control.signup_intents
   WHERE expires_at < clock_timestamp() - interval '1 day';

  INSERT INTO tenant_control.signup_intents DEFAULT VALUES
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$issue$;

REVOKE ALL ON FUNCTION public.issue_signup_intent_internal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_signup_intent_internal() TO service_role;

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
  v_existing_org_id uuid;
  v_existing_workspace_id uuid;
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

  -- Both values are authoritative server-side timestamps in the same Supabase
  -- environment. A self-serve identity must not pre-date the issued capability.
  IF v_user.created_at < v_intent.created_at
     OR v_user.created_at > v_intent.expires_at THEN
    RAISE EXCEPTION 'existing_identity_requires_restoration' USING ERRCODE = '42501';
  END IF;

  -- Zero-downtime compatibility bridge for the legacy on_auth_user_created
  -- trigger. During the coordinated cutover, a genuinely fresh identity may
  -- already have the exact one-org/one-default-workspace structure created by
  -- that trigger before this RPC runs. Adopt only that structure when every
  -- server-side timestamp and ownership edge falls inside this signup intent.
  -- Returning users still fail above because their auth.users.created_at
  -- predates the newly issued intent.
  SELECT p.organization_id, w.id
    INTO v_existing_org_id, v_existing_workspace_id
  FROM public.profiles p
  JOIN public.organizations o
    ON o.id = p.organization_id
   AND o.created_by = v_uid
  JOIN public.organization_members om
    ON om.organization_id = o.id
   AND om.user_id = v_uid
   AND om.role = 'owner'::public.org_role
  JOIN public.workspaces w
    ON w.organization_id = o.id
   AND w.created_by = v_uid
   AND w.slug = 'default'
  JOIN public.workspace_members wm
    ON wm.workspace_id = w.id
   AND wm.user_id = v_uid
   AND wm.role = 'workspace_admin'::public.workspace_role
  WHERE p.user_id = v_uid
    AND o.created_at >= v_intent.created_at
    AND o.created_at <= v_intent.expires_at
    AND p.created_at >= v_intent.created_at
    AND p.created_at <= v_intent.expires_at
    AND w.created_at >= v_intent.created_at
    AND w.created_at <= v_intent.expires_at
    AND (SELECT count(*) FROM public.profiles px WHERE px.user_id = v_uid) = 1
    AND (SELECT count(*) FROM public.organization_members omx WHERE omx.user_id = v_uid) = 1
    AND (SELECT count(*) FROM public.workspace_members wmx WHERE wmx.user_id = v_uid) = 1
  LIMIT 1;

  IF v_existing_org_id IS NOT NULL AND v_existing_workspace_id IS NOT NULL THEN
    INSERT INTO public.workspace_quotas (
      workspace_id,
      max_datasets,
      max_simulations_per_day,
      max_copilot_queries_per_day,
      max_team_seats
    )
    VALUES (v_existing_workspace_id, 5, 5, 20, 5)
    ON CONFLICT (workspace_id) DO UPDATE SET
      max_datasets = EXCLUDED.max_datasets,
      max_simulations_per_day = EXCLUDED.max_simulations_per_day,
      max_copilot_queries_per_day = EXCLUDED.max_copilot_queries_per_day,
      max_team_seats = EXCLUDED.max_team_seats,
      updated_at = now();

    UPDATE tenant_control.signup_intents
       SET consumed_at = clock_timestamp(),
           consumed_by = v_uid,
           organization_id = v_existing_org_id,
           workspace_id = v_existing_workspace_id
     WHERE token = p_intent_token;

    RETURN jsonb_build_object(
      'provisioned', true,
      'idempotent', false,
      'adopted_legacy', true,
      'organization_id', v_existing_org_id,
      'workspace_id', v_existing_workspace_id
    );
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

-- Read-only proof used by /onboarding after tenant discovery refreshes. It never
-- accepts browser metadata as evidence; the private consumed intent is the proof.
CREATE OR REPLACE FUNCTION public.has_verified_signup_provenance(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, tenant_control
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM tenant_control.signup_intents si
        WHERE si.organization_id = p_organization_id
          AND si.consumed_by = auth.uid()
          AND si.consumed_at IS NOT NULL
     );
$$;

REVOKE ALL ON FUNCTION public.has_verified_signup_provenance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_verified_signup_provenance(uuid) TO authenticated;

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

COMMENT ON FUNCTION public.issue_signup_intent_internal() IS
  'Service-role-only issuer for a 24-hour prospective signup capability; browser callers use the begin-signup-intent Edge Function.';
COMMENT ON FUNCTION public.provision_verified_signup(uuid) IS
  'Creates one tenant only when Auth identity creation is proven to post-date a valid signup intent.';
COMMENT ON FUNCTION public.has_verified_signup_provenance(uuid) IS
  'Returns whether the current authenticated user owns server-side verified fresh-signup provenance for the organization.';
