# Dependency advisory risk

`npm audit` reported three advisories on June 25, 2026.

## Vite and esbuild

The direct Vite advisory and transitive esbuild advisory primarily affect the
development server. The automated fix requires Vite 8, which is a semver-major
upgrade and is outside the supported peer range of the current
`lovable-tagger` dependency (`>=5 <8`).

No safe in-range upgrade currently resolves these advisories. Mitigations:

- Never expose the Vite development server to an untrusted network.
- Bind local development to loopback unless remote access is explicitly
  required and protected.
- Build production assets in CI and serve only the static output.
- Re-evaluate Vite 8 after `lovable-tagger` declares compatibility and run the
  full browser and build suite before upgrading.

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
