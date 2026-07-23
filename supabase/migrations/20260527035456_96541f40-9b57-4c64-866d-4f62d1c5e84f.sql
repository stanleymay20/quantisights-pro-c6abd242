
-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 5E — Operational Intelligence Graph
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. NODES ─────────────────────────────────────────────────────────────────
CREATE TABLE public.operational_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  node_type text NOT NULL CHECK (node_type IN (
    'entity','intervention','narrative','decision','advisory','pressure',
    'outcome','governance_event','connector','signal','drift_alert',
    'executive_brief','sap_entity','crm_entity'
  )),
  node_ref_id text,
  canonical_key text NOT NULL,
  title text NOT NULL,
  summary text,
  operational_state text DEFAULT 'active',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','dormant','retired','invalidated')),
  operational_criticality numeric NOT NULL DEFAULT 0 CHECK (operational_criticality BETWEEN 0 AND 100),
  exposure_score numeric NOT NULL DEFAULT 0 CHECK (exposure_score BETWEEN 0 AND 100),
  volatility_score numeric NOT NULL DEFAULT 0 CHECK (volatility_score BETWEEN 0 AND 100),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, node_type, canonical_key)
);
CREATE INDEX idx_ogn_org_type ON public.operational_graph_nodes(organization_id, node_type);
CREATE INDEX idx_ogn_org_status ON public.operational_graph_nodes(organization_id, status);
CREATE INDEX idx_ogn_criticality ON public.operational_graph_nodes(organization_id, operational_criticality DESC);
CREATE INDEX idx_ogn_metadata ON public.operational_graph_nodes USING GIN (metadata);

GRANT SELECT ON public.operational_graph_nodes TO authenticated;
GRANT ALL ON public.operational_graph_nodes TO service_role;
ALTER TABLE public.operational_graph_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read nodes" ON public.operational_graph_nodes FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "service writes nodes" ON public.operational_graph_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. EDGES (with Edits 1, 2, 3) ────────────────────────────────────────────
CREATE TABLE public.operational_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  source_node_id uuid NOT NULL REFERENCES public.operational_graph_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.operational_graph_nodes(id) ON DELETE CASCADE,
  edge_type text NOT NULL CHECK (edge_type IN (
    'influences','escalates','mitigates','caused_by','informed_by',
    'depends_on','resolved_by','contradicts','amplifies','correlated_with',
    'precedes','derived_from','pressure_propagates_to','intervention_blocks',
    'intervention_accelerates'
  )),
  directionality text NOT NULL DEFAULT 'directed' CHECK (directionality IN ('directed','undirected')),
  strength numeric NOT NULL DEFAULT 0.5 CHECK (strength BETWEEN 0 AND 1),
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  propagation_weight numeric NOT NULL DEFAULT 0.5 CHECK (propagation_weight BETWEEN 0 AND 1),
  -- Edit 2: Causal vs correlation semantics
  relationship_semantics text NOT NULL DEFAULT 'correlated' CHECK (relationship_semantics IN (
    'causal','correlated','inferred','governance-linked','temporal','statistical'
  )),
  -- Edit 1: Edge validity decay
  validity_decay_score numeric NOT NULL DEFAULT 1.0 CHECK (validity_decay_score BETWEEN 0 AND 1),
  last_validated_at timestamptz NOT NULL DEFAULT now(),
  edge_staleness_state text NOT NULL DEFAULT 'fresh' CHECK (edge_staleness_state IN ('fresh','aging','stale','invalid')),
  -- Edit 3: Propagation saturation controls
  max_propagation_influence numeric NOT NULL DEFAULT 0.7 CHECK (max_propagation_influence BETWEEN 0 AND 1),
  propagation_saturation_score numeric NOT NULL DEFAULT 0 CHECK (propagation_saturation_score BETWEEN 0 AND 1),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array' AND jsonb_array_length(evidence_refs) >= 1),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_node_id, target_node_id, edge_type)
);
CREATE INDEX idx_oge_org_src ON public.operational_graph_edges(organization_id, source_node_id);
CREATE INDEX idx_oge_org_tgt ON public.operational_graph_edges(organization_id, target_node_id);
CREATE INDEX idx_oge_type ON public.operational_graph_edges(organization_id, edge_type);
CREATE INDEX idx_oge_staleness ON public.operational_graph_edges(organization_id, edge_staleness_state);
CREATE INDEX idx_oge_semantics ON public.operational_graph_edges(organization_id, relationship_semantics);

