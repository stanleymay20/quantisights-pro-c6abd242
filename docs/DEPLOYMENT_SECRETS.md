# Supabase deployment credentials

Quantivis uses separate GitHub Environments for staging and production. Never
store a database password as a repository-wide secret: environment scoping
prevents a staging workflow from receiving production credentials.

## GitHub Environment setup

Create two environments under **Settings -> Environments**:

| Environment | Project | Deployment rule |
| --- | --- | --- |
| `staging` | `cmnihsbdbpubznlkmjbc` | May deploy automatically from `main` |
| `production` | `izgfrekdamlgigehxoqs` | Require a reviewer before deployment |

Add these secrets separately inside each environment:

| Secret | Value source |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard -> account menu -> Access Tokens. Use a dedicated deployment token. |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard -> the matching project -> Database settings. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Resend dashboard. Optional as a pair: when absent, the workflow verifies the provider secrets already stored in Supabase instead of rotating them. |

`itpwpnwzzitkelffttyx` is the retired former production project. The
configuration scripts refuse to touch it.

A rejected `SUPABASE_ACCESS_TOKEN` shows up as `Supabase Auth config GET
failed: Unauthorized` in the first Management API step. Tokens are
account-scoped and can be revoked or expire. Generate a new one and replace
the environment secret; nothing else needs to change.

Do not commit, print, or paste either credential into source files, issues, or
workflow logs. The non-sensitive project references are pinned independently in
their workflows.

For each target, the non-sensitive project reference is pinned in its workflow;
credentials alone cannot redirect a job to a different project.

## Staging deployment

`Deploy Supabase Staging` (`.github/workflows/deploy-supabase-staging.yml`)
runs after CI succeeds for a push to `main` and can also be started manually.
It previews and applies migrations, verifies the database privilege boundary
(`scripts/verify-supabase-privilege-boundary.mjs`), enforces Auth hardening
(`scripts/configure-supabase-auth-hardening.mjs`), deploys every Edge Function,
and configures the Auth Send Email hook.

The pipeline refuses to push when staging has a migration that `main` does not
(for example, one applied from an unmerged branch). Merge that branch or remove
the remote-only version before the next deploy.

The staging database must have a Vault value named `project_url` containing
`https://cmnihsbdbpubznlkmjbc.supabase.co`. Scheduled functions read this value
instead of embedding a production URL.

## Production promotion

`Deploy Supabase Production` (`.github/workflows/deploy-edge-functions.yml`)
is manual and protected by the `production` environment. It only accepts a
SHA that carries a successful GA Readiness proof. After GA Readiness passes:

1. Open **Actions -> Deploy Supabase Production**.
2. Enter the certified `release_sha` and its `ga_readiness_run_id`.
3. Enter `izgfrekdamlgigehxoqs` in the confirmation field.
4. Approve the protected-environment deployment.
5. Confirm the migration preview and application, the privilege-boundary check,
   Auth hardening, function deployment, and Auth email transport all succeed.

Do not apply production migrations by hand (SQL editor, MCP, or `supabase db
push` from a laptop). Doing so bypasses the release chain. Grant drift that
never went through staging is exactly how client roles came to execute
service-only SECURITY DEFINER functions in production.

Before the first production promotion, create the production `project_url`
Vault value with the matching production URL. The trust-metrics migration fails
closed when that value is missing or malformed.

## Verify

Call the public function using the application's public Supabase key:

```bash
curl -i \
  https://izgfrekdamlgigehxoqs.supabase.co/functions/v1/public-system-status \
  -H "Origin: https://www.quantivis.io" \
  -H "apikey: <public-publishable-key>"
```

The response must not be `NOT_FOUND`. A successful response contains
`generated_at` and scheduler evidence with `last_run_at`,
`next_expected_run_at`, `severity`, and `evidence_source`.

Deployment success proves that the endpoint and schema exist. It does not prove
that scheduled jobs have run; verify the returned timestamps and
`trust_metrics_snapshots` rows separately.
