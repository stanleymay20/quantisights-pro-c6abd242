CREATE OR REPLACE FUNCTION public.handle_subscription_tier_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Provision AICIS for any active/trialing subscription on Growth or Enterprise.
  -- Starter intentionally excluded (CSV-only tier).
  IF NEW.organization_id IS NOT NULL
     AND NEW.status IN ('active', 'trialing')
     AND lower(COALESCE(NEW.tier, '')) IN ('growth', 'enterprise')
  THEN
    PERFORM public.provision_aicis_for_org(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$function$;