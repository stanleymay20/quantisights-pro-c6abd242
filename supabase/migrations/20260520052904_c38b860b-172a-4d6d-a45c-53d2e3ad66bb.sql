
-- Lifecycle status enum
CREATE TYPE public.intelligence_status AS ENUM (
  'new','scored','briefed','advised','routed','acknowledged','acted_on','resolved','archived'
);

CREATE TYPE public.intelligence_feedback_kind AS ENUM (
  'useful','not_useful','false_positive','acted_on','ignored'
);

CREATE TYPE public.intelligence_advisory_kind AS ENUM (
  'operational','risk_mitigation','escalation','strategic'
);

-- Batches (provenance)
CREATE TABLE public.aicis_export_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  batch_ref text NOT NULL,
  source text NOT NULL CHECK (source IN ('api','webhook','pull','manual')),
  schema_version text NOT NULL,
  item_count integer NOT NULL DEFAULT 0,
  duplicates_suppressed integer NOT NULL DEFAULT 0,
  processing_ms integer,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','completed','failed')),
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (organization_id, batch_ref)
);
CREATE INDEX idx_aicis_batches_org_received ON public.aicis_export_batches(organization_id, received_at DESC);

-- Intelligence items (canonical)
CREATE TABLE public.aicis_intelligence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  export_batch_id uuid REFERENCES public.aicis_export_batches(id) ON DELETE SET NULL,
  source_surface text NOT NULL,
  source_ref text,
  content_hash text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','high','immediate')),
  domain text,
  geography text[] NOT NULL DEFAULT '{}',
  entities jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  title text,
  summary text,
  schema_version text NOT NULL DEFAULT '1.0',
  global_criticality_score integer NOT NULL DEFAULT 0 CHECK (global_criticality_score BETWEEN 0 AND 100),
  status public.intelligence_status NOT NULL DEFAULT 'new',
  last_transition_at timestamptz NOT NULL DEFAULT now(),
  resolution_status text,
  resolution_notes text,
  cluster_id uuid,
  occurred_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, content_hash)
);
CREATE INDEX idx_intel_items_org_status ON public.aicis_intelligence_items(organization_id, status);
CREATE INDEX idx_intel_items_org_ingested ON public.aicis_intelligence_items(organization_id, ingested_at DESC);
CREATE INDEX idx_intel_items_severity ON public.aicis_intelligence_items(organization_id, severity, urgency);
CREATE INDEX idx_intel_items_geo ON public.aicis_intelligence_items USING GIN (geography);
CREATE INDEX idx_intel_items_entities ON public.aicis_intelligence_items USING GIN (entities);
CREATE INDEX idx_intel_items_global_crit ON public.aicis_intelligence_items(global_criticality_score DESC);

-- Clusters
CREATE TABLE public.intelligence_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  cluster_key text NOT NULL,
  canonical_summary text,
  related_item_ids uuid[] NOT NULL DEFAULT '{}',
  trend_strength numeric NOT NULL DEFAULT 0,
  source_count integer NOT NULL DEFAULT 0,
  escalation_velocity numeric NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, cluster_key)
);
CREATE INDEX idx_intel_clusters_org_last_seen ON public.intelligence_clusters(organization_id, last_seen_at DESC);

ALTER TABLE public.aicis_intelligence_items
  ADD CONSTRAINT intel_items_cluster_fk
  FOREIGN KEY (cluster_id) REFERENCES public.intelligence_clusters(id) ON DELETE SET NULL;

-- Relevance scores (+ decision pressure)
CREATE TABLE public.intelligence_relevance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  intelligence_item_id uuid NOT NULL REFERENCES public.aicis_intelligence_items(id) ON DELETE CASCADE,
  organization_relevance_score integer NOT NULL CHECK (organization_relevance_score BETWEEN 0 AND 100),
  business_impact_score integer NOT NULL CHECK (business_impact_score BETWEEN 0 AND 100),
  operational_urgency_score integer NOT NULL CHECK (operational_urgency_score BETWEEN 0 AND 100),
  decision_pressure_score integer NOT NULL DEFAULT 0 CHECK (decision_pressure_score BETWEEN 0 AND 100),
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intelligence_item_id)
);
CREATE INDEX idx_intel_scores_pressure ON public.intelligence_relevance_scores(organization_id, decision_pressure_score DESC);

