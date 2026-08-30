# Wiring the Auth Send Email Hook

The `auth-email-hook` Edge Function is deployed and active on both the staging
and production Supabase projects, but Supabase Auth has never actually been
told to call it. Confirmed directly against both projects:

- `public.email_send_log` has **0 rows, ever**, on staging and on production.
- `pgmq.metrics('auth_emails')` on staging shows `total_messages: 0`.
- GoTrue's own logs during a failing `Client Acceptance` run show it sending
  magic-link and recovery mail itself, directly, from
  `noreply@mail.app.supabase.io` — there is no webhook call anywhere in the
  log for that window.

Until this is wired up, every signup/magic-link/recovery/email-change email is
Supabase's generic unbranded default, not the app's `SignupEmail` /
`MagicLinkEmail` / `RecoveryEmail` / `EmailChangeEmail` /
`ReauthenticationEmail` templates in `supabase/functions/_shared/email-templates/`
— and it's why `Client Acceptance` fails closed every run on AUTH-004
(PKCE), AUTH-011 (password-reset request), and AUTH-013 (recovery round-trip):
the evidence RPC polls a queue the hook would populate, and nothing has ever
populated it.

## Projects

| Environment | Project ref | Notes |
| --- | --- | --- |
| Staging | `cmnihsbdbpubznlkmjbc` | `quantisights-pro-staging`. Do this one first. |
| Production | `izgfrekdamlgigehxoqs` | `quantivis-production`, created 2026-08-16. |

`docs/DEPLOYMENT_SECRETS.md` documents the production ref as
`itpwpnwzzitkelffttyx`. That ref does not resolve for this account (`ProtocolError:
You do not have permission to perform this action` — not a "not found," so it
may belong to a different org or be a stale/retired project). **Verify which
ref is the real production project before touching production Auth
settings** — confirm in Supabase Dashboard -> your organization -> project
list, and reconcile whichever of the two refs is wrong before proceeding.

## Steps (per project — do staging, verify, then production)

1. **Confirm the function's webhook secret isn't already set.**
   Dashboard -> select the project -> **Edge Functions** -> `auth-email-hook`
   -> **Secrets**. Note whether `SEND_EMAIL_HOOK_SECRET` already exists. If it
   does and you don't know its value, you'll replace it in step 3 — enabling
   the hook below generates a new one, and the function will 401 every real
   auth email until the two match, so do not skip straight to production.

2. **Enable the Send Email hook.**
   Dashboard -> **Authentication** -> **Hooks** (may show as "Hooks (Beta)")
   -> find **Send Email** -> **Enable**.
   - Hook type: **HTTPS**.
   - Endpoint URL:
     `https://<project-ref>.supabase.co/functions/v1/auth-email-hook`
     (use the project ref from the table above for whichever environment
     you're configuring).
   - Supabase generates a signing secret in the form `v1,whsec_...` and shows
     it once. Copy it now.

3. **Set the matching function secret.**
   Same **Edge Functions** -> `auth-email-hook` -> **Secrets** panel (or via
   CLI: `supabase secrets set SEND_EMAIL_HOOK_SECRET='v1,whsec_...' --project-ref <project-ref>`).
   Paste the exact value from step 2, including the `v1,whsec_` prefix — the
   function strips that prefix itself (`configuredSecret.replace(/^v1,whsec_/, "")`)
   before verifying, so pass the value Supabase gave you unmodified.

4. **Save and confirm the hook shows Enabled** against the `auth-email-hook`
   endpoint in the Authentication -> Hooks screen.

## Verify

Trigger one real auth email against the environment you just configured (a
password-reset request from the login page is the simplest), then check:

```sql
select id, template_name, recipient_email, status, created_at
from public.email_send_log
order by created_at desc
limit 5;
```

A new row with `status = 'sent'` (or `'pending'` briefly, then `'sent'`)
confirms the hook fired. On staging, also confirm the queue received it:

```sql
select pgmq.metrics('auth_emails');
```

`total_messages` should now be greater than 0.

If `email_send_log` stays empty after a real trigger, check the
`auth-email-hook` function's **Logs** tab in the dashboard for a 401
(secret mismatch — redo step 3) or 500 (payload/template error) before
re-enabling the hook.

## After staging is confirmed working

Re-run `Client Acceptance` (`.github/workflows/client-acceptance.yml`,
`workflow_dispatch`) against the current `main` SHA. AUTH-004, AUTH-011, and
AUTH-013 should now exercise the real branded pipeline instead of timing out.
Only repeat these steps against production once staging is verified — a bad
secret on production fails closed (no auth email sent at all, not a fallback
to Supabase's default mailer), so don't flip production Auth settings until
you've watched a real staging round-trip succeed.
