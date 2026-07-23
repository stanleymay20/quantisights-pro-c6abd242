DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can only access their org channels" ON realtime.messages;

  CREATE POLICY "Users can only access their org channels"
    ON realtime.messages
    FOR SELECT
    TO authenticated
    USING (
      -- Org-scoped topics: user must be a member of the organization
      EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND realtime.messages.topic ~ (
            '^realtime:public:[a-zA-Z0-9_]+:organization_id=eq\.' || om.organization_id::text || '$'
          )
      )
      -- Workspace-scoped topics: user must be a member of the workspace
      OR EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.user_id = auth.uid()
          AND realtime.messages.topic ~ (
            '^realtime:public:[a-zA-Z0-9_]+:workspace_id=eq\.' || wm.workspace_id::text || '$'
          )
      )
    );
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;