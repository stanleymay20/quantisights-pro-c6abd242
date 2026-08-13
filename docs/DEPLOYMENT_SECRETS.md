# Supabase deployment credentials

The `Deploy Supabase` GitHub Action requires two repository secrets. It applies
database migrations before deploying Edge Functions so schema and code cannot
silently diverge.

Add the values in GitHub:

1. Open the repository.
2. Go to **Settings -> Secrets and variables -> Actions**.
3. Select **New repository secret**.
4. Add each required value:

| Secret | Value source |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard -> account menu -> Access Tokens. Create a deployment token and copy it once. |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard -> Project Settings -> Database. Use the production database password, rotating it first if its custody is uncertain. |

Do not commit, print, or paste either credential into source files, issues, or
workflow logs. The non-sensitive project reference is pinned in the workflow.

## Redeploy

After both secrets exist:

1. Open **Actions -> Deploy Supabase**.
2. Start a manual workflow dispatch for the current `main` commit.
3. Confirm `Apply database migrations` and `Verify migration state` succeed.
4. Confirm the function deploy step reports no failed functions.

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
that scheduled jobs have run; verify the returned timestamps and production
`trust_metrics_snapshots` rows separately.
