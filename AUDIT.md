# Repository Audit

Audit date: 2026-07-02

## Scope

Reviewed the Vite/React/TypeScript application, Supabase Edge Functions, configuration, dependency metadata, and standard repository health checks.

## Commands run

- `npm run lint`
- `npm run build`
- `rg -n "(VITE_|SUPABASE|SERVICE_ROLE|SECRET|PASSWORD|API_KEY|anon|TODO|FIXME|console\\.log|dangerouslySetInnerHTML|eval\\()" -g '!node_modules' -g '!dist'`

## Executive summary

The application currently builds successfully, but linting fails with 82 errors and 19 warnings. The highest-impact issues are weak TypeScript guardrails, unresolved lint failures across app and Supabase function code, mixed package-manager lockfiles, missing automated tests, and production maintainability risks such as an oversized JavaScript bundle and verbose logging in sensitive backend paths.

## Findings

### High priority

1. **Lint gate is failing.**
   - `npm run lint` reports 101 total problems: 82 errors and 19 warnings.
   - The most common failure is `@typescript-eslint/no-explicit-any`, affecting app components, hooks, pages, and Supabase functions.
   - Additional errors include empty object interfaces, unnecessary regex escapes, an empty block statement, `prefer-const`, and CommonJS `require()` in `tailwind.config.ts`.
   - Recommendation: fix lint errors incrementally by module, then keep linting required in CI.

2. **TypeScript strictness is disabled.**
   - `tsconfig.app.json` sets `strict: false`, `noImplicitAny: false`, `noUnusedLocals: false`, and `noUnusedParameters: false`.
   - The root `tsconfig.json` also disables several safety checks.
   - Recommendation: keep the current relaxed settings only as a temporary compatibility mode; add a staged plan to enable `strict`, then `noImplicitAny`, then unused checks.

3. **No test script or test runner is configured.**
   - `package.json` contains `dev`, `build`, `build:dev`, `lint`, and `preview`, but no `test` command.
   - Recommendation: add Vitest/React Testing Library for component and hook coverage, and Deno/Supabase function tests or integration smoke tests for Edge Functions.

4. **Generated Supabase client does not guard required environment variables.**
   - `src/integrations/supabase/client.ts` passes `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` directly into `createClient`.
   - Recommendation: validate these values at startup so missing deployment configuration fails with a clear message instead of downstream runtime errors.

### Medium priority

5. **The production bundle is large.**
   - `npm run build` succeeds, but Vite warns that the main JavaScript chunk is larger than 500 kB after minification.
   - Current output includes a roughly 1.59 MB minified JS bundle and 447 kB gzip bundle.
   - Recommendation: add route-level lazy loading and consider manual chunks for large libraries such as PDF generation, charts, animation, and Supabase-heavy admin screens.

6. **Browserslist/caniuse data is stale.**
   - Build output reports Browserslist data is 13 months old.
   - Recommendation: run `npx update-browserslist-db@latest` during dependency maintenance and commit the resulting lockfile update.

7. **Mixed lockfiles can cause non-reproducible installs.**
   - The repository includes `package-lock.json`, `bun.lock`, and `bun.lockb`.
   - Recommendation: choose one package manager for contributors and CI. If npm is authoritative, remove Bun lockfiles; if Bun is authoritative, document it and remove `package-lock.json`.

8. **Supabase Edge Functions contain broad logging in sensitive workflows.**
   - Multiple Edge Functions log user IDs, email delivery details, request shapes, and AI-processing progress.
   - Recommendation: gate verbose logs behind an environment flag, redact user-identifying values where possible, and standardize structured logs.

9. **Security-sensitive server functionality depends on service-role keys.**
   - Several Edge Functions correctly read `SUPABASE_SERVICE_ROLE_KEY` from environment variables, but these paths should receive extra review because they bypass row-level security.
   - Recommendation: add per-function authorization checks, least-privilege RPCs where possible, and integration tests that assert cross-user access is impossible.

### Low priority

10. **Fast Refresh warnings indicate mixed component/non-component exports.**
    - Several UI/component files trigger `react-refresh/only-export-components` warnings.
    - Recommendation: move constants/helpers/hooks into separate files where feasible.

11. **README is still the default Lovable template.**
    - It contains placeholder project identifiers and generic setup guidance.
    - Recommendation: document required environment variables, package-manager choice, Supabase local development, Edge Function deployment, and verification commands.

12. **Console logging exists in client-side job discovery flows.**
    - Logs appear in `src/hooks/useJobDiscovery.ts`, `src/hooks/useSavedSearchAutomation.ts`, and `src/components/jobs/JobDiscoveryDialog.tsx`.
    - Recommendation: remove development logs or replace them with a debug logger disabled in production.

## Suggested remediation order

1. Decide and document the supported package manager.
2. Add minimal CI for `npm run lint` and `npm run build`.
3. Fix lint errors that are mechanical and low risk.
4. Add environment-variable validation for Supabase client initialization.
5. Add a basic test runner and smoke tests for key pages/hooks.
6. Split oversized routes and lazy-load heavy dependencies.
7. Harden Edge Function logging and service-role authorization checks.
8. Replace the template README with project-specific setup and operations guidance.
