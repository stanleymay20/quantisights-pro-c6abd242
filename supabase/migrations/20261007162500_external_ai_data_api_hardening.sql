-- Supabase is moving existing projects to explicit Data API exposure by
-- 2026-10-30. Make this feature's access model explicit now, and prevent
-- authenticated clients from bypassing the audited registry Edge Function.

-- Registry rows are readable by organization members but are not directly
-- writable through PostgREST. All writes go through ai-system-registry, which
-- enforces admin/owner authorization and audit/credential invariants.
DROP POLICY IF EXISTS "Admins owners can create AI systems" ON public.ai_systems;
DROP POLICY IF EXISTS "Admins owners can update AI systems" ON public.ai_systems;
DROP POLICY IF EXISTS "Org members can view AI systems" ON public.ai_systems;
CREATE POLICY "Org members can view AI systems"
  ON public.ai_systems FOR SELECT
  TO authenticated
  USING (public.is_org_member((select auth.uid()), organization_id));

REVOKE ALL ON TABLE public.ai_systems FROM anon, authenticated;
GRANT SELECT ON TABLE public.ai_systems TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_systems TO service_role;

-- Credential digests are never exposed to browser/user sessions. The registry
-- and intake Edge Functions use the service role server-side.
REVOKE ALL ON TABLE public.ai_system_credentials FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_system_credentials TO service_role;

-- Evidence is user-readable inside the owning tenant and otherwise immutable
-- from the Data API. Inserts happen only inside the service-role ingest RPC.
DROP POLICY IF EXISTS "Org members can view external AI evidence" ON public.external_ai_decision_evidence;
CREATE POLICY "Org members can view external AI evidence"
  ON public.external_ai_decision_evidence FOR SELECT
  TO authenticated
  USING (public.is_org_member((select auth.uid()), organization_id));

REVOKE ALL ON TABLE public.external_ai_decision_evidence FROM anon, authenticated;
GRANT SELECT ON TABLE public.external_ai_decision_evidence TO authenticated;
GRANT SELECT ON TABLE public.external_ai_decision_evidence TO service_role;
