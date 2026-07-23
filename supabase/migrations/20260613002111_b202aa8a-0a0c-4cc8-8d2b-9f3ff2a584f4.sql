
-- 1. Email tables
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Block direct reads" ON public.email_send_log
  FOR SELECT TO authenticated, anon USING (false);
CREATE POLICY "Block direct writes" ON public.email_send_log
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
CREATE POLICY "Block direct reads" ON public.email_unsubscribe_tokens
  FOR SELECT TO authenticated, anon USING (false);
CREATE POLICY "Block direct writes" ON public.email_unsubscribe_tokens
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Block direct reads" ON public.suppressed_emails
  FOR SELECT TO authenticated, anon USING (false);
CREATE POLICY "Block direct writes" ON public.suppressed_emails
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- 2. procurement_pack_versions: org owners or platform admins only
DROP POLICY IF EXISTS "Org members can view procurement packs" ON public.procurement_pack_versions;
CREATE POLICY "Org owners or admins can view procurement packs"
  ON public.procurement_pack_versions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role = 'owner'
    )
  );

-- 3. procurement_readiness_items: org owners or platform admins only
DROP POLICY IF EXISTS "procurement_readiness_items_read_authenticated" ON public.procurement_readiness_items;
CREATE POLICY "procurement_readiness_items_read_privileged"
  ON public.procurement_readiness_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role = 'owner'
    )
  );
