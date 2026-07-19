-- ROLLBACK for 20260719140000_harden_decision_workflow_integrity.sql
--
-- *** DELIBERATELY NOT IN supabase/migrations/ ***
-- Lives outside that directory so it is never auto-applied -- must be run
-- manually, deliberately.
--
-- Scope: removes ONLY the objects this migration introduced --
-- create_predecided_decision(jsonb,text), dismiss_decision(uuid,text),
-- enforce_decision_status_trusted_transition(), its two private state tables,
-- and its trigger, the decision_audit_source column and all three new
-- CHECK constraints -- and restores approve_decision()/reject_decision()
-- to their exact pre-this-migration bodies (as deployed by
-- supabase/migrations/20260713053125_8fdc265c-9fc4-41eb-99d9-b35e8615fc64.sql).
-- Does NOT touch enforce_decision_approval_gate(), the pre-existing RLS
-- policies, or any pre-existing trigger -- this migration never modified
-- any of them, so there is nothing to revert there.
--
-- *** IRREVERSIBLE / DATA IMPLICATIONS ***
-- 1. decision_audit_source is dropped, discarding the 'legacy'/'rpc'
--    provenance label. Non-destructive to any OTHER column. Fully
--    re-derivable at any time: every row is 'legacy' unless it was
--    created by approve_decision/reject_decision/create_predecided_decision
--    after this migration was applied, which is determinable from
--    audit_log's decision_approved/decision_rejected/
--    decision_created_predecided entries plus decided_at, if that
--    reconstruction is ever needed again.
-- 2. Any row created via create_predecided_decision() while this
--    migration was live keeps its data (decision_ledger row + audit_log
--    entry) -- this rollback drops the function, it does not delete rows
--    the function created. Those rows simply lose their
--    decision_audit_source label along with every other row's.
-- 3. Rolling back after this migration has been live for a while means
--    any decision approved/rejected/created-pre-decided in the interim
--    went through a trusted, audited path (by construction -- direct
--    writes were blocked) -- rolling back removes the enforcement but
--    does not un-approve/un-reject/un-create anything.
-- 4. Edge Functions calling create_predecided_decision() and frontend code
--    calling dismiss_decision() will fail after rollback. Revert both caller
--    deployments BEFORE running this script; SQL cannot verify deployed
--    application versions.

BEGIN;

-- Fail closed on a partial or provenance-mismatched installation. Application
-- callers must be rolled back before this script; PostgreSQL cannot verify that
-- external deployment-order prerequisite.
DO $preflight$
DECLARE
  v_trigger_oid oid := to_regprocedure('public.enforce_decision_status_trusted_transition()');
  v_create_oid oid := to_regprocedure('public.create_predecided_decision(jsonb,text)');
  v_dismiss_oid oid := to_regprocedure('public.dismiss_decision(uuid,text)');
  v_approve_oid oid := to_regprocedure('public.approve_decision(uuid,uuid,text,integer,text)');
  v_reject_oid oid := to_regprocedure('public.reject_decision(uuid,text)');
