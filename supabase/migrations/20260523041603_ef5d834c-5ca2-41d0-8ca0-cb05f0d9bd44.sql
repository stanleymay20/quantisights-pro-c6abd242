
-- ════════ Executive Intelligence Mode ════════

-- 1. Executive interventions queue
CREATE TABLE IF NOT EXISTS public.executive_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  intervention_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','elevated','high','critical')),
  recommended_action text NOT NULL,
  rationale text,
  supporting_intelligence_ids uuid[] NOT NULL DEFAULT '{}',
  supporting_advisory_ids uuid[] NOT NULL DEFAULT '{}',
  decision_pressure_score integer NOT NULL DEFAULT 0 CHECK (decision_pressure_score BETWEEN 0 AND 100),
  pressure_tier text NOT NULL DEFAULT 'low' CHECK (pressure_tier IN ('low','elevated','high','critical')),
  escalation_status text NOT NULL DEFAULT 'pending' CHECK (escalation_status IN ('pending','acknowledged','deferred','assigned','escalated','converted','resolved','dismissed')),
  owner_user_id uuid,
  decision_id uuid,
  scoring_factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exec_intv_org_status ON public.executive_interventions(organization_id, escalation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_intv_pressure ON public.executive_interventions(organization_id, decision_pressure_score DESC);

CREATE TRIGGER trg_exec_intv_updated BEFORE UPDATE ON public.executive_interventions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.executive_interventions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read interventions" ON public.executive_interventions
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "elevated write interventions" ON public.executive_interventions
  FOR INSERT TO authenticated WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));
CREATE POLICY "elevated update interventions" ON public.executive_interventions
  FOR UPDATE TO authenticated USING (public.exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));
CREATE POLICY "elevated delete interventions" ON public.executive_interventions
  FOR DELETE TO authenticated USING (public.exec_require_elevated_role(auth.uid(), organization_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.executive_interventions;

-- 2. Cross-domain risk narratives
CREATE TABLE IF NOT EXISTS public.executive_cross_domain_narratives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  narrative text NOT NULL,
  narrative_strength integer NOT NULL DEFAULT 0 CHECK (narrative_strength BETWEEN 0 AND 100),
  affected_domains text[] NOT NULL DEFAULT '{}',
  supporting_signal_ids uuid[] NOT NULL DEFAULT '{}',
  projected_window_days integer,
  combined_pressure_score integer NOT NULL DEFAULT 0 CHECK (combined_pressure_score BETWEEN 0 AND 100),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_xdn_org_generated ON public.executive_cross_domain_narratives(organization_id, generated_at DESC);

ALTER TABLE public.executive_cross_domain_narratives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read narratives" ON public.executive_cross_domain_narratives
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "elevated write narratives" ON public.executive_cross_domain_narratives
  FOR ALL TO authenticated
  USING (public.exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));

-- 3. Exposure snapshots
CREATE TABLE IF NOT EXISTS public.executive_exposure_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  exposure_score integer NOT NULL DEFAULT 0 CHECK (exposure_score BETWEEN 0 AND 100),
  exposure_reasoning text,
  dependency_graph jsonb NOT NULL DEFAULT '{}'::jsonb,
  geography_exposure jsonb NOT NULL DEFAULT '{}'::jsonb,
  supplier_exposure jsonb NOT NULL DEFAULT '{}'::jsonb,
  entity_exposure jsonb NOT NULL DEFAULT '{}'::jsonb,
  sector_exposure jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exp_org_computed ON public.executive_exposure_snapshots(organization_id, computed_at DESC);

ALTER TABLE public.executive_exposure_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read exposure" ON public.executive_exposure_snapshots
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "elevated write exposure" ON public.executive_exposure_snapshots
  FOR ALL TO authenticated
  USING (public.exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));

-- 4. Executive intelligence observability snapshots
CREATE TABLE IF NOT EXISTS public.executive_intel_observability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_day date NOT NULL DEFAULT CURRENT_DATE,
  items_to_decision_rate numeric NOT NULL DEFAULT 0,
  advisory_adoption_rate numeric NOT NULL DEFAULT 0,
  intervention_resolution_rate numeric NOT NULL DEFAULT 0,
  unresolved_critical_pressure integer NOT NULL DEFAULT 0,
  avg_response_latency_hours numeric NOT NULL DEFAULT 0,
  memory_effectiveness_score numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, snapshot_day)
);

ALTER TABLE public.executive_intel_observability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read exec obs" ON public.executive_intel_observability
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "elevated write exec obs" ON public.executive_intel_observability
  FOR ALL TO authenticated
  USING (public.exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));
