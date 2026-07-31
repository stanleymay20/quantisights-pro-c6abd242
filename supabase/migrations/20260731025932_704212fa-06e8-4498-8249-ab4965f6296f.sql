CREATE TABLE public.executive_contradictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  dataset_id uuid,
  contradiction_key text NOT NULL,
  category text NOT NULL DEFAULT 'operational',
  severity text NOT NULL DEFAULT 'medium',
  confidence numeric NOT NULL DEFAULT 0,
  subject text NOT NULL,
  scope text,
  period_label text,
  function_a text NOT NULL,
  function_b text NOT NULL,
  source_a text NOT NULL,
  source_b text NOT NULL,
  value_a numeric,
  value_b numeric,
  gap_absolute numeric,
  gap_pct numeric,
  explanation text NOT NULL,
  root_cause text,
  recommended_action text,
  blocks_decision boolean NOT NULL DEFAULT false,
  affected_decision_types text[] NOT NULL DEFAULT '{}',
  affected_decision_ids uuid[] NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_user_id uuid,
  status text NOT NULL DEFAULT 'open',
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT executive_contradictions_severity_chk CHECK (severity IN ('low','medium','high','critical')),
  CONSTRAINT executive_contradictions_status_chk CHECK (status IN ('open','investigating','resolved','accepted')),
  CONSTRAINT executive_contradictions_confidence_chk CHECK (confidence >= 0 AND confidence <= 100),
  CONSTRAINT executive_contradictions_unique_key UNIQUE (organization_id, contradiction_key)
);

GRANT SELECT, INSERT, UPDATE ON public.executive_contradictions TO authenticated;
GRANT ALL ON public.executive_contradictions TO service_role;

ALTER TABLE public.executive_contradictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view contradictions"
ON public.executive_contradictions FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Elevated roles can update contradictions"
ON public.executive_contradictions FOR UPDATE TO authenticated
USING (public.exec_require_elevated_role(auth.uid(), organization_id))
WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));

CREATE INDEX idx_exec_contradictions_org_status ON public.executive_contradictions (organization_id, status, severity, detected_at DESC);
CREATE INDEX idx_exec_contradictions_dataset ON public.executive_contradictions (dataset_id);

CREATE TRIGGER update_executive_contradictions_updated_at
BEFORE UPDATE ON public.executive_contradictions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();