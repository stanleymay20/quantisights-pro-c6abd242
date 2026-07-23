
-- 1. Fix calibration_assessments INSERT: require org membership
DROP POLICY IF EXISTS "Users can create their own assessments" ON public.calibration_assessments;
CREATE POLICY "Users can create their own assessments"
  ON public.calibration_assessments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_org_member(auth.uid(), organization_id)
  );

-- 2. Fix datasets storage UPDATE: add workspace membership check
DROP POLICY IF EXISTS "Org members can update dataset files" ON storage.objects;
CREATE POLICY "Org members can update dataset files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'datasets'
    AND public.is_org_member(
      auth.uid(),
      (storage.foldername(name))[1]::uuid
    )
    AND public.is_workspace_member(
      auth.uid(),
      (storage.foldername(name))[2]::uuid
    )
  );
