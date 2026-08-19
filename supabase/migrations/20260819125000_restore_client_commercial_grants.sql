-- Restore the table privileges required by the public demo-request flow and
-- authenticated subscription gating. RLS remains authoritative for row access.
--
-- Client acceptance proved both RLS policies existed but their matching table
-- privileges had been revoked, causing public lead submission to fail and paid
-- customers to be misclassified as unsubscribed/pilot users.

GRANT INSERT
ON TABLE public.enterprise_leads
TO anon, authenticated;

GRANT SELECT
ON TABLE public.subscriptions
TO authenticated;

-- Paid feature entitlements are needed by every member of the organization,
-- not only billing administrators. This policy exposes only the organization's
-- own subscription row; mutation remains service-side/admin-controlled.
DROP POLICY IF EXISTS "Org admins can view subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Org members can view subscription" ON public.subscriptions;
CREATE POLICY "Org members can view subscription"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));
