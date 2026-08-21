-- Governed reconciliation metadata for ambiguous outbound execution receipts.
--
-- Transport failures can leave an action in `uncertain` even when the external
-- system actually accepted or rejected the request. Reconciliation must never
-- re-dispatch the side effect; it records reviewed external evidence and closes
-- the receipt deterministically.

ALTER TABLE public.execution_action_receipts
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_by uuid,
  ADD COLUMN IF NOT EXISTS reconciliation_note text,
  ADD COLUMN IF NOT EXISTS external_reference text;

ALTER TABLE public.execution_action_receipts
  DROP CONSTRAINT IF EXISTS execution_action_receipts_reconciliation_note_length;
ALTER TABLE public.execution_action_receipts
  ADD CONSTRAINT execution_action_receipts_reconciliation_note_length
  CHECK (reconciliation_note IS NULL OR char_length(reconciliation_note) BETWEEN 10 AND 2000);

ALTER TABLE public.execution_action_receipts
  DROP CONSTRAINT IF EXISTS execution_action_receipts_external_reference_length;
ALTER TABLE public.execution_action_receipts
  ADD CONSTRAINT execution_action_receipts_external_reference_length
  CHECK (external_reference IS NULL OR char_length(external_reference) <= 500);

CREATE INDEX IF NOT EXISTS execution_action_receipts_uncertain_idx
  ON public.execution_action_receipts (organization_id, created_at DESC)
  WHERE status = 'uncertain';

COMMENT ON COLUMN public.execution_action_receipts.reconciled_at IS
  'Time an authorized reviewer resolved an uncertain transport outcome using external evidence.';
COMMENT ON COLUMN public.execution_action_receipts.reconciled_by IS
  'Authenticated owner/admin who performed reconciliation; no outbound action is dispatched by reconciliation.';
COMMENT ON COLUMN public.execution_action_receipts.reconciliation_note IS
  'Required reviewer explanation describing the external evidence used to resolve uncertainty.';
COMMENT ON COLUMN public.execution_action_receipts.external_reference IS
  'Optional external-system reference such as a request, message, ticket, or transaction identifier.';
