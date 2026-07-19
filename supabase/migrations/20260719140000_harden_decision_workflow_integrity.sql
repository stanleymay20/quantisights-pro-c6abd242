-- REVIEW-ONLY PROPOSAL -- decision workflow integrity hardening (revision 3).
-- STATUS: PROPOSED. NOT APPLIED to any database. Committed to main as a
-- review artefact only -- do not run without explicit approval.
-- Companion rollback:
--   supabase/rollback/20260719140000_harden_decision_workflow_integrity_rollback.sql
-- Design report:
--   docs/security/decision-workflow-integrity-hardening.md
--
-- SUPERSEDES supabase/migrations/20260719130000_decision_ledger_transition_integrity.sql.
-- That file is also still unapplied. This migration is self-contained and
-- does not require it to have been applied first (CREATE OR REPLACE /
-- DROP ... IF EXISTS throughout). Do not apply both -- see the design
-- report for the recommended cleanup of the superseded file.
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
--      -- trg_enforce_decision_approval_gate. If
--      -- trg_enforce_decision_status_trusted_transition already exists,
--      -- 20260719130000 was applied -- this migration's CREATE OR REPLACE
--      -- / DROP+CREATE TRIGGER steps still apply cleanly, but re-read the
--      -- design report's supersession note first.
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
-- Step 1: controlled-value constraints. NOT VALID -- validate separately,
-- as an explicit manual step, only after preflight query 1 confirms clean
-- data. Idempotent against a prior partial application.
-- ============================================================================

ALTER TABLE public.decision_ledger DROP CONSTRAINT IF EXISTS decision_ledger_decision_status_check;
ALTER TABLE public.decision_ledger
  ADD CONSTRAINT decision_ledger_decision_status_check
  CHECK (decision_status IN ('pending','approved','rejected','dismissed','executable','executed'))
  NOT VALID;

ALTER TABLE public.decision_ledger DROP CONSTRAINT IF EXISTS decision_ledger_execution_status_check;
ALTER TABLE public.decision_ledger
  ADD CONSTRAINT decision_ledger_execution_status_check
  CHECK (execution_status IN ('not_started','in_progress','completed','failed','cancelled','blocked'))
  NOT VALID;

-- Run ONLY after preflight query 1 confirms clean data:
--   ALTER TABLE public.decision_ledger VALIDATE CONSTRAINT decision_ledger_decision_status_check;
--   ALTER TABLE public.decision_ledger VALIDATE CONSTRAINT decision_ledger_execution_status_check;

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
  ADD COLUMN IF NOT EXISTS decision_audit_source text NOT NULL DEFAULT 'legacy';

ALTER TABLE public.decision_ledger DROP CONSTRAINT IF EXISTS decision_ledger_audit_source_check;
ALTER TABLE public.decision_ledger
  ADD CONSTRAINT decision_ledger_audit_source_check
  CHECK (decision_audit_source IN ('legacy','rpc'));

