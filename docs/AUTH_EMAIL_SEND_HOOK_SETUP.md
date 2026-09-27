# Auth Send Email hook

The Supabase Auth **Send Email** hook routes every signup, magic-link,
recovery, email-change and reauthentication email through the
`auth-email-hook` Edge Function. That function renders the branded templates in
`supabase/functions/_shared/email-templates/`, queues the mail in
`pgmq` `auth_emails`, and logs it in `public.email_send_log`.

## The deploy workflows own the hook. Do not configure it in the dashboard.

Both `Deploy Supabase Staging` and `Deploy Supabase Production` configure the
hook on every run. The "Configure independent … Auth email transport" step:

1. If `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set in the GitHub
   Environment, preflights that pair and writes it to the project's Edge
   Function secrets. If neither is set, it keeps the provider secrets already
   stored in Supabase. Setting only one of the two fails the run.
2. Proves that the active provider credentials and the worker's service-role
   authorization work (`scripts/preflight-supabase-auth-email.mjs runtime`).
3. Disables the existing hook, generates a fresh `v1,whsec_…` signing secret,
   stores it as `SEND_EMAIL_HOOK_SECRET`, re-enables the hook against
   `https://<project-ref>.supabase.co/functions/v1/auth-email-hook`, and
   verifies the result (`scripts/configure-supabase-auth-email.mjs`).

The signing secret is rotated on every deploy, so any hook secret entered by
hand in the dashboard is replaced the next time the workflow runs. To change
the email transport, change the GitHub Environment secrets and re-run the
workflow.

| Environment | Project ref | Workflow |
| --- | --- | --- |
| Staging | `cmnihsbdbpubznlkmjbc` | `.github/workflows/deploy-supabase-staging.yml` |
| Production | `izgfrekdamlgigehxoqs` | `.github/workflows/deploy-edge-functions.yml` |

`itpwpnwzzitkelffttyx` is the retired former production project.

## Verify

After a deploy, trigger one real auth email (a password-reset request from the
login page is simplest), then check:

```sql
select id, template_name, recipient_email, status, created_at
from public.email_send_log
order by created_at desc
limit 5;
```

A new row with `status = 'sent'` confirms the hook fired. `select
pgmq.metrics('auth_emails');` should show `total_messages` above 0.

If `email_send_log` stays empty, check the `auth-email-hook` function logs for
a 401 (hook secret mismatch: re-run the deploy workflow) or a 500
(payload/template error). An empty log with GoTrue sending from
`noreply@mail.app.supabase.io` means the hook is not enabled. Production has no
`email_send_log` rows until its first gated deploy runs this step.
