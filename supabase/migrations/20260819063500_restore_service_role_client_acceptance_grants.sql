-- Restore only the service_role DML privileges required by the staging
-- client-acceptance fixture lifecycle.
--
-- The August privilege hardening made trusted staging setup/teardown fail with
-- `permission denied` on subscriptions and enterprise_leads. RLS bypass alone
-- does not grant table privileges. These grants are intentionally limited to
-- service_role; anon/authenticated privileges and RLS policies are unchanged.
--
-- subscriptions is written by trusted billing/server code and by the disposable
-- paid-tier acceptance fixture. enterprise_leads is inserted publicly through
-- its existing RLS policy, but acceptance teardown needs trusted DELETE so a
-- synthetic lead cannot be left behind.

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.subscriptions
  TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.enterprise_leads
  TO service_role;
