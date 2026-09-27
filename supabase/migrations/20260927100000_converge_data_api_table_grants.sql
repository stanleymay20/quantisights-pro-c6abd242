-- Converge Data API table grants across Supabase projects.
--
-- Production carries Supabase's broad default privileges, which grant table
-- privileges to the API roles implicitly. Staging was provisioned without
-- those implicit grants, so a clean replay of this repository left
-- `authenticated` able to read only a fraction of public tables and made
-- staging diverge from production. Every public table has row-level security
-- enabled, so access is still decided by RLS policies; these grants only make
-- the privilege layer explicit and identical in every environment.
--
-- `anon` is intentionally NOT granted anything here. Anonymous access remains
-- limited to whatever earlier migrations granted explicitly.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
