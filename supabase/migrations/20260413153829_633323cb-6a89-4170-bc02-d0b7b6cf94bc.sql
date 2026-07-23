-- Multi-Armed Bandit experiments (Ch 9-11)
CREATE TABLE public.bandit_experiments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  strategy TEXT NOT NULL DEFAULT 'thompson',
  arms JSONB NOT NULL DEFAULT '[]'::jsonb,
  epsilon NUMERIC DEFAULT 0.1,
  exploration_bonus NUMERIC DEFAULT 1.414,
  total_pulls INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bandit_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view bandit experiments"
  ON public.bandit_experiments FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can create bandit experiments"
  ON public.bandit_experiments FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can update bandit experiments"
  ON public.bandit_experiments FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can delete bandit experiments"
  ON public.bandit_experiments FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

-- Bandit reward log
CREATE TABLE public.bandit_rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES public.bandit_experiments(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  arm_id TEXT NOT NULL,
  reward NUMERIC NOT NULL DEFAULT 0,
  context_features JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bandit_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view bandit rewards"
  ON public.bandit_rewards FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can insert bandit rewards"
  ON public.bandit_rewards FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

-- Attribution touchpoints (Ch 6)
CREATE TABLE public.attribution_touchpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  decision_id UUID REFERENCES public.decision_ledger(id),
  touchpoint_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  weight NUMERIC,
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attribution_touchpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view attribution touchpoints"
  ON public.attribution_touchpoints FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can insert attribution touchpoints"
  ON public.attribution_touchpoints FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

-- Attribution results
CREATE TABLE public.attribution_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  decision_id UUID REFERENCES public.decision_ledger(id),
  touchpoint_id UUID REFERENCES public.attribution_touchpoints(id),
  model TEXT NOT NULL,
  credit NUMERIC NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attribution_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view attribution results"
  ON public.attribution_results FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can insert attribution results"
  ON public.attribution_results FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

-- Maturity assessments (Ch 15)
CREATE TABLE public.maturity_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  overall_level INTEGER NOT NULL DEFAULT 1,
  overall_score INTEGER NOT NULL DEFAULT 0,
  dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  readiness_grade TEXT NOT NULL DEFAULT 'F',
  scaling_readiness INTEGER NOT NULL DEFAULT 0,
  next_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  assessed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.maturity_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view maturity assessments"
  ON public.maturity_assessments FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can insert maturity assessments"
  ON public.maturity_assessments FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

-- Indexes
CREATE INDEX idx_bandit_experiments_org ON public.bandit_experiments(organization_id);
CREATE INDEX idx_bandit_rewards_exp ON public.bandit_rewards(experiment_id);
CREATE INDEX idx_attribution_tp_org ON public.attribution_touchpoints(organization_id);
CREATE INDEX idx_attribution_results_decision ON public.attribution_results(decision_id);
CREATE INDEX idx_maturity_org ON public.maturity_assessments(organization_id, created_at DESC);

-- Triggers
CREATE TRIGGER update_bandit_experiments_updated_at
  BEFORE UPDATE ON public.bandit_experiments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();