GRANT SELECT ON public.operational_graph_edges TO authenticated;
GRANT ALL ON public.operational_graph_edges TO service_role;
ALTER TABLE public.operational_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read edges" ON public.operational_graph_edges FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "service writes edges" ON public.operational_graph_edges FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. TOPOLOGY SCORES (with Edits 4, 6) ─────────────────────────────────────
CREATE TABLE public.graph_topology_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES public.operational_graph_nodes(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  centrality_score numeric NOT NULL DEFAULT 0,
  exposure_score numeric NOT NULL DEFAULT 0,
  volatility_score numeric NOT NULL DEFAULT 0,
  operational_criticality numeric NOT NULL DEFAULT 0,
  decision_dependency_score numeric NOT NULL DEFAULT 0,
  propagation_risk numeric NOT NULL DEFAULT 0,
  escalation_density numeric NOT NULL DEFAULT 0,
  conflict_density numeric NOT NULL DEFAULT 0,
  -- Edit 4: Blast radius
  blast_radius_score numeric NOT NULL DEFAULT 0 CHECK (blast_radius_score BETWEEN 0 AND 100),
  blast_radius_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Edit 6: Confidence decomposition (no opaque single score)
  evidence_confidence numeric NOT NULL DEFAULT 0 CHECK (evidence_confidence BETWEEN 0 AND 100),
  relationship_stability numeric NOT NULL DEFAULT 0 CHECK (relationship_stability BETWEEN 0 AND 100),
  cross_source_consistency numeric NOT NULL DEFAULT 0 CHECK (cross_source_consistency BETWEEN 0 AND 100),
  topology_reliability numeric NOT NULL DEFAULT 0 CHECK (topology_reliability BETWEEN 0 AND 100),
  historical_accuracy numeric NOT NULL DEFAULT 0 CHECK (historical_accuracy BETWEEN 0 AND 100),
  scoring_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_id)
);
CREATE INDEX idx_gts_org_centrality ON public.graph_topology_scores(organization_id, centrality_score DESC);
CREATE INDEX idx_gts_org_blast ON public.graph_topology_scores(organization_id, blast_radius_score DESC);
CREATE INDEX idx_gts_org_propagation ON public.graph_topology_scores(organization_id, propagation_risk DESC);

GRANT SELECT ON public.graph_topology_scores TO authenticated;
GRANT ALL ON public.graph_topology_scores TO service_role;
ALTER TABLE public.graph_topology_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read topology" ON public.graph_topology_scores FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "service writes topology" ON public.graph_topology_scores FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 4. TRAVERSAL CACHE ───────────────────────────────────────────────────────
CREATE TABLE public.graph_traversal_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  traversal_type text NOT NULL CHECK (traversal_type IN (
    'root_cause','pressure_propagation','escalation_chain','dependency_concentration',
    'intervention_impact','narrative_conflict','governance_lineage'
  )),
  start_node_id uuid NOT NULL REFERENCES public.operational_graph_nodes(id) ON DELETE CASCADE,
  target_node_id uuid REFERENCES public.operational_graph_nodes(id) ON DELETE CASCADE,
  traversal_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasoning_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Edit 6: confidence decomposition embedded
  confidence_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);
CREATE INDEX idx_gtc_org_type_start ON public.graph_traversal_cache(organization_id, traversal_type, start_node_id);
CREATE INDEX idx_gtc_expires ON public.graph_traversal_cache(expires_at);

GRANT SELECT ON public.graph_traversal_cache TO authenticated;
GRANT ALL ON public.graph_traversal_cache TO service_role;
ALTER TABLE public.graph_traversal_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read traversals" ON public.graph_traversal_cache FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "service writes traversals" ON public.graph_traversal_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 5. MEMORY PATTERNS ───────────────────────────────────────────────────────
CREATE TABLE public.graph_memory_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pattern_type text NOT NULL CHECK (pattern_type IN (
    'recurring_escalation','recurring_failure','recurring_intervention_chain',
    'recurring_narrative_conflict','recurring_governance_breakdown','recurring_dependency_risk'
  )),
  pattern_signature text NOT NULL,
  recurring_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  recurrence_frequency integer NOT NULL DEFAULT 1,
  historical_effectiveness numeric DEFAULT 0 CHECK (historical_effectiveness BETWEEN 0 AND 100),
  historical_outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, pattern_type, pattern_signature)
);
CREATE INDEX idx_gmp_org_type ON public.graph_memory_patterns(organization_id, pattern_type);

