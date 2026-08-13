# Supabase deployment credentials

Quantivis uses separate GitHub Environments for staging and production. Never
store a database password as a repository-wide secret: environment scoping
prevents a staging workflow from receiving production credentials.

## GitHub Environment setup

Create two environments under **Settings -> Environments**:

| Environment | Project | Deployment rule |
| --- | --- | --- |
| `staging` | `cmnihsbdbpubznlkmjbc` | May deploy automatically from `main` |
| `production` | `itpwpnwzzitkelffttyx` | Require a reviewer before deployment |

Add these secrets separately inside each environment:

| Secret | Value source |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard -> account menu -> Access Tokens. Use a dedicated deployment token. |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard -> the matching project -> Database settings. |

Do not commit, print, or paste either credential into source files, issues, or
workflow logs. The non-sensitive project references are pinned independently in
their workflows.

For each target, the non-sensitive project reference is pinned in its workflow;
credentials alone cannot redirect a job to a different project.

## Staging deployment

`Deploy Supabase Staging` runs for Supabase changes pushed to `main` and can
also be started manually. It previews migrations, applies them, deploys every
Edge Function, and lists the hosted functions as verification.

The staging database must have a Vault value named `project_url` containing
`https://cmnihsbdbpubznlkmjbc.supabase.co`. Scheduled functions read this value
instead of embedding a production URL.

## Production promotion

`Deploy Supabase Production` is manual and protected by the `production`
environment. After staging acceptance:

1. Open **Actions -> Deploy Supabase Production**.
2. Select the exact tested `main` commit.
3. Enter `itpwpnwzzitkelffttyx` in the confirmation field.
4. Approve the protected-environment deployment.
5. Confirm migration preview, migration application, function deployment, and
   final function listing all succeed.

Before the first production promotion, create the production `project_url`
Vault value with the matching production URL. The trust-metrics migration fails
closed when that value is missing or malformed.

## Verify

Call the public function using the application's public Supabase key:

```bash
curl -i \
  https://itpwpnwzzitkelffttyx.supabase.co/functions/v1/public-system-status \
  -H "Origin: https://www.quantivis.io" \
  -H "apikey: <public-publishable-key>"
```

The response must not be `NOT_FOUND`. A successful response contains
`generated_at` and scheduler evidence with `last_run_at`,
`next_expected_run_at`, `severity`, and `evidence_source`.

Deployment success proves that the endpoint and schema exist. It does not prove
that scheduled jobs have run; verify the returned timestamps and
`trust_metrics_snapshots` rows separately.
