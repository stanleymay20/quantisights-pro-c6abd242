-- ============================================================
-- Restore the "approved/rejected decisions are final" guard on
-- enforce_decision_approval_gate().
--
-- 20260713010000_fix_decision_approval_atomicity.sql added this guard:
--   IF OLD.decision_status IN ('approved', 'rejected')
--      AND NEW.decision_status IS DISTINCT FROM OLD.decision_status THEN
--     RAISE EXCEPTION ...
--   END IF;
-- 20260713101123_c24694df-...sql later re-issued the whole function body
-- (to add the executed/executable checks alongside new data-hygiene work)
-- without carrying this guard forward, so it silently dropped out of the
-- live trigger. The sanctioned RPC path (approve_decision/reject_decision)
-- still independently blocks re-approval via its own "must be pending"
-- check, but a direct UPDATE on decision_ledger bypassing those RPCs could
-- flip an already-approved decision to rejected (or vice versa) with no
-- trigger-level block. Restoring it here as defense in depth; no other
-- behavior from 20260713101123 is changed.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_decision_approval_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  unsatisfied_stages INT;
BEGIN
  IF OLD.decision_status IN ('approved', 'rejected')
     AND NEW.decision_status IS DISTINCT FROM OLD.decision_status THEN
    RAISE EXCEPTION 'Decision % already has a final decision_status of %; it cannot transition to %',
      NEW.id, OLD.decision_status, NEW.decision_status
      USING ERRCODE = 'check_violation';
  END IF;

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