BEGIN
  -- Hashes are reproducible with SELECT md5(prosrc) FROM pg_proc for the
  -- exact function sources installed by the forward migration. Length is
  -- checked as an additional guard; owner/security/config/grants are checked
  -- independently below.
  IF to_regclass('public.decision_transition_authorizations') IS NULL
     OR to_regclass('public.decision_creation_idempotency') IS NULL
     OR v_trigger_oid IS NULL OR v_create_oid IS NULL OR v_dismiss_oid IS NULL
     OR v_approve_oid IS NULL OR v_reject_oid IS NULL THEN
    RAISE EXCEPTION 'rollback preflight failed: hardening installation is partial';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles o ON o.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=v_trigger_oid
                 AND md5(p.prosrc)='84533cf399b6a5e7e1af1ba3da5fcae8' AND length(p.prosrc)=720
                 AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog, public'] AND o.rolname='postgres'
                 AND l.lanname='plpgsql' AND p.prorettype='trigger'::regtype AND NOT p.proretset AND p.pronargdefaults=0)
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles o ON o.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=v_create_oid
                    AND md5(p.prosrc)='330a4e7fb29226e86a8d46c8cbc9231a' AND length(p.prosrc)=4289
                    AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog, public'] AND o.rolname='postgres'
                    AND l.lanname='plpgsql' AND p.prorettype='uuid'::regtype AND NOT p.proretset AND p.pronargdefaults=0)
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles o ON o.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=v_dismiss_oid
                    AND md5(p.prosrc)='acd5d840f10b5e1d663083396a9f9829' AND length(p.prosrc)=1754
                    AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog, public'] AND o.rolname='postgres'
                    AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND NOT p.proretset AND p.pronargdefaults=1)
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles o ON o.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=v_approve_oid
                    AND md5(p.prosrc)='5e693be7e84218a83ffc2c2d08295200' AND length(p.prosrc)=3358
                    AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog, public'] AND o.rolname='postgres'
                    AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND NOT p.proretset AND p.pronargdefaults=4)
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles o ON o.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=v_reject_oid
                    AND md5(p.prosrc)='7afdb57a3592c927ea2b8d71946a5491' AND length(p.prosrc)=1928
                    AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog, public'] AND o.rolname='postgres'
                    AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND NOT p.proretset AND p.pronargdefaults=1) THEN
    RAISE EXCEPTION 'rollback preflight failed: hardened function source or metadata differs';
  END IF;
  IF has_function_privilege('anon',v_trigger_oid,'EXECUTE') OR has_function_privilege('authenticated',v_trigger_oid,'EXECUTE')
     OR has_function_privilege('service_role',v_trigger_oid,'EXECUTE')
     OR has_function_privilege('anon',v_create_oid,'EXECUTE') OR has_function_privilege('authenticated',v_create_oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_create_oid,'EXECUTE')
     OR has_function_privilege('anon',v_dismiss_oid,'EXECUTE') OR NOT has_function_privilege('authenticated',v_dismiss_oid,'EXECUTE')
     OR has_function_privilege('service_role',v_dismiss_oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_approve_oid,'EXECUTE') OR has_function_privilege('anon',v_approve_oid,'EXECUTE')
     OR has_function_privilege('service_role',v_approve_oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_reject_oid,'EXECUTE') OR has_function_privilege('anon',v_reject_oid,'EXECUTE')
     OR has_function_privilege('service_role',v_reject_oid,'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
                WHERE p.oid IN (v_trigger_oid,v_create_oid,v_dismiss_oid,v_approve_oid,v_reject_oid) AND a.grantee=0) THEN
    RAISE EXCEPTION 'rollback preflight failed: hardened function grants differ';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.decision_ledger'::regclass AND NOT tgisinternal) <> 4
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.decision_ledger'::regclass
                    AND tgname='trg_enforce_decision_status_trusted_transition' AND tgtype=23
                    AND tgenabled='O' AND tgfoid=v_trigger_oid)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.decision_ledger'::regclass
                    AND tgname='update_decision_ledger_updated_at' AND tgtype=19 AND tgenabled='O'
                    AND tgfoid='public.update_updated_at_column()'::regprocedure)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.decision_ledger'::regclass
                    AND tgname='trg_intel_writeback_on_decision_resolved' AND tgtype=17 AND tgenabled='O'
                    AND tgfoid='public.intel_writeback_on_decision_resolved()'::regprocedure)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.decision_ledger'::regclass
                    AND tgname='trg_enforce_decision_approval_gate' AND tgtype=19 AND tgenabled='O'
                    AND tgfoid='public.enforce_decision_approval_gate()'::regprocedure) THEN
    RAISE EXCEPTION 'rollback preflight failed: hardened trigger inventory or linkage differs';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles o ON o.oid=c.relowner
                 WHERE c.oid='public.decision_transition_authorizations'::regclass AND c.relkind='r'
                   AND c.relrowsecurity AND NOT c.relforcerowsecurity AND o.rolname='postgres')
     OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles o ON o.oid=c.relowner
                    WHERE c.oid='public.decision_creation_idempotency'::regclass AND c.relkind='r'
                      AND c.relrowsecurity AND NOT c.relforcerowsecurity AND o.rolname='postgres')
     OR has_table_privilege('anon','public.decision_transition_authorizations','SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated','public.decision_transition_authorizations','SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('service_role','public.decision_transition_authorizations','SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon','public.decision_creation_idempotency','SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated','public.decision_creation_idempotency','SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('service_role','public.decision_creation_idempotency','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'rollback preflight failed: private table owner, RLS, or grants differ';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid IN
              ('public.decision_transition_authorizations'::regclass,'public.decision_creation_idempotency'::regclass))
     OR (SELECT count(*) FROM pg_index WHERE indrelid='public.decision_transition_authorizations'::regclass) <> 1
     OR (SELECT count(*) FROM pg_index WHERE indrelid='public.decision_creation_idempotency'::regclass) <> 2 THEN
    RAISE EXCEPTION 'rollback preflight failed: private table policy or index inventory differs';
  END IF;
  IF (SELECT count(*) FROM pg_attrdef WHERE adrelid='public.decision_transition_authorizations'::regclass) <> 0
     OR (SELECT count(*) FROM pg_attrdef WHERE adrelid='public.decision_creation_idempotency'::regclass) <> 1 THEN
    RAISE EXCEPTION 'rollback preflight failed: private table default inventory differs';
  END IF;
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid='public.decision_transition_authorizations'::regclass
      AND attnum>0 AND NOT attisdropped) <> 4
     OR (SELECT array_agg(attname || ':' || format_type(atttypid,atttypmod) || ':' || attnotnull ORDER BY attnum)
         FROM pg_attribute WHERE attrelid='public.decision_transition_authorizations'::regclass
           AND attnum>0 AND NOT attisdropped)
        <> ARRAY['transaction_id:bigint:true','backend_pid:integer:true','operation:text:true','decision_id:uuid:true']
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.decision_transition_authorizations'::regclass) <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.decision_transition_authorizations'::regclass
                    AND conname='decision_transition_authorizations_pkey' AND contype='p' AND conkey=ARRAY[1,2,3,4]::smallint[])
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.decision_transition_authorizations'::regclass
                    AND conname='decision_transition_authorizations_operation_check' AND contype='c' AND convalidated
                    AND regexp_replace(pg_get_expr(conbin,conrelid),'\s+','','g')=
                        regexp_replace('(operation = ANY (ARRAY[''INSERT''::text, ''UPDATE''::text]))','\s+','','g'))
     OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.decision_creation_idempotency'::regclass
         AND attnum>0 AND NOT attisdropped) <> 5
     OR (SELECT array_agg(attname || ':' || format_type(atttypid,atttypmod) || ':' || attnotnull ORDER BY attnum)
         FROM pg_attribute WHERE attrelid='public.decision_creation_idempotency'::regclass
           AND attnum>0 AND NOT attisdropped)
        <> ARRAY['organization_id:uuid:true','caller_scope:uuid:true','idempotency_key:text:true',
                 'decision_id:uuid:false','created_at:timestamp with time zone:true']
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.decision_creation_idempotency'::regclass) <> 4
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.decision_creation_idempotency'::regclass
                    AND conname='decision_creation_idempotency_pkey' AND contype='p' AND conkey=ARRAY[1,2,3]::smallint[])
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.decision_creation_idempotency'::regclass
                    AND conname='decision_creation_idempotency_decision_id_key' AND contype='u' AND conkey=ARRAY[4]::smallint[])
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.decision_creation_idempotency'::regclass
                    AND conname='decision_creation_idempotency_idempotency_key_check' AND contype='c' AND convalidated
                    AND regexp_replace(pg_get_expr(conbin,conrelid),'\s+','','g')=
                        regexp_replace('((length(idempotency_key) >= 1) AND (length(idempotency_key) <= 200))','\s+','','g'))
     OR NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d
                      ON d.adrelid=a.attrelid AND d.adnum=a.attnum
                    WHERE a.attrelid='public.decision_creation_idempotency'::regclass
                      AND a.attname='created_at' AND pg_get_expr(d.adbin,d.adrelid)='now()')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.decision_creation_idempotency'::regclass
                    AND conname='decision_creation_idempotency_decision_id_fkey' AND contype='f'
                    AND confrelid='public.decision_ledger'::regclass AND confdeltype='c' AND convalidated) THEN
    RAISE EXCEPTION 'rollback preflight failed: private table columns or constraints differ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d
                   ON d.adrelid=a.attrelid AND d.adnum=a.attnum
                 WHERE a.attrelid='public.decision_ledger'::regclass
                   AND a.attname='decision_audit_source' AND a.atttypid='text'::regtype AND a.attnotnull
                   AND pg_get_expr(d.adbin,d.adrelid) IN ('''legacy''::text','''legacy''')
                   AND NOT a.attisdropped)
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.decision_ledger'::regclass
         AND conname IN ('decision_ledger_decision_status_check','decision_ledger_execution_status_check','decision_ledger_audit_source_check')) <> 3
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.decision_ledger'::regclass
                AND conname IN ('decision_ledger_decision_status_check','decision_ledger_execution_status_check','decision_ledger_audit_source_check')
                AND (contype<>'c' OR NOT convalidated)) THEN
    RAISE EXCEPTION 'rollback preflight failed: provenance column or workflow constraints differ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.decision_ledger'::regclass
                 AND conname='decision_ledger_decision_status_check'
                 AND regexp_replace(pg_get_expr(conbin,conrelid),'\s+','','g')=
                     regexp_replace('(decision_status = ANY (ARRAY[''pending''::text, ''approved''::text, ''rejected''::text, ''dismissed''::text, ''executable''::text, ''executed''::text]))','\s+','','g'))
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.decision_ledger'::regclass
                    AND conname='decision_ledger_execution_status_check'
                    AND regexp_replace(pg_get_expr(conbin,conrelid),'\s+','','g')=
                        regexp_replace('(execution_status = ANY (ARRAY[''not_started''::text, ''in_progress''::text, ''completed''::text, ''failed''::text, ''cancelled''::text, ''blocked''::text]))','\s+','','g'))
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.decision_ledger'::regclass
                    AND conname='decision_ledger_audit_source_check'
                    AND regexp_replace(pg_get_expr(conbin,conrelid),'\s+','','g')=
                        regexp_replace('(decision_audit_source = ANY (ARRAY[''legacy''::text, ''rpc''::text]))','\s+','','g')) THEN
    RAISE EXCEPTION 'rollback preflight failed: workflow constraint expressions differ';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid IN
              ('public.decision_transition_authorizations'::regclass,'public.decision_creation_idempotency'::regclass)
              AND conrelid NOT IN ('public.decision_transition_authorizations'::regclass,'public.decision_creation_idempotency'::regclass)) THEN
    RAISE EXCEPTION 'rollback preflight failed: unexpected external dependency on private tables';
  END IF;
  -- DROP uses RESTRICT (the default), providing a final fail-closed dependency check.
END $preflight$;

-- ---- Step 5 reversal: restore approve_decision/reject_decision to their
-- exact pre-this-migration bodies ----

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
SET search_path = public
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
END;
$$;

REVOKE ALL ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.reject_decision(
  _decision_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
END;
$$;

REVOKE ALL ON FUNCTION public.reject_decision(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_decision(uuid, text) TO authenticated;

-- ---- Step 4 reversal: drop workflow RPCs and private state ----

DROP FUNCTION public.dismiss_decision(uuid, text);
DROP FUNCTION public.create_predecided_decision(jsonb, text);

-- ---- Step 3 reversal: drop the new trigger and its function ----

DROP TRIGGER trg_enforce_decision_status_trusted_transition ON public.decision_ledger;
DROP FUNCTION public.enforce_decision_status_trusted_transition();
DROP TABLE public.decision_transition_authorizations;
DROP TABLE public.decision_creation_idempotency;

-- ---- Step 2 reversal: drop the legacy-provenance column ----

ALTER TABLE public.decision_ledger DROP CONSTRAINT IF EXISTS decision_ledger_audit_source_check;
ALTER TABLE public.decision_ledger DROP COLUMN IF EXISTS decision_audit_source;

-- ---- Step 1 reversal: drop the controlled-value constraints ----

ALTER TABLE public.decision_ledger DROP CONSTRAINT IF EXISTS decision_ledger_decision_status_check;
ALTER TABLE public.decision_ledger DROP CONSTRAINT IF EXISTS decision_ledger_execution_status_check;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Post-rollback verification:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.decision_ledger'::regclass
--   AND conname IN ('decision_ledger_decision_status_check','decision_ledger_execution_status_check','decision_ledger_audit_source_check');
--   -- Expected: zero rows.
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.decision_ledger'::regclass
--   AND tgname = 'trg_enforce_decision_status_trusted_transition';
--   -- Expected: zero rows.
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'decision_ledger' AND column_name = 'decision_audit_source';
--   -- Expected: zero rows.
--   SELECT proname FROM pg_proc WHERE proname = 'create_predecided_decision';
--   -- Expected: zero rows.
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid = 'public.decision_ledger'::regclass AND NOT tgisinternal;
--   -- Expected: update_decision_ledger_updated_at,
--   -- trg_intel_writeback_on_decision_resolved,
--   -- trg_enforce_decision_approval_gate -- all tgenabled = 'O', all
--   -- unmodified by this rollback (they were never modified by the
--   -- forward migration either).
