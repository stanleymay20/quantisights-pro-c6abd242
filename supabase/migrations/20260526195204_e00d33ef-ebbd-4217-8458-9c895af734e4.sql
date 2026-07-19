
ALTER TABLE public.intelligence_fusion_clusters
  ADD COLUMN IF NOT EXISTS narrative_class text,
  ADD COLUMN IF NOT EXISTS narrative_scope text,
  ADD COLUMN IF NOT EXISTS narrative_severity text,
  ADD COLUMN IF NOT EXISTS narrative_domain_mix jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stability_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volatility_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_hash text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.intelligence_fusion_clusters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS llm_rendered boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intelligence_fusion_clusters_status_check') THEN
    ALTER TABLE public.intelligence_fusion_clusters DROP CONSTRAINT intelligence_fusion_clusters_status_check;
  END IF;
END $$;
ALTER TABLE public.intelligence_fusion_clusters
  ADD CONSTRAINT intelligence_fusion_clusters_status_check
  CHECK (status IN ('active','superseded','retired','resolved','expired','dormant','suppressed','false_positive'));

CREATE INDEX IF NOT EXISTS idx_fusion_clusters_status_org
  ON public.intelligence_fusion_clusters(organization_id, status, pressure_score DESC);
CREATE INDEX IF NOT EXISTS idx_fusion_clusters_class
  ON public.intelligence_fusion_clusters(organization_id, narrative_class) WHERE narrative_class IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.narrative_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  narrative_a_id uuid NOT NULL REFERENCES public.intelligence_fusion_clusters(id) ON DELETE CASCADE,
  narrative_b_id uuid NOT NULL REFERENCES public.intelligence_fusion_clusters(id) ON DELETE CASCADE,
  conflict_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  affected_dimensions text[] NOT NULL DEFAULT '{}'::text[],
  evidence_disagreement jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_notes text,
  CONSTRAINT narrative_conflicts_severity_check CHECK (severity IN ('low','medium','high','critical')),
  CONSTRAINT narrative_conflicts_status_check CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  CONSTRAINT narrative_conflicts_pair_check CHECK (narrative_a_id <> narrative_b_id)
);
GRANT SELECT ON public.narrative_conflicts TO authenticated;
GRANT ALL ON public.narrative_conflicts TO service_role;
ALTER TABLE public.narrative_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "narrative_conflicts_read_members" ON public.narrative_conflicts
  FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()));
CREATE POLICY "narrative_conflicts_write_admin" ON public.narrative_conflicts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'executive'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'executive'::app_role));
CREATE INDEX IF NOT EXISTS idx_narrative_conflicts_org
  ON public.narrative_conflicts(organization_id, status, severity);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_narrative_conflict_pair
  ON public.narrative_conflicts(organization_id, LEAST(narrative_a_id, narrative_b_id), GREATEST(narrative_a_id, narrative_b_id), conflict_type)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.narrative_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  cluster_id uuid REFERENCES public.intelligence_fusion_clusters(id) ON DELETE CASCADE,
  cluster_signature text,
  event_type text NOT NULL,
  prior_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  actor text NOT NULL DEFAULT 'system',
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT narrative_audit_event_check CHECK (event_type IN (
    'generated','updated','suppressed','promoted','retired','resolved','expired','dormant',
    'linked_to_decision','invalidated','confidence_changed','conflict_detected','conflict_resolved',
    'version_bumped','budget_capped'
  ))
);
GRANT SELECT ON public.narrative_audit_log TO authenticated;
GRANT ALL ON public.narrative_audit_log TO service_role;
ALTER TABLE public.narrative_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "narrative_audit_read_members" ON public.narrative_audit_log
  FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()));
CREATE INDEX IF NOT EXISTS idx_narrative_audit_org_time
  ON public.narrative_audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_audit_cluster
  ON public.narrative_audit_log(cluster_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.narrative_suppression_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  cluster_signature text,
  candidate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  suppression_reason text NOT NULL,
  suppression_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  suppressed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT narrative_suppression_reason_check CHECK (suppression_reason IN (
    'duplicate','stale','low_pressure','superseded','budget_exceeded','below_confidence_threshold','fatigue'
  ))
);
GRANT SELECT ON public.narrative_suppression_log TO authenticated;
GRANT ALL ON public.narrative_suppression_log TO service_role;
ALTER TABLE public.narrative_suppression_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "narrative_suppression_read_members" ON public.narrative_suppression_log
  FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()));
CREATE INDEX IF NOT EXISTS idx_narrative_suppression_org
  ON public.narrative_suppression_log(organization_id, suppressed_at DESC);

CREATE TABLE IF NOT EXISTS public.attention_budget_config (
  organization_id uuid PRIMARY KEY,
  max_active_exec_narratives integer NOT NULL DEFAULT 5,
  max_active_ops_narratives integer NOT NULL DEFAULT 10,
  max_daily_new_narratives integer NOT NULL DEFAULT 3,
  min_confidence_to_publish numeric NOT NULL DEFAULT 40,
  min_pressure_to_publish numeric NOT NULL DEFAULT 30,
  fatigue_demotion_threshold integer NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.attention_budget_config TO authenticated;
GRANT ALL ON public.attention_budget_config TO service_role;
ALTER TABLE public.attention_budget_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attention_budget_read_members" ON public.attention_budget_config
  FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()));
CREATE POLICY "attention_budget_write_admin" ON public.attention_budget_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_attention_budget_touch
BEFORE UPDATE ON public.attention_budget_config
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO public.attention_budget_config (organization_id)
SELECT id FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;
