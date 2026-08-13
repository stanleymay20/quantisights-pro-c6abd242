CREATE TABLE public.gdpr_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_email TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('access','rectification','erasure','restriction','portability','objection','automated_decision_opt_out','complaint')),
  organization_context TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','verifying','in_progress','fulfilled','rejected')),
  source_ip INET,
  user_agent TEXT,
  honeypot_triggered BOOLEAN NOT NULL DEFAULT false,
  hour_bucket BIGINT NOT NULL DEFAULT 0,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gdpr_requests
  ADD CONSTRAINT gdpr_requests_email_len CHECK (char_length(requester_email) <= 254),
  ADD CONSTRAINT gdpr_requests_org_len CHECK (organization_context IS NULL OR char_length(organization_context) <= 200),
  ADD CONSTRAINT gdpr_requests_msg_len CHECK (message IS NULL OR char_length(message) <= 2000);

CREATE OR REPLACE FUNCTION public.gdpr_requests_set_hour_bucket()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.hour_bucket := floor(extract(epoch from NEW.created_at) / 3600)::bigint;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gdpr_requests_hour_bucket
  BEFORE INSERT ON public.gdpr_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.gdpr_requests_set_hour_bucket();

CREATE UNIQUE INDEX gdpr_requests_email_type_hour_uniq
  ON public.gdpr_requests (lower(requester_email), request_type, hour_bucket);

CREATE INDEX gdpr_requests_status_idx ON public.gdpr_requests (status, created_at DESC);

GRANT INSERT ON public.gdpr_requests TO anon, authenticated;
GRANT SELECT, UPDATE ON public.gdpr_requests TO authenticated;
GRANT ALL ON public.gdpr_requests TO service_role;

ALTER TABLE public.gdpr_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone may submit a GDPR request"
  ON public.gdpr_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (honeypot_triggered = false);

CREATE POLICY "Admins may read GDPR requests"
  ON public.gdpr_requests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins may update GDPR requests"
  ON public.gdpr_requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER gdpr_requests_updated_at
  BEFORE UPDATE ON public.gdpr_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();