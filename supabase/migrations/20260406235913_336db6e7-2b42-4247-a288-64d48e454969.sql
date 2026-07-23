
-- 1. Score idempotency guard: prevents duplicate scores within a cooldown window
CREATE OR REPLACE FUNCTION public.exec_compute_scores_idempotent(
  _org_id uuid,
  _scores jsonb,
  _cooldown_minutes integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _item jsonb;
  _inserted integer := 0;
  _skipped integer := 0;
  _scope_type text;
  _scope_id text;
  _model_version integer;
  _exists boolean;
BEGIN
  FOR _item IN SELECT jsonb_array_elements(_scores)
  LOOP
    _scope_type := _item->>'scope_type';
    _scope_id := _item->>'scope_id';
    _model_version := COALESCE((_item->>'scoring_model_version')::integer, 0);

    -- Check if a score for same org/scope/model was written recently
    SELECT EXISTS (
      SELECT 1 FROM public.execution_scores
      WHERE organization_id = _org_id
        AND scope_type = _scope_type
        AND scope_id = _scope_id::uuid
        AND scoring_model_version = _model_version
        AND computed_at > now() - (_cooldown_minutes || ' minutes')::interval
    ) INTO _exists;

    IF _exists THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.execution_scores (
      organization_id, scope_type, scope_id,
      score, reliability_rate, avg_delay_days,
      success_rate, failure_rate, plans_evaluated,
      scoring_model_version, computed_at,
      formula_snapshot, computed_by, source_window_days,
      score_explanation
    ) VALUES (
      _org_id,
      _scope_type,
      (_item->>'scope_id')::uuid,
      COALESCE((_item->>'score')::integer, 0),
      (_item->>'reliability_rate')::integer,
      (_item->>'avg_delay_days')::numeric,
      (_item->>'success_rate')::integer,
      (_item->>'failure_rate')::integer,
      (_item->>'plans_evaluated')::integer,
      _model_version,
      COALESCE((_item->>'computed_at')::timestamptz, now()),
      _item->>'formula_snapshot',
      COALESCE(_item->>'computed_by', 'system'),
      COALESCE((_item->>'source_window_days')::integer, 90),
      _item->'score_explanation'
    );
    _inserted := _inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted', _inserted, 'skipped_duplicates', _skipped);
END;
$$;

-- 2. Server-side step-up auth verification
CREATE OR REPLACE FUNCTION public.exec_verify_step_up_auth(
  _user_id uuid,
  _org_id uuid,
  _validity_minutes integer DEFAULT 5
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.auth_events
    WHERE user_id = _user_id
      AND event_type = 'step_up_auth'
      AND created_at > now() - (_validity_minutes || ' minutes')::interval
    ORDER BY created_at DESC
    LIMIT 1
  )
$$;

-- 3. Replace exec_infer_blockers with a capped version
CREATE OR REPLACE FUNCTION public.exec_infer_blockers(_org_id uuid, _limit integer DEFAULT 100)
RETURNS TABLE(
  plan_id uuid,
  inferred_blocker_id uuid,
  blocker_status text,
  blocker_action_title text,
  plan_action_title text,
  reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    downstream.id AS plan_id,
    upstream.id AS inferred_blocker_id,
    upstream.status AS blocker_status,
    upstream.action_title AS blocker_action_title,
    downstream.action_title AS plan_action_title,
    'Upstream plan in same decision is ' || upstream.status || ' (created earlier, deadline earlier or equal)' AS reason
  FROM public.execution_plans upstream
  JOIN public.execution_plans downstream
    ON upstream.decision_id = downstream.decision_id
    AND upstream.organization_id = downstream.organization_id
    AND upstream.id != downstream.id
  WHERE upstream.organization_id = _org_id
    AND upstream.status IN ('pending', 'in_progress', 'blocked')
    AND downstream.status IN ('pending', 'in_progress', 'blocked')
    AND upstream.created_at < downstream.created_at
    AND (upstream.deadline IS NULL OR downstream.deadline IS NULL OR upstream.deadline <= downstream.deadline)
    AND downstream.blocked_by_plan_id IS NULL
  ORDER BY downstream.decision_id, upstream.created_at
  LIMIT _limit
$$;

-- 4. Index for fast step-up auth lookups
CREATE INDEX IF NOT EXISTS idx_auth_events_step_up_lookup
ON public.auth_events (user_id, event_type, created_at DESC)
WHERE event_type = 'step_up_auth';

-- 5. Index for score idempotency checks
CREATE INDEX IF NOT EXISTS idx_exec_scores_idempotency
ON public.execution_scores (organization_id, scope_type, scope_id, scoring_model_version, computed_at DESC);
