# Dependency advisory risk

Quantivis keeps the repository dependency audit fail-closed at
`npm audit --audit-level=moderate`. Security advisories are remediated in the
dependency graph rather than allowlisted or hidden by lowering the audit
threshold.

## October 16, 2026 dependency repair

The October 2026 audit exposed a new high-severity `braces` stack-exhaustion
advisory together with transitive advisories in the development toolchain.
The repaired graph:

- removes the development-only `lovable-tagger` integration and the unused
  `@tailwindcss/typography` dependency instead of carrying their vulnerable
  transitive trees;
- upgrades `typescript-eslint` to 8.71.2;
- pins patched `source-map-js`, `dompurify`, and `postcss-selector-parser`
  versions through npm overrides;
- routes every `braces` consumer through `vendor/braces-patched`.

The vendored `braces` package is a controlled Quantivis patch of upstream
3.0.3 for GHSA-vfj7-8cjw-p6xm. Its security changes are based on reviewed
commit `FSDevelop/braces@28d440b5dd449dbf1fe6f3506cf94ecca4d02660`:
brace/parenthesis nesting and recursive AST traversal are bounded to 100
levels and cyclic parent chains are rejected. Quantivis records the patch
provenance in `vendor/braces-patched/package.json` and
`vendor/braces-patched/README.quantivis.md`, preserves the upstream MIT
license, removes a patch-fork debug log, and adds regression tests for normal
expansion plus adversarial nesting.

This is not represented as an official upstream `braces` release. Replace the
controlled patch with an official patched upstream release when one becomes
available and passes the complete Quantivis release gate.

## Vite and esbuild

The earlier Vite/esbuild advisory set was resolved by upgrading to Vite 8,
Vitest 4 and the compatible Vite React plugin. The October 2026 remediation
also removes `lovable-tagger`; Quantivis no longer needs that development-only
component tagging plugin. The development server must still never be exposed
to an untrusted network.

## PowerPoint export parser

The dormant `pptxgenjs` export path depended on an image parser with no patched
release. Because the exporter was not wired into the product, the dependency
and unused implementation were removed. Product copy now describes PPTX export
as planned rather than deployed. Reintroduction requires a patched dependency,
download-integrity tests, and a security review.

## xlsx

Resolved by pinning to the supported SheetJS 0.20.3 distribution and vendoring
the official tarball at `vendor/xlsx-0.20.3.tgz`.

Why it is vendored:

- SheetJS 0.20.3 is distributed from the SheetJS CDN, not the npm registry.
- Production builds should not depend on third-party CDN availability while
  preparing the build environment.
- The vendored tarball keeps installs reproducible while preserving the patched
  package version.

Ongoing controls:

- Treat all workbook uploads as untrusted input.
- The affected import path is `src/lib/workbook-parser.ts`.
- Keep upload size, row, sheet, and processing-time limits enforced.
- Parse outside latency-sensitive UI work where possible.
- Reject unsupported extensions and malformed workbooks.
- Keep adversarial workbook fixtures in the parser test path.
