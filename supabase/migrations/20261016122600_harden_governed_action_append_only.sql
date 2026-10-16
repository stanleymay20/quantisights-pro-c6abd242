-- Follow-up hardening for the governed action ledger.
-- Preserve append-only history without blocking legitimate FK cascades during
-- organization erasure. Runtime service-role code does not receive DELETE on
-- requests/events and does not receive UPDATE on events.

DROP TRIGGER IF EXISTS trg_governed_action_events_no_delete ON public.governed_action_events;

REVOKE DELETE ON public.governed_action_requests FROM service_role;
GRANT SELECT, INSERT, UPDATE ON public.governed_action_requests TO service_role;

REVOKE UPDATE, DELETE ON public.governed_action_events FROM service_role;
GRANT SELECT, INSERT ON public.governed_action_events TO service_role;

COMMENT ON TABLE public.governed_action_events IS
  'Append-only lifecycle events. Runtime roles cannot update/delete rows; parent organization erasure may cascade.';
