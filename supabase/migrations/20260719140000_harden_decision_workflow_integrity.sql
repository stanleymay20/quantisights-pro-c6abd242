-- Decision workflow integrity hardening.
-- STATUS: implementation-ready; not applied by this repository change.
-- Companion rollback:
--   supabase/rollback/20260719140000_harden_decision_workflow_integrity_rollback.sql
-- Design report:
--   docs/security/decision-workflow-integrity-hardening.md
--
-- The superseded proposal and its rollback were removed from migration history.
-- Preflight fails closed if any prior hardening object exists.
--
-- Explicitly NOT included: any reapplication of
-- 20260713010000_fix_decision_approval_atomicity.sql (superseded --
-- enforce_decision_approval_gate() is already correct live, matching
-- 20260713101124_c24694df-...sql already in this repo's history;
-- approve_decision()/reject_decision() are already correctly deployed via
-- 20260713053125_8fdc265c-...sql). This migration does not touch
-- enforce_decision_approval_gate() at all.
--
-- Full reconstruction of live definitions, gap analysis, status-vocabulary
-- derivation, terminal-INSERT policy justification, and trigger-ordering
-- analysis are all in the design report -- this file focuses on the SQL
-- and the preflight/verification/test queries that accompany it.

-- ============================================================================
-- PREFLIGHT (run manually BEFORE applying; NOT executed automatically)
-- ============================================================================
--
-- 1. Status vocabularies -- must match exactly what Step 1's CHECK
--    constraints below allow, or STOP and revise this file first:
--
--      SELECT decision_status, count(*) FROM public.decision_ledger
--      GROUP BY decision_status ORDER BY 1;
--      -- Expected set: pending, approved, rejected, dismissed, executable, executed
--
--      SELECT execution_status, count(*) FROM public.decision_ledger
--      GROUP BY execution_status ORDER BY 1;
--      -- Expected set: not_started, in_progress, completed, failed, cancelled, blocked
--
-- 2. Legacy provenance -- informational only, does not gate anything (this
--    migration's Step 2 column addition is metadata-only and does not
--    branch on this count):
--
--      SELECT count(*) FROM public.decision_ledger
--      WHERE decision_status IN ('approved','rejected') AND decided_by IS NULL;
--      -- Reported by Lovable as 345 at time of writing. If different,
--      -- no action needed -- see design report "Legacy provenance".
--
-- 3. Confirm the trigger inventory matches what this migration's
--    interaction analysis assumes (see design report, "Trigger
--    interaction safety"):
--
--      SELECT tgname, tgtype, tgenabled FROM pg_trigger
--      WHERE tgrelid = 'public.decision_ledger'::regclass AND NOT tgisinternal
--      ORDER BY tgname;
--      -- Expected (pre-this-migration): update_decision_ledger_updated_at,
--      -- trg_intel_writeback_on_decision_resolved,
--      -- trg_enforce_decision_approval_gate. Any prior hardening trigger
--      -- or object causes executable preflight to fail closed; nothing is
--      -- overwritten based on a matching name.
--
-- 4. Confirm objects this migration assumes already exist (none are
--    created here except where noted in Step 4):
--
--      SELECT proname, pg_get_function_identity_arguments(oid)
--      FROM pg_proc WHERE proname IN
--        ('get_user_org_role', 'is_org_member', 'check_decision_evaluability');
--      SELECT tablename FROM pg_tables
--      WHERE tablename IN ('execution_plans','decision_outcomes','audit_log','approval_chain_stages');
--      SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'decision_ledger' AND column_name = 'required_approvals';
--
-- 5. Confirm approve_decision/reject_decision current signatures (this
--    migration's CREATE OR REPLACE must not silently change the signature
--    PostgREST/clients already call):
--
--      SELECT proname, pg_get_function_identity_arguments(oid)
--      FROM pg_proc WHERE proname IN ('approve_decision', 'reject_decision');
--      -- Expected: approve_decision(uuid, uuid, text, int, text),
--      --           reject_decision(uuid, text)
--
-- 6. Confirm current RLS policies and table-level grants on
--    decision_ledger (this migration adds no new RLS policy and assumes
--    the existing ones are unchanged -- see design report "Gap: table-
--    level grants" for why this query matters):
--
--      SELECT policyname, cmd, roles FROM pg_policies
--      WHERE tablename = 'decision_ledger' ORDER BY cmd;
--      -- Expected: Leadership can view decisions (SELECT),
--      -- Admins/owners can insert decisions (INSERT),
--      -- Admins/owners can update decisions (UPDATE),
--      -- Admins/owners can delete decisions (DELETE)
--
--      SELECT grantee, privilege_type FROM information_schema.role_table_grants
--      WHERE table_name = 'decision_ledger' ORDER BY grantee, privilege_type;
--      -- No migration in this repo ever GRANTs on decision_ledger
--      -- explicitly -- this is expected to show Supabase's project-level
--      -- default privileges to anon/authenticated. If it does NOT (e.g.
--      -- a project-specific REVOKE was applied out of band), the INSERT-
--      -- bypass analysis in the design report may need revisiting before
--      -- applying this migration.
-- ============================================================================

-- ============================================================================
-- Step 1: controlled-value constraints. The executable preflight rejects
-- unknown/NULL data and existing same-named objects before creation; constraints
-- are validated in this transaction.
-- ============================================================================

BEGIN;

DO $preflight$
DECLARE
  v_approve_oid oid := to_regprocedure('public.approve_decision(uuid,uuid,text,integer,text)');
  v_reject_oid oid := to_regprocedure('public.reject_decision(uuid,text)');
  v_gate_oid oid := to_regprocedure('public.enforce_decision_approval_gate()');
  v_expected_approve text := $expected_approve$DECLARE
  v_org_id uuid;
  v_status text;
  v_recommended_action text;
  v_decision_type text;
  v_confidence numeric;
  v_audit_id uuid;
  v_plan_id uuid;
  v_outcome_id uuid;
  v_eval jsonb;
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
    RAISE EXCEPTION 'only organization owners/admins may approve decisions' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'decision % is % and cannot be approved (must be pending)', _decision_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.decision_ledger
  SET decision_status = 'approved', decided_at = v_now, decided_by = auth.uid()
  WHERE id = _decision_id;

  INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload)
  VALUES (
    v_org_id, auth.uid(), 'user', 'decision_approved', 'decision', _decision_id::text,
    jsonb_build_object('recommended_action', v_recommended_action, 'confidence_at_decision', v_confidence)
  )
  RETURNING id INTO v_audit_id;

  INSERT INTO public.execution_plans (
    decision_id, organization_id, action_title, action_description, owner_user_id,
    priority, status, trigger_type, trigger_config
  )
  VALUES (
    _decision_id, v_org_id, left(v_recommended_action, 200), 'Execution plan for: ' || v_recommended_action,
    auth.uid(), 'medium', 'pending', 'manual',
    jsonb_build_object('suggested_owner', _suggested_owner, 'evaluation_window_days', _evaluation_window_days)
  )
  RETURNING id INTO v_plan_id;

  v_eval := public.check_decision_evaluability(v_org_id, _dataset_id, _expected_metric);

  IF (v_eval ->> 'status') <> 'NOT_MEASURABLE' THEN
    INSERT INTO public.decision_outcomes (
      decision_id, organization_id, dataset_id, expected_metric, expected_direction, evaluation_window_days
    )
    VALUES (
      _decision_id, v_org_id,
      COALESCE((v_eval ->> 'resolved_dataset_id')::uuid, _dataset_id),
      COALESCE(v_eval ->> 'resolved_metric', _expected_metric, v_decision_type, 'unknown'),
      'increase', _evaluation_window_days
    )
    RETURNING id INTO v_outcome_id;
  END IF;

  RETURN jsonb_build_object(
    'decision_id', _decision_id,
    'decision_status', 'approved',
    'decided_at', v_now,
    'audit_id', v_audit_id,
    'execution_plan_id', v_plan_id,
    'decision_outcome_id', v_outcome_id,
    'evaluability', v_eval
  );
END;$expected_approve$;
  v_expected_reject text := $expected_reject$DECLARE
  v_org_id uuid;
  v_status text;
  v_existing_notes text;
  v_audit_id uuid;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT organization_id, decision_status, notes
  INTO v_org_id, v_status, v_existing_notes
  FROM public.decision_ledger
  WHERE id = _decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', _decision_id USING ERRCODE = 'no_data_found';
  END IF;

  IF public.get_user_org_role(auth.uid(), v_org_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only organization owners/admins may reject decisions' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'decision % is % and cannot be rejected (must be pending)', _decision_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.decision_ledger
  SET decision_status = 'rejected',
      decided_at = v_now,
      decided_by = auth.uid(),
      notes = CASE WHEN _reason IS NULL THEN notes
                   ELSE COALESCE(v_existing_notes || E'\n', '') || 'Rejected in executive review: ' || _reason END
  WHERE id = _decision_id;

  INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload)
  VALUES (
    v_org_id, auth.uid(), 'user', 'decision_rejected', 'decision', _decision_id::text,
    jsonb_build_object('reason', _reason)
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object('decision_id', _decision_id, 'decision_status', 'rejected', 'decided_at', v_now, 'audit_id', v_audit_id);
END;$expected_reject$;
  v_expected_gate text := $expected_gate$DECLARE
  unsatisfied_stages INT;
BEGIN
  IF NEW.decision_status IS NOT DISTINCT FROM OLD.decision_status THEN
    RETURN NEW;
  END IF;

  IF NEW.decision_status = 'executed' AND COALESCE(OLD.decision_status, '') <> 'executable' THEN
    RAISE EXCEPTION 'Decision % cannot be marked executed without passing through executable state', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.decision_status = 'executable' AND COALESCE(NEW.required_approvals, 0) > 0 THEN
    SELECT count(*) INTO unsatisfied_stages
      FROM public.approval_chain_stages
     WHERE decision_id = NEW.id AND satisfied = false;

    IF unsatisfied_stages > 0 THEN
      RAISE EXCEPTION 'Decision % has % unsatisfied approval stage(s); cannot become executable', NEW.id, unsatisfied_stages
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;$expected_gate$;
BEGIN
  -- Baseline was transcribed byte-for-byte from migrations 20260713053125
  -- (approval RPCs) and 20260713101124 (approval gate). pg_proc.prosrc is
  -- compared exactly because it is stable source text, unlike pretty-printed
  -- pg_get_functiondef output across PostgreSQL releases.
  IF to_regclass('public.decision_ledger') IS NULL OR to_regclass('public.audit_log') IS NULL
     OR to_regclass('public.execution_plans') IS NULL OR to_regclass('public.decision_outcomes') IS NULL THEN
    RAISE EXCEPTION 'preflight failed: required live tables are missing';
  END IF;
  IF v_approve_oid IS NULL OR v_reject_oid IS NULL OR v_gate_oid IS NULL THEN
    RAISE EXCEPTION 'preflight failed: reviewed workflow functions are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles o ON o.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang
                 WHERE p.oid=v_approve_oid AND p.prosrc=v_expected_approve AND p.prosecdef
                   AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public'] AND o.rolname='postgres'
                   AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND NOT p.proretset AND p.pronargdefaults=4)
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles o ON o.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang
                    WHERE p.oid=v_reject_oid AND p.prosrc=v_expected_reject AND p.prosecdef
                      AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public'] AND o.rolname='postgres'
                      AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND NOT p.proretset AND p.pronargdefaults=1)
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles o ON o.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang
                    WHERE p.oid=v_gate_oid AND p.prosrc=v_expected_gate AND p.prosecdef
                      AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public'] AND o.rolname='postgres'
                      AND l.lanname='plpgsql' AND p.prorettype='trigger'::regtype AND NOT p.proretset AND p.pronargdefaults=0) THEN
    RAISE EXCEPTION 'preflight failed: workflow function source, owner, security, volatility, or search_path differs from reviewed baseline';
  END IF;
  IF NOT has_function_privilege('authenticated',v_approve_oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_reject_oid,'EXECUTE')
     OR has_function_privilege('anon',v_approve_oid,'EXECUTE') OR has_function_privilege('service_role',v_approve_oid,'EXECUTE')
     OR has_function_privilege('anon',v_reject_oid,'EXECUTE') OR has_function_privilege('service_role',v_reject_oid,'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p,
                  LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
                WHERE p.oid IN (v_approve_oid,v_reject_oid) AND a.grantee=0) THEN
    RAISE EXCEPTION 'preflight failed: workflow RPC EXECUTE grants differ from reviewed baseline';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.decision_ledger'::regclass AND NOT tgisinternal) <> 3
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.decision_ledger'::regclass
                    AND tgname='update_decision_ledger_updated_at' AND tgtype=19 AND tgenabled='O'
                    AND tgfoid='public.update_updated_at_column()'::regprocedure)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.decision_ledger'::regclass
                    AND tgname='trg_intel_writeback_on_decision_resolved' AND tgtype=17 AND tgenabled='O'
                    AND tgfoid='public.intel_writeback_on_decision_resolved()'::regprocedure)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.decision_ledger'::regclass
                    AND tgname='trg_enforce_decision_approval_gate' AND tgtype=19 AND tgenabled='O' AND tgfoid=v_gate_oid) THEN
    RAISE EXCEPTION 'preflight failed: complete decision_ledger trigger inventory differs from reviewed baseline';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles o ON o.oid=c.relowner
                 WHERE c.oid='public.decision_ledger'::regclass AND c.relrowsecurity AND o.rolname='postgres')
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.decision_ledger'::regclass
                    AND attname='decision_status' AND atttypid='text'::regtype AND attnotnull AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.decision_ledger'::regclass
                    AND attname='execution_status' AND atttypid='text'::regtype AND attnotnull AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.decision_ledger'::regclass
                    AND attname='required_approvals' AND atttypid='integer'::regtype AND attnotnull AND NOT attisdropped) THEN
    RAISE EXCEPTION 'preflight failed: decision_ledger owner, RLS, or relevant column definitions differ from reviewed baseline';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid='public.decision_ledger'::regclass) <> 4
     OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.decision_ledger'::regclass
                    AND polname='Leadership can view decisions' AND polcmd='r')
     OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.decision_ledger'::regclass
                    AND polname='Admins/owners can insert decisions' AND polcmd='a')
     OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.decision_ledger'::regclass
                    AND polname='Admins/owners can update decisions' AND polcmd='w')
     OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.decision_ledger'::regclass
                    AND polname='Admins/owners can delete decisions' AND polcmd='d') THEN
    RAISE EXCEPTION 'preflight failed: decision_ledger RLS policy inventory differs from reviewed baseline';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d
                   ON d.adrelid=a.attrelid AND d.adnum=a.attnum
                 WHERE a.attrelid='public.decision_ledger'::regclass AND a.attname='decision_status'
                   AND pg_get_expr(d.adbin,d.adrelid) IN ('''pending''::text','''pending'''))
     OR NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d
                      ON d.adrelid=a.attrelid AND d.adnum=a.attnum
                    WHERE a.attrelid='public.decision_ledger'::regclass AND a.attname='execution_status'
                      AND pg_get_expr(d.adbin,d.adrelid) IN ('''not_started''::text','''not_started'''))
     OR NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d
                      ON d.adrelid=a.attrelid AND d.adnum=a.attnum
                    WHERE a.attrelid='public.decision_ledger'::regclass AND a.attname='required_approvals'
                      AND pg_get_expr(d.adbin,d.adrelid)='0')
     OR EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.decision_ledger'::regclass
                AND c.conkey && ARRAY[
                  (SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='decision_status'),
                  (SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='execution_status')
                ]::smallint[]) THEN
    RAISE EXCEPTION 'preflight failed: workflow defaults or existing constraints differ from reviewed baseline';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.decision_ledger'::regclass
             AND attname='decision_audit_source' AND NOT attisdropped)
     OR to_regclass('public.decision_transition_authorizations') IS NOT NULL
     OR to_regclass('public.decision_creation_idempotency') IS NOT NULL
     OR to_regprocedure('public.create_predecided_decision(jsonb,text)') IS NOT NULL
     OR to_regprocedure('public.dismiss_decision(uuid,text)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.decision_ledger'::regclass
                AND tgname='trg_enforce_decision_status_trusted_transition' AND NOT tgisinternal)
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.decision_ledger'::regclass
                AND conname IN ('decision_ledger_decision_status_check','decision_ledger_execution_status_check',
                                'decision_ledger_audit_source_check')) THEN
    RAISE EXCEPTION 'preflight failed: prior hardening object exists; inspect provenance and do not overwrite it';
  END IF;
  IF EXISTS (SELECT 1 FROM public.decision_ledger WHERE decision_status IS NULL
             OR decision_status NOT IN ('pending','approved','rejected','dismissed','executable','executed')
             OR execution_status IS NULL
             OR execution_status NOT IN ('not_started','in_progress','completed','failed','cancelled','blocked')) THEN
    RAISE EXCEPTION 'preflight failed: NULL or unsupported workflow status exists';
  END IF;
END $preflight$;

ALTER TABLE public.decision_ledger
  ADD CONSTRAINT decision_ledger_decision_status_check
  CHECK (decision_status IN ('pending','approved','rejected','dismissed','executable','executed'))
  NOT VALID;

ALTER TABLE public.decision_ledger
  ADD CONSTRAINT decision_ledger_execution_status_check
  CHECK (execution_status IN ('not_started','in_progress','completed','failed','cancelled','blocked'))
  NOT VALID;


-- ============================================================================
-- Step 2: honest legacy provenance. Metadata-only: a single constant
-- DEFAULT on a new NOT NULL column is a catalog-only operation in
-- Postgres 11+ (no table rewrite, no row touched, no trigger fired, no
-- updated_at bump) -- deliberately NOT a row-by-row backfill UPDATE.
-- Every pre-existing row -- regardless of whether decided_by is NULL or
-- not -- equally predates this migration's RPC-only enforcement, so one
-- constant label ('legacy') truthfully represents all of them; the
-- decided_by-IS-NULL/NOT-NULL split among those legacy rows remains
-- fully queryable (see preflight query 2 and the post-migration
-- verification query below) without needing two different constant
-- labels baked into the column. decided_by/decided_at are never written
-- by this migration.
-- ============================================================================

ALTER TABLE public.decision_ledger
  ADD COLUMN decision_audit_source text NOT NULL DEFAULT 'legacy';

ALTER TABLE public.decision_ledger
  ADD CONSTRAINT decision_ledger_audit_source_check
  CHECK (decision_audit_source IN ('legacy','rpc'));

-- ============================================================================
-- Step 3: private, single-use transition capabilities and deny-by-default gate.
-- A caller-settable GUC is deliberately not an authorization boundary.
-- ============================================================================

CREATE TABLE public.decision_transition_authorizations (
  transaction_id bigint NOT NULL,
  backend_pid integer NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE')),
  decision_id uuid,
  PRIMARY KEY (transaction_id, backend_pid, operation, decision_id)
);
ALTER TABLE public.decision_transition_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.decision_transition_authorizations FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.decision_creation_idempotency (
  organization_id uuid NOT NULL,
  caller_scope uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  decision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, caller_scope, idempotency_key),
  UNIQUE (decision_id),
  CONSTRAINT decision_creation_idempotency_decision_id_fkey
    FOREIGN KEY (decision_id) REFERENCES public.decision_ledger(id) ON DELETE CASCADE
);
ALTER TABLE public.decision_creation_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.decision_creation_idempotency FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.enforce_decision_status_trusted_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_authorized boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.decision_status IS NOT DISTINCT FROM OLD.decision_status THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.decision_transition_authorizations
   WHERE transaction_id = pg_catalog.txid_current()
     AND backend_pid = pg_catalog.pg_backend_pid()
     AND operation = TG_OP
     AND decision_id IS NOT DISTINCT FROM NEW.id
  RETURNING true INTO v_authorized;

  IF COALESCE(v_authorized, false) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.decision_status = 'pending' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'decision_status may only change through an approved workflow RPC'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_decision_status_trusted_transition() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_enforce_decision_status_trusted_transition
BEFORE INSERT OR UPDATE ON public.decision_ledger
FOR EACH ROW EXECUTE FUNCTION public.enforce_decision_status_trusted_transition();

-- A JSON payload preserves seed/import fields while reserved fields are stripped
-- and database-owned provenance/timestamps are forced. The idempotency record is
-- locked by its unique key, so concurrent retries return the first decision.
CREATE FUNCTION public.create_predecided_decision(_decision jsonb, _idempotency_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_org_id uuid := (_decision ->> 'organization_id')::uuid;
  v_status text := _decision ->> 'decision_status';
  v_scope uuid := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_id uuid;
  v_payload jsonb;
BEGIN
  IF _idempotency_key IS NULL OR length(btrim(_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'idempotency key is required (1..200 characters)' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_org_id IS NULL OR v_status NOT IN ('approved','rejected','dismissed','executable','executed') THEN
    RAISE EXCEPTION 'invalid organization or pre-decided status' USING ERRCODE = 'check_violation';
  END IF;
  IF auth.uid() IS NOT NULL AND public.get_user_org_role(auth.uid(), v_org_id) NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'only organization owners/admins may create pre-decided decisions' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.decision_creation_idempotency (organization_id, caller_scope, idempotency_key)
  VALUES (v_org_id, v_scope, btrim(_idempotency_key))
  ON CONFLICT DO NOTHING;
  SELECT decision_id INTO v_id FROM public.decision_creation_idempotency
   WHERE organization_id = v_org_id AND caller_scope = v_scope
     AND idempotency_key = btrim(_idempotency_key)
   FOR UPDATE;
  IF v_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.decision_ledger WHERE id = v_id) THEN
      RETURN v_id;
    END IF;
    -- Defensive repair for a stale reservation from a disabled/corrupt FK.
    DELETE FROM public.decision_creation_idempotency
     WHERE organization_id = v_org_id AND caller_scope = v_scope
       AND idempotency_key = btrim(_idempotency_key);
    INSERT INTO public.decision_creation_idempotency (organization_id, caller_scope, idempotency_key)
    VALUES (v_org_id, v_scope, btrim(_idempotency_key));
  END IF;

  v_id := gen_random_uuid();
  v_payload := _decision - ARRAY['id','created_at','updated_at','decided_at','decision_audit_source'];
  v_payload := v_payload || jsonb_build_object(
    'id', v_id, 'organization_id', v_org_id, 'decision_status', v_status,
    'decided_at', now(), 'decision_audit_source', 'rpc'
  );
  IF auth.uid() IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object('decided_by', auth.uid());
  END IF;

  INSERT INTO public.decision_transition_authorizations (transaction_id, backend_pid, operation, decision_id)
  VALUES (pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), 'INSERT', v_id);
  INSERT INTO public.decision_ledger (
    id, organization_id, recommended_action, chosen_action, decision_type,
    decision_status, execution_status, decided_by, decided_at,
    confidence_at_decision, raw_confidence, capped_confidence,
    confidence_cap_reason, predicted_net_impact, predicted_roi_probability,
    probability_of_success, baseline_value, expected_value_at_decision,
    outcome_delta, actual_value, prediction_accuracy_score, dataset_id,
    decision_context_id, notes, decision_audit_source
  ) SELECT
    r.id, r.organization_id, r.recommended_action, r.chosen_action, r.decision_type,
    r.decision_status, COALESCE(r.execution_status, 'not_started'), r.decided_by, r.decided_at,
    r.confidence_at_decision, r.raw_confidence, r.capped_confidence,
    r.confidence_cap_reason, r.predicted_net_impact, r.predicted_roi_probability,
    r.probability_of_success, r.baseline_value, r.expected_value_at_decision,
    r.outcome_delta, r.actual_value, r.prediction_accuracy_score, r.dataset_id,
    r.decision_context_id, r.notes, r.decision_audit_source
  FROM jsonb_populate_record(NULL::public.decision_ledger, v_payload) AS r;

  UPDATE public.decision_creation_idempotency SET decision_id = v_id
   WHERE organization_id = v_org_id AND caller_scope = v_scope
     AND idempotency_key = btrim(_idempotency_key);
  INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload)
  VALUES (v_org_id, auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END,
          CASE WHEN v_status = 'dismissed' THEN 'decision_dismissed' ELSE 'decision_created_predecided' END,
          'decision', v_id::text, jsonb_build_object('decision_status', v_status, 'idempotency_key', btrim(_idempotency_key)));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_predecided_decision(jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_predecided_decision(jsonb,text) TO service_role;

CREATE FUNCTION public.dismiss_decision(_decision_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_org_id uuid; v_status text; v_audit_id uuid; v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT organization_id, decision_status INTO v_org_id, v_status
    FROM public.decision_ledger WHERE id = _decision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'decision % not found', _decision_id USING ERRCODE = 'no_data_found'; END IF;
  IF public.get_user_org_role(auth.uid(), v_org_id) NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'only organization owners/admins may dismiss decisions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'decision % is % and cannot be dismissed (must be pending)', _decision_id, v_status USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.decision_transition_authorizations (transaction_id, backend_pid, operation, decision_id)
  VALUES (pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), 'UPDATE', _decision_id);
  UPDATE public.decision_ledger SET decision_status='dismissed', decided_at=v_now,
    decided_by=auth.uid(), decision_audit_source='rpc',
    notes=CASE WHEN _reason IS NULL THEN notes ELSE COALESCE(notes || E'\n','') || 'Dismissed: ' || _reason END
    WHERE id=_decision_id;
  INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload)
  VALUES (v_org_id, auth.uid(), 'user', 'decision_dismissed', 'decision', _decision_id::text,
          jsonb_build_object('reason', _reason)) RETURNING id INTO v_audit_id;
  RETURN jsonb_build_object('decision_id',_decision_id,'decision_status','dismissed','decided_at',v_now,'audit_id',v_audit_id);
END;
$$;
REVOKE ALL ON FUNCTION public.dismiss_decision(uuid,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.dismiss_decision(uuid,text) TO authenticated;

-- ============================================================================
-- Step 5: extend approve_decision / reject_decision with single-use capabilities. Every line other
-- than the search_path strengthening, the single-use capability insert, and the
-- decision_audit_source stamp is byte-identical to the currently-
-- deployed body in
-- supabase/migrations/20260713053125_8fdc265c-9fc4-41eb-99d9-b35e8615fc64.sql:
-- row lock, role check, status precondition, audit_log insert,
-- execution_plans insert, decision_outcomes insert are all unchanged.
-- ============================================================================

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
    RAISE EXCEPTION 'only organization owners/admins may approve decisions' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'decision % is % and cannot be approved (must be pending)', _decision_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Issue a private, transaction-and-backend-bound single-use capability.
  INSERT INTO public.decision_transition_authorizations (transaction_id, backend_pid, operation, decision_id)
  VALUES (pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), 'UPDATE', _decision_id);

  UPDATE public.decision_ledger
  SET decision_status = 'approved', decided_at = v_now, decided_by = auth.uid(),
      decision_audit_source = 'rpc'
  WHERE id = _decision_id;


  INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload)
  VALUES (
    v_org_id, auth.uid(), 'user', 'decision_approved', 'decision', _decision_id::text,
    jsonb_build_object('recommended_action', v_recommended_action, 'confidence_at_decision', v_confidence)
  )
  RETURNING id INTO v_audit_id;

  INSERT INTO public.execution_plans (
    decision_id, organization_id, action_title, action_description, owner_user_id,
    priority, status, trigger_type, trigger_config
  )
  VALUES (
    _decision_id, v_org_id, left(v_recommended_action, 200), 'Execution plan for: ' || v_recommended_action,
    auth.uid(), 'medium', 'pending', 'manual',
    jsonb_build_object('suggested_owner', _suggested_owner, 'evaluation_window_days', _evaluation_window_days)
  )
  RETURNING id INTO v_plan_id;

  v_eval := public.check_decision_evaluability(v_org_id, _dataset_id, _expected_metric);

  IF (v_eval ->> 'status') <> 'NOT_MEASURABLE' THEN
    INSERT INTO public.decision_outcomes (
      decision_id, organization_id, dataset_id, expected_metric, expected_direction, evaluation_window_days
    )
    VALUES (
      _decision_id, v_org_id,
      COALESCE((v_eval ->> 'resolved_dataset_id')::uuid, _dataset_id),
      COALESCE(v_eval ->> 'resolved_metric', _expected_metric, v_decision_type, 'unknown'),
      'increase', _evaluation_window_days
    )
    RETURNING id INTO v_outcome_id;
  END IF;

  RETURN jsonb_build_object(
    'decision_id', _decision_id,
    'decision_status', 'approved',
    'decided_at', v_now,
    'audit_id', v_audit_id,
    'execution_plan_id', v_plan_id,
    'decision_outcome_id', v_outcome_id,
    'evaluability', v_eval
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.reject_decision(
  _decision_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_org_id uuid;
  v_status text;
  v_existing_notes text;
  v_audit_id uuid;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT organization_id, decision_status, notes
  INTO v_org_id, v_status, v_existing_notes
  FROM public.decision_ledger
  WHERE id = _decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', _decision_id USING ERRCODE = 'no_data_found';
  END IF;

  IF public.get_user_org_role(auth.uid(), v_org_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only organization owners/admins may reject decisions' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'decision % is % and cannot be rejected (must be pending)', _decision_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.decision_transition_authorizations (transaction_id, backend_pid, operation, decision_id)
  VALUES (pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), 'UPDATE', _decision_id);

  UPDATE public.decision_ledger
  SET decision_status = 'rejected',
      decided_at = v_now,
      decided_by = auth.uid(),
      decision_audit_source = 'rpc',
      notes = CASE WHEN _reason IS NULL THEN notes
                   ELSE COALESCE(v_existing_notes || E'\n', '') || 'Rejected in executive review: ' || _reason END
  WHERE id = _decision_id;


  INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload)
  VALUES (
    v_org_id, auth.uid(), 'user', 'decision_rejected', 'decision', _decision_id::text,
    jsonb_build_object('reason', _reason)
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object('decision_id', _decision_id, 'decision_status', 'rejected', 'decided_at', v_now, 'audit_id', v_audit_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_decision(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reject_decision(uuid, text) TO authenticated;

ALTER TABLE public.decision_ledger VALIDATE CONSTRAINT decision_ledger_decision_status_check;
ALTER TABLE public.decision_ledger VALIDATE CONSTRAINT decision_ledger_execution_status_check;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Deployment verification (run after application): confirm all constraints
-- validate, four pre-existing/new triggers remain enabled, RPC grants match the
-- explicit grants above, and the private tables have no non-owner privileges.
-- Exercise direct INSERT/UPDATE rejection, each RPC, NULL reasons, duplicate
-- idempotency keys, unauthorized roles, and rollback in a disposable database.
