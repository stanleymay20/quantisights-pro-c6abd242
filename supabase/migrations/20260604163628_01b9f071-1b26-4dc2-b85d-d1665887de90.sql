
-- 1) enterprise_leads: restrict reads to service_role only
DROP POLICY IF EXISTS "Service role manages enterprise leads" ON public.enterprise_leads;
CREATE POLICY "Service role reads enterprise leads"
  ON public.enterprise_leads
  FOR SELECT
  TO service_role
  USING (true);

-- 2) internal_reference_data: use authoritative is_org_member
DROP POLICY IF EXISTS "Members read own + global reference data" ON public.internal_reference_data;
CREATE POLICY "Members read own + global reference data"
  ON public.internal_reference_data
  FOR SELECT
  USING (
    (organization_id IS NULL)
    OR public.is_org_member(auth.uid(), organization_id)
  );

-- 3) trust_metrics_snapshots: restrict reads to service_role only
DROP POLICY IF EXISTS "Trust snapshots readable by org members" ON public.trust_metrics_snapshots;
CREATE POLICY "Service role reads trust snapshots"
  ON public.trust_metrics_snapshots
  FOR SELECT
  TO service_role
  USING (true);

-- 4) Pin search_path on pgmq helper functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = pgmq, public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = pgmq, public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = pgmq, public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = pgmq, public;
