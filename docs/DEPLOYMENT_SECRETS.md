# Supabase deployment secrets

The `Deploy Supabase Edge Functions` GitHub Action requires two repository
secrets. The failed workflow run on June 25, 2026 received both values as
empty, so it stopped before deploying `public-system-status`.

Add the values in GitHub:

1. Open the repository.
2. Go to **Settings → Secrets and variables → Actions**.
3. Select **New repository secret**.
4. Add each required value:

| Secret | Value source |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → account menu → Access Tokens. Create a deployment token and copy it once. |
| `SUPABASE_PROJECT_REF` | `itpwpnwzzitkelffttyx` |

Do not commit, print, or paste the access token into source files, issues, or
workflow logs. Although the project reference is not sensitive, the workflow
currently reads it through GitHub Secrets for consistent deployment handling.

## Redeploy

After both secrets exist:

1. Open **Actions → Deploy Supabase Edge Functions**.
2. Open the failed run or start a manual workflow dispatch.
3. Select **Re-run failed jobs**.
4. Confirm the deploy step reports `public-system-status` as deployed.

## Verify

Call the public function using the application's public Supabase key:

```bash
curl -i \
  https://itpwpnwzzitkelffttyx.supabase.co/functions/v1/public-system-status \
  -H "Origin: https://www.quantivis.io" \
  -H "apikey: <public-publishable-key>"
```

The response must not be `NOT_FOUND`. A successful response contains
`generated_at` and six job evidence objects with `last_run_at`,
`next_expected_run_at`, `severity`, and `evidence_source`.

Deployment success proves that the endpoint exists. It does not prove that the
scheduler has run; the returned timestamps and statuses are the scheduler
evidence.
