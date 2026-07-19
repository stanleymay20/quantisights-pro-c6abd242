-- 1) GDPR requests: drop overly-broad admin policies (admin role is global, not org-scoped).
--    Service role bypasses RLS, so backend tooling/edge functions continue to work.
DROP POLICY IF EXISTS "Admins may read GDPR requests" ON public.gdpr_requests;
DROP POLICY IF EXISTS "Admins may update GDPR requests" ON public.gdpr_requests;

-- 2) Realtime channel policy: replace permissive LIKE with anchored regex match.
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can only access their org channels" ON realtime.messages;

  CREATE POLICY "Users can only access their org channels"
    ON realtime.messages
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND realtime.messages.topic ~ (
            '^realtime:public:[a-zA-Z0-9_]+:organization_id=eq\.' || om.organization_id::text || '$'
          )
      )
    );
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;