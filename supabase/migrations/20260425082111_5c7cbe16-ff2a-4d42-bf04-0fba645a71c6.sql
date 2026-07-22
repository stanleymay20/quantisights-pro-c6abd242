-- ─────────────────────────────────────────────────────────────────────────────
-- 1. external_sync_runs — audit log for every external source refresh
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.external_sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.external_data_sources(id) ON DELETE CASCADE,
  vendor_key text NOT NULL,
  trigger text NOT NULL DEFAULT 'manual',  -- manual | scheduled | service
  actor text,                                -- user:<uuid> | cron | service
  status text NOT NULL DEFAULT 'running',    -- running | success | error | partial
  rows_fetched integer NOT NULL DEFAULT 0,
  rows_upserted integer NOT NULL DEFAULT 0,
  pages_fetched integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer
);

CREATE INDEX IF NOT EXISTS idx_external_sync_runs_org_started
  ON public.external_sync_runs (organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_sync_runs_source
  ON public.external_sync_runs (source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_sync_runs_status
  ON public.external_sync_runs (status, started_at DESC);

ALTER TABLE public.external_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view sync runs" ON public.external_sync_runs;
CREATE POLICY "Org members can view sync runs"
  ON public.external_sync_runs
  FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL
    OR public.is_org_member(auth.uid(), organization_id)
  );

-- INSERT/UPDATE/DELETE intentionally NOT exposed to authenticated;
-- only the service role (edge function) writes here.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Auto-provision AICIS for Pro+ organizations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_aicis_for_org(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Idempotent: never overwrite an existing AICIS row (Enterprise may have BYO key)
  INSERT INTO public.external_data_sources (
    organization_id,
    vendor_key,
    vendor_name,
    category,
    is_active,
    refresh_interval_hours,
    trust_level,
    license_type,
    config,
    next_refresh_at
  )
  VALUES (
    _org_id,
    'aicis',
    'AICIS — Aggregated Country Intelligence Signals',
    'country_intelligence',
    true,
    24,
    90,
    'quantivis_platform_license',
    jsonb_build_object('page_size', 500, 'max_pages', 4),
    now()
  )
  ON CONFLICT (organization_id, vendor_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_subscription_tier_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Provision AICIS when subscription is active/trialing and tier is Pro or higher
  IF NEW.organization_id IS NOT NULL
     AND NEW.status IN ('active', 'trialing')
     AND lower(COALESCE(NEW.tier, '')) IN ('pro', 'business', 'enterprise', 'enterprise_plus')
  THEN
    PERFORM public.provision_aicis_for_org(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_aicis_on_subscription ON public.subscriptions;
CREATE TRIGGER trg_provision_aicis_on_subscription
  AFTER INSERT OR UPDATE OF tier, status ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_subscription_tier_change();

-- Backfill: provision AICIS for every existing Pro+ org that doesn't have it yet
DO $$
DECLARE
  _org uuid;
BEGIN
  FOR _org IN
    SELECT DISTINCT s.organization_id
    FROM public.subscriptions s
    WHERE s.status IN ('active', 'trialing')
      AND lower(COALESCE(s.tier, '')) IN ('pro', 'business', 'enterprise', 'enterprise_plus')
      AND s.organization_id IS NOT NULL
  LOOP
    PERFORM public.provision_aicis_for_org(_org);
  END LOOP;
END $$;