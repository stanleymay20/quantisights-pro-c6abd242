-- Phase 4: Backfill audit_log for existing decision_ledger entries
INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload, created_at)
SELECT
  d.organization_id,
  d.decided_by,
  CASE WHEN d.decided_by IS NULL THEN 'system' ELSE 'user' END,
  'decision.created',
  'decision_ledger',
  d.id::text,
  jsonb_build_object(
    'decision_type', d.decision_type,
    'decision_status', d.decision_status,
    'chosen_action', d.chosen_action,
    'backfilled', true,
    'backfill_reason', 'phase-4-audit-log-backfill'
  ),
  d.created_at
FROM public.decision_ledger d
WHERE d.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_log al
    WHERE al.resource_id = d.id::text
      AND al.action_type = 'decision.created'
  );

INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload, created_at)
SELECT
  d.organization_id,
  d.decided_by,
  CASE WHEN d.decided_by IS NULL THEN 'system' ELSE 'user' END,
  'decision.decided',
  'decision_ledger',
  d.id::text,
  jsonb_build_object(
    'decision_status', d.decision_status,
    'chosen_action', d.chosen_action,
    'backfilled', true
  ),
  COALESCE(d.decided_at, d.updated_at, d.created_at)
FROM public.decision_ledger d
WHERE d.organization_id IS NOT NULL
  AND d.decided_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_log al
    WHERE al.resource_id = d.id::text
      AND al.action_type = 'decision.decided'
  );

INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload, created_at)
SELECT
  d.organization_id,
  d.decided_by,
  'system',
  'decision.outcome_measured',
  'decision_ledger',
  d.id::text,
  jsonb_build_object(
    'actual_value', d.actual_value,
    'outcome_delta', d.outcome_delta,
    'backfilled', true
  ),
  d.outcome_measured_at
FROM public.decision_ledger d
WHERE d.organization_id IS NOT NULL
  AND d.outcome_measured_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_log al
    WHERE al.resource_id = d.id::text
      AND al.action_type = 'decision.outcome_measured'
  );