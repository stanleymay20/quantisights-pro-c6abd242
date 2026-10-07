# Dependency audit remediation — October 2026

Controlled branch for remediating newly published npm advisories without weakening Quantivis release gates.

## Base

- `main`: `f6b3061c5d296f35c2befe112dabc0fa4e8efaeb`
- Scope: dependency/toolchain security only
- No production deployment
- No Supabase/database changes
- No Evidence Wedge implementation changes from PR #59

## Current audit evidence

The inherited dependency graph currently fails `npm audit --audit-level=moderate` with 18 advisories (12 high, 5 moderate, 1 low), including the Tailwind 3 dependency chain through `braces`, `micromatch`, `chokidar`, `fast-glob`, and `postcss-selector-parser`; TypeScript-ESLint advisories; and DOMPurify advisories.

## Rules

1. Do not lower or bypass the audit threshold.
2. Do not hand-edit `package-lock.json` integrity data.
3. Prefer the smallest supported dependency changes.
4. Treat Tailwind 3 -> 4 as a real migration with visual regression review.
5. Preserve Quantivis design tokens, dark mode, animations, typography, and shadcn component behavior.
6. Require exact-head lint, typecheck, trusted-kernel typecheck, tests, security checks, build, npm audit, and merge compatibility before merge.