-- ============================================================================
-- Step 3: trusted-context flag + deny-by-default INSERT/UPDATE guard.
-- One consolidated trigger function/trigger (not two) covering both
-- INSERT and UPDATE -- see design report "Trigger interaction safety" for
-- why consolidation, and for the explicit order-safety analysis against
-- the three pre-existing triggers this migration does not touch.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_decision_status_trusted_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_trusted boolean;
BEGIN
  v_trusted := coalesce(
    pg_catalog.current_setting('quantivis.internal.decision_transition_authorized', true),
    'false'
  ) = 'true';

  IF TG_OP = 'INSERT' THEN
    -- Deny-by-default for creation: an ordinary INSERT must start
    -- 'pending'. The only sanctioned way to create a row with a
    -- non-pending decision_status is public.create_predecided_decision()
    -- (Step 4), which sets the trusted flag internally -- this closes
    -- the terminal-status INSERT bypass (owner/admin, or any service_role
    -- caller, could otherwise INSERT a row already 'approved'/'rejected'
    -- with no RPC, no audit_log entry, and browser-supplied decided_by/
    -- decided_at treated as if authoritative).
    IF NEW.decision_status IS DISTINCT FROM 'pending' AND NOT v_trusted THEN
      RAISE EXCEPTION
        'New decisions must be created with decision_status = pending; use approve_decision()/reject_decision() to transition an existing row, or create_predecided_decision() for a pre-decided record (attempted: %)',
        NEW.decision_status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'. Any column other than decision_status is never
  -- blocked here -- owner/admin users keep full direct UPDATE access to
  -- notes, execution_status progression (Start/Complete buttons in
  -- DecisionLedger.tsx), calibration fields, outcome tracking, etc.
  IF NEW.decision_status IS NOT DISTINCT FROM OLD.decision_status THEN
    RETURN NEW;
  END IF;

  IF NOT v_trusted THEN
    RAISE EXCEPTION
      'Decision % decision_status transition from % to % is protected and must go through a trusted workflow (approve_decision()/reject_decision(), or an equivalent future RPC); direct updates to decision_status are not permitted',
      NEW.id, OLD.decision_status, NEW.decision_status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

-- Restricted per SECURITY DEFINER review: this function must only ever
-- run as a trigger body, never be called directly. Trigger firing is
-- authorized by the trigger definition itself, not by the invoking
-- role's EXECUTE privilege on the function.
REVOKE ALL ON FUNCTION public.enforce_decision_status_trusted_transition() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_decision_status_trusted_transition ON public.decision_ledger;
CREATE TRIGGER trg_enforce_decision_status_trusted_transition
  BEFORE INSERT OR UPDATE ON public.decision_ledger
  FOR EACH ROW EXECUTE FUNCTION public.enforce_decision_status_trusted_transition();

-- This trigger applies unconditionally to every writer, including
-- service_role -- BEFORE/AFTER triggers fire for every role, RLS bypass
-- (BYPASSRLS, which this repository's own migrations repeatedly document
-- service_role as having -- e.g. 20260401045214, 20260606164443,
-- 20260619073534) only skips ROW SECURITY POLICY evaluation, not trigger
-- execution. This is precisely why a trigger (not an RLS WITH CHECK) is
-- the correct mechanism for closing a bypass that must also cover
-- service_role.
--
-- NOTE: no current write path sets decision_status to 'executable' or
-- 'executed' at all (confirmed by grep of src/, supabase/functions/, and
-- supabase/migrations/ -- those values only appear inside
-- enforce_decision_approval_gate()'s own guard logic, anticipating a
-- future write path that does not exist yet). Deny-by-default already
-- covers them automatically. The moment an "executable"/"executed" RPC
-- is built, it MUST call
-- pg_catalog.set_config('quantivis.internal.decision_transition_authorized', 'true', true)
-- the same way approve_decision/reject_decision/create_predecided_decision
-- do, or it will be silently blocked by this trigger.

