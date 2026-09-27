-- Fail closed on SECURITY DEFINER execution for client roles.
--
-- Earlier hardening revoked EXECUTE from PUBLIC (and anon), but Supabase
-- default privileges grant EXECUTE to `authenticated` directly, so on projects
-- with those defaults (production) every public SECURITY DEFINER function stayed callable through
-- PostgREST /rpc by any signed-in user. That included the auth email queue
-- (read_email_batch, enqueue_email, delete_email, move_to_dlq), cross-tenant
-- maintenance (exec_cleanup_old_data, cleanup_old_copilot_messages,
-- update_dataset_staleness) and billing entitlement provisioning
-- (provision_aicis_for_org).
--
-- Contract after this migration:
--   * anon / PUBLIC execute no public SECURITY DEFINER function.
--   * authenticated executes only the allowlist below. Each entry either
--     enforces the caller's tenant membership itself or is an RLS policy
--     helper that policies evaluate as the calling role.
--   * Everything else is service_role only (Edge Functions use the service
--     client) or trigger-only.
-- The allowlist is mirrored in supabase/security/client-callable-definer-functions.json
-- and verified against live projects by scripts/verify-supabase-privilege-boundary.mjs.

-- 1. Add tenant guards to the three client-called RPCs that lacked them.

CREATE OR REPLACE FUNCTION public.check_workspace_quota(_workspace_id uuid, _metric_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_usage bigint;
  quota_limit bigint;
  result jsonb;
BEGIN
  -- End users may only read quotas of workspaces in organizations they belong
  -- to. Service-role callers carry no auth.uid() and are trusted.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = _workspace_id
      AND public.is_org_member(auth.uid(), w.organization_id)
  ) THEN
    RAISE EXCEPTION 'not authorized for workspace' USING ERRCODE = '42501';
  END IF;

  -- Get current usage for today
  SELECT COALESCE(metric_value, 0) INTO current_usage
  FROM public.usage_metering
  WHERE workspace_id = _workspace_id
    AND period_date = CURRENT_DATE
    AND metric_name = _metric_name;

  IF current_usage IS NULL THEN
    current_usage := 0;
  END IF;

  -- Get quota limit
  SELECT
    CASE _metric_name
      WHEN 'datasets_created' THEN q.max_datasets
      WHEN 'rows_ingested' THEN q.max_rows_per_day
      WHEN 'api_calls' THEN q.max_api_calls_per_day
      WHEN 'simulations' THEN q.max_simulations_per_day
      WHEN 'copilot_queries' THEN q.max_copilot_queries_per_day
      ELSE 999999
    END INTO quota_limit
  FROM public.workspace_quotas q
  WHERE q.workspace_id = _workspace_id;

  IF quota_limit IS NULL THEN
    quota_limit := 999999; -- no quota = unlimited
  END IF;

  result := jsonb_build_object(
    'current_usage', current_usage,
    'quota_limit', quota_limit,
    'allowed', current_usage < quota_limit,
    'remaining', GREATEST(quota_limit - current_usage, 0)
  );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_workspace_usage(_workspace_id uuid, _org_id uuid, _metric_name text, _increment bigint DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- End users may only add positive usage to a workspace of their own
  -- organization; negative increments would let a tenant reset its own quota.
  IF auth.uid() IS NOT NULL THEN
    IF _increment IS NULL OR _increment <= 0 THEN
      RAISE EXCEPTION 'usage increment must be positive' USING ERRCODE = '22023';
    END IF;
    IF NOT public.is_org_member(auth.uid(), _org_id) OR NOT EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = _workspace_id AND w.organization_id = _org_id
    ) THEN
      RAISE EXCEPTION 'not authorized for workspace' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.usage_metering (workspace_id, organization_id, period_date, metric_name, metric_value)
  VALUES (_workspace_id, _org_id, CURRENT_DATE, _metric_name, _increment)
  ON CONFLICT (workspace_id, period_date, metric_name)
  DO UPDATE SET metric_value = usage_metering.metric_value + _increment,
               updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_decision_evaluability(_org_id uuid, _dataset_id uuid DEFAULT NULL::uuid, _expected_metric text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _has_dataset boolean := false;
  _has_metric boolean := false;
  _data_points bigint := 0;
  _distinct_dates bigint := 0;
  _resolved_dataset_id uuid;
  _resolved_metric text;
  _reasons jsonb := '[]'::jsonb;
  _suggestions jsonb := '[]'::jsonb;
  _status text;
  _score int := 0;
BEGIN
  -- End users may only inspect datasets and metrics of their own
  -- organization. Service-role callers carry no auth.uid() and are trusted.
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'not authorized for organization' USING ERRCODE = '42501';
  END IF;

  -- 1. Dataset check
  IF _dataset_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.datasets
      WHERE id = _dataset_id AND organization_id = _org_id AND status = 'active'
    ) INTO _has_dataset;
    _resolved_dataset_id := _dataset_id;
  ELSE
    -- Try to find any active dataset for the org
    SELECT id INTO _resolved_dataset_id
    FROM public.datasets
    WHERE organization_id = _org_id AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;
    _has_dataset := _resolved_dataset_id IS NOT NULL;
  END IF;

  IF _has_dataset THEN
    _score := _score + 1;
  ELSE
    _reasons := _reasons || jsonb_build_array('No active dataset linked to this decision');
    _suggestions := _suggestions || jsonb_build_array('Upload or link a dataset before approving');
  END IF;

  -- 2. Metric existence check
  IF _expected_metric IS NOT NULL AND _resolved_dataset_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.metrics
      WHERE organization_id = _org_id
        AND dataset_id = _resolved_dataset_id
        AND metric_type = _expected_metric
      LIMIT 1
    ) INTO _has_metric;
    _resolved_metric := _expected_metric;
  ELSIF _resolved_dataset_id IS NOT NULL THEN
    -- No metric specified, check if dataset has any metrics at all
    SELECT metric_type INTO _resolved_metric
    FROM public.metric_summaries
    WHERE organization_id = _org_id AND dataset_id = _resolved_dataset_id
    ORDER BY row_count DESC
    LIMIT 1;
    _has_metric := _resolved_metric IS NOT NULL;
  END IF;

  IF _has_metric THEN
    _score := _score + 1;
  ELSE
    IF _expected_metric IS NOT NULL THEN
      _reasons := _reasons || jsonb_build_array('Metric "' || _expected_metric || '" not found in dataset');
      _suggestions := _suggestions || jsonb_build_array('Ensure metric type "' || _expected_metric || '" exists in your uploaded data');
    ELSE
      _reasons := _reasons || jsonb_build_array('No metrics found in any dataset');
      _suggestions := _suggestions || jsonb_build_array('Upload data containing measurable metrics');
    END IF;
  END IF;

  -- 3. Data sufficiency check (need ≥5 distinct dates for before/after)
  IF _has_metric AND _resolved_dataset_id IS NOT NULL THEN
    SELECT COUNT(*), COUNT(DISTINCT date)
    INTO _data_points, _distinct_dates
    FROM public.metrics
    WHERE organization_id = _org_id
      AND dataset_id = _resolved_dataset_id
      AND metric_type = _resolved_metric;

    IF _distinct_dates >= 10 THEN
      _score := _score + 1;
    ELSIF _distinct_dates >= 5 THEN
      _reasons := _reasons || jsonb_build_array('Limited historical data (' || _distinct_dates || ' dates) — evaluation may be imprecise');
      _suggestions := _suggestions || jsonb_build_array('At least 10 distinct date points recommended for reliable before/after analysis');
    ELSE
      _reasons := _reasons || jsonb_build_array('Insufficient historical data (' || _distinct_dates || ' dates) for before/after evaluation');
      _suggestions := _suggestions || jsonb_build_array('Upload at least 5 date points of "' || COALESCE(_resolved_metric, 'metric') || '" data');
    END IF;
  END IF;

  -- Determine status
  _status := CASE
    WHEN _score = 3 THEN 'MEASURABLE'
    WHEN _score >= 1 THEN 'PARTIALLY_MEASURABLE'
    ELSE 'NOT_MEASURABLE'
  END;

  RETURN jsonb_build_object(
    'status', _status,
    'score', _score,
    'max_score', 3,
    'has_dataset', _has_dataset,
    'has_metric', _has_metric,
    'data_points', _data_points,
    'distinct_dates', _distinct_dates,
    'resolved_dataset_id', _resolved_dataset_id,
    'resolved_metric', _resolved_metric,
    'reasons', _reasons,
    'suggestions', _suggestions
  );
