const context = process.env.CONTEXT ?? "";
const branch = process.env.BRANCH ?? "";
const commitRef = (process.env.COMMIT_REF ?? "").trim();
const certifiedSha = (process.env.QUANTIVIS_GA_CERTIFIED_SHA ?? "").trim();
const fullSha = /^[0-9a-f]{40}$/i;

// Netlify's ignore contract is inverted: 0 skips a build, 1 continues it.
// Preview/branch deploys remain available for engineering feedback. Only the
// production main deployment is release-gated.
if (context !== "production" || branch !== "main") {
  console.log(`Netlify release gate: non-production context "${context}" on "${branch}" — build allowed.`);
  process.exit(1);
}

if (!fullSha.test(commitRef)) {
  console.log("Netlify release gate: production COMMIT_REF is missing or malformed — build skipped.");
  process.exit(0);
}

if (!fullSha.test(certifiedSha)) {
  console.log("Netlify release gate: no valid QUANTIVIS_GA_CERTIFIED_SHA is configured — production build skipped.");
  process.exit(0);
}

if (commitRef !== certifiedSha) {
  console.log(
    `Netlify release gate: ${commitRef} is not the certified release ${certifiedSha} — production build skipped.`,
  );
  process.exit(0);
}

console.log(`Netlify release gate: exact certified release ${commitRef} — production build allowed.`);
process.exit(1);
