
-- ========== 1. Subscription grace period & failure tracking ==========
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grace_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_interval text DEFAULT 'month' CHECK (billing_interval IN ('month','year'));

CREATE INDEX IF NOT EXISTS idx_subscriptions_grace ON public.subscriptions(grace_period_end) WHERE grace_period_end IS NOT NULL;

-- ========== 2. Tier feature matrix ==========
CREATE TABLE IF NOT EXISTS public.tier_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier text NOT NULL,
  feature_key text NOT NULL,
  is_allowed boolean NOT NULL DEFAULT false,
  quota_limit integer,
  quota_period text DEFAULT 'month' CHECK (quota_period IN ('day','month','year','total')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier, feature_key)
);

ALTER TABLE public.tier_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read tier features"
  ON public.tier_features FOR SELECT
  TO authenticated
  USING (true);

-- Seed feature matrix
INSERT INTO public.tier_features (tier, feature_key, is_allowed, quota_limit, quota_period) VALUES
  -- Starter
  ('starter', 'dashboard', true, NULL, 'month'),
  ('starter', 'datasets', true, 5, 'total'),
  ('starter', 'copilot', true, 50, 'month'),
  ('starter', 'simulations', false, 0, 'month'),
  ('starter', 'advisory', false, 0, 'month'),
  ('starter', 'boardExport', false, 0, 'month'),
  ('starter', 'sso', false, 0, 'month'),
  -- Growth
  ('growth', 'dashboard', true, NULL, 'month'),
  ('growth', 'datasets', true, 50, 'total'),
  ('growth', 'copilot', true, 500, 'month'),
  ('growth', 'simulations', true, 100, 'month'),
  ('growth', 'advisory', true, NULL, 'month'),
  ('growth', 'boardExport', true, 20, 'month'),
  ('growth', 'forecasting', true, NULL, 'month'),
  ('growth', 'anomalyDetection', true, NULL, 'month'),
  ('growth', 'apiIntegrations', true, NULL, 'month'),
  ('growth', 'sso', false, 0, 'month'),
  -- Enterprise
  ('enterprise', 'dashboard', true, NULL, 'month'),
  ('enterprise', 'datasets', true, NULL, 'total'),
  ('enterprise', 'copilot', true, NULL, 'month'),
  ('enterprise', 'simulations', true, NULL, 'month'),
  ('enterprise', 'advisory', true, NULL, 'month'),
  ('enterprise', 'boardExport', true, NULL, 'month'),
  ('enterprise', 'forecasting', true, NULL, 'month'),
  ('enterprise', 'anomalyDetection', true, NULL, 'month'),
  ('enterprise', 'apiIntegrations', true, NULL, 'month'),
  ('enterprise', 'sso', true, NULL, 'month'),
  ('enterprise', 'biasDetection', true, NULL, 'month'),
  ('enterprise', 'commandCenter', true, NULL, 'month'),
  ('enterprise', 'multiOrg', true, NULL, 'month')
ON CONFLICT (tier, feature_key) DO UPDATE SET
  is_allowed = EXCLUDED.is_allowed,
  quota_limit = EXCLUDED.quota_limit;

-- ========== 3. check_feature_access RPC ==========
CREATE OR REPLACE FUNCTION public.check_feature_access(
  _org_id uuid,
  _feature_key text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub record;
  _feat record;
  _now timestamptz := now();
  _effective_tier text;
  _is_demo boolean := false;
BEGIN
  -- Active or trialing or in grace period
  SELECT tier, status, current_period_end, grace_period_end, payment_failed_at, is_trial, trial_end
  INTO _sub
  FROM public.subscriptions
  WHERE organization_id = _org_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF _sub IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_subscription',
      'message', 'No active subscription for this organization'
    );
  END IF;

  -- Determine effective tier
  IF _sub.status = 'active' OR _sub.status = 'trialing' THEN
    _effective_tier := _sub.tier;
  ELSIF _sub.grace_period_end IS NOT NULL AND _sub.grace_period_end > _now THEN
    _effective_tier := _sub.tier; -- grace period preserves tier
  ELSE
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'subscription_inactive',
      'status', _sub.status,
      'message', 'Subscription is no longer active'
    );
  END IF;

  -- Look up feature
  SELECT is_allowed, quota_limit, quota_period
  INTO _feat
  FROM public.tier_features
  WHERE tier = _effective_tier AND feature_key = _feature_key;

  IF _feat IS NULL THEN
    -- Unknown feature → allow by default (legacy compat)
    RETURN jsonb_build_object(
      'allowed', true,
      'tier', _effective_tier,
      'reason', 'feature_not_listed'
    );
  END IF;

  IF NOT _feat.is_allowed THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'tier_insufficient',
      'tier', _effective_tier,
      'feature', _feature_key,
      'message', 'Your current tier does not include ' || _feature_key
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'tier', _effective_tier,
    'feature', _feature_key,
    'quota_limit', _feat.quota_limit,
    'in_grace_period', (_sub.grace_period_end IS NOT NULL AND _sub.grace_period_end > _now AND _sub.status NOT IN ('active','trialing'))
  );
END;
$$;

-- ========== 4. External data sources registry (AICIS etc.) ==========
CREATE TABLE IF NOT EXISTS public.external_data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  vendor_key text NOT NULL,
  vendor_name text NOT NULL,
  category text NOT NULL DEFAULT 'macro',
  endpoint_url text,
  refresh_interval_hours integer NOT NULL DEFAULT 24,
  last_refreshed_at timestamptz,
  next_refresh_at timestamptz,
  license_type text DEFAULT 'public',
  license_url text,
  trust_level integer NOT NULL DEFAULT 70 CHECK (trust_level BETWEEN 0 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, vendor_key)
);

CREATE INDEX IF NOT EXISTS idx_external_data_sources_org ON public.external_data_sources(organization_id);
CREATE INDEX IF NOT EXISTS idx_external_data_sources_next_refresh ON public.external_data_sources(next_refresh_at) WHERE is_active = true;

ALTER TABLE public.external_data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view external data sources"
  ON public.external_data_sources FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org admins can insert external data sources"
  ON public.external_data_sources FOR INSERT
  TO authenticated
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));

CREATE POLICY "Org admins can update external data sources"
  ON public.external_data_sources FOR UPDATE
  TO authenticated
  USING (public.exec_require_elevated_role(auth.uid(), organization_id));

CREATE POLICY "Org admins can delete external data sources"
  ON public.external_data_sources FOR DELETE
  TO authenticated
  USING (public.exec_require_elevated_role(auth.uid(), organization_id));

CREATE TRIGGER trg_external_data_sources_updated_at
  BEFORE UPDATE ON public.external_data_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== 5. Enterprise leads table ==========
CREATE TABLE IF NOT EXISTS public.enterprise_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  work_email text NOT NULL,
  company text NOT NULL,
  company_size text,
  use_case text,
  estimated_seats integer,
  source text DEFAULT 'web',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','closed_won','closed_lost')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.enterprise_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit enterprise leads"
  ON public.enterprise_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Service role manages enterprise leads"
  ON public.enterprise_leads FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_enterprise_leads_updated_at
  BEFORE UPDATE ON public.enterprise_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
