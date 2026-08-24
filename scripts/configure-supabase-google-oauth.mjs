#!/usr/bin/env node

const REQUIRED_ENV = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_REF",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "AUTH_SITE_URL",
  "AUTH_URI_ALLOW_LIST",
];

for (const name of REQUIRED_ENV) {
  if (!process.env[name]?.trim()) {
    console.error(`::error::${name} must be set`);
    process.exit(2);
  }
}

const accessToken = process.env.SUPABASE_ACCESS_TOKEN.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF.trim();
const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID.trim();
const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET.trim();
const siteUrl = process.env.AUTH_SITE_URL.trim();
const uriAllowList = process.env.AUTH_URI_ALLOW_LIST.trim();

const PRODUCTION_REF = "izgfrekdamlgigehxoqs";
const STAGING_REF = "cmnihsbdbpubznlkmjbc";
const RETIRED_REF = "itpwpnwzzitkelffttyx";

if (projectRef === RETIRED_REF) {
  console.error("::error::Refusing to configure Auth on the retired Supabase project");
  process.exit(2);
}

if (![PRODUCTION_REF, STAGING_REF].includes(projectRef)) {
  console.error(`::error::Unrecognised Supabase project ref: ${projectRef}`);
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

let normalizedSiteUrl;
try {
  normalizedSiteUrl = requireHttpsUrl(siteUrl, "AUTH_SITE_URL");
  for (const entry of uriAllowList.split(",").map((value) => value.trim()).filter(Boolean)) {
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

await requestJson("PATCH", {
  external_google_enabled: true,
  external_google_client_id: googleClientId,
  external_google_secret: googleClientSecret,
  external_google_skip_nonce_check: false,
  site_url: normalizedSiteUrl,
  uri_allow_list: uriAllowList,
});

const verified = await requestJson("GET");
const failures = [];

if (verified.external_google_enabled !== true) failures.push("external_google_enabled is not true");
if (verified.external_google_client_id !== googleClientId) failures.push("Google client ID does not match requested value");
if (verified.external_google_skip_nonce_check === true) failures.push("Google nonce checking is disabled");
if (verified.site_url?.replace(/\/$/, "") !== normalizedSiteUrl) failures.push("site_url does not match requested value");
if (verified.uri_allow_list !== uriAllowList) failures.push("uri_allow_list does not match requested value");

if (failures.length > 0) {
  for (const failure of failures) console.error(`::error::${failure}`);
  process.exit(1);
}

console.log(`Google OAuth configuration verified for ${projectRef}.`);
console.log(`Google Console authorized redirect URI: https://${projectRef}.supabase.co/auth/v1/callback`);
console.log("OAuth client secret was never printed.");