-- ============================================================================
-- Step 4: create_predecided_decision() -- the sanctioned trusted-INSERT
-- path for legitimate immediately-decided records (demo/seed/import).
-- Chosen design: (A) deny-by-default for ordinary INSERTs, combined with
-- (B) a dedicated audited creation RPC for the legitimate exception --
-- see design report "Terminal-status INSERT bypass" for the full
-- justification, including why PostgREST/REST callers structurally
-- cannot satisfy a pure-(A)-with-raw-set_config escape hatch (a REST
-- .insert() call cannot chain an arbitrary SQL statement before itself).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_predecided_decision(
  _organization_id uuid,
  _decision_status text,
  _recommended_action text,
  _chosen_action text DEFAULT NULL,
  _decision_type text DEFAULT 'strategic',
  _execution_status text DEFAULT 'not_started',
  _decided_by uuid DEFAULT NULL,
  _confidence_at_decision numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF _decision_status NOT IN ('approved','rejected','executable','executed') THEN
    RAISE EXCEPTION
      'create_predecided_decision: % is not a valid pre-decided status (must be a terminal status, not pending/dismissed)',
      _decision_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Authenticated (non-service-role) callers must satisfy the same
  -- owner/admin membership check the existing "Admins/owners can insert
  -- decisions" RLS policy already requires for a plain INSERT.
  -- service_role calls (auth.uid() IS NULL -- no user JWT) are already
  -- fully trusted at the platform level, matching this repository's
  -- existing convention (see Step 3's trigger comment) -- there is no
  -- per-user role to check in that case.
  IF auth.uid() IS NOT NULL
     AND public.get_user_org_role(auth.uid(), _organization_id) NOT IN ('owner', 'admin')
  THEN
    RAISE EXCEPTION 'only organization owners/admins may create a pre-decided decision'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_catalog.set_config('quantivis.internal.decision_transition_authorized', 'true', true);

  INSERT INTO public.decision_ledger (
    organization_id, decision_type, recommended_action, chosen_action,
    decision_status, execution_status, decided_by, decided_at,
    confidence_at_decision, decision_audit_source
  ) VALUES (
    _organization_id, _decision_type, _recommended_action, _chosen_action,
    _decision_status, _execution_status, _decided_by,
    -- decided_at is database-generated (now()), never caller-supplied --
    -- only set for decisions that are actually decided (approved/
    -- rejected); executable/executed do not represent a decide event.
    CASE WHEN _decision_status IN ('approved', 'rejected') THEN now() ELSE NULL END,
    _confidence_at_decision, 'rpc'
  )
  RETURNING id INTO v_id;

  PERFORM pg_catalog.set_config('quantivis.internal.decision_transition_authorized', 'false', true);

  INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload)
  VALUES (
    _organization_id, auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'service_role' ELSE 'user' END,
    'decision_created_predecided', 'decision', v_id::text,
    jsonb_build_object('decision_status', _decision_status, 'recommended_action', _recommended_action)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_predecided_decision(uuid, text, text, text, text, text, uuid, numeric) FROM PUBLIC;
-- Granted to service_role only: the only current callers of a
-- non-pending-at-creation INSERT are the create-demo-session,
-- seed-demo-data, and event-stream Edge Functions, all of which write
-- via a service_role-keyed client (verified directly in their source --
-- see design report "Frontend and application compatibility plan"). No
-- authenticated-user-facing flow currently needs this RPC. Extend the
-- grant deliberately, not by default, if one is built.
GRANT EXECUTE ON FUNCTION public.create_predecided_decision(uuid, text, text, text, text, text, uuid, numeric) TO service_role;

-- ============================================================================
-- Step 5: extend approve_decision / reject_decision. Every line other
-- than the search_path strengthening, the two set_config calls, and the
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

  -- Trusted flag: transaction-local (is_local = true, the third
  -- argument), so it cannot leak to any other transaction on this or any
  -- other pooled connection, and is automatically cleared at
  -- COMMIT/ROLLBACK even if the explicit reset below is never reached
  -- due to an error raised after this point.
  PERFORM pg_catalog.set_config('quantivis.internal.decision_transition_authorized', 'true', true);

  UPDATE public.decision_ledger
  SET decision_status = 'approved', decided_at = v_now, decided_by = auth.uid(),
      decision_audit_source = 'rpc'
  WHERE id = _decision_id;

  PERFORM pg_catalog.set_config('quantivis.internal.decision_transition_authorized', 'false', true);

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

  PERFORM pg_catalog.set_config('quantivis.internal.decision_transition_authorized', 'true', true);

  UPDATE public.decision_ledger
  SET decision_status = 'rejected',
      decided_at = v_now,
      decided_by = auth.uid(),
      decision_audit_source = 'rpc',
      notes = CASE WHEN _reason IS NULL THEN notes
                   ELSE COALESCE(v_existing_notes || E'\n', '') || 'Rejected in executive review: ' || _reason END
  WHERE id = _decision_id;

  PERFORM pg_catalog.set_config('quantivis.internal.decision_transition_authorized', 'false', true);

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

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- SPOOFING / SECURITY REVIEW SUMMARY (full detail in the design report)
-- ============================================================================
-- set_config / current_setting : no existing function anywhere in this
--                             repository's migration history (other than
--                             the superseded 20260719130000 proposal)
--                             calls either. This migration introduces the
--                             only live usages, always pg_catalog-
--                             qualified.
-- generic SQL execution      : no exec_sql/execute_sql/run_sql-style RPC
--                             exists anywhere in the schema.
-- arbitrary config setters   : none -- no RPC accepts a GUC name/value
--                             pair and forwards it to set_config.
-- dynamic SQL                : none in any function this migration adds
--                             or modifies.
-- broad EXECUTE grants       : no GRANT EXECUTE ... TO PUBLIC exists
--                             anywhere in the schema (checked
--                             repository-wide, not just this migration).
--                             enforce_decision_status_trusted_transition:
--                             REVOKE ALL FROM PUBLIC, no GRANT at all.
--                             create_predecided_decision: REVOKE ALL FROM
--                             PUBLIC, GRANT EXECUTE TO service_role only.
--                             approve_decision/reject_decision: REVOKE
--                             ALL FROM PUBLIC, GRANT EXECUTE TO
--                             authenticated only (unchanged from live).
-- service-role bypass        : service_role bypasses ROW SECURITY
--                             POLICIES (documented repeatedly elsewhere
--                             in this repo's own migrations -- e.g.
--                             20260401045214, 20260606164443,
--                             20260619073534) but NOT triggers -- the new
--                             BEFORE INSERT/UPDATE trigger in Step 3
--                             applies to every writer regardless of role,
--                             which is why a trigger (not an RLS WITH
--                             CHECK) was chosen as the enforcement point.
-- ============================================================================

-- ============================================================================
-- SECURITY DEFINER REVIEW SUMMARY
-- ============================================================================
-- fixed search_path        : pg_catalog, public on every function this
--                             migration adds or modifies (strengthened
--                             from `public` alone on approve_decision/
--                             reject_decision -- an intentional, reviewed
--                             change, not incidental; every other line in
--                             both functions is unchanged from the live
--                             body).
-- user-controlled dynamic SQL : none.
-- EXECUTE grants            : see "broad EXECUTE grants" above.
-- auth.uid() required        : approve_decision/reject_decision require
--                             it unconditionally (unchanged).
--                             create_predecided_decision permits
--                             auth.uid() IS NULL specifically for
--                             service_role calls, which have no JWT by
--                             construction -- this is not a bypass of the
--                             per-user role check, it is the absence of a
--                             user to check a role for, matching this
--                             repository's own established
--                             service_role-bypasses-RLS convention.
-- organization from locked row : approve_decision/reject_decision derive
--                             v_org_id from the SELECT ... FOR UPDATE,
--                             never from a caller-supplied parameter
--                             (unchanged). create_predecided_decision
--                             necessarily accepts organization_id as a
--                             parameter (there is no existing row to lock
--                             for a brand-new record) but validates
--                             caller membership against it before
--                             inserting, for authenticated callers.
-- atomic conditional transition : SELECT ... FOR UPDATE +
--                             status-precondition check, unchanged.
-- database-generated decided_by/decided_at : unchanged in
--                             approve_decision/reject_decision (auth.uid(),
--                             now()). create_predecided_decision accepts
--                             decided_by as an explicit backend-supplied
--                             parameter (this is a service-role/backend
--                             trust boundary, not a browser one -- see
--                             design report) and always computes
--                             decided_at as now() server-side, never
--                             caller-supplied.
-- atomic audit insert        : unchanged in approve_decision/
--                             reject_decision. create_predecided_decision
--                             adds its own audit_log insert in the same
--                             transaction as its INSERT.
-- execution-plan/outcome behavior : unchanged.
-- ============================================================================

-- ============================================================================
-- POST-MIGRATION VERIFICATION (run manually AFTER applying; NOT executed
-- automatically)
-- ============================================================================
--
-- 1. Constraints present and (once validated) valid:
--
--      SELECT conname, convalidated FROM pg_constraint
--      WHERE conrelid = 'public.decision_ledger'::regclass
--        AND conname IN ('decision_ledger_decision_status_check',
--                         'decision_ledger_execution_status_check',
--                         'decision_ledger_audit_source_check');
--
-- 2. New trigger present, enabled, and every pre-existing trigger still
--    enabled and unmodified:
--
--      SELECT tgname, tgenabled FROM pg_trigger
--      WHERE tgrelid = 'public.decision_ledger'::regclass AND NOT tgisinternal
--      ORDER BY tgname;
--      -- Expected: all four, tgenabled = 'O' (enabled).
--
-- 3. Row counts on decision_ledger unchanged (this migration adds
--    columns/constraints/functions, it never inserts, deletes, or
--    updates a single existing row):
--
--      SELECT count(*) FROM public.decision_ledger;
--      -- Compare against a pre-migration count captured separately.
--
-- 4. No pre-existing row's updated_at changed (confirms Step 2's
--    metadata-only column addition did not touch any row -- unlike the
--    superseded 20260719130000 proposal, there is no backfill statement
--    here to have caused this in the first place, but verify anyway):
--
--      SELECT count(*) FROM public.decision_ledger
--      WHERE updated_at > '<migration start timestamp>';
--      -- Expected: 0.
--
-- 5. Legacy provenance breakdown (informational, matches preflight query 2):
--
--      SELECT decided_by IS NULL AS decided_by_is_null, count(*)
--      FROM public.decision_ledger
--      WHERE decision_audit_source = 'legacy' AND decision_status IN ('approved','rejected')
--      GROUP BY 1;
--
-- 6. intelligence_memory / aicis_intelligence_items untouched (confirms
--    trg_intel_writeback_on_decision_resolved never fired -- this
--    migration performs zero UPDATEs to decision_ledger):
--
--      SELECT count(*) FROM public.intelligence_memory
--      WHERE recorded_at > '<migration start timestamp>';
--      -- Expected: 0 new rows attributable to this migration.
-- ============================================================================

