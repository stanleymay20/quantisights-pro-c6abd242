-- Fix latent bug: trigger references NEW.status but ledger uses decision_status.
CREATE OR REPLACE FUNCTION public.enforce_decision_approval_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  unsatisfied_stages INT;
BEGIN
  IF NEW.decision_status IS NOT DISTINCT FROM OLD.decision_status THEN
    RETURN NEW;
  END IF;

  IF NEW.decision_status = 'executed' AND COALESCE(OLD.decision_status, '') <> 'executable' THEN
    RAISE EXCEPTION 'Decision % cannot be marked executed without passing through executable state', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.decision_status = 'executable' AND COALESCE(NEW.required_approvals, 0) > 0 THEN
    SELECT count(*) INTO unsatisfied_stages
      FROM public.approval_chain_stages
     WHERE decision_id = NEW.id AND satisfied = false;

    IF unsatisfied_stages > 0 THEN
      RAISE EXCEPTION 'Decision % has % unsatisfied approval stage(s); cannot become executable', NEW.id, unsatisfied_stages
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- Phase 1 data hygiene columns
ALTER TABLE public.decision_ledger
  ADD COLUMN IF NOT EXISTS is_suppressed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suppression_reason text;

CREATE INDEX IF NOT EXISTS idx_decision_ledger_not_suppressed
  ON public.decision_ledger (organization_id, created_at DESC)
  WHERE is_suppressed = false;

-- 1) Stub decisions with no monetary impact and no evidence — keep oldest per (org, recommended_action).
WITH stubs AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organization_id, recommended_action
           ORDER BY created_at ASC
         ) AS rn
    FROM public.decision_ledger
   WHERE (predicted_net_impact IS NULL OR predicted_net_impact = 0)
     AND (evidence_sources IS NULL
          OR jsonb_typeof(evidence_sources) <> 'array'
          OR jsonb_array_length(evidence_sources) = 0)
     AND is_suppressed = false
)
UPDATE public.decision_ledger d
   SET is_suppressed = true,
       suppression_reason = 'stub_no_impact_no_evidence'
  FROM stubs s
 WHERE d.id = s.id
   AND s.rn > 1;

-- 2) Massively duplicated seed rows (>10× same recommended_action per org) — keep newest 3.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organization_id, recommended_action
           ORDER BY created_at DESC
         ) AS rn,
         count(*) OVER (
           PARTITION BY organization_id, recommended_action
         ) AS grp
    FROM public.decision_ledger
   WHERE is_suppressed = false
)
UPDATE public.decision_ledger d
   SET is_suppressed = true,
       suppression_reason = COALESCE(suppression_reason, 'seed_duplicate')
  FROM ranked r
 WHERE d.id = r.id
   AND r.grp > 10
   AND r.rn > 3;

-- Shared RPC so Outcome Tracking, System Health, and Decision Ledger all report the same
-- "outcomes measured" number.
CREATE OR REPLACE FUNCTION public.count_measured_outcomes(_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
    FROM public.decision_ledger
   WHERE organization_id = _org_id
     AND outcome_measured_at IS NOT NULL
     AND is_suppressed = false;
$$;

GRANT EXECUTE ON FUNCTION public.count_measured_outcomes(uuid) TO authenticated, service_role;
