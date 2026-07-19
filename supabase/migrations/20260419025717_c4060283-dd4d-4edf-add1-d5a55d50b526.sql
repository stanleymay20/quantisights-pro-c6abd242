-- Allow org members with admin/owner role to write their own internal reference data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='internal_reference_data'
      AND policyname='Org admins insert own reference data'
  ) THEN
    CREATE POLICY "Org admins insert own reference data"
      ON public.internal_reference_data
      FOR INSERT
      TO authenticated
      WITH CHECK (
        organization_id IS NOT NULL
        AND public.exec_require_elevated_role(auth.uid(), organization_id)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='internal_reference_data'
      AND policyname='Org admins update own reference data'
  ) THEN
    CREATE POLICY "Org admins update own reference data"
      ON public.internal_reference_data
      FOR UPDATE
      TO authenticated
      USING (
        organization_id IS NOT NULL
        AND public.exec_require_elevated_role(auth.uid(), organization_id)
      )
      WITH CHECK (
        organization_id IS NOT NULL
        AND public.exec_require_elevated_role(auth.uid(), organization_id)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='internal_reference_data'
      AND policyname='Org admins delete own reference data'
  ) THEN
    CREATE POLICY "Org admins delete own reference data"
      ON public.internal_reference_data
      FOR DELETE
      TO authenticated
      USING (
        organization_id IS NOT NULL
        AND public.exec_require_elevated_role(auth.uid(), organization_id)
      );
  END IF;
END $$;