const DEFAULT_TARGET_URL = "https://www.quantivis.io/";
const TARGET_URL = process.env.CLOUDFLARE_VERIFY_URL ?? DEFAULT_TARGET_URL;
const CACHE_BUST = process.env.CLOUDFLARE_VERIFY_CACHE_BUST !== "0";
const OAUTH_EXEMPT_PATHS = ["/~oauth/initiate?provider=google", "/auth/callback"];

const requiredHeaders = [
  {
    name: "content-security-policy",
    expected: "present",
    validate: (value) => Boolean(value),
  },
  {
    name: "x-frame-options",
    expected: "DENY",
    validate: (value) => value?.toLowerCase() === "deny",
  },
  {
    name: "strict-transport-security",
    expected: "present",
    validate: (value) => Boolean(value),
  },
  {
    name: "x-content-type-options",
    expected: "nosniff",
    validate: (value) => value?.toLowerCase() === "nosniff",
  },
  {
    name: "referrer-policy",
    expected: "present",
    validate: (value) => Boolean(value),
  },
  {
    name: "permissions-policy",
    expected: "present",
    validate: (value) => Boolean(value),
  },
  {
    name: "cross-origin-opener-policy",
    expected: "present",
    validate: (value) => Boolean(value),
  },
  {
    name: "cross-origin-resource-policy",
    expected: "present",
    validate: (value) => Boolean(value),
  },
  {
    name: "x-quantivis-edge-security",
    expected: "cloudflare-worker when Worker fallback is active",
    validate: () => true,
    optional: true,
  },
];

async function fetchHeaders() {
  const url = new URL(TARGET_URL);
  if (CACHE_BUST) {
    url.searchParams.set("cf_header_probe", String(Date.now()));
  }

  const response = await fetch(url, {
    method: "HEAD",
    redirect: "follow",
  });

  return {
    status: response.status,
    url: response.url,
    headers: response.headers,
  };
}

async function fetchManualHeaders(path) {
  const url = new URL(path, TARGET_URL);
  if (CACHE_BUST) {
    url.searchParams.set("cf_header_probe", String(Date.now()));
  }

  const response = await fetch(url, {
    method: "HEAD",
    redirect: "manual",
  });

  return {
    status: response.status,
    url: url.toString(),
    headers: response.headers,
  };
}

const result = await fetchHeaders();
const failures = [];

console.log(`Checked: ${result.url}`);
console.log(`HTTP status: ${result.status}`);

for (const requiredHeader of requiredHeaders) {
  const value = result.headers.get(requiredHeader.name);
  const passed = requiredHeader.validate(value);
  const displayedValue = value ?? "<missing>";

  console.log(`${passed || requiredHeader.optional ? "PASS" : "FAIL"} ${requiredHeader.name}: ${displayedValue}`);

  if (!passed && !requiredHeader.optional) {
    failures.push(`${requiredHeader.name} expected ${requiredHeader.expected}, got ${displayedValue}`);
  }
}

for (const path of OAUTH_EXEMPT_PATHS) {
  const oauthResult = await fetchManualHeaders(path);
  const blockedHeaders = [
    "x-frame-options",
    "content-security-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "x-quantivis-edge-security",
  ].filter((headerName) => oauthResult.headers.has(headerName));

  console.log(`OAuth exempt check ${oauthResult.url}: ${oauthResult.status}`);
  if (blockedHeaders.length > 0) {
    failures.push(`${path} must bypass frame/popup isolation headers, found: ${blockedHeaders.join(", ")}`);
  }
}

if (failures.length > 0) {
  console.error("\nCloudflare enterprise security verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("\nCloudflare enterprise security verification passed.");
}
