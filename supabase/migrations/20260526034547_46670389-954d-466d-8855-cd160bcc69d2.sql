
CREATE TABLE IF NOT EXISTS public.intelligence_fusion_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  cluster_type text NOT NULL DEFAULT 'operational',
  title text NOT NULL,
  canonical_summary text,
  narrative text,
  supporting_item_ids uuid[] NOT NULL DEFAULT '{}',
  supporting_intervention_ids uuid[] NOT NULL DEFAULT '{}',
  supporting_advisory_ids uuid[] NOT NULL DEFAULT '{}',
  affected_domains text[] NOT NULL DEFAULT '{}',
  affected_geographies text[] NOT NULL DEFAULT '{}',
  affected_entities text[] NOT NULL DEFAULT '{}',
  trend_direction text NOT NULL DEFAULT 'stable',
  escalation_velocity numeric NOT NULL DEFAULT 0,
  narrative_strength numeric NOT NULL DEFAULT 0,
  confidence_score numeric NOT NULL DEFAULT 0,
  pressure_score numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  cluster_signature text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_fusion_clusters_org ON public.intelligence_fusion_clusters(organization_id, pressure_score DESC);
CREATE INDEX IF NOT EXISTS idx_fusion_clusters_sig ON public.intelligence_fusion_clusters(organization_id, cluster_signature);
ALTER TABLE public.intelligence_fusion_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fusion_clusters_read_members" ON public.intelligence_fusion_clusters
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "fusion_clusters_write_admin_exec" ON public.intelligence_fusion_clusters
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive'));

CREATE TABLE IF NOT EXISTS public.organizational_pressure_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  pressure_score numeric NOT NULL DEFAULT 0,
  pressure_velocity numeric NOT NULL DEFAULT 0,
  pressure_acceleration numeric NOT NULL DEFAULT 0,
  stabilization_indicator numeric NOT NULL DEFAULT 0,
  operational_pressure numeric NOT NULL DEFAULT 0,
  strategic_pressure numeric NOT NULL DEFAULT 0,
  geopolitical_pressure numeric NOT NULL DEFAULT 0,
  cyber_pressure numeric NOT NULL DEFAULT 0,
  supply_chain_pressure numeric NOT NULL DEFAULT 0,
  regulatory_pressure numeric NOT NULL DEFAULT 0,
  execution_pressure numeric NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  contributing_cluster_ids uuid[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_pressure_models_org ON public.organizational_pressure_models(organization_id, snapshot_at DESC);
ALTER TABLE public.organizational_pressure_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pressure_models_read_members" ON public.organizational_pressure_models
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "pressure_models_write_admin" ON public.organizational_pressure_models
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive'));

CREATE TABLE IF NOT EXISTS public.narrative_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  cluster_id uuid REFERENCES public.intelligence_fusion_clusters(id) ON DELETE CASCADE,
  cluster_signature text,
  led_to_decision boolean NOT NULL DEFAULT false,
  decision_ids uuid[] NOT NULL DEFAULT '{}',
  outcome_observed boolean NOT NULL DEFAULT false,
  outcome_effective boolean,
  ignored boolean NOT NULL DEFAULT false,
  false_positive boolean NOT NULL DEFAULT false,
  resolution_time_hours numeric,
  narrative_effectiveness_score numeric NOT NULL DEFAULT 0,
  narrative_trust_score numeric NOT NULL DEFAULT 0,
  narrative_resolution_rate numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_narrative_memory_org ON public.narrative_memory(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_memory_sig ON public.narrative_memory(organization_id, cluster_signature);
ALTER TABLE public.narrative_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "narrative_memory_read_members" ON public.narrative_memory
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "narrative_memory_write_admin" ON public.narrative_memory
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive'));

CREATE TABLE IF NOT EXISTS public.fusion_observability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  inputs_count integer NOT NULL DEFAULT 0,
  clusters_count integer NOT NULL DEFAULT 0,
  compression_ratio numeric NOT NULL DEFAULT 0,
  duplicates_suppressed integer NOT NULL DEFAULT 0,
  avg_generation_latency_ms numeric NOT NULL DEFAULT 0,
  executive_interactions integer NOT NULL DEFAULT 0,
  narrative_to_decision_conversion_pct numeric NOT NULL DEFAULT 0,
  ignored_narrative_pct numeric NOT NULL DEFAULT 0,
  narrative_resolution_effectiveness_pct numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, day)
);
ALTER TABLE public.fusion_observability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fusion_obs_read_members" ON public.fusion_observability
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "fusion_obs_write_admin" ON public.fusion_observability
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_fusion_clusters_touch ON public.intelligence_fusion_clusters;
CREATE TRIGGER trg_fusion_clusters_touch BEFORE UPDATE ON public.intelligence_fusion_clusters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_narrative_memory_touch ON public.narrative_memory;
CREATE TRIGGER trg_narrative_memory_touch BEFORE UPDATE ON public.narrative_memory
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
