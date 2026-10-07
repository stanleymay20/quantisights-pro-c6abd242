# Upstream provenance

This directory is a security-patched local copy of `lovable-tagger@1.3.5`.

- Upstream package: `lovable-tagger`
- Upstream version: `1.3.5`
- Upstream repository metadata: `https://github.com/lovablelabs/lovable`, directory `npm-packages/tagger`
- Upstream npm tarball SHA-256: `3631ad1f19e3c677f24f92c7a0e02b02614881f1324c1e1a475cd84c8e9db56f`
- Upstream license metadata: MIT

## Quantivis patch

Upstream eagerly imports `tailwindcss/resolveConfig.js` although it already has a separate Tailwind v4 path. The eager import forces Tailwind 3 into the dependency graph. Quantivis makes that resolver a dynamic import inside the v3-only fallback and removes the hard Tailwind dependency from the local package metadata. JSX tagging and Tailwind v4 extraction logic are unchanged.

Replace this copy with upstream as soon as upstream ships an equivalent fix.
