-- Quantivis 10/10 tranche 1: governed enterprise action loop foundation.
--
-- This migration adds the durable server-owned request/receipt ledger for external
-- enterprise actions. It deliberately does NOT add any provider write adapter.
-- Existing connectors stay read/recommend-only until a connector-specific write
-- path is separately proven in staging.

CREATE TABLE IF NOT EXISTS public.governed_action_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES public.decision_ledger(id) ON DELETE RESTRICT,
  connector_id uuid NOT NULL REFERENCES public.data_connectors(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL,
  connector_type text NOT NULL,
  action_type text NOT NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  dry_run boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'dry_run'
    CHECK (status IN ('dry_run', 'approval_required', 'executing', 'executed', 'failed', 'unknown')),
  reversible boolean NOT NULL DEFAULT false,
  provider_receipt_id text,
  response_digest text,
  failure_code text,
  failure_message text,
  attempted_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT governed_action_idempotency_unique
    UNIQUE (organization_id, connector_id, action_type, idempotency_key),
  CONSTRAINT governed_action_receipt_consistency CHECK (
    status <> 'executed'
    OR provider_receipt_id IS NOT NULL
    OR response_digest IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_governed_action_requests_org_created
  ON public.governed_action_requests (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_governed_action_requests_decision
  ON public.governed_action_requests (decision_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_governed_action_requests_connector
  ON public.governed_action_requests (connector_id, created_at DESC);

ALTER TABLE public.governed_action_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_view_governed_action_requests" ON public.governed_action_requests;
CREATE POLICY "members_view_governed_action_requests"
  ON public.governed_action_requests
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

-- Browser roles never create/update/delete action ledger rows directly.
-- Writes are owned by the governed-action Edge function through service_role.
REVOKE INSERT, UPDATE, DELETE ON public.governed_action_requests FROM anon, authenticated;
GRANT SELECT ON public.governed_action_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.governed_action_requests TO service_role;

CREATE TABLE IF NOT EXISTS public.governed_action_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_request_id uuid NOT NULL REFERENCES public.governed_action_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN (
      'requested',
      'dry_run_validated',
      'approval_required',
      'attempted',
      'executed',
      'failed',
      'verification_unknown',
      'verified',
      'compensation_requested',
      'compensated'
    )),
  actor_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governed_action_events_action
  ON public.governed_action_events (action_request_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_governed_action_events_org
  ON public.governed_action_events (organization_id, created_at DESC);

ALTER TABLE public.governed_action_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_view_governed_action_events" ON public.governed_action_events;
CREATE POLICY "members_view_governed_action_events"
  ON public.governed_action_events
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

REVOKE INSERT, UPDATE, DELETE ON public.governed_action_events FROM anon, authenticated;
GRANT SELECT ON public.governed_action_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.governed_action_events TO service_role;

-- Append-only event semantics. Even service-role code may not mutate or delete
-- individual event rows after creation. Organization deletion remains possible
-- through the parent FK cascade.
CREATE OR REPLACE FUNCTION public.prevent_governed_action_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'governed_action_events are append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_governed_action_events_no_update ON public.governed_action_events;
CREATE TRIGGER trg_governed_action_events_no_update
  BEFORE UPDATE ON public.governed_action_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_governed_action_event_mutation();

DROP TRIGGER IF EXISTS trg_governed_action_events_no_delete ON public.governed_action_events;
CREATE TRIGGER trg_governed_action_events_no_delete
  BEFORE DELETE ON public.governed_action_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_governed_action_event_mutation();

-- Reuse the existing repository-wide updated_at helper for the mutable request
-- state row; event rows stay immutable.
DROP TRIGGER IF EXISTS trg_governed_action_requests_updated_at ON public.governed_action_requests;
CREATE TRIGGER trg_governed_action_requests_updated_at
  BEFORE UPDATE ON public.governed_action_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.governed_action_requests IS
  'Server-owned ledger for governed external enterprise actions. Executed rows require a provider receipt or verifiable response digest.';
COMMENT ON TABLE public.governed_action_events IS
  'Append-only lifecycle events for governed external enterprise actions.';
