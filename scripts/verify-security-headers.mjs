const TARGET_URL = process.env.HEADERS_VERIFY_URL ?? "https://www.quantivis.io/";
const OAUTH_EXEMPT_PATHS = ["/~oauth/initiate?provider=google", "/auth/callback"];

const requiredHeaders = [
  {
    name: "content-security-policy",
    validate: (value) => Boolean(value),
    expected: "present",
  },
  {
    name: "x-frame-options",
    validate: (value) => value?.toLowerCase() === "deny",
    expected: "DENY",
  },
  {
    name: "x-content-type-options",
    validate: (value) => value?.toLowerCase() === "nosniff",
    expected: "nosniff",
  },
  {
    name: "referrer-policy",
    validate: (value) => Boolean(value),
    expected: "present",
  },
  {
    name: "strict-transport-security",
    validate: (value) => Boolean(value),
    expected: "present",
  },
];

async function fetchHeaders() {
  const response = await fetch(TARGET_URL, {
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
  console.log(`${passed ? "PASS" : "FAIL"} ${requiredHeader.name}: ${displayedValue}`);

  if (!passed) {
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
  console.error("\nSecurity header verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("\nSecurity header verification passed.");
}
