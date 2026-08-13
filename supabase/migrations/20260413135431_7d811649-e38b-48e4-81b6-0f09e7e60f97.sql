
-- 1. Add statistical quantification fields to advisory_instances
ALTER TABLE public.advisory_instances
  ADD COLUMN IF NOT EXISTS deviation_score numeric,
  ADD COLUMN IF NOT EXISTS detection_model text DEFAULT 'threshold',
  ADD COLUMN IF NOT EXISTS model_parameters jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS z_score numeric,
  ADD COLUMN IF NOT EXISTS ewma_baseline numeric,
  ADD COLUMN IF NOT EXISTS ewma_std numeric;

-- 2. Create externalized decision rules table
CREATE TABLE public.decision_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  is_shadow boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  condition_type text NOT NULL DEFAULT 'insight_match',
  conditions jsonb NOT NULL DEFAULT '{}',
  actions jsonb NOT NULL DEFAULT '{}',
  hit_policy text NOT NULL DEFAULT 'first_match',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.decision_rules ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Org members can view decision rules"
  ON public.decision_rules FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can manage decision rules"
  ON public.decision_rules FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND (SELECT role FROM public.organization_members WHERE user_id = auth.uid() AND organization_id = decision_rules.organization_id) IN ('owner', 'admin')
  );

CREATE POLICY "Admins can update decision rules"
  ON public.decision_rules FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (SELECT role FROM public.organization_members WHERE user_id = auth.uid() AND organization_id = decision_rules.organization_id) IN ('owner', 'admin')
  );

CREATE POLICY "Admins can delete decision rules"
  ON public.decision_rules FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (SELECT role FROM public.organization_members WHERE user_id = auth.uid() AND organization_id = decision_rules.organization_id) IN ('owner', 'admin')
  );

-- Indexes for decision rules
CREATE INDEX idx_decision_rules_org_active ON public.decision_rules(organization_id, is_active, priority);

-- 3. Create shadow decision log for shadow rule execution tracking
CREATE TABLE public.decision_shadow_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.decision_rules(id) ON DELETE CASCADE,
  rule_version integer NOT NULL,
  advisory_instance_id uuid REFERENCES public.advisory_instances(id) ON DELETE SET NULL,
  shadow_decision jsonb NOT NULL DEFAULT '{}',
  would_have_created boolean NOT NULL DEFAULT false,
  production_decision_id uuid REFERENCES public.decision_ledger(id) ON DELETE SET NULL,
  discrepancy_detected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.decision_shadow_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view shadow logs"
  ON public.decision_shadow_log FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "System can insert shadow logs"
  ON public.decision_shadow_log FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE INDEX idx_shadow_log_org ON public.decision_shadow_log(organization_id, created_at DESC);

-- 4. Add counterfactual linkage to decision outcomes
ALTER TABLE public.decision_ledger
  ADD COLUMN IF NOT EXISTS counterfactual_analysis_id uuid REFERENCES public.counterfactual_analyses(id),
  ADD COLUMN IF NOT EXISTS counterfactual_delta numeric,
  ADD COLUMN IF NOT EXISTS causal_attribution_score numeric;

-- Trigger for updated_at on decision_rules
CREATE TRIGGER update_decision_rules_updated_at
  BEFORE UPDATE ON public.decision_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
