-- External AI evidence is immutable during normal operation, but organization
-- erasure must remain possible. The organization_id FK is ON DELETE CASCADE.
-- PostgreSQL executes that referential action from a parent trigger, so the
-- child BEFORE DELETE trigger runs at trigger depth > 1. Permit only that
-- cascade path; direct service-role UPDATE/DELETE remains blocked.
--
-- This is preferable to a separate purge RPC: if deleting the organization
-- fails because of any other constraint, PostgreSQL rolls the whole parent
-- DELETE statement back and the evidence rows remain intact.

CREATE OR REPLACE FUNCTION public.prevent_external_ai_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'external_ai_decision_evidence is append-only';
END;
$$;

COMMENT ON FUNCTION public.prevent_external_ai_evidence_mutation() IS
  'Blocks direct UPDATE/DELETE of external AI evidence. DELETE is allowed only when invoked by a nested FK cascade such as deletion of the owning organization.';
