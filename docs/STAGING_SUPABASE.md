# Supabase staging and production separation

Quantivis uses two intentionally separate Supabase projects:

| Environment | Project reference | Purpose |
| --- | --- | --- |
| Production | `itpwpnwzzitkelffttyx` | Live application and first-client data after pilot acceptance |
| Staging | `cmnihsbdbpubznlkmjbc` | Migration rehearsal, tenant-isolation tests, and sanitized pilot validation |

Do not replace the production project reference in `supabase/config.toml`. The
staging project is a validation target, not a production replacement.

## Browser configuration

The application is Vite React, not Next.js. It uses `@supabase/supabase-js`
through `src/integrations/supabase/client.ts`; `@supabase/ssr`, Next middleware,
and `next/headers` do not apply.

For a staging frontend build:

1. Copy `.env.staging.example` to `.env.staging.local`.
2. Run `npm run dev -- --mode staging` or `npm run build -- --mode staging`.
3. Confirm the rendered app connects only to `cmnihsbdbpubznlkmjbc`.

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` may enter the
browser. Never use `SUPABASE_SECRET_KEY`, `SUPABASE_SECRET_KEYS`,
`SUPABASE_SERVICE_ROLE_KEY`, or database credentials in a `VITE_` variable.

## MCP access

The committed `.mcp.json` scopes AI tooling to the staging project and enables
read-only mode by default. This follows Supabase's recommendation to avoid
connecting AI tools to production and limits accidental database mutations.

Authenticate the `supabase-staging` MCP server through the AI client's normal
OAuth flow. Authentication is per developer and must not be committed.

Use the Supabase CLI and reviewed migrations for writes. Do not disable MCP
read-only mode merely to bypass the migration workflow.

## Edge Functions and keys

Hosted Supabase Edge Functions receive `SUPABASE_URL`, named publishable and
secret key maps, and JWKS configuration from the platform. Existing functions
continue using their current injected legacy variables until they are migrated
and tested deliberately.

New functions may import the server SDK directly:

```ts
import { withSupabase } from "npm:@supabase/server";
```

No root `@supabase/server` installation is required for Edge Functions. A secret
key bypasses RLS and belongs only in a secured backend environment.

## Staging validation and production promotion

1. Apply the exact repository migrations to staging using the CLI.
2. Deploy the exact repository Edge Functions to staging.
3. Run database security advisors and resolve critical findings.
4. Create two synthetic organizations and least-privileged test users.
5. Run tenant-isolation and the full `docs/PILOT_OPERATIONS.md` acceptance test.
6. Record the tested commit and migration version.
7. Apply the same immutable commit and migrations to production through CI.
8. Run production smoke tests with synthetic accounts before inviting a client.

Never copy staging users, secrets, or synthetic records into production. A green
staging run is promotion evidence, but it is not proof that production deployed
successfully.
