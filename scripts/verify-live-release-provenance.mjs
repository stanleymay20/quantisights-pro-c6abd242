const target = process.env.FRONTEND_PROVENANCE_URL ?? "https://www.quantivis.io/release.json";
const expectedSha = process.env.EXPECTED_RELEASE_SHA
  ?? process.env.RELEASE_SHA
  ?? process.env.CERTIFIED_SHA
  ?? "";

if (!/^[0-9a-f]{40}$/i.test(expectedSha)) {
  console.error("::error::Live frontend provenance verification requires a full 40-character expected SHA");
  process.exit(1);
}

const url = new URL(target);
url.searchParams.set("release_probe", `${Date.now()}-${expectedSha.slice(0, 12)}`);

let response;
try {
  response = await fetch(url, {
    headers: {
      accept: "application/json",
      "cache-control": "no-cache",
    },
    redirect: "follow",
  });
} catch (error) {
  console.error(`::error::Unable to fetch live frontend provenance: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

if (!response.ok) {
  console.error(`::error::Live frontend provenance endpoint returned HTTP ${response.status}`);
  process.exit(1);
}

let release;
try {
  release = await response.json();
} catch {
  console.error("::error::Live frontend provenance endpoint did not return valid JSON");
  process.exit(1);
}

const liveSha = typeof release?.gitCommit === "string" ? release.gitCommit.trim() : "";
if (!/^[0-9a-f]{40}$/i.test(liveSha)) {
  console.error(`::error::Live frontend release.json does not contain a full gitCommit SHA (got ${liveSha || "<missing>"})`);
  process.exit(1);
}

if (liveSha.toLowerCase() !== expectedSha.toLowerCase()) {
  console.error(`::error::Live frontend SHA ${liveSha} does not match certified release ${expectedSha}`);
  process.exit(1);
}

if (typeof release?.version !== "string" || release.version.trim() === "") {
  console.error("::error::Live frontend release.json is missing version metadata");
  process.exit(1);
}

if (typeof release?.buildTimestamp !== "string" || Number.isNaN(Date.parse(release.buildTimestamp))) {
  console.error("::error::Live frontend release.json is missing a valid buildTimestamp");
  process.exit(1);
}

console.log(`Verified live frontend provenance: ${liveSha}`);
console.log(`Version: ${release.version}`);
console.log(`Build timestamp: ${release.buildTimestamp}`);
console.log(`Deployment ID: ${release.deploymentId ?? "<not supplied by host>"}`);
