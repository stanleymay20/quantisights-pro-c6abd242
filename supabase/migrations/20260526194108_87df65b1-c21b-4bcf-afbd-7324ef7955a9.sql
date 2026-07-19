CREATE TABLE public.sap_schema_drift_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id UUID NOT NULL REFERENCES public.data_connectors(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  entity_set TEXT NOT NULL,
  entity_type TEXT,
  drift_type TEXT NOT NULL CHECK (drift_type IN (
    'field_added','field_removed','field_type_changed',
    'key_changed','nav_property_added','nav_property_removed',
    'entity_missing','entity_new'
  )),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  field_name TEXT,
  before_value JSONB,
  after_value JSONB,
  operational_impact TEXT,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sap_drift_org ON public.sap_schema_drift_alerts(organization_id, detected_at DESC);
CREATE INDEX idx_sap_drift_conn ON public.sap_schema_drift_alerts(connector_id, acknowledged, detected_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.sap_schema_drift_alerts TO authenticated;
GRANT ALL ON public.sap_schema_drift_alerts TO service_role;

ALTER TABLE public.sap_schema_drift_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drift_org_read" ON public.sap_schema_drift_alerts
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "drift_admin_update" ON public.sap_schema_drift_alerts
  FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.is_org_member(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "drift_admin_delete" ON public.sap_schema_drift_alerts
  FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::app_role));