
-- Canonical relationship graph (CRM-aware ontology)
CREATE TABLE IF NOT EXISTS public.canonical_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  connector_id uuid,
  source_type text NOT NULL,
  relationship_type text NOT NULL,             -- 'contact_of' | 'deal_of' | 'owner_of' | 'activity_on_deal' | ...
  from_entity_id uuid NOT NULL REFERENCES public.canonical_entities(id) ON DELETE CASCADE,
  to_entity_id   uuid NOT NULL REFERENCES public.canonical_entities(id) ON DELETE CASCADE,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_type, relationship_type, from_entity_id, to_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_crel_org_type ON public.canonical_relationships (organization_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_crel_from     ON public.canonical_relationships (from_entity_id);
CREATE INDEX IF NOT EXISTS idx_crel_to       ON public.canonical_relationships (to_entity_id);

ALTER TABLE public.canonical_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canonical_relationships_read"
  ON public.canonical_relationships FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "canonical_relationships_admin_manage"
  ON public.canonical_relationships FOR ALL TO authenticated
  USING (is_org_member(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_org_member(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role));

-- Per-connector rate-limit intelligence
CREATE TABLE IF NOT EXISTS public.connector_throttle_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  connector_id uuid NOT NULL UNIQUE REFERENCES public.data_connectors(id) ON DELETE CASCADE,
  vendor text NOT NULL,                          -- 'hubspot' | 'salesforce' | ...
  remaining_quota integer,                       -- last observed remaining requests in current window
  daily_remaining integer,
  reset_at timestamptz,
  last_status_code integer,
  last_retry_after_ms integer,
  adaptive_backoff_ms integer NOT NULL DEFAULT 0,
  consecutive_throttle_events integer NOT NULL DEFAULT 0,
  last_throttled_at timestamptz,
  last_observed_at  timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_throttle_org ON public.connector_throttle_state (organization_id);

ALTER TABLE public.connector_throttle_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connector_throttle_state_read"
  ON public.connector_throttle_state FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "connector_throttle_state_admin_manage"
  ON public.connector_throttle_state FOR ALL TO authenticated
  USING (is_org_member(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_org_member(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role));
