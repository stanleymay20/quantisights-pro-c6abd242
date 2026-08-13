# Dependency advisory risk

The August 13, 2026 remediation upgraded the affected toolchain and removed an
unpatchable dormant export dependency. `npm audit --audit-level=moderate` now
reports zero vulnerabilities.

## Vite and esbuild

Resolved by upgrading to Vite 8, Vitest 4, the compatible Vite React plugin,
and `lovable-tagger` 1.3.3. The full unit suite and production build pass on the
upgraded toolchain. The development server must still never be exposed to an
untrusted network.

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
