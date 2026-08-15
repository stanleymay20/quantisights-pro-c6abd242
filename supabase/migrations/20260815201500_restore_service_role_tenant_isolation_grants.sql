-- Restore explicit service_role privileges required by staging tenant-isolation
-- certification on newly provisioned Supabase projects.
--
-- Newer Supabase projects do not necessarily grant public-schema table access
-- to service_role by default. Replaying the historical schema into a fresh
-- staging project therefore leaves these pre-existing tenant tables without
-- the DML privileges that trusted server-side setup/teardown code requires.
-- Keep the grant narrow: only the four tables used by the tenant-isolation
-- fixture lifecycle are included here.

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.organizations
  TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.organization_members
  TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.decision_ledger
  TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.audit_log
  TO service_role;