END;
$function$;

-- 2. Revoke client execution from every public SECURITY DEFINER function
--    outside the allowlist. Idempotent and history-independent: converges
--    projects regardless of which default privileges they were provisioned with.

DO $$
DECLARE
  function_signature text;
BEGIN
  FOR function_signature IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname NOT IN (
        -- Tenant-guarded client RPCs
        'accept_invitation',
        'approve_decision',
        'check_decision_evaluability',
        'check_workspace_quota',
        'create_and_approve_decision',
        'get_decision_value_summary',
        'get_metrics_summary',
        'increment_workspace_usage',
        'list_execution_action_receipts',
        'list_execution_compensation_requests',
        'reconcile_execution_action_receipt',
        'record_decision_value_attribution',
        'reject_decision',
        'request_execution_compensation',
        'review_execution_compensation',
        -- RLS policy helpers (evaluated as the calling role)
        'exec_require_elevated_role',
        'get_user_org_role',
        'has_role',
        'is_dataset_workspace_member',
        'is_org_member',
        'is_workspace_member'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', function_signature);
  END LOOP;
END
$$;

-- 3. Allowlisted functions: never anonymous, explicitly available to
--    signed-in users and the service role in every environment.

REVOKE EXECUTE ON FUNCTION public.accept_invitation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_decision(uuid, uuid, text, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_decision_evaluability(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_workspace_quota(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_and_approve_decision(uuid, text, text, numeric, numeric, numeric, text, text, uuid, text, uuid, text, integer, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_decision_value_summary(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_metrics_summary(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_workspace_usage(uuid, uuid, text, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_execution_action_receipts(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_execution_compensation_requests(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_execution_action_receipt(uuid, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_decision_value_attribution(uuid, uuid, text, numeric, numeric, numeric, text, text, numeric, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_decision(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_execution_compensation(uuid, uuid, text, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_execution_compensation(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.exec_require_elevated_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_org_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_dataset_workspace_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_decision(uuid, uuid, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_decision_evaluability(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_workspace_quota(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_and_approve_decision(uuid, text, text, numeric, numeric, numeric, text, text, uuid, text, uuid, text, integer, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_decision_value_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_metrics_summary(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_workspace_usage(uuid, uuid, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_execution_action_receipts(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_execution_compensation_requests(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_execution_action_receipt(uuid, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_decision_value_attribution(uuid, uuid, text, numeric, numeric, numeric, text, text, numeric, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_decision(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_execution_compensation(uuid, uuid, text, text, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_execution_compensation(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exec_require_elevated_role(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_org_role(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_dataset_workspace_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated, service_role;

-- 4. Service-only helpers called by Edge Functions through the service client.
--    Explicit so projects without implicit default grants behave the same.

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_cleanup_old_data(integer, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_compute_scores_idempotent(uuid, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_create_interventions_atomic(jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_get_latest_events_by_plan(uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_infer_blockers(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_infer_blockers(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_log_override(uuid, uuid, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_operational_metrics(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_reassign_plan_atomic(uuid, uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_resolve_intervention_atomic(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_supersede_predictions(uuid[], uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_verify_step_up_auth(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_cron_advisory_lock(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_cron_advisory_lock(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.connector_try_lock(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.connector_release_lock(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_metric_aggregates(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_convergence_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_copilot_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_simulation_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_feature_access(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_decision_embeddings(text, double precision, integer, uuid, text[]) TO service_role;

NOTIFY pgrst, 'reload schema';
