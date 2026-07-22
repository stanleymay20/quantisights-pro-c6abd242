ALTER TABLE public.advisory_instances
  ADD COLUMN IF NOT EXISTS decision_enrichment_id uuid REFERENCES public.decision_enrichment(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_evidence_summary text,
  ADD COLUMN IF NOT EXISTS internal_context_summary text,
  ADD COLUMN IF NOT EXISTS combined_interpretation text,
  ADD COLUMN IF NOT EXISTS client_confidence numeric,
  ADD COLUMN IF NOT EXISTS enriched_confidence numeric,
  ADD COLUMN IF NOT EXISTS confidence_delta numeric,
  ADD COLUMN IF NOT EXISTS blending_rule text;

CREATE INDEX IF NOT EXISTS idx_advisory_enrichment
  ON public.advisory_instances (organization_id, decision_enrichment_id)
  WHERE decision_enrichment_id IS NOT NULL;

COMMENT ON COLUMN public.advisory_instances.client_evidence_summary IS
  'Human-readable summary of what the client''s own data shows (Layer A)';
COMMENT ON COLUMN public.advisory_instances.internal_context_summary IS
  'Human-readable summary of relevant internal/external context (Layer B)';
COMMENT ON COLUMN public.advisory_instances.blending_rule IS
  'Which blending rule fired: headwind_dampening | tailwind_reinforcement | context_enriched | no_context';