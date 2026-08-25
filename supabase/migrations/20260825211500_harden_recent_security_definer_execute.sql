-- Recent SECURITY DEFINER functions were created after the baseline privilege
-- hardening migration. Explicitly remove legacy client-role grants so upgraded
-- projects converge with clean installations.

REVOKE ALL ON FUNCTION public.augment_executive_brief_decision_value()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_aicis_decision_value_attribution()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_decision_value_summary(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_execution_action_receipts(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_execution_compensation_requests(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconcile_execution_action_receipt(uuid, uuid, text, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_decision_value_attribution(uuid, uuid, text, numeric, numeric, numeric, text, text, numeric, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_execution_compensation(uuid, uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_execution_compensation(uuid, uuid, text, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_decision_value_summary(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_execution_action_receipts(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_execution_compensation_requests(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_execution_action_receipt(uuid, uuid, text, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_decision_value_attribution(uuid, uuid, text, numeric, numeric, numeric, text, text, numeric, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_execution_compensation(uuid, uuid, text, text, jsonb, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_execution_compensation(uuid, uuid, text, text)
  TO authenticated, service_role;
