
DO $$
DECLARE
  _uid uuid;
  _org uuid;
  _email text;
BEGIN
  FOREACH _email IN ARRAY ARRAY['jimipcompany@gmail.com','jimpcompany@gmail.com'] LOOP
    SELECT id INTO _uid FROM auth.users WHERE email = _email LIMIT 1;
    IF _uid IS NULL THEN
      RAISE NOTICE 'No user found for %', _email;
      CONTINUE;
    END IF;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (_uid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    SELECT organization_id INTO _org FROM public.profiles WHERE user_id = _uid LIMIT 1;
    IF _org IS NULL THEN
      SELECT organization_id INTO _org FROM public.organization_members WHERE user_id = _uid LIMIT 1;
    END IF;

    IF _org IS NOT NULL THEN
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (_org, _uid, 'owner')
      ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner';

      IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE organization_id = _org) THEN
        INSERT INTO public.subscriptions (
          organization_id, tier, status, current_period_end,
          stripe_customer_id, stripe_subscription_id
        )
        VALUES (
          _org, 'enterprise', 'active', now() + interval '10 years',
          'manual_grant_cus_' || _uid::text,
          'manual_grant_sub_' || _uid::text
        );
      ELSE
        UPDATE public.subscriptions
        SET tier = 'enterprise',
            status = 'active',
            current_period_end = GREATEST(COALESCE(current_period_end, now()), now() + interval '10 years'),
            payment_failed_at = NULL,
            grace_period_end = NULL
        WHERE organization_id = _org;
      END IF;
    END IF;

    RAISE NOTICE 'Granted full access to % (uid=%, org=%)', _email, _uid, _org;
  END LOOP;
END $$;
