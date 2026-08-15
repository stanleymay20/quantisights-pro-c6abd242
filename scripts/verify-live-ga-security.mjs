const TARGET_URL = process.env.GA_SECURITY_VERIFY_URL ?? "https://www.quantivis.io/";
const OAUTH_EXEMPT_PATHS = ["/~oauth/initiate?provider=google", "/auth/callback"];

const requiredHeaders = [
  ["content-security-policy", (value) => Boolean(value), "present"],
  ["x-frame-options", (value) => value?.toLowerCase() === "deny", "DENY"],
  ["strict-transport-security", (value) => Boolean(value), "present"],
  ["x-content-type-options", (value) => value?.toLowerCase() === "nosniff", "nosniff"],
  ["referrer-policy", (value) => Boolean(value), "present"],
  ["permissions-policy", (value) => Boolean(value), "present"],
];

async function probe(path = "/", redirect = "follow") {
  const url = new URL(path, TARGET_URL);
  url.searchParams.set("ga_security_probe", String(Date.now()));
  const response = await fetch(url, { method: "HEAD", redirect });
  return { response, url };
}

function addFailure(failures, message) {
  failures.push(message);
  // GitHub Actions turns this into a visible check annotation, which keeps
  // release evidence actionable even when raw job logs are unavailable.
  console.error(`::error::${message}`);
}

const failures = [];
const { response, url } = await probe();
console.log(`GA live security probe: ${url}`);
console.log(`HTTP status: ${response.status}`);

if (response.status >= 500) {
  addFailure(failures, `live site returned HTTP ${response.status}`);
}

for (const [name, validate, expected] of requiredHeaders) {
  const value = response.headers.get(name);
  const passed = validate(value);
  console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${value ?? "<missing>"}`);
  if (!passed) addFailure(failures, `${name} expected ${expected}, got ${value ?? "<missing>"}`);
}

const csp = response.headers.get("content-security-policy") ?? "";
if (/(?:^|[;\s])['\"]?unsafe-eval['\"]?(?:[;\s]|$)/i.test(csp)) {
  addFailure(failures, "Content-Security-Policy contains unsafe-eval");
  console.log("FAIL CSP unsafe-eval: present");
} else {
  console.log("PASS CSP unsafe-eval: absent");
}

for (const path of OAUTH_EXEMPT_PATHS) {
  const { response: oauthResponse } = await probe(path, "manual");
  const isolationHeaders = [
    "x-frame-options",
    "content-security-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "x-quantivis-edge-security",
  ].filter((header) => oauthResponse.headers.has(header));

  console.log(`OAuth popup exemption ${path}: HTTP ${oauthResponse.status}`);
  if (isolationHeaders.length > 0) {
    addFailure(
      failures,
      `${path} unexpectedly has popup-isolating headers: ${isolationHeaders.join(", ")}`,
    );
  }
}

if (failures.length > 0) {
  console.error(`\nGA live security verification failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("\nGA live security verification passed.");
