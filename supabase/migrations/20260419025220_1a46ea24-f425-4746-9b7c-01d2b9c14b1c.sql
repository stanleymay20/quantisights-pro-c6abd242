
-- 1. Add real org column
ALTER TABLE public.internal_reference_data
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2. Backfill from metadata
UPDATE public.internal_reference_data
SET organization_id = (metadata->>'organization_id')::uuid
WHERE organization_id IS NULL
  AND metadata ? 'organization_id'
  AND (metadata->>'organization_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 3. Drop the old JSON-expression index
DROP INDEX IF EXISTS public.ux_internal_reference_dedupe;

-- 4. Real column-based uniqueness (NULLS NOT DISTINCT so global rows still dedupe)
CREATE UNIQUE INDEX IF NOT EXISTS ux_internal_reference_dedupe_v2
  ON public.internal_reference_data (organization_id, metric_name, source, period_start)
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS ix_iref_org ON public.internal_reference_data (organization_id);

-- 5. Tighten read policy: members see their org's data + globally-shared (org_id IS NULL) rows
DROP POLICY IF EXISTS "Authenticated users can read reference data" ON public.internal_reference_data;

CREATE POLICY "Members read own + global reference data"
ON public.internal_reference_data FOR SELECT
TO authenticated
USING (
  organization_id IS NULL
  OR public.is_organization_member(auth.uid(), organization_id)
);
