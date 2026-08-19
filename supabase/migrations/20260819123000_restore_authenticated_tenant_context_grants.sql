-- Restore the table privileges required by the authenticated tenant-context
-- code paths. RLS remains the authorization boundary for every row.
--
-- Staging client acceptance proved that authenticated users could sign in but
-- could not resolve their own profile/organization because table-level grants
-- had been removed while the scoped RLS policies remained in place. That left
-- the application in "No org / No workspace / Decision context" reduced mode
-- and made governed Decision Rooms unavailable for otherwise valid customers.

GRANT SELECT, INSERT, UPDATE
ON TABLE public.profiles
TO authenticated;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.organizations
TO authenticated;
