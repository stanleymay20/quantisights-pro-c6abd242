-- Harden the governed decision loop end to end.
--
-- This forward-only migration makes the database authoritative for executive
-- approval readiness, closes direct governance-evidence write gaps, repairs
-- direction-aware accuracy for legacy rows, and schedules the two outcome
-- evaluators using environment-local Vault routing.

-- ---------------------------------------------------------------------------
-- 1. Canonical server-side executive approval readiness
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decision_approval_readiness(_decision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_evidence_sources jsonb;
  v_meta jsonb;
  v_governance_context jsonb;
  v_confidence numeric;
  v_decision_origin text;
  v_decision_status text;
  v_evidence_status text;
  v_source_quality text;
  v_governance_status text;
  v_evidence_verified boolean := false;
  v_quality_ok boolean := false;
  v_contradiction_ok boolean := true;
  v_confidence_ok boolean := false;
  v_governance_ok boolean := false;
  v_blocking_reasons text[] := ARRAY[]::text[];
BEGIN
  SELECT
    COALESCE(evidence_sources, '[]'::jsonb),
    COALESCE(explanation_metadata, '{}'::jsonb),
    COALESCE(governance_context, '{}'::jsonb),
    COALESCE(capped_confidence, confidence_at_decision, raw_confidence),
    decision_origin,
    decision_status
  INTO
    v_evidence_sources,
    v_meta,
    v_governance_context,
    v_confidence,
    v_decision_origin,
    v_decision_status
  FROM public.decision_ledger
  WHERE id = _decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', _decision_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Match the client trust adapter exactly: an explicit evidence status wins.
  -- Linked evidence/source_data is only an inference fallback when no explicit
  -- status is present. This prevents a caller from bypassing an explicit
  -- partial/blocked/missing evidence classification merely by retaining links.
  v_evidence_status := lower(COALESCE(v_meta ->> 'evidence_status', ''));
  IF v_evidence_status <> '' THEN
    v_evidence_verified := v_evidence_status IN (
      'verified', 'passed', 'approved', 'complete', 'completed', 'valid'
    );
  ELSE
    v_evidence_verified :=
      CASE
        WHEN jsonb_typeof(v_evidence_sources) = 'array'
          THEN jsonb_array_length(v_evidence_sources) > 0
        ELSE false
      END
      OR (
        v_meta ? 'source_data'
        AND jsonb_typeof(v_meta -> 'source_data') = 'object'
      );
  END IF;

  v_source_quality := lower(COALESCE(
    v_meta ->> 'evidence_classification',
    v_decision_origin,
    ''
  ));
  v_quality_ok := v_evidence_verified AND v_source_quality <> 'low_quality';

  v_contradiction_ok := NOT (
    lower(COALESCE(v_meta ->> 'has_unresolved_contradiction', 'false')) IN ('true', '1', 'yes')
    OR lower(COALESCE(v_meta ->> 'unresolved_contradiction', 'false')) IN ('true', '1', 'yes')
    OR lower(COALESCE(v_meta ->> 'contradiction_unresolved', 'false')) IN ('true', '1', 'yes')
    OR CASE
      WHEN jsonb_typeof(v_meta -> 'contradictions') = 'array'
        THEN jsonb_array_length(v_meta -> 'contradictions') > 0
      ELSE false
    END
  );

  v_confidence_ok := v_confidence IS NOT NULL AND v_confidence >= 70;

  v_governance_status := lower(COALESCE(
    v_governance_context ->> 'status',
    v_meta #>> '{governance,status}',
    ''
  ));

  -- Mirror the existing client trust contract: a pending/in-review decision
  -- has a usable governance path unless an explicit governance status says it
  -- is blocked/missing. This prevents the server gate from inventing a new
  -- business rule while still making the existing rule authoritative.
  IF v_governance_status = '' THEN
    v_governance_ok := lower(COALESCE(v_decision_status, '')) IN ('pending', 'in_review', 'open');
  ELSE
    v_governance_ok := v_governance_status IN (
      'verified', 'passed', 'approved', 'complete', 'completed', 'valid',
      'partial', 'warning', 'review', 'in_review', 'pending'
    );
  END IF;

  IF NOT v_evidence_verified THEN
    v_blocking_reasons := array_append(v_blocking_reasons, 'missing evidence: verified evidence must be linked before approval');
  END IF;
  IF NOT v_quality_ok THEN
    v_blocking_reasons := array_append(v_blocking_reasons, 'weak evidence quality: sources are not yet decision-grade');
  END IF;
  IF NOT v_contradiction_ok THEN
    v_blocking_reasons := array_append(v_blocking_reasons, 'unresolved contradiction: conflicting signals must be resolved before approval');
  END IF;
  IF NOT v_confidence_ok THEN
    v_blocking_reasons := array_append(v_blocking_reasons, 'insufficient confidence: AICIS confidence must be at least 70% before approval');
  END IF;
  IF NOT v_governance_ok THEN
    v_blocking_reasons := array_append(v_blocking_reasons, 'missing required approval: governance status must be available before approval');
  END IF;

  RETURN jsonb_build_object(
    'allowed', cardinality(v_blocking_reasons) = 0,
    'evidence_verified', v_evidence_verified,
    'quality_ok', v_quality_ok,
    'contradiction_ok', v_contradiction_ok,
    'confidence_ok', v_confidence_ok,
    'governance_ok', v_governance_ok,
    'blocking_reasons', to_jsonb(v_blocking_reasons)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decision_approval_readiness(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decision_approval_readiness(uuid) TO service_role;

-- Reissue the current direction-aware approval RPC and add the canonical
-- readiness gate before any write occurs. Keep the public signature stable.
CREATE OR REPLACE FUNCTION public.approve_decision(
  _decision_id uuid,
  _dataset_id uuid DEFAULT NULL,
  _expected_metric text DEFAULT NULL,
  _evaluation_window_days int DEFAULT 30,
  _suggested_owner text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_org_id uuid;
  v_status text;
  v_recommended_action text;
  v_decision_type text;
  v_confidence numeric;
  v_audit_id uuid;
  v_plan_id uuid;
  v_outcome_id uuid;
  v_eval jsonb;
  v_readiness jsonb;
  v_resolved_metric text;
  v_expected_direction text;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT organization_id, decision_status, recommended_action, decision_type,
         COALESCE(capped_confidence, confidence_at_decision, raw_confidence, 50)
  INTO v_org_id, v_status, v_recommended_action, v_decision_type, v_confidence
  FROM public.decision_ledger
  WHERE id = _decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', _decision_id USING ERRCODE = 'no_data_found';
  END IF;

  IF public.get_user_org_role(auth.uid(), v_org_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only organization owners/admins may approve decisions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'decision % is % and cannot be approved (must be pending)', _decision_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  v_readiness := public.decision_approval_readiness(_decision_id);
  IF NOT COALESCE((v_readiness ->> 'allowed')::boolean, false) THEN
    RAISE EXCEPTION 'decision approval blocked: %', v_readiness -> 'blocking_reasons'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.decision_ledger
  SET decision_status = 'approved', decided_at = v_now, decided_by = auth.uid()
  WHERE id = _decision_id;

  INSERT INTO public.execution_plans (
    decision_id, organization_id, action_title, action_description, owner_user_id,
    priority, status, trigger_type, trigger_config
  )
  VALUES (
    _decision_id, v_org_id, left(v_recommended_action, 200),
    'Execution plan for: ' || v_recommended_action,
    auth.uid(), 'medium', 'pending', 'manual',
    jsonb_build_object(
      'suggested_owner', _suggested_owner,
      'evaluation_window_days', _evaluation_window_days
    )
  )
  RETURNING id INTO v_plan_id;

  v_eval := public.check_decision_evaluability(v_org_id, _dataset_id, _expected_metric);

  IF (v_eval ->> 'status') <> 'NOT_MEASURABLE' THEN
    v_resolved_metric := COALESCE(
      v_eval ->> 'resolved_metric',
      _expected_metric,
      v_decision_type,
      'unknown'
    );
    v_expected_direction := public.infer_expected_direction(v_resolved_metric);

    INSERT INTO public.decision_outcomes (
      decision_id,
      organization_id,
      dataset_id,
      expected_metric,
      expected_direction,
      evaluation_window_days
    )
    VALUES (
      _decision_id,
      v_org_id,
      COALESCE((v_eval ->> 'resolved_dataset_id')::uuid, _dataset_id),
      v_resolved_metric,
      v_expected_direction,
      _evaluation_window_days
    )
    RETURNING id INTO v_outcome_id;
  END IF;

  INSERT INTO public.audit_log (
    organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload
  )
  VALUES (
    v_org_id,
    auth.uid(),
    'user',
    'decision_approved',
    'decision',
    _decision_id::text,
    jsonb_build_object(
      'recommended_action', v_recommended_action,
      'confidence_at_decision', v_confidence,
      'execution_plan_id', v_plan_id,
      'decision_outcome_id', v_outcome_id,
      'expected_metric', v_resolved_metric,
      'expected_direction', v_expected_direction,
      'approval_readiness', v_readiness
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'decision_id', _decision_id,
    'decision_status', 'approved',
    'decided_at', v_now,
    'audit_id', v_audit_id,
    'execution_plan_id', v_plan_id,
    'decision_outcome_id', v_outcome_id,
    'expected_direction', v_expected_direction,
    'approval_readiness', v_readiness,
    'evaluability', v_eval
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Governance-record integrity
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can create approvals" ON public.decision_approvals;
CREATE POLICY "Admins can create approvals"
ON public.decision_approvals
FOR INSERT
WITH CHECK (
  public.get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin')
  AND requested_by = auth.uid()
  AND public.is_org_member(approver_id, organization_id)
  AND EXISTS (
    SELECT 1
    FROM public.decision_ledger d
    WHERE d.id = decision_id
      AND d.organization_id = organization_id
  )
);

DROP POLICY IF EXISTS "Approvers can update their approvals" ON public.decision_approvals;
CREATE POLICY "Approvers can update their approvals"
ON public.decision_approvals
FOR UPDATE
USING (
  approver_id = auth.uid()
  AND public.is_org_member(auth.uid(), organization_id)
)
WITH CHECK (
  approver_id = auth.uid()
  AND public.is_org_member(auth.uid(), organization_id)
);

CREATE OR REPLACE FUNCTION public.guard_decision_approval_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.decision_id IS DISTINCT FROM OLD.decision_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.approver_id IS DISTINCT FROM OLD.approver_id
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at THEN
    RAISE EXCEPTION 'decision approval identity fields are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_decision_approval_identity_trigger ON public.decision_approvals;
CREATE TRIGGER guard_decision_approval_identity_trigger
BEFORE UPDATE ON public.decision_approvals
FOR EACH ROW
EXECUTE FUNCTION public.guard_decision_approval_identity();

-- Outcome records are governance evidence. Service-role evaluators and the
-- SECURITY DEFINER approval RPC bypass RLS; direct authenticated writes are
-- therefore restricted to organization owners/admins.
DROP POLICY IF EXISTS "Users can insert own org outcomes" ON public.decision_outcomes;
DROP POLICY IF EXISTS "Users can update own org outcomes" ON public.decision_outcomes;

CREATE POLICY "Owners admins can insert decision outcomes"
ON public.decision_outcomes
FOR INSERT
WITH CHECK (
  public.get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin')
  AND EXISTS (
    SELECT 1
    FROM public.decision_ledger d
    WHERE d.id = decision_id
      AND d.organization_id = organization_id
  )
);

CREATE POLICY "Owners admins can update decision outcomes"
ON public.decision_outcomes
FOR UPDATE
USING (public.get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin'))
WITH CHECK (public.get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- 3. Direction-aware legacy calibration signal
-- ---------------------------------------------------------------------------
-- Where a canonical outcome direction exists but the ledger has no accuracy
-- score, backfill a conservative binary directional score. This prevents old
-- lower-is-better outcomes from teaching the calibration model the opposite
-- lesson merely because their raw delta is negative.
WITH latest_direction AS (
  SELECT DISTINCT ON (decision_id)
    decision_id,
    expected_direction
  FROM public.decision_outcomes
  WHERE expected_direction IN ('increase', 'decrease', 'stable')
  ORDER BY decision_id, evaluation_date DESC NULLS LAST, created_at DESC
)
UPDATE public.decision_ledger d
SET prediction_accuracy_score = CASE
      WHEN ld.expected_direction = 'increase' AND d.outcome_delta > 1 THEN 100
      WHEN ld.expected_direction = 'decrease' AND d.outcome_delta < -1 THEN 100
      WHEN ld.expected_direction = 'stable' AND abs(d.outcome_delta) <= 1 THEN 100
      ELSE 0
    END,
    updated_at = now()
FROM latest_direction ld
WHERE ld.decision_id = d.id
  AND d.outcome_delta IS NOT NULL
  AND d.prediction_accuracy_score IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Automatic closed-loop evaluation
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  job_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'project_url'
      AND decrypted_secret ~ '^https://[a-z0-9-]+\.supabase\.co/?$'
  ) THEN
    RAISE EXCEPTION 'Vault secret project_url is missing or invalid; refusing to schedule outcome evaluation';
  END IF;

  IF NULLIF(public.get_ingest_cron_secret(), '') IS NULL THEN
    RAISE EXCEPTION 'Vault secret ingest_cron_secret is missing; refusing to schedule outcome evaluation';
  END IF;

  FOREACH job_name IN ARRAY ARRAY[
    'evaluate-decision-outcomes-hourly',
    'evaluate-aicis-outcomes-hourly'
  ] LOOP
    BEGIN
      PERFORM cron.unschedule(job_name);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END
$$;

SELECT cron.schedule(
  'evaluate-decision-outcomes-hourly',
  '17 * * * *',
  $cron$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'), '/') || '/functions/v1/evaluate-outcomes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_ingest_cron_secret()
    ),
    body := jsonb_build_object('action', 'evaluate_all', 'cron', true)
  );
  $cron$
);

SELECT cron.schedule(
  'evaluate-aicis-outcomes-hourly',
  '37 * * * *',
  $cron$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'), '/') || '/functions/v1/aicis-evaluate-outcomes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_ingest_cron_secret()
    ),
    body := jsonb_build_object('cron', true)
  );
  $cron$
);

NOTIFY pgrst, 'reload schema';