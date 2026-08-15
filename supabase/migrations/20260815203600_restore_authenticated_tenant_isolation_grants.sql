-- Restore explicit authenticated-role privileges for the tenant-isolation
-- surfaces on freshly provisioned Supabase projects.
--
-- RLS policies are already enabled on both tables and remain the authorization
-- boundary. PostgreSQL table privileges must allow the authenticated role to
-- reach those policies; otherwise legitimate own-tenant requests fail with
-- 42501 before RLS is evaluated.

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.decision_ledger
  TO authenticated;

-- audit_log is append-only for application users. Authenticated users only
-- receive the read privilege required by its existing owner/admin RLS policy.
GRANT SELECT
  ON TABLE public.audit_log
  TO authenticated;
