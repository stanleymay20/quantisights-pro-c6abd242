
-- 1. Create org_role enum for organization membership
CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'analyst', 'executive', 'viewer');

-- 2. Add created_by to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS created_by uuid;

-- 3. Create organization_members table
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Security definer to check org membership (improved)
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_org_role(_user_id uuid, _org_id uuid)
RETURNS org_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.organization_members
  WHERE user_id = _user_id AND organization_id = _org_id
  LIMIT 1
$$;

-- RLS for organization_members
CREATE POLICY "Members can view their org members"
  ON public.organization_members FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owners/admins can insert members"
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin')
    OR user_id = auth.uid()
  );

CREATE POLICY "Owners/admins can update members"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin'));

CREATE POLICY "Owners can delete members"
  ON public.organization_members FOR DELETE TO authenticated
  USING (get_user_org_role(auth.uid(), organization_id) = 'owner');

-- 4. Create datasets table
CREATE TABLE public.datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text,
  uploaded_by uuid NOT NULL,
  row_count integer DEFAULT 0,
  column_mapping jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view datasets"
  ON public.datasets FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can insert datasets"
  ON public.datasets FOR INSERT TO authenticated
  WITH CHECK (is_org_member(auth.uid(), organization_id) AND uploaded_by = auth.uid());

CREATE POLICY "Uploaders can update own datasets"
  ON public.datasets FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid());

CREATE POLICY "Admins/owners can delete datasets"
  ON public.datasets FOR DELETE TO authenticated
  USING (get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin'));

-- 5. Create metrics table
CREATE TABLE public.metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE SET NULL,
  metric_type text NOT NULL,
  value numeric NOT NULL,
  date date NOT NULL,
  region text,
  segment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view metrics"
  ON public.metrics FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can insert metrics"
  ON public.metrics FOR INSERT TO authenticated
  WITH CHECK (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can delete metrics"
  ON public.metrics FOR DELETE TO authenticated
  USING (get_user_org_role(auth.uid(), organization_id) IN ('owner', 'admin'));

-- Create index for metrics queries
CREATE INDEX idx_metrics_org_date ON public.metrics(organization_id, date);
CREATE INDEX idx_metrics_type ON public.metrics(metric_type);

-- 6. Create insights table
CREATE TABLE public.insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  category text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view insights"
  ON public.insights FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "System can insert insights"
  ON public.insights FOR INSERT TO authenticated
  WITH CHECK (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Members can mark as read"
  ON public.insights FOR UPDATE TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

-- 7. Update handle_new_user to auto-create organization + membership
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
BEGIN
  -- Create organization for the user
  INSERT INTO public.organizations (name, created_by)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) || '''s Organization',
    NEW.id
  )
  RETURNING id INTO new_org_id;

  -- Create profile with org
  INSERT INTO public.profiles (user_id, full_name, organization_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), new_org_id);

  -- Add as owner in organization_members
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  -- Keep app-level role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin');

  RETURN NEW;
END;
$$;

-- 8. Storage bucket for CSV uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('datasets', 'datasets', false);

CREATE POLICY "Authenticated users can upload datasets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'datasets');

CREATE POLICY "Org members can read dataset files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'datasets');

-- 9. Update organizations RLS to use new membership model
DROP POLICY IF EXISTS "Authenticated users can view organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can create organizations if no org" ON public.organizations;

CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), id) OR created_by = auth.uid());

CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Owners can update their organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (get_user_org_role(auth.uid(), id) = 'owner');
