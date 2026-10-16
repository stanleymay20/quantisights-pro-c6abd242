# Quantivis controlled braces security patch

This directory is a deliberately vendored runtime fork of `braces` 3.0.3 for Quantivis dependency hardening.

- Upstream package: `micromatch/braces` 3.0.3
- Advisory: `GHSA-vfj7-8cjw-p6xm` / CVE-2026-93687
- Patch source reviewed: `FSDevelop/braces` commit `28d440b5dd449dbf1fe6f3506cf94ecca4d02660`
- Quantivis package version: `3.0.4-quantivis.1`

The security change bounds brace/parenthesis nesting and recursive AST processing to 100 levels and rejects cyclic parent chains. Quantivis additionally removes a debug log present in the patch fork and makes the invalid-brace helper null-safe.

This package is not claimed to be an upstream `braces` release. It exists because the advisory has no patched upstream npm release. It must remain pinned, tested, and replaced with an official upstream fix if/when one becomes available.
