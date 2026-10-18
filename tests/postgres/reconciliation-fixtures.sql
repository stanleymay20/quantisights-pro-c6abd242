-- Synthetic, disposable PostgreSQL 17 fixtures for Tranche 4 SQL execution.
-- NOT the Quantivis production/staging schema. Never use this file on remote databases.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE SCHEMA auth;
CREATE SCHEMA extensions;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.organization_members (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL
);

CREATE TABLE public.execution_action_receipts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  execution_plan_id uuid NOT NULL,
  decision_id uuid NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('claimed','uncertain','succeeded','failed')),
  response_status integer,
  response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  reconciled_at timestamptz,
  reconciled_by uuid,
  reconciliation_note text,
  external_reference text,
  attempt_count integer DEFAULT 1,
  max_attempts integer DEFAULT 3,
  last_attempt_at timestamptz,
  last_retry_reason text,
  retry_exhausted_at timestamptz,
  idempotency_key text,
  request_fingerprint text
);
ALTER TABLE public.execution_action_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.execution_action_receipts FROM PUBLIC, anon, authenticated;

CREATE TABLE public.execution_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  execution_plan_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_id uuid,
  metadata jsonb NOT NULL
);
CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL,
  actor_id uuid,
  actor_type text NOT NULL,
  action_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  payload jsonb NOT NULL
);

INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
  ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-111111111111','owner'),
  ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-111111111111','member'),
  ('22222222-2222-4222-8222-222222222222','cccccccc-cccc-4ccc-8ccc-111111111111','owner');

INSERT INTO public.execution_action_receipts (
  id,organization_id,execution_plan_id,decision_id,action_type,
  status,response_status,response_metadata,error_message,
  idempotency_key,request_fingerprint
) VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-222222222222',
    '11111111-1111-4111-8111-333333333333',
    'notify_slack','uncertain',504,
    jsonb_build_object('provider_evidence_digest',repeat('a',64),'provider_evidence_observed_status','uncertain','transport','timeout'),
    'Provider outcome could not be confirmed',
    repeat('x',24),repeat('f',64)
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-444444444444',
    '11111111-1111-4111-8111-333333333333',
    'notify_slack','uncertain',504,
    jsonb_build_object('provider_evidence_digest',repeat('b',64)),
    'Another tenant outcome',repeat('y',24),repeat('e',64)
  );
