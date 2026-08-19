-- Restore the trusted service_role privilege required by staging client
-- acceptance to resolve the canonical organization created by the signup
-- trigger.
--
-- The acceptance fixture reads only profiles.organization_id for the freshly
-- created disposable user. RLS bypass does not itself grant table privileges,
-- so a revoked table grant causes `permission denied for table profiles` even
-- when using the service-role key.
--
-- Keep this grant intentionally narrow. No privileges are added for anon or
-- authenticated users, and no RLS policy is changed or disabled.

GRANT SELECT
  ON TABLE public.profiles
  TO service_role;
