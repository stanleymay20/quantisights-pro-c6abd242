
-- ═══════════════════════════════════════════════════════════════
-- PHASE 4: Prediction history columns
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.execution_predictions
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_run_id uuid,
  ADD COLUMN IF NOT EXISTS run_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS feature_summary jsonb,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz NOT NULL DEFAULT now();

-- ═══════════════════════════════════════════════════════════════
-- PHASE 5: Score governance columns
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.execution_scores
  ADD COLUMN IF NOT EXISTS formula_snapshot text,
  ADD COLUMN IF NOT EXISTS computed_by text DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS source_window_days integer DEFAULT 90,
  ADD COLUMN IF NOT EXISTS score_explanation jsonb;

-- ═══════════════════════════════════════════════════════════════
-- PHASE 6: Dependency graph columns on execution_plans
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.execution_plans
  ADD COLUMN IF NOT EXISTS blocked_by_plan_id uuid REFERENCES public.execution_plans(id),
  ADD COLUMN IF NOT EXISTS unlocks_plan_ids uuid[],
  ADD COLUMN IF NOT EXISTS dependency_type text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS is_critical_path boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_exec_plans_blocked ON public.execution_plans(blocked_by_plan_id) WHERE blocked_by_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exec_plans_critical ON public.execution_plans(organization_id, is_critical_path) WHERE is_critical_path = true;

-- ═══════════════════════════════════════════════════════════════
-- PHASE 7: Executive override table
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.execution_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  execution_plan_id uuid NOT NULL REFERENCES public.execution_plans(id),
  override_type text NOT NULL, -- force_reassign, force_cancel, extend_deadline, escalate, mark_blocked
  actor_id uuid NOT NULL,
  reason text NOT NULL,
  previous_state jsonb NOT NULL,
  new_state jsonb NOT NULL,
  requires_step_up boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view overrides"
  ON public.execution_overrides FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can create overrides"
  ON public.execution_overrides FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE INDEX idx_exec_overrides_plan ON public.execution_overrides(execution_plan_id, created_at DESC);
