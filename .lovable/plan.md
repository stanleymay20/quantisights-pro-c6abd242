# Resend Configuration — Staging Parity (Next Step)

## Finding (read-only inspection, complete)

- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are present as runtime secrets on this Lovable project/backend and are the exact names the auth-email-hook / process-email-queue edge functions read. Present and usable here.
- No Resend workspace connector is linked; these are plain project-level secrets.
- Secret values are encrypted and cannot be read back or exported — they cannot be copied programmatically to the separate Supabase staging project `cmnihsbdbpubznlkmjbc`.
- Staging CI (`deploy-supabase-staging.yml`) expects `RESEND_API_KEY` / `RESEND_FROM_EMAIL` from the protected GitHub Environment, plus staging Supabase edge-function secrets set by the workflow.

## Proposed next step (manual, user-side; no code changes)

1. In the Resend dashboard, confirm the API key and verified sender address intended for staging.
2. Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to the staging GitHub Environment secrets.
3. Run/verify the staging workflow, which sets the staging Supabase edge-function secrets and runs `scripts/configure-supabase-auth-email.mjs verify` (fail-closed gate).
4. No changes to this Lovable project are required.

## Out of scope

- No modification of code, secrets, databases, or provider settings.
- No live send test against Resend (would require a network call with the credential).
