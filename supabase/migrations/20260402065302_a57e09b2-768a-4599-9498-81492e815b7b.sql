
-- Schema Evolution Log
CREATE TABLE public.schema_evolution_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  change_type TEXT NOT NULL DEFAULT 'unknown',
  column_name TEXT,
  old_type TEXT,
  new_type TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detected_by TEXT NOT NULL DEFAULT 'system',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schema_evolution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view schema evolution for their org"
  ON public.schema_evolution_log FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can insert schema evolution"
  ON public.schema_evolution_log FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE INDEX idx_schema_evolution_dataset ON public.schema_evolution_log(dataset_id, version_number);
CREATE INDEX idx_schema_evolution_org ON public.schema_evolution_log(organization_id);

-- Data Lineage Graph
CREATE TABLE public.data_lineage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  source_name TEXT,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  target_name TEXT,
  transformation TEXT,
  transformation_details JSONB DEFAULT '{}'::jsonb,
  confidence_impact NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.data_lineage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lineage for their org"
  ON public.data_lineage FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can create lineage entries"
  ON public.data_lineage FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE INDEX idx_lineage_source ON public.data_lineage(organization_id, source_type, source_id);
CREATE INDEX idx_lineage_target ON public.data_lineage(organization_id, target_type, target_id);
CREATE INDEX idx_lineage_org ON public.data_lineage(organization_id);