-- ============================================================================
-- DIRECT-UPDATE BYPASS TESTS (manual, run in a transaction, ROLLBACK)
-- ============================================================================
--
-- BEGIN;
-- UPDATE public.decision_ledger
-- SET decision_status = 'approved', decided_at = now(), decided_by = auth.uid()
-- WHERE id = '<real pending decision id>' AND organization_id = '<real org id>';
-- -- Expected: ERROR, insufficient_privilege.
-- ROLLBACK;
--
-- BEGIN;
-- UPDATE public.decision_ledger SET decision_status = 'rejected'
-- WHERE id = '<real pending decision id>' AND organization_id = '<real org id>';
-- -- Expected: ERROR, same reason.
-- ROLLBACK;
--
-- BEGIN;
-- UPDATE public.decision_ledger SET decision_status = 'executable'
-- WHERE id = '<real pending decision id>' AND organization_id = '<real org id>';
-- -- Expected: ERROR (deny-by-default covers this transition too, even
-- -- though no current application code attempts it).
-- ROLLBACK;
--
-- BEGIN;
-- UPDATE public.decision_ledger SET decision_status = 'dismissed'
-- WHERE id = '<real pending decision id>' AND organization_id = '<real org id>';
-- -- Expected: ERROR.
-- ROLLBACK;
--
-- BEGIN;
-- -- Unrelated-field updates by an owner/admin must NOT be blocked:
-- UPDATE public.decision_ledger SET notes = 'test note, not a status change'
-- WHERE id = '<real decision id>' AND organization_id = '<real org id>';
-- -- Expected: succeeds.
-- ROLLBACK;
--
-- BEGIN;
-- -- execution_status progression (Start/Complete buttons) must NOT be blocked:
-- UPDATE public.decision_ledger
-- SET execution_status = 'in_progress', execution_started_at = now()
-- WHERE id = '<real approved decision id>' AND organization_id = '<real org id>'
--   AND execution_status = 'not_started';
-- -- Expected: succeeds.
-- ROLLBACK;
-- ============================================================================