GRANT SELECT ON public.graph_memory_patterns TO authenticated;
GRANT ALL ON public.graph_memory_patterns TO service_role;
ALTER TABLE public.graph_memory_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read patterns" ON public.graph_memory_patterns FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "service writes patterns" ON public.graph_memory_patterns FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 6. GOVERNANCE EVENTS (append-only, with Edit 7) ──────────────────────────
CREATE TABLE public.graph_governance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  node_id uuid REFERENCES public.operational_graph_nodes(id) ON DELETE SET NULL,
  edge_id uuid REFERENCES public.operational_graph_edges(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'generated','linked','escalated','invalidated','suppressed','conflict_detected',
    'propagation_detected','resolved','topology_scored','traversed','memory_pattern_detected',
    'escalation_threshold_breached'
  )),
  -- Edit 7: Governance escalation thresholds
  escalation_threshold_breached boolean NOT NULL DEFAULT false,
  threshold_kind text,
  threshold_value numeric,
  prior_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  actor text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gge_org_time ON public.graph_governance_events(organization_id, created_at DESC);
CREATE INDEX idx_gge_org_type ON public.graph_governance_events(organization_id, event_type);
CREATE INDEX idx_gge_escalation ON public.graph_governance_events(organization_id, escalation_threshold_breached) WHERE escalation_threshold_breached;

GRANT SELECT, INSERT ON public.graph_governance_events TO authenticated;
GRANT ALL ON public.graph_governance_events TO service_role;
ALTER TABLE public.graph_governance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read governance" ON public.graph_governance_events FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "org members append governance" ON public.graph_governance_events FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "service writes governance" ON public.graph_governance_events FOR INSERT TO service_role WITH CHECK (true);
-- Append-only: DENY UPDATE/DELETE (no policies created for those operations)

-- ── 7. ATTENTION VIEWS (with Edit 8: 4-level hierarchy) ──────────────────────
CREATE TABLE public.graph_attention_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  persona text NOT NULL CHECK (persona IN ('executive','operations','governance','board')),
  -- Edit 8: Topology abstraction level
  abstraction_level integer NOT NULL DEFAULT 1 CHECK (abstraction_level BETWEEN 1 AND 4),
  title text NOT NULL,
  compressed_summary text NOT NULL,
  priority_score numeric NOT NULL DEFAULT 0 CHECK (priority_score BETWEEN 0 AND 100),
  supporting_nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  supporting_edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 hours')
);
CREATE INDEX idx_gav_org_persona ON public.graph_attention_views(organization_id, persona, abstraction_level);
CREATE INDEX idx_gav_priority ON public.graph_attention_views(organization_id, priority_score DESC);

GRANT SELECT ON public.graph_attention_views TO authenticated;
GRANT ALL ON public.graph_attention_views TO service_role;
ALTER TABLE public.graph_attention_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read attention" ON public.graph_attention_views FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "service writes attention" ON public.graph_attention_views FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 8. SNAPSHOT VERSIONS (Edit 5: temporal topology) ─────────────────────────
CREATE TABLE public.graph_snapshot_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  snapshot_label text NOT NULL,
  node_count integer NOT NULL DEFAULT 0,
  edge_count integer NOT NULL DEFAULT 0,
  density numeric NOT NULL DEFAULT 0,
  node_state jsonb NOT NULL DEFAULT '[]'::jsonb,
  edge_state jsonb NOT NULL DEFAULT '[]'::jsonb,
  topology_state jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, snapshot_hash)
);
CREATE INDEX idx_gsv_org_time ON public.graph_snapshot_versions(organization_id, created_at DESC);

GRANT SELECT ON public.graph_snapshot_versions TO authenticated;
GRANT INSERT ON public.graph_snapshot_versions TO service_role;
GRANT ALL ON public.graph_snapshot_versions TO service_role;
ALTER TABLE public.graph_snapshot_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read snapshots" ON public.graph_snapshot_versions FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "service writes snapshots" ON public.graph_snapshot_versions FOR INSERT TO service_role WITH CHECK (true);
-- Append-only: no UPDATE/DELETE policies

-- ── 9. OBSERVABILITY ─────────────────────────────────────────────────────────
CREATE TABLE public.graph_observability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  nodes_created integer NOT NULL DEFAULT 0,
  edges_created integer NOT NULL DEFAULT 0,
  propagation_paths integer NOT NULL DEFAULT 0,
  graph_density numeric NOT NULL DEFAULT 0,
  reasoning_chain_count integer NOT NULL DEFAULT 0,
  conflict_count integer NOT NULL DEFAULT 0,
  recurring_pattern_count integer NOT NULL DEFAULT 0,
  topology_compute_ms integer NOT NULL DEFAULT 0,
  compression_ratio numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, day)
);

GRANT SELECT ON public.graph_observability TO authenticated;
GRANT ALL ON public.graph_observability TO service_role;
ALTER TABLE public.graph_observability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read observability" ON public.graph_observability FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "service writes observability" ON public.graph_observability FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 10. updated_at triggers ──────────────────────────────────────────────────
CREATE TRIGGER trg_ogn_updated BEFORE UPDATE ON public.operational_graph_nodes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_oge_updated BEFORE UPDATE ON public.operational_graph_edges
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
