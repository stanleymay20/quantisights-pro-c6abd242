
CREATE TABLE IF NOT EXISTS public.executive_intelligence_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  snapshot_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by text NOT NULL DEFAULT 'cron',
  brief_id uuid REFERENCES public.executive_briefs(id) ON DELETE SET NULL,
  headline text,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_interventions jsonb NOT NULL DEFAULT '[]'::jsonb,
  pressure_queue jsonb NOT NULL DEFAULT '[]'::jsonb,
  cross_domain_narratives jsonb NOT NULL DEFAULT '[]'::jsonb,
  emerging_threats jsonb NOT NULL DEFAULT '[]'::jsonb,
  fatigue_warning jsonb NOT NULL DEFAULT '{}'::jsonb,
  conversion_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_score integer,
  confidence integer
);

CREATE UNIQUE INDEX IF NOT EXISTS executive_intelligence_snapshots_org_date_uidx
  ON public.executive_intelligence_snapshots(organization_id, snapshot_date);
CREATE INDEX IF NOT EXISTS executive_intelligence_snapshots_org_generated_idx
  ON public.executive_intelligence_snapshots(organization_id, generated_at DESC);

ALTER TABLE public.executive_intelligence_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exec_intel_snapshots_read" ON public.executive_intelligence_snapshots;
CREATE POLICY "exec_intel_snapshots_read"
  ON public.executive_intelligence_snapshots
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.exec_require_elevated_role(auth.uid(), organization_id)
      OR public.get_user_org_role(auth.uid(), organization_id) = 'executive'::org_role
    )
  );

DROP POLICY IF EXISTS "exec_intel_snapshots_no_write" ON public.executive_intelligence_snapshots;
CREATE POLICY "exec_intel_snapshots_no_write"
  ON public.executive_intelligence_snapshots
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
