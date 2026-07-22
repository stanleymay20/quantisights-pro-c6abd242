# Cloudflare security-header automation

This repository includes a manual GitHub Actions workflow that creates or updates the Cloudflare HTTP response header transform rule for `www.quantivis.io`.

The automation does not hardcode secrets. It reads Cloudflare credentials from environment variables or GitHub Actions secrets.

## Required GitHub Actions secrets

Add these in GitHub:

`Settings` → `Secrets and variables` → `Actions` → `New repository secret`

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token allowed to edit zone rulesets. |
| `CLOUDFLARE_ZONE_ID` | Cloudflare Zone ID for the Quantivis domain. |

## Cloudflare API token

Create the token in Cloudflare:

1. Open `My Profile` → `API Tokens`.
2. Choose `Create Token`.
3. Use a custom token.
4. Grant zone-scoped permissions for the Quantivis zone:
   - `Zone` → `Rulesets` → `Edit`
   - `Zone` → `Zone` → `Read`
5. Restrict the token to the Quantivis zone.
6. Save the generated token as the GitHub secret `CLOUDFLARE_API_TOKEN`.

Do not commit the token to the repository.

## Zone ID

Find the Zone ID in Cloudflare:

1. Open the Cloudflare dashboard.
2. Select the Quantivis domain zone.
3. Open the zone overview page.
4. Copy the `Zone ID` from the API section.
5. Save it as the GitHub secret `CLOUDFLARE_ZONE_ID`.

## What the workflow applies

The workflow runs `npm run headers:apply`, which creates or updates one HTTP response header transform rule using the Cloudflare Rulesets API.

Target expression:

```text
http.host eq "www.quantivis.io"
```

Managed headers:

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

## Manual GitHub workflow run

1. Open the repository in GitHub.
2. Go to `Actions`.
3. Select `Apply Cloudflare Security Headers`.
4. Click `Run workflow`.

The workflow:

1. Installs dependencies with `npm ci`.
2. Runs `npm run headers:apply`.
3. Waits 20 seconds for edge propagation.
4. Runs `npm run headers:verify` against `https://www.quantivis.io/`.

## Local usage

Apply headers locally only when the Cloudflare environment variables are available:

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... npm run headers:apply
```

Verify the live deployment:

```bash
npm run headers:verify
```

You can override the verification URL:

```bash
HEADERS_VERIFY_URL=https://www.quantivis.io/security npm run headers:verify
```

## Expected verification output

Successful verification prints one `PASS` line for each required header:

```text
Checked: https://www.quantivis.io/
HTTP status: 200
PASS content-security-policy: default-src 'self'; ...
PASS x-frame-options: DENY
PASS x-content-type-options: nosniff
PASS referrer-policy: strict-origin-when-cross-origin
PASS strict-transport-security: max-age=31536000; includeSubDomains; preload

Security header verification passed.
```

If the workflow fails before applying the rule, confirm both GitHub Actions secrets are present. If the apply step succeeds but verification fails, wait a few minutes for Cloudflare propagation and rerun the workflow.
