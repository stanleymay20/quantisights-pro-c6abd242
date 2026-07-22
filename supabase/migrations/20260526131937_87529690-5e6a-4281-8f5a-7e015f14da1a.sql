-- Phase 5 scaffold: SAP OData connector — operational ontology ingestion for SAP/S/4HANA/ERP

-- 1) Extend connector_type enum
DO $$ BEGIN
  ALTER TYPE public.connector_type ADD VALUE IF NOT EXISTS 'sap_odata';
EXCEPTION WHEN others THEN NULL; END $$;

-- 2) Extend canonical source_type registry (text, used by canonical_* tables)
--    No constraint changes needed — source_type is a free text column on canonical_* tables.

-- 3) SAP OData object schema cache (mirrors salesforce_object_schemas pattern)
CREATE TABLE IF NOT EXISTS public.sap_object_schemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.data_connectors(id) ON DELETE CASCADE,
  service_name text NOT NULL,                -- e.g. 'API_BUSINESS_PARTNER', 'API_SALES_ORDER_SRV'
  entity_set text NOT NULL,                  -- e.g. 'A_BusinessPartner', 'A_SalesOrder'
  entity_type text NOT NULL,                 -- OData EntityType name from $metadata
  odata_version text NOT NULL DEFAULT 'V2',  -- 'V2' | 'V4'
  api_version text,
  is_custom boolean NOT NULL DEFAULT false,
  key_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,         -- [{name,type,nullable,maxLength,...}]
  navigation_properties jsonb NOT NULL DEFAULT '[]'::jsonb,
  record_count_estimate bigint,
  last_discovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sap_obj_unique UNIQUE (connector_id, service_name, entity_set)
);

CREATE INDEX IF NOT EXISTS idx_sap_obj_org ON public.sap_object_schemas (organization_id);
CREATE INDEX IF NOT EXISTS idx_sap_obj_conn ON public.sap_object_schemas (connector_id);

ALTER TABLE public.sap_object_schemas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sap_obj_read" ON public.sap_object_schemas;
CREATE POLICY "sap_obj_read" ON public.sap_object_schemas
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "sap_obj_admin_manage" ON public.sap_object_schemas;
CREATE POLICY "sap_obj_admin_manage" ON public.sap_object_schemas
  FOR ALL TO authenticated
  USING (is_org_member(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_org_member(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role));