-- ============================================================================
-- TERMINAL-STATUS INSERT BYPASS TESTS (manual, run in a transaction, ROLLBACK)
-- ============================================================================
--
-- BEGIN;
-- -- Ordinary owner/admin attempts to directly INSERT an already-approved
-- -- decision (the exact bypass Codex identified):
-- INSERT INTO public.decision_ledger (organization_id, recommended_action, decision_status, decided_by, decided_at)
-- VALUES ('<real org id>', 'test', 'approved', auth.uid(), now());
-- -- Expected: ERROR, insufficient_privilege.
-- ROLLBACK;
--
-- BEGIN;
-- -- Ordinary INSERT with decision_status = 'pending' (the default,
-- -- legitimate path) must still work:
-- INSERT INTO public.decision_ledger (organization_id, recommended_action, decision_status)
-- VALUES ('<real org id>', 'test', 'pending');
-- -- Expected: succeeds.
-- ROLLBACK;
--
-- BEGIN;
-- -- The sanctioned trusted-insert path:
-- SELECT public.create_predecided_decision('<real org id>', 'approved', 'Seeded demo decision');
-- -- Expected (as service_role): succeeds, returns a uuid. As an
-- -- authenticated owner/admin: also succeeds (role check passes). As an
-- -- authenticated ordinary member: see unauthorized-role tests below.
-- SELECT decision_status, decision_audit_source, decided_at FROM public.decision_ledger
-- WHERE id = '<returned id>';
-- -- Expected: decision_status = 'approved', decision_audit_source = 'rpc',
-- -- decided_at IS NOT NULL (database-generated).
-- ROLLBACK;
-- ============================================================================

