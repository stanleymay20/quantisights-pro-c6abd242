-- P0 FIX: Enable RLS on webauthn_challenges (currently DISABLED)
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- P0 FIX: Enable RLS on webauthn_credentials (currently DISABLED)
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- Policies already exist from prior migration but RLS was not enabled.
-- Verify existing policies are in place (they are: "Users manage own challenges" and "Users manage own webauthn credentials")
-- No new policies needed - the existing ALL policies with user_id = auth.uid() are correct.

-- P1 FIX: Realtime channel authorization
-- Add policy to realtime.messages so users can only subscribe to org-scoped channels
-- This prevents cross-org data leakage via Realtime subscriptions
DO $$
BEGIN
  -- Enable RLS only if we own the table (older projects)
  BEGIN
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  -- Create policy restricting channel subscriptions
  CREATE POLICY "Users can only access their org channels"
    ON realtime.messages
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND realtime.messages.extension::text
              LIKE '%' || p.organization_id::text || '%'
      )
    );

EXCEPTION
  WHEN duplicate_object THEN
    NULL;  -- Policy already exists
  WHEN undefined_table THEN
    NULL;  -- realtime.messages doesn't exist in this environment
  WHEN insufficient_privilege THEN
    NULL;  -- Cannot modify Supabase-managed realtime table
END $$;