-- Briefs
CREATE TABLE public.intelligence_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  cluster_id uuid REFERENCES public.intelligence_clusters(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text NOT NULL,
  why_it_matters text,
  affected_areas text[] NOT NULL DEFAULT '{}',
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  projected_impact_window tstzrange,
  severity text NOT NULL DEFAULT 'medium',
  item_ids uuid[] NOT NULL DEFAULT '{}',
  confidence integer NOT NULL DEFAULT 70 CHECK (confidence BETWEEN 0 AND 85),
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_intel_briefs_org_generated ON public.intelligence_briefs(organization_id, generated_at DESC);

-- Advisories
CREATE TABLE public.intelligence_advisories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  brief_id uuid REFERENCES public.intelligence_briefs(id) ON DELETE CASCADE,
  intelligence_item_id uuid REFERENCES public.aicis_intelligence_items(id) ON DELETE SET NULL,
  kind public.intelligence_advisory_kind NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  rationale jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence integer NOT NULL DEFAULT 70 CHECK (confidence BETWEEN 0 AND 85),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_intel_advisories_org ON public.intelligence_advisories(organization_id, created_at DESC);

-- Routes
CREATE TABLE public.intelligence_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  intelligence_item_id uuid REFERENCES public.aicis_intelligence_items(id) ON DELETE CASCADE,
  brief_id uuid REFERENCES public.intelligence_briefs(id) ON DELETE SET NULL,
  route_type text NOT NULL CHECK (route_type IN ('decision','task','approval','alert','owner_assignment')),
  target_id uuid,
  target_table text,
  owner_user_id uuid,
  routed_by uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_intel_routes_org ON public.intelligence_routes(organization_id, created_at DESC);

-- Memory (outcomes)
CREATE TABLE public.intelligence_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  intelligence_item_id uuid REFERENCES public.aicis_intelligence_items(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.intelligence_routes(id) ON DELETE SET NULL,
  observed_outcome text,
  effectiveness_rating integer CHECK (effectiveness_rating BETWEEN 0 AND 100),
  attribution_notes text,
  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_intel_memory_org ON public.intelligence_memory(organization_id, recorded_at DESC);

-- Feedback (reinforcement)
CREATE TABLE public.intelligence_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  intelligence_item_id uuid REFERENCES public.aicis_intelligence_items(id) ON DELETE CASCADE,
  brief_id uuid REFERENCES public.intelligence_briefs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  feedback public.intelligence_feedback_kind NOT NULL,
  feedback_weight numeric NOT NULL DEFAULT 1.0,
  feedback_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_intel_feedback_org ON public.intelligence_feedback(organization_id, created_at DESC);

-- Observability rollup
CREATE TABLE public.intelligence_observability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  imports_total integer NOT NULL DEFAULT 0,
  imports_failed integer NOT NULL DEFAULT 0,
  duplicates_suppressed integer NOT NULL DEFAULT 0,
  avg_processing_ms integer NOT NULL DEFAULT 0,
  items_to_decisions integer NOT NULL DEFAULT 0,
  conversion_rate numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, day)
);

-- Lifecycle transition trigger
CREATE OR REPLACE FUNCTION public.intel_touch_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.last_transition_at = now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_intel_touch_transition
BEFORE UPDATE ON public.aicis_intelligence_items
FOR EACH ROW EXECUTE FUNCTION public.intel_touch_transition();

-- RLS
ALTER TABLE public.aicis_export_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aicis_intelligence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_relevance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_advisories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_observability ENABLE ROW LEVEL SECURITY;

-- Read policies for org members
CREATE POLICY "org members read batches" ON public.aicis_export_batches FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "org members read items" ON public.aicis_intelligence_items FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "org members read clusters" ON public.intelligence_clusters FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "org members read scores" ON public.intelligence_relevance_scores FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "org members read briefs" ON public.intelligence_briefs FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "org members read advisories" ON public.intelligence_advisories FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "org members read routes" ON public.intelligence_routes FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "org members read memory" ON public.intelligence_memory FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "org members read feedback" ON public.intelligence_feedback FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "org members read observability" ON public.intelligence_observability FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));

-- Authenticated users can write feedback for their org
CREATE POLICY "org members write feedback" ON public.intelligence_feedback FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id) AND user_id = auth.uid());

-- Owner/admin can transition items (status updates), write routes, memory
CREATE POLICY "owner/admin update items" ON public.aicis_intelligence_items FOR UPDATE TO authenticated
  USING (public.exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));

CREATE POLICY "owner/admin write routes" ON public.intelligence_routes FOR INSERT TO authenticated
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id) AND routed_by = auth.uid());

CREATE POLICY "owner/admin write memory" ON public.intelligence_memory FOR INSERT TO authenticated
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.aicis_intelligence_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.intelligence_briefs;
