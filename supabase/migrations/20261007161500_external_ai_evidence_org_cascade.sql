-- External AI evidence is immutable during normal operation, but deleting the
-- owning organization must still be possible. Because credentials and evidence
-- also reference ai_systems, independent FK cascades could otherwise encounter
-- RESTRICT edges in an unsafe order.
--
-- Solve that at the organization boundary: a BEFORE DELETE trigger removes the
-- external-AI subtree in dependency order (evidence -> credentials -> systems)
-- inside the same PostgreSQL statement/transaction. If organization deletion
-- later fails for any other reason, PostgreSQL rolls these child deletions back
-- with it.

CREATE OR REPLACE FUNCTION public.prevent_external_ai_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_purge_org text;
BEGIN
  v_purge_org := current_setting('quantivis.external_ai_purge_org', true);

  IF TG_OP = 'DELETE'
     AND v_purge_org IS NOT NULL
     AND v_purge_org = OLD.organization_id::text
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'external_ai_decision_evidence is append-only';
END;
$$;

COMMENT ON FUNCTION public.prevent_external_ai_evidence_mutation() IS
  'Blocks direct UPDATE/DELETE of external AI evidence. Deletion is permitted only inside the owning-organization erasure transaction.';

CREATE OR REPLACE FUNCTION public.cleanup_external_ai_for_organization_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Transaction-local and scoped to this exact organization. The evidence
  -- mutation guard accepts only rows for this org while cleanup is running.
  PERFORM set_config('quantivis.external_ai_purge_org', OLD.id::text, true);

  DELETE FROM public.external_ai_decision_evidence
  WHERE organization_id = OLD.id;

  DELETE FROM public.ai_system_credentials
  WHERE organization_id = OLD.id;

  DELETE FROM public.ai_systems
  WHERE organization_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_external_ai_before_organization_delete
  ON public.organizations;
CREATE TRIGGER cleanup_external_ai_before_organization_delete
  BEFORE DELETE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_external_ai_for_organization_delete();

REVOKE ALL ON FUNCTION public.cleanup_external_ai_for_organization_delete() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.cleanup_external_ai_for_organization_delete() IS
  'Internal organization-delete trigger. Removes external AI evidence, credentials, and registry rows in dependency order inside the parent delete transaction.';
