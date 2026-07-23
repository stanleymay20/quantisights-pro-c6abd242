
-- Fix: role_permissions table already created, just recreate the function with correct enum values
-- Drop and recreate if tables exist from partial migration
DROP TABLE IF EXISTS public.org_branding;
DROP TABLE IF EXISTS public.embed_tokens;
DROP TABLE IF EXISTS public.role_permissions;
DROP FUNCTION IF EXISTS public.has_permission(uuid, uuid, text);

-- =============================================
-- GRANULAR RBAC PERMISSIONS
-- =============================================
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  role org_role NOT NULL,
  permission text NOT NULL,
  granted boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, role, permission)
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view permissions" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owners manage permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.get_user_org_role(auth.uid(), organization_id) = 'owner')
  WITH CHECK (public.get_user_org_role(auth.uid(), organization_id) = 'owner');

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _org_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT rp.granted
     FROM public.role_permissions rp
     JOIN public.organization_members om
       ON om.organization_id = rp.organization_id AND om.role = rp.role
     WHERE om.user_id = _user_id
       AND rp.organization_id = _org_id
       AND rp.permission = _permission
     LIMIT 1),
    CASE
      WHEN (SELECT role FROM public.organization_members WHERE user_id = _user_id AND organization_id = _org_id) IN ('owner', 'admin') THEN true
      WHEN (SELECT role FROM public.organization_members WHERE user_id = _user_id AND organization_id = _org_id) IN ('analyst', 'executive') AND _permission LIKE '%.view' THEN true
      WHEN (SELECT role FROM public.organization_members WHERE user_id = _user_id AND organization_id = _org_id) = 'viewer' AND _permission = 'dashboard.view' THEN true
      ELSE false
    END
  );
$$;

-- =============================================
-- EMBEDDABLE DASHBOARD TOKENS
-- =============================================
CREATE TABLE public.embed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  created_by uuid NOT NULL,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  dashboard_type text NOT NULL DEFAULT 'kpi_overview',
  allowed_metrics jsonb DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.embed_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view embed tokens" ON public.embed_tokens
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins manage embed tokens" ON public.embed_tokens
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin'));

CREATE POLICY "Admins update embed tokens" ON public.embed_tokens
  FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin'));

CREATE POLICY "Admins delete embed tokens" ON public.embed_tokens
  FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin'));

CREATE POLICY "Public embed read" ON public.embed_tokens
  FOR SELECT TO anon
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- =============================================
-- WHITE-LABEL ORG BRANDING
-- =============================================
CREATE TABLE public.org_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
  logo_url text,
  primary_color text DEFAULT '246 59% 50%',
  accent_color text DEFAULT '263 70% 50%',
  company_name text,
  custom_domain text,
  favicon_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.org_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view branding" ON public.org_branding
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owners manage branding" ON public.org_branding
  FOR ALL TO authenticated
  USING (public.get_user_org_role(auth.uid(), organization_id) = 'owner')
  WITH CHECK (public.get_user_org_role(auth.uid(), organization_id) = 'owner');

CREATE POLICY "Public branding read" ON public.org_branding
  FOR SELECT TO anon
  USING (true);
