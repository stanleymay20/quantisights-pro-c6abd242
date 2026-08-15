-- Enforce finite trial access at the server-side entitlement boundary.
-- Previously any row with status='trialing' remained entitled indefinitely,
-- even after trial_end had passed. This is especially important for the
-- no-card pilot, but also makes Stripe trial semantics fail closed.
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
BEGIN
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

  IF _sub.status = 'active' THEN
    _effective_tier := _sub.tier;
  ELSIF _sub.status = 'trialing' THEN
    IF _sub.trial_end IS NULL OR _sub.trial_end <= _now THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'trial_expired',
        'status', _sub.status,
        'trial_end', _sub.trial_end,
        'message', 'Trial or pilot access has expired'
      );
    END IF;
    _effective_tier := _sub.tier;
  ELSIF _sub.grace_period_end IS NOT NULL AND _sub.grace_period_end > _now THEN
    _effective_tier := _sub.tier;
  ELSE
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'subscription_inactive',
      'status', _sub.status,
      'message', 'Subscription is no longer active'
    );
  END IF;

  SELECT is_allowed, quota_limit, quota_period
  INTO _feat
  FROM public.tier_features
  WHERE tier = _effective_tier AND feature_key = _feature_key;

  IF _feat IS NULL THEN
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
