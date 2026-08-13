-- Fail closed for function execution in the exposed public schema.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. That made
-- several SECURITY DEFINER helpers callable as anon even though their defining
-- migrations only named authenticated/service_role grants.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE
  function_signature text;
BEGIN
  FOR function_signature IN
    SELECT format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    )
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      function_signature
    );
  END LOOP;
END
$$;

-- These three RPCs intentionally expose already-public, read-only evidence.
-- SECURITY INVOKER preserves their public API without bypassing table grants
-- or RLS policies.
ALTER FUNCTION public.get_latest_trust_metrics() SECURITY INVOKER;
ALTER FUNCTION public.get_active_subprocessors() SECURITY INVOKER;
ALTER FUNCTION public.get_procurement_readiness() SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION public.get_latest_trust_metrics()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_active_subprocessors()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_procurement_readiness()
  TO anon, authenticated, service_role;

-- Tenant-scoped privileged RPCs are never anonymous. Keep their existing
-- authenticated contracts explicit after removing the inherited PUBLIC grant.
GRANT EXECUTE ON FUNCTION public.count_measured_outcomes(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_active_governance_profile(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_cron_health(text[])
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_iq_composite_score(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_org_security_settings()
  TO authenticated, service_role;

-- Trigger functions must only be invoked by their triggers, never through the
-- Data API by a client role.
REVOKE EXECUTE ON FUNCTION public.create_default_governance_profile()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_decision_approval_gate()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intel_writeback_on_decision_resolved()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intv_writeback_learning()
  FROM PUBLIC, anon, authenticated;
