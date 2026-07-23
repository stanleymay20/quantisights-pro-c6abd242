
-- Execution Interventions table
CREATE TABLE public.execution_interventions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  execution_plan_id UUID NOT NULL REFERENCES public.execution_plans(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  intervention_type TEXT NOT NULL DEFAULT 'escalation',
  trigger_reason TEXT NOT NULL,
  previous_owner UUID,
  new_owner UUID,
  escalated_to UUID,
  corrective_action TEXT,
  auto_triggered BOOLEAN NOT NULL DEFAULT false,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_interventions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view interventions"
  ON public.execution_interventions FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can create interventions"
  ON public.execution_interventions FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can update interventions"
  ON public.execution_interventions FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE INDEX idx_exec_interventions_plan ON public.execution_interventions(execution_plan_id);
CREATE INDEX idx_exec_interventions_org ON public.execution_interventions(organization_id);

CREATE TRIGGER update_exec_interventions_updated_at
  BEFORE UPDATE ON public.execution_interventions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Execution Scores table
CREATE TABLE public.execution_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL DEFAULT 'organization',
  scope_id UUID NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  reliability_rate NUMERIC DEFAULT 0,
  avg_delay_days NUMERIC DEFAULT 0,
  success_rate NUMERIC DEFAULT 0,
  failure_rate NUMERIC DEFAULT 0,
  plans_evaluated INTEGER DEFAULT 0,
  scoring_model_version INTEGER DEFAULT 1,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view execution scores"
  ON public.execution_scores FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE INDEX idx_exec_scores_org ON public.execution_scores(organization_id);
CREATE INDEX idx_exec_scores_scope ON public.execution_scores(scope_type, scope_id);

-- Execution Predictions table
CREATE TABLE public.execution_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  execution_plan_id UUID NOT NULL REFERENCES public.execution_plans(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  risk_score NUMERIC NOT NULL DEFAULT 0,
  predicted_outcome TEXT NOT NULL DEFAULT 'on_track',
  delay_days_predicted NUMERIC DEFAULT 0,
  risk_factors JSONB DEFAULT '[]'::jsonb,
  recommendation TEXT,
  model_version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view execution predictions"
  ON public.execution_predictions FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE INDEX idx_exec_predictions_plan ON public.execution_predictions(execution_plan_id);
CREATE INDEX idx_exec_predictions_org ON public.execution_predictions(organization_id);
