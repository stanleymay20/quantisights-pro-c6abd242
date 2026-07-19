
-- Salesforce schema discovery cache
CREATE TABLE IF NOT EXISTS public.salesforce_object_schemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.data_connectors(id) ON DELETE CASCADE,
  object_name text NOT NULL,                       -- 'Account', 'Opportunity', 'CustomObj__c'
  api_version text NOT NULL,                       -- 'v60.0'
  is_custom boolean NOT NULL DEFAULT false,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,       -- [{name,type,nillable,length,referenceTo}]
  relationships jsonb NOT NULL DEFAULT '[]'::jsonb,-- [{name,relationshipName,referenceTo,cascadeDelete}]
  record_count_estimate bigint,
  last_discovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connector_id, object_name)
);
CREATE INDEX IF NOT EXISTS idx_sf_obj_org ON public.salesforce_object_schemas (organization_id);

ALTER TABLE public.salesforce_object_schemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sf_obj_read"
  ON public.salesforce_object_schemas FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "sf_obj_admin_manage"
  ON public.salesforce_object_schemas FOR ALL TO authenticated
  USING (is_org_member(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_org_member(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role));

-- Token lifecycle state (real secrets live in Vault; this row tracks rotation + quarantine).
CREATE TABLE IF NOT EXISTS public.connector_token_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL UNIQUE REFERENCES public.data_connectors(id) ON DELETE CASCADE,
  vendor text NOT NULL,                            -- 'salesforce' | 'hubspot' | ...
  access_token_vault_name text,
  refresh_token_vault_name text,                   -- pointer to vault.secrets.name (never the value)
  instance_url text,
  scope text,
  issued_at timestamptz,
  expires_at timestamptz,
  last_rotated_at timestamptz,
  rotation_count integer NOT NULL DEFAULT 0,
  refresh_failure_count integer NOT NULL DEFAULT 0,
  quarantined boolean NOT NULL DEFAULT false,
  quarantined_at timestamptz,
  quarantine_reason text,
  revoked boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tok_org ON public.connector_token_state (organization_id);

ALTER TABLE public.connector_token_state ENABLE ROW LEVEL SECURITY;

-- Read: only metadata (no token values are stored here)
CREATE POLICY "tok_read"
  ON public.connector_token_state FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

-- Owner/admin manage; service role bypasses RLS for refresh writes
CREATE POLICY "tok_admin_manage"
  ON public.connector_token_state FOR ALL TO authenticated
  USING (is_org_member(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_org_member(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role));

-- CDC readiness on checkpoints
ALTER TABLE public.connector_sync_checkpoints
  ADD COLUMN IF NOT EXISTS last_change_token text,
  ADD COLUMN IF NOT EXISTS high_watermark   timestamptz,
  ADD COLUMN IF NOT EXISTS change_event_ready boolean NOT NULL DEFAULT false;
