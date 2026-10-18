-- Integration assertions for a disposable PostgreSQL 17 CI database only.
-- Requires reconciliation-fixtures.sql and the actual Tranche 4 migration.
-- Nothing here dispatches network requests or touches a remote Supabase project.
\set ON_ERROR_STOP on

-- Check the permission boundary before any action.
DO $$
BEGIN
  IF pg_catalog.has_function_privilege('anon',
    'public.reconcile_execution_action_receipt(uuid,uuid,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'anon unexpectedly has reconciliation RPC EXECUTE';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated',
    'public.protect_execution_reconciliation_evidence()','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated unexpectedly has direct trigger helper EXECUTE';
  END IF;
  IF pg_catalog.has_table_privilege('authenticated',
    'public.execution_action_receipts','SELECT') THEN
    RAISE EXCEPTION 'authenticated can directly read protected receipt table';
  END IF;
END;
$$;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-111111111111';

-- A normal organization member may read but never reconcile.
DO $$
DECLARE
  blocked boolean := false;
  v_rows jsonb;
BEGIN
  v_rows := public.list_execution_action_receipts(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-333333333333'
  );
  IF jsonb_array_length(v_rows) <> 1 OR v_rows->0->>'id' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' THEN
    RAISE EXCEPTION 'Tenant-scoped read leaked or omitted a receipt';
  END IF;
  IF (v_rows->0 ? 'idempotency_key') OR (v_rows->0 ? 'request_fingerprint') THEN
    RAISE EXCEPTION 'Tenant projection exposes private intent identifiers';
  END IF;
  BEGIN
    PERFORM public.reconcile_execution_action_receipt(
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'succeeded','Member cannot resolve this receipt',NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Non-admin successfully reconciled a receipt';
  END IF;
END;
$$;

-- A different tenant's owner cannot access or reconcile org A.
SET request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-111111111111';
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.list_execution_action_receipts(
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-333333333333'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Cross-tenant receipt read succeeded';
  END IF;
END;
$$;

-- An org A owner cannot resolve an org B receipt by passing org A.
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-111111111111';
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.reconcile_execution_action_receipt(
      '11111111-1111-4111-8111-111111111111',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'failed','Not a receipt in this organization',NULL
    );
  EXCEPTION WHEN no_data_found THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Cross-tenant receipt reconciliation succeeded';
  END IF;
END;
$$;

-- Governed reconciliation succeeds exactly once and returns source evidence.
DO $$
DECLARE
  resolved jsonb;
BEGIN
  resolved := public.reconcile_execution_action_receipt(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'succeeded',
    'Verified in the external provider console.',
    'provider-message-123'
  );
  IF resolved->>'success' <> 'true'
    OR resolved->'receipt'->>'status' <> 'succeeded'
    OR resolved->'receipt'->>'reconciliation_evidence_version' <> 'v1'
    OR length(resolved->'receipt'->>'reconciliation_evidence_digest') <> 64 THEN
    RAISE EXCEPTION 'Successful reconciliation omitted its source evidence';
  END IF;
END;
$$;

DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.reconcile_execution_action_receipt(
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'failed','A second conflicting reconciliation must fail',NULL
    );
  EXCEPTION WHEN check_violation THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Second reconciliation was not rejected';
  END IF;
END;
$$;

-- Now verify exact stored UTF-8 material and immutable source fields as DB owner.
RESET ROLE;
DO $$
DECLARE
  r public.execution_action_receipts%ROWTYPE;
  m jsonb;
  failed boolean := false;
BEGIN
  SELECT * INTO STRICT r FROM public.execution_action_receipts
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  IF r.reconciliation_evidence_digest IS DISTINCT FROM
    pg_catalog.encode(extensions.digest(r.reconciliation_evidence_material,'sha256'),'hex') THEN
    RAISE EXCEPTION 'Persisted source material does not hash to stored digest';
  END IF;
  m := r.reconciliation_evidence_material::jsonb;
  IF m->>'receipt_id' <> r.id::text
    OR m->>'resolution' <> r.status
    OR m->>'reconciled_by' <> r.reconciled_by::text
    OR (m->>'reconciled_at')::timestamptz <> r.reconciled_at
    OR m->>'reconciliation_note' <> r.reconciliation_note
    OR m->>'external_reference' <> r.external_reference
    OR m->>'provider_evidence_digest' <> repeat('a',64)
    OR r.response_metadata->>'provider_evidence_digest' <> repeat('a',64) THEN
    RAISE EXCEPTION 'Source evidence semantics diverge from receipt or original provider digest';
  END IF;
  IF r.response_metadata->'reconciliation'->>'evidence_digest' <> r.reconciliation_evidence_digest THEN
    RAISE EXCEPTION 'Operational metadata is not bound to source reconciliation digest';
  END IF;

  BEGIN
    UPDATE public.execution_action_receipts
      SET reconciliation_note = 'Tampered with after governed resolution'
      WHERE id = r.id;
  EXCEPTION WHEN check_violation THEN
    failed := true;
  END;
  IF NOT failed THEN
    RAISE EXCEPTION 'Source reconciliation could be mutated after persistence';
  END IF;

  failed := false;
  BEGIN
    UPDATE public.execution_action_receipts
      SET status = 'failed'
      WHERE id = r.id;
  EXCEPTION WHEN check_violation THEN
    failed := true;
  END;
  IF NOT failed THEN
    RAISE EXCEPTION 'Reconciled receipt status could be rewritten';
  END IF;

  IF (SELECT count(*) FROM public.execution_events
      WHERE event_type='outbound_action_reconciled') <> 1
    OR (SELECT count(*) FROM public.audit_log
      WHERE action_type='outbound_execution_reconciled') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one governed event and audit entry';
  END IF;
END;
$$;

-- A read as owner still returns only the member's own tenant record.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-111111111111';
DO $$
DECLARE v_rows jsonb;
BEGIN
  v_rows := public.list_execution_action_receipts(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-333333333333'
  );
  IF jsonb_array_length(v_rows) <> 1
    OR v_rows->0->>'reconciliation_evidence_digest' IS NULL
    OR v_rows->0->>'reconciliation_evidence_material' IS NULL
    OR v_rows->0 ? 'idempotency_key' THEN
    RAISE EXCEPTION 'Tenant projection missing source evidence or exposing private keys';
  END IF;
END;
$$;
RESET ROLE;
