-- Restore the dataset-scoping contract already used by dashboard and decision
-- surfaces. The ledger remains organization-authorized by RLS; dataset_id adds
-- a verified dataset boundary without turning missing scope into fabricated data.

ALTER TABLE public.decision_ledger
  ADD COLUMN IF NOT EXISTS dataset_id uuid;

COMMENT ON COLUMN public.decision_ledger.dataset_id IS
  'Verified dataset scope for dataset-bound decisions. NULL means no dataset scope was proven.';

-- Recover scope only from evidence that resolves to a dataset owned by the same
-- organization. Unresolvable historical decisions deliberately remain NULL.
UPDATE public.decision_ledger AS dl
SET dataset_id = d.id
FROM public.datasets AS d
WHERE dl.dataset_id IS NULL
  AND d.organization_id = dl.organization_id
  AND d.id::text = NULLIF(dl.explanation_metadata #>> '{source_data,dataset_id}', '');

UPDATE public.decision_ledger AS dl
SET dataset_id = ai.dataset_id
FROM public.advisory_instances AS ai
WHERE dl.dataset_id IS NULL
  AND dl.advisory_instance_id = ai.id
  AND ai.organization_id = dl.organization_id
  AND ai.dataset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_decision_ledger_org_dataset_pending
  ON public.decision_ledger (organization_id, dataset_id)
  WHERE execution_status = 'not_started' AND is_suppressed = false;

CREATE OR REPLACE FUNCTION public.enforce_decision_ledger_dataset_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_advisory_dataset_id uuid;
  v_metadata_dataset_text text;
  v_metadata_dataset_id uuid;
BEGIN
  -- Advisory-backed decisions inherit the advisory's verified dataset scope.
  IF NEW.advisory_instance_id IS NOT NULL THEN
    SELECT ai.dataset_id
      INTO v_advisory_dataset_id
    FROM public.advisory_instances AS ai
    WHERE ai.id = NEW.advisory_instance_id
      AND ai.organization_id = NEW.organization_id;

    IF v_advisory_dataset_id IS NOT NULL THEN
      IF NEW.dataset_id IS NULL THEN
        NEW.dataset_id := v_advisory_dataset_id;
      ELSIF NEW.dataset_id <> v_advisory_dataset_id THEN
        RAISE EXCEPTION 'decision dataset scope conflicts with advisory dataset scope'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  -- Insight-backed decisions already carry the source dataset in structured
  -- explanation metadata. Promote that evidence into the canonical column.
  v_metadata_dataset_text := NULLIF(NEW.explanation_metadata #>> '{source_data,dataset_id}', '');
  IF v_metadata_dataset_text IS NOT NULL THEN
    BEGIN
      v_metadata_dataset_id := v_metadata_dataset_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'decision source_data.dataset_id is not a valid uuid'
        USING ERRCODE = '22023';
    END;

    IF NEW.dataset_id IS NULL THEN
      NEW.dataset_id := v_metadata_dataset_id;
    ELSIF NEW.dataset_id <> v_metadata_dataset_id THEN
      RAISE EXCEPTION 'decision dataset scope conflicts with source evidence dataset scope'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- A non-null dataset scope is valid only when the dataset belongs to the same
  -- organization. This keeps service-role writers from creating cross-tenant
  -- decision scope even though service_role bypasses RLS.
  IF NEW.dataset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.datasets AS d
    WHERE d.id = NEW.dataset_id
      AND d.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'decision dataset scope does not belong to the decision organization'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_decision_ledger_dataset_scope ON public.decision_ledger;
CREATE TRIGGER trg_enforce_decision_ledger_dataset_scope
  BEFORE INSERT OR UPDATE OF organization_id, dataset_id, advisory_instance_id, explanation_metadata
  ON public.decision_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_decision_ledger_dataset_scope();

-- Trigger-only function: no direct client or service invocation is required.
REVOKE ALL ON FUNCTION public.enforce_decision_ledger_dataset_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_decision_ledger_dataset_scope() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_decision_ledger_dataset_scope() FROM authenticated;
REVOKE ALL ON FUNCTION public.enforce_decision_ledger_dataset_scope() FROM service_role;

NOTIFY pgrst, 'reload schema';
