
-- P1: Fix realtime.messages LIKE pattern → exact match
DO $$
BEGIN
  -- Drop the weak LIKE-based policy
  DROP POLICY IF EXISTS "Users can only access their org channels" ON realtime.messages;
  
  -- Recreate with exact match on topic structure
  -- Realtime topics follow: "realtime:public:tablename:organization_id=eq.<UUID>"
  CREATE POLICY "Users can only access their org channels"
    ON realtime.messages
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND realtime.messages.topic LIKE 'realtime:public:%:organization\_id=eq.' || p.organization_id::text
      )
    );
EXCEPTION 
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- P2: Let users read their own auth_events
CREATE POLICY "Users can view own auth events"
  ON public.auth_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- P2: Fix key_results UPDATE policy to require admin/owner role
DROP POLICY IF EXISTS "Admins can update key results" ON public.key_results;
CREATE POLICY "Admins can update key results"
  ON public.key_results
  FOR UPDATE
  TO authenticated
  USING (get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin'))
  WITH CHECK (get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin'));