CREATE INDEX idx_exec_overrides_org ON public.execution_overrides(organization_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- PHASE 8: Observability run log
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.execution_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  run_type text NOT NULL, -- scan_interventions, compute_scores, predict_risks, command_summary
  run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  correlation_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  items_processed integer DEFAULT 0,
  items_created integer DEFAULT 0,
  status text NOT NULL DEFAULT 'running', -- running, completed, failed, partial
  error_message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view run logs"
  ON public.execution_run_log FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "System can insert run logs"
  ON public.execution_run_log FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE INDEX idx_exec_run_log_org ON public.execution_run_log(organization_id, run_type, started_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- PHASE 2: Concurrency-safe dedupe index for interventions
-- ═══════════════════════════════════════════════════════════════
-- Unique partial index: only one unresolved intervention per plan
-- This prevents duplicates at the database level even under concurrent scans
CREATE UNIQUE INDEX IF NOT EXISTS idx_exec_interventions_unique_unresolved
  ON public.execution_interventions(execution_plan_id)
  WHERE resolved = false;

-- ═══════════════════════════════════════════════════════════════
-- PHASE 4: Index for active predictions
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_exec_predictions_active
  ON public.execution_predictions(organization_id, is_active, risk_score DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_exec_predictions_plan_history
  ON public.execution_predictions(execution_plan_id, generated_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- PHASE 1: Atomic RPC — reassign plan
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.exec_reassign_plan_atomic(
  _plan_id uuid,
  _org_id uuid,
  _new_owner_id uuid,
  _actor_id uuid,
  _reason text DEFAULT 'Manual reassignment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _plan record;
  _prev_owner uuid;
BEGIN
  -- Lock the plan row for update
  SELECT owner_user_id, action_title, status INTO _plan
  FROM public.execution_plans
  WHERE id = _plan_id AND organization_id = _org_id
  FOR UPDATE;

  IF _plan IS NULL THEN
    RETURN jsonb_build_object('error', 'Plan not found', 'success', false);
  END IF;

  _prev_owner := _plan.owner_user_id;

  -- Update plan owner
  UPDATE public.execution_plans
  SET owner_user_id = _new_owner_id, updated_at = now()
  WHERE id = _plan_id;

  -- Insert resolved intervention record
  INSERT INTO public.execution_interventions (
    execution_plan_id, organization_id, intervention_type,
    trigger_reason, previous_owner, new_owner,
    auto_triggered, resolved, resolved_at, resolved_by
  ) VALUES (
    _plan_id, _org_id, 'reassignment',
    _reason, _prev_owner, _new_owner_id,
    false, true, now(), _actor_id
  );

  -- Insert execution event
  INSERT INTO public.execution_events (
    execution_plan_id, organization_id, event_type, actor_id,
    metadata
  ) VALUES (
    _plan_id, _org_id, 'reassigned', _actor_id,
    jsonb_build_object('previous_owner', _prev_owner, 'new_owner', _new_owner_id, 'reason', _reason)
  );

  -- Audit log
  INSERT INTO public.audit_log (
    organization_id, actor_id, actor_type, action_type,
    resource_type, resource_id, payload
  ) VALUES (
    _org_id, _actor_id, 'user', 'plan_reassigned',
    'execution_plan', _plan_id::text,
    jsonb_build_object('previous_owner', _prev_owner, 'new_owner', _new_owner_id, 'reason', _reason)
  );

  RETURN jsonb_build_object('success', true, 'previous_owner', _prev_owner);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- PHASE 1: Atomic RPC — resolve intervention
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.exec_resolve_intervention_atomic(
  _intervention_id uuid,
  _org_id uuid,
  _actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _intervention record;
BEGIN
  SELECT id, execution_plan_id, intervention_type, resolved INTO _intervention
  FROM public.execution_interventions
  WHERE id = _intervention_id AND organization_id = _org_id
  FOR UPDATE;

  IF _intervention IS NULL THEN
    RETURN jsonb_build_object('error', 'Intervention not found', 'success', false);
  END IF;

  IF _intervention.resolved THEN
    RETURN jsonb_build_object('error', 'Already resolved', 'success', false);
  END IF;

  UPDATE public.execution_interventions
  SET resolved = true, resolved_at = now(), resolved_by = _actor_id
  WHERE id = _intervention_id;

  INSERT INTO public.audit_log (
    organization_id, actor_id, actor_type, action_type,
    resource_type, resource_id, payload
  ) VALUES (
    _org_id, _actor_id, 'user', 'intervention_resolved',
    'execution_intervention', _intervention_id::text,
    jsonb_build_object('intervention_type', _intervention.intervention_type, 'plan_id', _intervention.execution_plan_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- PHASE 1+2: Atomic bulk intervention creation with dedupe
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.exec_create_interventions_atomic(
  _interventions jsonb,
  _org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _item jsonb;
  _created integer := 0;
  _skipped integer := 0;
BEGIN
  FOR _item IN SELECT jsonb_array_elements(_interventions)
  LOOP
    BEGIN
      INSERT INTO public.execution_interventions (
        execution_plan_id, organization_id, intervention_type,
        trigger_reason, previous_owner, corrective_action, auto_triggered
      ) VALUES (
        (_item->>'execution_plan_id')::uuid,
        _org_id,
        _item->>'intervention_type',
        _item->>'trigger_reason',
        NULLIF(_item->>'previous_owner', '')::uuid,
        _item->>'corrective_action',
        COALESCE((_item->>'auto_triggered')::boolean, true)
      );
      _created := _created + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Dedupe: unique partial index prevents duplicate unresolved interventions
      _skipped := _skipped + 1;
    END;
  END LOOP;

  -- Bulk audit log for all created interventions
  IF _created > 0 THEN
    INSERT INTO public.audit_log (
      organization_id, actor_type, action_type, resource_type, payload
    ) VALUES (
      _org_id, 'system', 'bulk_interventions_created', 'execution_intervention',
      jsonb_build_object('created', _created, 'skipped_duplicates', _skipped)
    );
  END IF;

  RETURN jsonb_build_object('created', _created, 'skipped', _skipped);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- PHASE 3: Exact latest-event retrieval per plan
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.exec_get_latest_events_by_plan(
  _plan_ids uuid[],
  _org_id uuid
)
RETURNS TABLE(execution_plan_id uuid, latest_event_at timestamptz, event_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    e.execution_plan_id,
    MAX(e.created_at) AS latest_event_at,
    COUNT(*) AS event_count
  FROM public.execution_events e
  WHERE e.execution_plan_id = ANY(_plan_ids)
    AND e.organization_id = _org_id
  GROUP BY e.execution_plan_id;
$$;

-- ═══════════════════════════════════════════════════════════════
-- PHASE 4: Atomic prediction supersede
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.exec_supersede_predictions(
  _plan_ids uuid[],
  _org_id uuid,
  _new_run_id uuid,
  _predictions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _item jsonb;
  _inserted integer := 0;
  _superseded integer;
BEGIN
  -- Mark existing active predictions as superseded
  UPDATE public.execution_predictions
  SET is_active = false,
      superseded_at = now(),
      superseded_by_run_id = _new_run_id
  WHERE execution_plan_id = ANY(_plan_ids)
    AND organization_id = _org_id
    AND is_active = true;

  GET DIAGNOSTICS _superseded = ROW_COUNT;

  -- Insert new predictions
  FOR _item IN SELECT jsonb_array_elements(_predictions)
  LOOP
    INSERT INTO public.execution_predictions (
      execution_plan_id, organization_id, risk_score,
      predicted_outcome, delay_days_predicted, risk_factors,
      recommendation, model_version, run_id, is_active,
      feature_summary, generated_at
    ) VALUES (
      (_item->>'execution_plan_id')::uuid,
      _org_id,
      (_item->>'risk_score')::integer,
      _item->>'predicted_outcome',
      (_item->>'delay_days_predicted')::integer,
      (_item->'risk_factors')::jsonb,
      _item->>'recommendation',
      COALESCE((_item->>'model_version')::integer, 2),
      _new_run_id,
      true,
      _item->'feature_summary',
      now()
    );
    _inserted := _inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('superseded', _superseded, 'inserted', _inserted, 'run_id', _new_run_id);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- PHASE 7: Executive override RPC
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.exec_log_override(
  _plan_id uuid,
  _org_id uuid,
  _actor_id uuid,
  _override_type text,
  _reason text,
  _changes jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _plan record;
  _prev_state jsonb;
  _new_state jsonb;
BEGIN
  SELECT id, status, owner_user_id, deadline, priority, is_critical_path
  INTO _plan
  FROM public.execution_plans
  WHERE id = _plan_id AND organization_id = _org_id
  FOR UPDATE;

  IF _plan IS NULL THEN
    RETURN jsonb_build_object('error', 'Plan not found', 'success', false);
  END IF;

  _prev_state := jsonb_build_object(
    'status', _plan.status,
    'owner_user_id', _plan.owner_user_id,
    'deadline', _plan.deadline,
    'priority', _plan.priority,
    'is_critical_path', _plan.is_critical_path
  );

  -- Apply changes based on override type
  CASE _override_type
    WHEN 'force_cancel' THEN
      UPDATE public.execution_plans SET status = 'cancelled', updated_at = now() WHERE id = _plan_id;
    WHEN 'force_reassign' THEN
      UPDATE public.execution_plans SET owner_user_id = (_changes->>'new_owner_id')::uuid, updated_at = now() WHERE id = _plan_id;
    WHEN 'extend_deadline' THEN
      UPDATE public.execution_plans SET deadline = (_changes->>'new_deadline')::timestamptz, updated_at = now() WHERE id = _plan_id;
    WHEN 'mark_blocked' THEN
      UPDATE public.execution_plans SET status = 'blocked', updated_at = now() WHERE id = _plan_id;
    WHEN 'escalate' THEN
      UPDATE public.execution_plans SET priority = 'critical', is_critical_path = true, updated_at = now() WHERE id = _plan_id;
    ELSE
      RETURN jsonb_build_object('error', 'Unknown override type', 'success', false);
  END CASE;

  -- Capture new state
  SELECT jsonb_build_object(
    'status', ep.status, 'owner_user_id', ep.owner_user_id,
    'deadline', ep.deadline, 'priority', ep.priority, 'is_critical_path', ep.is_critical_path
  ) INTO _new_state
  FROM public.execution_plans ep WHERE ep.id = _plan_id;

  -- Log the override
  INSERT INTO public.execution_overrides (
    organization_id, execution_plan_id, override_type,
    actor_id, reason, previous_state, new_state
  ) VALUES (
    _org_id, _plan_id, _override_type,
    _actor_id, _reason, _prev_state, _new_state
  );

  -- Audit trail
  INSERT INTO public.audit_log (
    organization_id, actor_id, actor_type, action_type,
    resource_type, resource_id, payload
  ) VALUES (
    _org_id, _actor_id, 'user', 'executive_override',
    'execution_plan', _plan_id::text,
    jsonb_build_object('override_type', _override_type, 'reason', _reason, 'previous', _prev_state, 'new', _new_state)
  );

  -- Event trail
  INSERT INTO public.execution_events (
    execution_plan_id, organization_id, event_type, actor_id,
    metadata
  ) VALUES (
    _plan_id, _org_id, 'override_' || _override_type, _actor_id,
    jsonb_build_object('reason', _reason, 'previous', _prev_state, 'new', _new_state)
  );

  RETURN jsonb_build_object('success', true, 'previous_state', _prev_state, 'new_state', _new_state);
END;
$$;
