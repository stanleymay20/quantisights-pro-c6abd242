
DROP POLICY IF EXISTS "Anyone can submit enterprise leads" ON public.enterprise_leads;

CREATE POLICY "Anyone can submit valid enterprise leads"
  ON public.enterprise_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(trim(full_name)) BETWEEN 2 AND 200
    AND length(trim(company)) BETWEEN 1 AND 200
    AND work_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    AND length(work_email) <= 320
    AND (use_case IS NULL OR length(use_case) <= 5000)
    AND (notes IS NULL OR length(notes) <= 5000)
    AND status = 'new'
  );
