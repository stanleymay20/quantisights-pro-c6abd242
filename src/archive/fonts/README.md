# Archived font binaries

`Inter-Bold.ttf` and `Inter-SemiBold.ttf` were stored at the repository
root but had **no references** in any source, HTML, CSS, or build-config
file. The runtime loads Inter exclusively from the Google Fonts CDN via
`index.html`. Verified during the DS-0 Design Foundation audit on commit
`89a5ac8`.

Moved here so the binaries are still recoverable from `git mv` history if
self-hosting becomes a requirement later (e.g., for an air-gapped
deployment), without inflating the working tree at the repo root.

Do not reference these files from production code. To self-host Inter,
copy the desired weights into `public/fonts/` and declare `@font-face` in
`src/index.css`.
