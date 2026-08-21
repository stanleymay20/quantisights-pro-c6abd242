-- Durable idempotency receipts for governed outbound execution.
--
-- The execute-decision-action Edge Function claims a receipt before any
-- external side effect. A repeated request with the same idempotency key can
-- therefore return the existing receipt instead of firing the action again.
-- The table is intentionally service-role only: RLS is enabled and no client
-- policies are granted.

CREATE TABLE IF NOT EXISTS public.execution_action_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  execution_plan_id uuid NOT NULL REFERENCES public.execution_plans(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES public.decision_ledger(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'succeeded', 'failed', 'uncertain')),
  initiated_by uuid,
  response_status integer,
  response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT execution_action_receipts_idempotency_key_length
    CHECK (char_length(idempotency_key) BETWEEN 16 AND 200),
  CONSTRAINT execution_action_receipts_request_fingerprint_length
    CHECK (char_length(request_fingerprint) BETWEEN 32 AND 128),
  CONSTRAINT execution_action_receipts_org_key_unique
    UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS execution_action_receipts_plan_created_idx
  ON public.execution_action_receipts (execution_plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS execution_action_receipts_decision_created_idx
  ON public.execution_action_receipts (decision_id, created_at DESC);

ALTER TABLE public.execution_action_receipts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.execution_action_receipts IS
  'Service-role-only durable receipts used to prevent duplicate governed outbound side effects.';
COMMENT ON COLUMN public.execution_action_receipts.idempotency_key IS
  'Caller-supplied execution intent key. Unique per organization and reused across transport retries.';
COMMENT ON COLUMN public.execution_action_receipts.request_fingerprint IS
  'SHA-256 fingerprint of the action type, plan, destination, and payload/message associated with the key.';
COMMENT ON COLUMN public.execution_action_receipts.status IS
  'claimed before dispatch; succeeded/failed after a definitive response; uncertain when dispatch outcome cannot be proven.';
