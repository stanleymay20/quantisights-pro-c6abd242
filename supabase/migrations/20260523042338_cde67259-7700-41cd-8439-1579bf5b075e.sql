-- Drop existing empty shell
DROP TABLE IF EXISTS public.executive_interventions CASCADE;

DO $$ BEGIN
  CREATE TYPE public.intervention_status AS ENUM (
    'proposed','acknowledged','assigned','in_progress','deferred','escalated','resolved','dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.intervention_tier AS ENUM ('informational','elevated','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.executive_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('intelligence_item','brief','advisory','forecast','decision_pressure','manual')),
  source_id uuid,
  intervention_type text NOT NULL,
  title text NOT NULL,
  summary text,
  rationale text,
  recommended_action text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  urgency text NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low','medium','high','critical')),
  business_impact numeric NOT NULL DEFAULT 0.5 CHECK (business_impact BETWEEN 0 AND 1),
  organizational_exposure numeric NOT NULL DEFAULT 0.5 CHECK (organizational_exposure BETWEEN 0 AND 1),
  uncertainty_score numeric NOT NULL DEFAULT 0.3 CHECK (uncertainty_score BETWEEN 0 AND 1),
  decision_pressure_score numeric NOT NULL DEFAULT 0.5 CHECK (decision_pressure_score BETWEEN 0 AND 1),
  intervention_priority_score integer NOT NULL DEFAULT 0 CHECK (intervention_priority_score BETWEEN 0 AND 100),
  escalation_tier public.intervention_tier NOT NULL DEFAULT 'informational',
  scoring_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  contributing_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  scoring_version integer NOT NULL DEFAULT 1,
  owner_id uuid,
  status public.intervention_status NOT NULL DEFAULT 'proposed',
  acknowledged_at timestamptz,
  assigned_at timestamptz,
  acted_at timestamptz,
  resolved_at timestamptz,
  resolution_notes text,
  outcome_score integer CHECK (outcome_score BETWEEN 0 AND 100),
  decision_id uuid,
  execution_plan_id uuid,
  sla_due_at timestamptz,
  last_escalated_at timestamptz,
  escalation_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_interventions_org_status ON public.executive_interventions(organization_id, status);
CREATE INDEX idx_interventions_org_priority ON public.executive_interventions(organization_id, intervention_priority_score DESC);
CREATE INDEX idx_interventions_tier ON public.executive_interventions(organization_id, escalation_tier);
CREATE INDEX idx_interventions_owner ON public.executive_interventions(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_interventions_source ON public.executive_interventions(source_type, source_id);

ALTER TABLE public.executive_interventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intv_select_org_members" ON public.executive_interventions
  FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "intv_insert_elevated" ON public.executive_interventions
  FOR INSERT WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));
CREATE POLICY "intv_update_elevated" ON public.executive_interventions
  FOR UPDATE USING (public.exec_require_elevated_role(auth.uid(), organization_id));
CREATE POLICY "intv_delete_elevated" ON public.executive_interventions
  FOR DELETE USING (public.exec_require_elevated_role(auth.uid(), organization_id));

CREATE TRIGGER trg_interventions_updated_at
  BEFORE UPDATE ON public.executive_interventions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.intervention_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  intervention_id uuid NOT NULL REFERENCES public.executive_interventions(id) ON DELETE CASCADE,
  escalation_level integer NOT NULL DEFAULT 1,
  escalation_reason text NOT NULL,
  escalation_summary text,
  escalation_targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  triggered_by text NOT NULL DEFAULT 'system',
  actor_id uuid,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_intv_esc_org ON public.intervention_escalations(organization_id, created_at DESC);
CREATE INDEX idx_intv_esc_intv ON public.intervention_escalations(intervention_id);
ALTER TABLE public.intervention_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intv_esc_select" ON public.intervention_escalations
  FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "intv_esc_insert" ON public.intervention_escalations
  FOR INSERT WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));

CREATE TABLE IF NOT EXISTS public.intervention_learning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  intervention_id uuid NOT NULL REFERENCES public.executive_interventions(id) ON DELETE CASCADE,
  outcome text,
  time_to_resolution_hours numeric,
  effectiveness_score integer CHECK (effectiveness_score BETWEEN 0 AND 100),
  recurrence_count integer NOT NULL DEFAULT 0,
  operational_impact_reduction numeric,
  false_positive boolean NOT NULL DEFAULT false,
  escalation_accuracy numeric CHECK (escalation_accuracy BETWEEN 0 AND 1),
  recommendation_confidence_adjustment numeric NOT NULL DEFAULT 0,
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intervention_id)
);
CREATE INDEX idx_intv_learn_org ON public.intervention_learning(organization_id, recorded_at DESC);
ALTER TABLE public.intervention_learning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intv_learn_select" ON public.intervention_learning
  FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "intv_learn_insert" ON public.intervention_learning
  FOR INSERT WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));
CREATE POLICY "intv_learn_update" ON public.intervention_learning
  FOR UPDATE USING (public.exec_require_elevated_role(auth.uid(), organization_id));