-- ============================================================================
-- RPC SUCCESS TESTS (manual, run in a transaction, ROLLBACK)
-- ============================================================================
--
-- BEGIN;
-- SELECT public.approve_decision('<real pending decision id>');
-- SELECT decision_status, decision_audit_source FROM public.decision_ledger
-- WHERE id = '<same decision id>';
-- -- Expected: decision_status = 'approved', decision_audit_source = 'rpc'.
-- SELECT count(*) FROM public.audit_log
-- WHERE resource_id = '<same decision id>' AND action_type = 'decision_approved';
-- -- Expected: 1 (confirms the RPC path is NOT blocked by the new
-- -- trigger -- set_config must be visible to the trigger inside the same
-- -- function/transaction).
-- ROLLBACK;
--
-- BEGIN;
-- SELECT public.reject_decision('<another real pending decision id>', 'test rejection');
-- -- Expected: succeeds, decision_status = 'rejected', decision_audit_source = 'rpc'.
-- ROLLBACK;
-- ============================================================================

-- ============================================================================
-- CONNECTION-POOL / TRANSACTION-LEAKAGE TESTS (manual)
-- ============================================================================
--
-- 1. Same-transaction, cross-statement leak check:
--
--      BEGIN;
--      SELECT public.approve_decision('<real pending decision id A>');
--      UPDATE public.decision_ledger SET decision_status = 'rejected'
--      WHERE id = '<a DIFFERENT, still-pending decision id B>';
--      -- Expected: the second statement ERRORs even though it is in the
--      -- same transaction as a successful RPC call immediately before it.
--      ROLLBACK;
--
-- 2. Cross-connection leak check (open two separate sessions):
--
--      -- Session 1:
--      SELECT public.approve_decision('<real pending decision id C>');
--
--      -- Session 2 (a fresh connection):
--      SELECT pg_catalog.current_setting('quantivis.internal.decision_transition_authorized', true);
--      -- Expected: NULL/empty.
--      BEGIN;
--      UPDATE public.decision_ledger SET decision_status = 'approved'
--      WHERE id = '<real pending decision id D>';
--      -- Expected: ERROR.
--      ROLLBACK;
--
-- 3. Failed-RPC-clears-the-flag check (a precondition failure that occurs
--    before set_config is ever called in that invocation, then confirm
--    no leak from it regardless):
--
--      BEGIN;
--      SELECT public.approve_decision('<an ALREADY approved/rejected decision id>');
--      -- Expected: ERROR, check_violation ("must be pending") -- fails
--      -- before reaching the set_config call in this function body.
--      UPDATE public.decision_ledger SET decision_status = 'approved'
--      WHERE id = '<a different, still-pending decision id>';
--      -- Expected: ERROR -- confirms the failed call left no trusted
--      -- state behind (is_local=true is rolled back with the aborted
--      -- statement/transaction regardless of where the function failed).
--      ROLLBACK;
-- ============================================================================

