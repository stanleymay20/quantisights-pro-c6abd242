#!/usr/bin/env node

const action = process.argv[2]?.trim() || "full";
const SUPPORTED_ACTIONS = new Set(["full", "redirects-only"]);

if (!SUPPORTED_ACTIONS.has(action)) {
  console.error(`::error::Unsupported Google OAuth configuration action: ${action}`);
  process.exit(2);
}

const REQUIRED_ENV = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_REF",
  "AUTH_SITE_URL",
  "AUTH_URI_ALLOW_LIST",
];

if (action === "full") {
  REQUIRED_ENV.push("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET");
}

for (const name of REQUIRED_ENV) {
  if (!process.env[name]?.trim()) {
    console.error(`::error::${name} must be set`);
    process.exit(2);
  }
}

const accessToken = process.env.SUPABASE_ACCESS_TOKEN.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF.trim();
const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "";
const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "";
const siteUrl = process.env.AUTH_SITE_URL.trim();
const uriAllowList = process.env.AUTH_URI_ALLOW_LIST.trim();

const PRODUCTION_REF = "izgfrekdamlgigehxoqs";
const STAGING_REF = "cmnihsbdbpubznlkmjbc";
const RETIRED_REF = "itpwpnwzzitkelffttyx";
const STAGING_PREVIEW_CALLBACKS = [
  "https://deploy-preview-34--quantivis.netlify.app/auth/callback",
  "https://deploy-preview-*--quantivis.netlify.app/auth/callback",
];

if (projectRef === RETIRED_REF) {
  console.error("::error::Refusing to configure Auth on the retired Supabase project");
  process.exit(2);
}

if (![PRODUCTION_REF, STAGING_REF].includes(projectRef)) {
  console.error(`::error::Unrecognised Supabase project ref: ${projectRef}`);
  process.exit(2);
}

if (action === "redirects-only" && projectRef !== STAGING_REF) {
  console.error("::error::redirects-only is restricted to the staging Supabase project");
  process.exit(2);
}

const requireHttpsUrl = (value, label) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS`);
  }
  return parsed.toString().replace(/\/$/, "");
};

const parseAllowList = (value) => String(value ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

let normalizedSiteUrl;
let requiredAllowEntries;
try {
  normalizedSiteUrl = requireHttpsUrl(siteUrl, "AUTH_SITE_URL");
  requiredAllowEntries = parseAllowList(uriAllowList);
  // Netlify deploy previews are staging-only acceptance surfaces. Supabase
  // otherwise falls back to the staging Site URL when redirectTo is not
  // allow-listed, which can strand a successful Google login on Lovable.
  if (projectRef === STAGING_REF) {
    requiredAllowEntries = [...new Set([...requiredAllowEntries, ...STAGING_PREVIEW_CALLBACKS])];
  }
  for (const entry of requiredAllowEntries) {
    // Supabase permits wildcard redirect entries. Validate the non-wildcard
    // portion conservatively without ever evaluating or following the URL.
    const candidate = entry.replace(/\*\*/g, "preview").replace(/\*/g, "preview");
    requireHttpsUrl(candidate, `AUTH_URI_ALLOW_LIST entry ${entry}`);
  }
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};

const requestJson = async (method, body) => {
  const response = await fetch(endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: "Management API returned non-JSON content" };
    }
  }

  if (!response.ok) {
    const detail = payload?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Supabase Auth config ${method} failed: ${detail}`);
  }

  return payload ?? {};
};

const current = await requestJson("GET");
console.log(
  `Current Auth config: project=${projectRef} google_enabled=${Boolean(current.external_google_enabled)} site_url=${current.site_url || "unset"}`,
);

let expectedAllowEntries = requiredAllowEntries;
let expectedAllowList = requiredAllowEntries.join(",");

if (action === "redirects-only") {
  const existingAllowEntries = parseAllowList(current.uri_allow_list);
  expectedAllowEntries = [...new Set([...existingAllowEntries, ...requiredAllowEntries])];
  expectedAllowList = expectedAllowEntries.join(",");

  await requestJson("PATCH", {
    site_url: normalizedSiteUrl,
    uri_allow_list: expectedAllowList,
  });
} else {
  await requestJson("PATCH", {
    external_google_enabled: true,
    external_google_client_id: googleClientId,
    external_google_secret: googleClientSecret,
    external_google_skip_nonce_check: false,
    site_url: normalizedSiteUrl,
    uri_allow_list: expectedAllowList,
  });
}

const verified = await requestJson("GET");
const failures = [];
const verifiedAllowEntries = new Set(parseAllowList(verified.uri_allow_list));

if (action === "full") {
  if (verified.external_google_enabled !== true) failures.push("external_google_enabled is not true");
  if (verified.external_google_client_id !== googleClientId) failures.push("Google client ID does not match requested value");
  if (verified.external_google_skip_nonce_check === true) failures.push("Google nonce checking is disabled");
}
if (verified.site_url?.replace(/\/$/, "") !== normalizedSiteUrl) failures.push("site_url does not match requested value");
for (const entry of expectedAllowEntries) {
  if (!verifiedAllowEntries.has(entry)) failures.push(`uri_allow_list is missing required entry ${entry}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`::error::${failure}`);
  process.exit(1);
}

if (action === "redirects-only") {
  console.log(`Staging Auth redirect contract verified for ${projectRef} with ${expectedAllowEntries.length} allowed redirect entries.`);
  console.log("Google provider credentials were not read or changed.");
} else {
  console.log(`Google OAuth configuration verified for ${projectRef}.`);
  console.log(`Google Console authorized redirect URI: https://${projectRef}.supabase.co/auth/v1/callback`);
  console.log("OAuth client secret was never printed.");
}
