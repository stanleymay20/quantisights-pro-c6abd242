
-- ============================================================
-- Phase 6A — Contextual Governance Engine
-- ============================================================

-- 1. governance_profiles (versioned)
CREATE TABLE public.governance_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  version INT NOT NULL DEFAULT 1,
  risk_appetite TEXT NOT NULL DEFAULT 'balanced' CHECK (risk_appetite IN ('conservative','balanced','aggressive')),
  governance_model TEXT NOT NULL DEFAULT 'centralized' CHECK (governance_model IN ('centralized','distributed','committee','founder_led')),
  advisory_threshold NUMERIC NOT NULL DEFAULT 0.70,
  escalation_threshold NUMERIC NOT NULL DEFAULT 0.70,
  intervention_threshold NUMERIC NOT NULL DEFAULT 0.60,
  governance_confidence_floor NUMERIC NOT NULL DEFAULT 0.50,
  governance_confidence_ceiling NUMERIC NOT NULL DEFAULT 0.90,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  change_reason TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_governance_profiles_org_version ON public.governance_profiles(organization_id, version);
CREATE INDEX idx_governance_profiles_org_active ON public.governance_profiles(organization_id) WHERE effective_to IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.governance_profiles TO authenticated;
GRANT ALL ON public.governance_profiles TO service_role;
ALTER TABLE public.governance_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view governance profiles"
ON public.governance_profiles FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owners/admins can insert governance profiles"
ON public.governance_profiles FOR INSERT TO authenticated
WITH CHECK (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

CREATE POLICY "Owners/admins can update governance profiles"
ON public.governance_profiles FOR UPDATE TO authenticated
USING (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

-- 2. governance_thresholds
CREATE TABLE public.governance_thresholds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  threshold_key TEXT NOT NULL,
  threshold_value NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'org_override' CHECK (source IN ('default','org_override','profile','pack')),
  source_ref TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_governance_thresholds_lookup ON public.governance_thresholds(organization_id, threshold_key) WHERE effective_to IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.governance_thresholds TO authenticated;
GRANT ALL ON public.governance_thresholds TO service_role;
ALTER TABLE public.governance_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view thresholds"
ON public.governance_thresholds FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owners/admins can write thresholds"
ON public.governance_thresholds FOR INSERT TO authenticated
WITH CHECK (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

CREATE POLICY "Owners/admins can update thresholds"
ON public.governance_thresholds FOR UPDATE TO authenticated
USING (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

-- 3. context_packs (system templates)
CREATE TABLE public.context_packs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pack_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  kpi_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  threshold_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  governance_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  executive_views JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT true,
  is_locked_default BOOLEAN NOT NULL DEFAULT false,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.context_packs TO anon, authenticated;
GRANT ALL ON public.context_packs TO service_role;
ALTER TABLE public.context_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Context packs are public templates"
ON public.context_packs FOR SELECT TO anon, authenticated USING (true);

-- 4. organization_context_packs
CREATE TABLE public.organization_context_packs (
  organization_id UUID NOT NULL,
  pack_key TEXT NOT NULL REFERENCES public.context_packs(pack_key) ON DELETE CASCADE,
  derived_from_pack TEXT,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled_by UUID,
  config_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (organization_id, pack_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_context_packs TO authenticated;
GRANT ALL ON public.organization_context_packs TO service_role;
ALTER TABLE public.organization_context_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view context pack activations"
ON public.organization_context_packs FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owners/admins manage context pack activations"
ON public.organization_context_packs FOR ALL TO authenticated
USING (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'))
WITH CHECK (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

-- 5. approval_chain_stages (sequenced multi-stage approvals)
CREATE TABLE public.approval_chain_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  approval_stage TEXT NOT NULL,
  sequence_order INT NOT NULL,
  required_quorum INT NOT NULL DEFAULT 1,
  approvals_received INT NOT NULL DEFAULT 0,
  satisfied BOOLEAN NOT NULL DEFAULT false,
  satisfied_at TIMESTAMPTZ,
  approver_role TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_approval_chain_decision ON public.approval_chain_stages(decision_id, sequence_order);

GRANT SELECT, INSERT, UPDATE ON public.approval_chain_stages TO authenticated;
GRANT ALL ON public.approval_chain_stages TO service_role;
ALTER TABLE public.approval_chain_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view approval chain"
ON public.approval_chain_stages FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can update approval chain"
ON public.approval_chain_stages FOR UPDATE TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

-- 6. context_governance_audit (append-only)
CREATE TABLE public.context_governance_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('decision','intervention','advisory','insight')),
  subject_id UUID NOT NULL,
  governance_profile_id UUID,
  governance_profile_version INT,
  governance_model TEXT,
  risk_profile TEXT,
  context_pack TEXT,
  engine_version TEXT,
  thresholds_applied JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_rules_applied JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_path JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_context_governance_audit_subject ON public.context_governance_audit(subject_type, subject_id);
CREATE INDEX idx_context_governance_audit_org ON public.context_governance_audit(organization_id, created_at DESC);

GRANT SELECT ON public.context_governance_audit TO authenticated;
GRANT ALL ON public.context_governance_audit TO service_role;
ALTER TABLE public.context_governance_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view governance audit"
ON public.context_governance_audit FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

-- (append-only: no INSERT/UPDATE/DELETE policies → only service_role can write)

-- 7. organizational_identity additions
ALTER TABLE public.organizational_identity
  ADD COLUMN IF NOT EXISTS governance_model_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 8. decision_ledger additions
ALTER TABLE public.decision_ledger
  ADD COLUMN IF NOT EXISTS required_approvals INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approval_chain JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS governance_profile_id UUID,
  ADD COLUMN IF NOT EXISTS governance_context JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 9. Approval enforcement trigger
CREATE OR REPLACE FUNCTION public.enforce_decision_approval_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unsatisfied_stages INT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'executed' AND COALESCE(OLD.status,'') <> 'executable' THEN
    RAISE EXCEPTION 'Decision % cannot be marked executed without passing through executable state', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'executable' AND COALESCE(NEW.required_approvals, 0) > 0 THEN
    SELECT count(*) INTO unsatisfied_stages
    FROM public.approval_chain_stages
    WHERE decision_id = NEW.id AND satisfied = false;

    IF unsatisfied_stages > 0 THEN
      RAISE EXCEPTION 'Decision % has % unsatisfied approval stage(s); cannot become executable', NEW.id, unsatisfied_stages
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_decision_approval_gate ON public.decision_ledger;
CREATE TRIGGER trg_enforce_decision_approval_gate
BEFORE UPDATE ON public.decision_ledger
FOR EACH ROW EXECUTE FUNCTION public.enforce_decision_approval_gate();

-- 10. Default governance_profile on new organization
CREATE OR REPLACE FUNCTION public.create_default_governance_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.governance_profiles (organization_id, risk_appetite, governance_model, change_reason)
  VALUES (NEW.id, 'balanced', 'centralized', 'auto-created on org init')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_governance_profile ON public.organizations;
CREATE TRIGGER trg_create_default_governance_profile
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.create_default_governance_profile();

-- Backfill default profile for existing orgs
INSERT INTO public.governance_profiles (organization_id, risk_appetite, governance_model, change_reason)
SELECT o.id, 'balanced', 'centralized', 'backfill phase 6A'
FROM public.organizations o
LEFT JOIN public.governance_profiles gp ON gp.organization_id = o.id AND gp.effective_to IS NULL
WHERE gp.id IS NULL;

-- 11. Resolver function
CREATE OR REPLACE FUNCTION public.get_active_governance_profile(_org_id UUID)
RETURNS SETOF public.governance_profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.governance_profiles
  WHERE organization_id = _org_id AND effective_to IS NULL
  ORDER BY version DESC
  LIMIT 1;
$$;

-- 12. Seed system context packs
INSERT INTO public.context_packs (pack_key, name, description, kpi_templates, threshold_defaults, governance_defaults, executive_views, is_system) VALUES
('university', 'University Pack', 'Higher education: enrollment, retention, accreditation, faculty performance',
  '[{"key":"enrollment_rate","label":"Enrollment Rate","direction":"increase"},{"key":"retention_rate","label":"Student Retention","direction":"increase"},{"key":"accreditation_score","label":"Accreditation Score","direction":"increase"},{"key":"faculty_performance","label":"Faculty Performance","direction":"increase"}]'::jsonb,
  '{"aicis.risk_threshold":0.55,"intervention.high_tier":75}'::jsonb,
  '{"risk_appetite":"conservative","governance_model":"committee"}'::jsonb,
  '["enrollment_funnel","accreditation_status"]'::jsonb, true),
('supply_chain', 'Supply Chain Pack', 'Inventory, logistics, supplier risk, fulfillment',
  '[{"key":"inventory_turnover","label":"Inventory Turnover","direction":"increase"},{"key":"on_time_delivery","label":"On-Time Delivery","direction":"increase"},{"key":"supplier_risk","label":"Supplier Risk","direction":"decrease"},{"key":"fulfillment_rate","label":"Fulfillment Rate","direction":"increase"}]'::jsonb,
  '{"aicis.risk_threshold":0.60,"intervention.high_tier":80}'::jsonb,
  '{"risk_appetite":"balanced","governance_model":"centralized"}'::jsonb,
  '["supplier_heatmap","fulfillment_trend"]'::jsonb, true),
('private_equity', 'Private Equity Pack', 'Portfolio performance, IRR, cash flow, value creation',
  '[{"key":"irr","label":"IRR","direction":"increase"},{"key":"moic","label":"MOIC","direction":"increase"},{"key":"cash_flow","label":"Cash Flow","direction":"increase"},{"key":"value_creation","label":"Value Creation","direction":"increase"}]'::jsonb,
  '{"aicis.risk_threshold":0.65,"intervention.high_tier":85}'::jsonb,
  '{"risk_appetite":"aggressive","governance_model":"distributed"}'::jsonb,
  '["portfolio_heatmap","lp_reporting"]'::jsonb, true),
('government', 'Government Pack', 'Policy execution, citizen outcomes, compliance',
  '[{"key":"policy_execution","label":"Policy Execution","direction":"increase"},{"key":"citizen_outcomes","label":"Citizen Outcomes","direction":"increase"},{"key":"compliance_rate","label":"Compliance Rate","direction":"increase"}]'::jsonb,
  '{"aicis.risk_threshold":0.50,"intervention.high_tier":70}'::jsonb,
  '{"risk_appetite":"conservative","governance_model":"committee"}'::jsonb,
  '["policy_dashboard","compliance_status"]'::jsonb, true),
('healthcare', 'Healthcare Pack', 'Patient outcomes, capacity, safety, compliance',
  '[{"key":"patient_outcomes","label":"Patient Outcomes","direction":"increase"},{"key":"capacity_utilization","label":"Capacity Utilization","direction":"increase"},{"key":"safety_incidents","label":"Safety Incidents","direction":"decrease"},{"key":"compliance_rate","label":"Compliance Rate","direction":"increase"}]'::jsonb,
  '{"aicis.risk_threshold":0.50,"intervention.high_tier":70}'::jsonb,
  '{"risk_appetite":"conservative","governance_model":"centralized"}'::jsonb,
  '["patient_safety","capacity_planning"]'::jsonb, true)
ON CONFLICT (pack_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  kpi_templates = EXCLUDED.kpi_templates,
  threshold_defaults = EXCLUDED.threshold_defaults,
  governance_defaults = EXCLUDED.governance_defaults,
  executive_views = EXCLUDED.executive_views,
  updated_at = now();
