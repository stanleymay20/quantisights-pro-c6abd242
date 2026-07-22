-- Fairness Assessments (Ch 14: FAT Systems)
CREATE TABLE public.fairness_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_id UUID REFERENCES public.decision_ledger(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dataset_id UUID REFERENCES public.datasets(id) ON DELETE SET NULL,
  protected_attribute TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  group_a_label TEXT NOT NULL,
  group_b_label TEXT NOT NULL,
  group_a_value NUMERIC,
  group_b_value NUMERIC,
  disparate_impact_ratio NUMERIC,
  statistical_parity_diff NUMERIC,
  assessment_status TEXT NOT NULL DEFAULT 'pending',
  remediation_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.fairness_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view fairness assessments"
  ON public.fairness_assessments FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can create fairness assessments"
  ON public.fairness_assessments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND public.exec_require_elevated_role(auth.uid(), organization_id)
  );

CREATE INDEX idx_fairness_org ON public.fairness_assessments(organization_id);
CREATE INDEX idx_fairness_decision ON public.fairness_assessments(decision_id);

-- Model Drift Snapshots (Ch 13: Observability)
CREATE TABLE public.model_drift_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  feature_importance JSONB DEFAULT '{}',
  prediction_distribution JSONB DEFAULT '{}',
  drift_score NUMERIC DEFAULT 0,
  drift_detected BOOLEAN DEFAULT false,
  baseline_snapshot_id UUID REFERENCES public.model_drift_snapshots(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.model_drift_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view drift snapshots"
  ON public.model_drift_snapshots FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "System can insert drift snapshots"
  ON public.model_drift_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE INDEX idx_drift_org_model ON public.model_drift_snapshots(organization_id, model_name);
CREATE INDEX idx_drift_date ON public.model_drift_snapshots(snapshot_date DESC);