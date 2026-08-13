
-- Replace dead-code service_role policies with explicit deny-all for client roles.
-- Service role bypasses RLS regardless, so explicit deny makes intent clear and
-- prevents accidental future grants of access.

-- email_send_state: replace dead-code policy with explicit deny-all
DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Deny all client access to email_send_state"
  ON public.email_send_state
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- trust_metrics_snapshots: add explicit deny-all SELECT for client roles
-- (existing service_role SELECT policy is redundant but harmless; keep explicit deny)
CREATE POLICY "Deny client SELECT on trust_metrics_snapshots"
  ON public.trust_metrics_snapshots
  FOR SELECT
  TO authenticated, anon
  USING (false);

CREATE POLICY "Deny client INSERT on trust_metrics_snapshots"
  ON public.trust_metrics_snapshots
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

-- auth_rate_limits: add explicit deny-all for client roles to document intent.
-- This table is service-role-only (written by edge functions / auth-rate-limiter).
CREATE POLICY "Deny all client access to auth_rate_limits"
  ON public.auth_rate_limits
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);
