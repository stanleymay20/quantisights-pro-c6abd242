-- P0 FIX: Enable RLS on webauthn_challenges (currently DISABLED)
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- P0 FIX: Enable RLS on webauthn_credentials (currently DISABLED)
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- Policies already exist from prior migration but RLS was not enabled.
-- Verify existing policies are in place (they are: "Users manage own challenges" and "Users manage own webauthn credentials")
-- No new policies needed - the existing ALL policies with user_id = auth.uid() are correct.

-- NOTE: Do not ALTER or CREATE POLICY on realtime.messages from application migrations.
-- realtime.messages is a Supabase-managed table and production projects may restrict
-- ownership to the Realtime service role. PostgreSQL Realtime (postgres_changes)
-- authorization for Quantivis remains enforced by RLS on the underlying public tables.
-- If private Broadcast/Presence channels are introduced, configure their supported
-- Realtime Authorization policies separately using realtime.topic() and validate them
-- with a live tenant-isolation certification before enabling those channels.