CREATE TABLE IF NOT EXISTS public.intervention_fatigue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('org','team','owner')),
  scope_id text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  total_interventions integer NOT NULL DEFAULT 0,
  unresolved_count integer NOT NULL DEFAULT 0,
  escalation_density numeric NOT NULL DEFAULT 0,
  repeat_advisories integer NOT NULL DEFAULT 0,
  ignored_count integer NOT NULL DEFAULT 0,
  fatigue_score integer NOT NULL DEFAULT 0 CHECK (fatigue_score BETWEEN 0 AND 100),
  overload_risk text NOT NULL DEFAULT 'low' CHECK (overload_risk IN ('low','moderate','high','severe')),
  suppression_recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, scope_type, scope_id, window_start)
);
CREATE INDEX idx_intv_fatigue_org ON public.intervention_fatigue(organization_id, computed_at DESC);
ALTER TABLE public.intervention_fatigue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intv_fatigue_select" ON public.intervention_fatigue
  FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));

CREATE TABLE IF NOT EXISTS public.intervention_observability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  day date NOT NULL,
  creation_count integer NOT NULL DEFAULT 0,
  resolution_count integer NOT NULL DEFAULT 0,
  escalation_count integer NOT NULL DEFAULT 0,
  avg_response_latency_minutes numeric,
  avg_resolution_hours numeric,
  fatigue_score integer NOT NULL DEFAULT 0,
  false_positive_count integer NOT NULL DEFAULT 0,
  effectiveness_avg numeric,
  conversion_to_decision_rate numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, day)
);
CREATE INDEX idx_intv_obs_org_day ON public.intervention_observability(organization_id, day DESC);
ALTER TABLE public.intervention_observability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intv_obs_select" ON public.intervention_observability
  FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));

CREATE OR REPLACE FUNCTION public.compute_intervention_priority(
  _decision_pressure numeric, _business_impact numeric,
  _organizational_exposure numeric, _uncertainty numeric, _urgency text
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE _uncertainty_mult numeric; _time_factor numeric; _base numeric; _score integer; _tier public.intervention_tier;
BEGIN
  _uncertainty_mult := GREATEST(0.7, 1.0 - (COALESCE(_uncertainty,0) * 0.3));
  IF _urgency = 'critical' THEN _time_factor := 1.25;
  ELSIF _urgency = 'high' THEN _time_factor := 1.10;
  ELSIF _urgency = 'low' THEN _time_factor := 0.85;
  ELSE _time_factor := 1.00;
  END IF;
  _base := COALESCE(_decision_pressure,0) * COALESCE(_business_impact,0) * COALESCE(_organizational_exposure,0);
  _score := LEAST(100, GREATEST(0, ROUND(_base * _uncertainty_mult * _time_factor * 100)::int));
  IF _score >= 80 THEN _tier := 'critical'::public.intervention_tier;
  ELSIF _score >= 60 THEN _tier := 'high'::public.intervention_tier;
  ELSIF _score >= 35 THEN _tier := 'elevated'::public.intervention_tier;
  ELSE _tier := 'informational'::public.intervention_tier;
  END IF;
  RETURN jsonb_build_object('score', _score, 'tier', _tier,
    'breakdown', jsonb_build_object(
      'decision_pressure', _decision_pressure, 'business_impact', _business_impact,
      'organizational_exposure', _organizational_exposure,
      'uncertainty_multiplier', _uncertainty_mult,
      'time_sensitivity_factor', _time_factor, 'base_product', _base));
END $fn$;

CREATE OR REPLACE FUNCTION public.intv_auto_score()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _calc jsonb; _new_tier public.intervention_tier;
BEGIN
  _calc := public.compute_intervention_priority(
    NEW.decision_pressure_score, NEW.business_impact,
    NEW.organizational_exposure, NEW.uncertainty_score, NEW.urgency);
  NEW.intervention_priority_score := (_calc->>'score')::int;
  _new_tier := (_calc->>'tier')::public.intervention_tier;
  NEW.escalation_tier := _new_tier;
  NEW.scoring_breakdown := _calc->'breakdown';
  IF NEW.sla_due_at IS NULL THEN
    IF _new_tier = 'critical' THEN NEW.sla_due_at := NEW.created_at + interval '4 hours';
    ELSIF _new_tier = 'high' THEN NEW.sla_due_at := NEW.created_at + interval '24 hours';
    ELSIF _new_tier = 'elevated' THEN NEW.sla_due_at := NEW.created_at + interval '72 hours';
    ELSE NEW.sla_due_at := NEW.created_at + interval '7 days';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_intv_auto_score
  BEFORE INSERT OR UPDATE OF decision_pressure_score, business_impact, organizational_exposure, uncertainty_score, urgency
  ON public.executive_interventions
  FOR EACH ROW EXECUTE FUNCTION public.intv_auto_score();

CREATE OR REPLACE FUNCTION public.intv_touch_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'acknowledged' THEN NEW.acknowledged_at := COALESCE(NEW.acknowledged_at, now());
    ELSIF NEW.status = 'assigned' THEN NEW.assigned_at := COALESCE(NEW.assigned_at, now());
    ELSIF NEW.status = 'in_progress' THEN NEW.acted_at := COALESCE(NEW.acted_at, now());
    ELSIF NEW.status IN ('resolved','dismissed') THEN NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_intv_touch_status
  BEFORE UPDATE OF status ON public.executive_interventions
  FOR EACH ROW EXECUTE FUNCTION public.intv_touch_status();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='executive_interventions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.executive_interventions';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='intervention_escalations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.intervention_escalations';
  END IF;
END $$;