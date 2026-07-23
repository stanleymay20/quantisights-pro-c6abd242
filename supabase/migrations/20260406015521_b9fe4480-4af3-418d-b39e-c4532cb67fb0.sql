-- This migration exists solely to trigger a TypeScript types regeneration.
-- The following tables already exist in the database but are not reflected
-- in the auto-generated types file:
--   sso_configs, webauthn_credentials, scim_tokens, connector_configs,
--   metric_mappings, sync_schedules, governance_maturity_assessments
-- And the RPC: resolve_sso_for_email
--
-- Adding a harmless comment column remark to force schema change detection.

COMMENT ON TABLE public.sso_configs IS 'Enterprise SSO/SAML configuration per organization';
COMMENT ON TABLE public.webauthn_credentials IS 'WebAuthn/FIDO2 passkey credentials per user';
COMMENT ON TABLE public.scim_tokens IS 'SCIM 2.0 provisioning bearer tokens per organization';
COMMENT ON TABLE public.connector_configs IS 'Database connector configurations for data ingestion';
COMMENT ON TABLE public.metric_mappings IS 'Column-to-metric mappings for connected data sources';
COMMENT ON TABLE public.sync_schedules IS 'Scheduled sync configurations for data connectors';
COMMENT ON TABLE public.governance_maturity_assessments IS 'Governance maturity assessment results per organization';