-- ============================================================================
-- UNAUTHORISED-ROLE TESTS (manual -- requires impersonating a non-
-- owner/admin org member)
-- ============================================================================
--
-- SET LOCAL ROLE authenticated;
-- SET LOCAL request.jwt.claims = '{"sub": "<a real MEMBER, not owner/admin, user id>"}';
-- BEGIN;
-- SELECT public.approve_decision('<real pending decision in that member''s org>');
-- -- Expected: ERROR, insufficient_privilege (unchanged from current
-- -- behavior).
-- ROLLBACK;
--
-- BEGIN;
-- SELECT public.create_predecided_decision('<that member''s org id>', 'approved', 'test');
-- -- Expected: ERROR, insufficient_privilege (create_predecided_decision
-- -- is granted only to service_role, so an ordinary authenticated
-- -- session cannot even reach the function -- but if EXECUTE were ever
-- -- extended to authenticated, the internal role check must still
-- -- reject this).
-- ROLLBACK;
--
-- BEGIN;
-- UPDATE public.decision_ledger SET decision_status = 'approved'
-- WHERE id = '<real pending decision in that member''s org>';
-- -- Expected: ERROR either way -- pre-existing RLS should already block
-- -- a non-owner/admin UPDATE, and this migration's trigger blocks it
-- -- unconditionally regardless of RLS configuration, as defense in depth.
-- ROLLBACK;
-- ============================================================================

-- ============================================================================
-- LEGACY-ROW COMPATIBILITY TESTS (manual, read-only unless noted)
-- ============================================================================
--
-- 1. Legacy rows still satisfy the new CHECK constraints:
--
--      SELECT count(*) FROM public.decision_ledger
--      WHERE decision_status NOT IN ('pending','approved','rejected','dismissed','executable','executed');
--      -- Expected: 0 (must be 0 before VALIDATE CONSTRAINT will succeed).
--
-- 2. Legacy rows report decision_audit_source = 'legacy' via the column
--    default, with no decided_by/decided_at fabrication:
--
--      SELECT count(*) FROM public.decision_ledger
--      WHERE decision_audit_source = 'legacy' AND decision_status IN ('approved','rejected');
--      -- Expected: matches the total approved+rejected row count from
--      -- before this migration (every one of them is 'legacy', since
--      -- none went through approve_decision/reject_decision/
--      -- create_predecided_decision before this migration existed).
--
-- 3. A legacy row can still have unrelated fields updated by an
--    owner/admin without being forced through any new RPC:
--
--      BEGIN;
--      UPDATE public.decision_ledger SET notes = 'legacy row, unrelated edit'
--      WHERE decision_audit_source = 'legacy' AND decision_status = 'approved'
--      LIMIT 1... -- (use a real id in practice; UPDATE has no LIMIT)
--      -- Expected: succeeds.
--      ROLLBACK;
-- ============================================================================
