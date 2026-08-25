-- Client-acceptance evidence helper.
--
-- This does not grant a browser or authenticated user access to authentication
-- links. The function is executable only by service_role, which already has
-- Supabase Auth admin authority (including the ability to generate recovery
-- links). It exists so CI can prove a browser-initiated PKCE flow using the
-- exact one-time message produced by the staging Send Email Hook.

CREATE OR REPLACE FUNCTION public.get_auth_evidence_message(
  p_recipient text,
  p_label text,
  p_after timestamptz
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pgmq
AS $$
  WITH candidates AS (
    SELECT enqueued_at, message
    FROM pgmq.q_auth_emails
    UNION ALL
    SELECT enqueued_at, message
    FROM pgmq.a_auth_emails
  )
  SELECT message
  FROM candidates
  WHERE enqueued_at >= p_after
    AND message ->> 'to' = p_recipient
    AND message ->> 'label' = p_label
  ORDER BY enqueued_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_auth_evidence_message(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_auth_evidence_message(text, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.get_auth_evidence_message(text, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_evidence_message(text, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.get_auth_evidence_message(text, text, timestamptz) IS
  'Service-role-only CI evidence lookup for a recent auth-email PGMQ message. Never expose to browser roles.';
