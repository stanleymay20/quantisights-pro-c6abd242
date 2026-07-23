
-- Reports table
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  generated_by uuid NOT NULL,
  report_type text NOT NULL DEFAULT 'executive',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view reports"
  ON public.reports FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can create reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (is_org_member(auth.uid(), organization_id) AND generated_by = auth.uid());

-- Reports storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', false);

CREATE POLICY "Authenticated users can upload reports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reports');

CREATE POLICY "Org members can read reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reports');

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_insights_org_created ON public.insights(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_org ON public.reports(organization_id);
