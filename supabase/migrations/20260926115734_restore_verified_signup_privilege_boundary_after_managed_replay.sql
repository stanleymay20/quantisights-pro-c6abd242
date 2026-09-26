-- Move verified-signup privileged logic out of the exposed public API schema.
-- Public RPC names remain stable, but are now SECURITY INVOKER wrappers.
-- Direct client access to the private intent ledger remains explicitly denied.

GRANT USAGE ON SCHEMA tenant_control TO authenticated;

DROP POLICY IF EXISTS signup_intents_explicit_deny ON tenant_control.signup_intents;
CREATE POLICY signup_intents_explicit_deny
ON tenant_control.signup_intents
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION tenant_control.provision_verified_signup(p_intent_token uuid)
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

REVOKE ALL ON FUNCTION tenant_control.provision_verified_signup(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION tenant_control.provision_verified_signup(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION tenant_control.has_verified_signup_provenance(p_organization_id uuid)
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

REVOKE ALL ON FUNCTION tenant_control.has_verified_signup_provenance(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION tenant_control.has_verified_signup_provenance(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.provision_verified_signup(p_intent_token uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, tenant_control
AS $wrapper$
  SELECT tenant_control.provision_verified_signup(p_intent_token);
$wrapper$;

REVOKE ALL ON FUNCTION public.provision_verified_signup(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provision_verified_signup(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.has_verified_signup_provenance(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, tenant_control
AS $wrapper$
  SELECT tenant_control.has_verified_signup_provenance(p_organization_id);
$wrapper$;

REVOKE ALL ON FUNCTION public.has_verified_signup_provenance(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_verified_signup_provenance(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.provision_verified_signup(uuid) IS
  'SECURITY INVOKER API wrapper for the private verified-signup provisioning boundary.';
COMMENT ON FUNCTION public.has_verified_signup_provenance(uuid) IS
  'SECURITY INVOKER API wrapper for private verified-signup provenance verification.';
