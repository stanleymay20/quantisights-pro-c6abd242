
-- execution_predictions: deny all direct writes (only service-role RPCs write)
CREATE POLICY "Deny direct insert on predictions"
ON public.execution_predictions
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Deny direct update on predictions"
ON public.execution_predictions
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Deny direct delete on predictions"
ON public.execution_predictions
FOR DELETE
TO authenticated
USING (false);

-- execution_scores: deny all direct writes (only service-role RPCs write)
CREATE POLICY "Deny direct insert on scores"
ON public.execution_scores
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Deny direct update on scores"
ON public.execution_scores
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Deny direct delete on scores"
ON public.execution_scores
FOR DELETE
TO authenticated
USING (false);
