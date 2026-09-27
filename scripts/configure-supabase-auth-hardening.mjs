#!/usr/bin/env node

// Enforces Auth hardening that GA requires on every Quantivis Supabase project:
// leaked-password protection (HaveIBeenPwned check on sign-up and password
// change). Usage: node scripts/configure-supabase-auth-hardening.mjs [configure|verify]

const action = process.argv[2]?.trim() || "configure";
if (!["configure", "verify"].includes(action)) {
  console.error(`::error::Unsupported Auth hardening action: ${action}`);
  process.exit(2);
}

const PRODUCTION_REF = "izgfrekdamlgigehxoqs";
const STAGING_REF = "cmnihsbdbpubznlkmjbc";

const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

if (!accessToken) fail("SUPABASE_ACCESS_TOKEN must be set");
if (![PRODUCTION_REF, STAGING_REF].includes(projectRef)) {
  fail(`Unrecognised Supabase project ref: ${projectRef || "unset"}`);
}

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

async function request(method, body) {
  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: "Supabase Management API returned non-JSON content" };
    }
  }
  if (!response.ok) {
    const detail = payload?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(`${method} Auth config failed: ${detail}`);
  }
  return payload;
}

try {
  const before = await request("GET");
  if (action === "configure" && before.password_hibp_enabled !== true) {
    await request("PATCH", { password_hibp_enabled: true });
  }

  const after = action === "configure" ? await request("GET") : before;
  if (after.password_hibp_enabled !== true) {
    fail(`Leaked-password protection is disabled on ${projectRef}`);
  }

  console.log(`Verified leaked-password protection is enabled on ${projectRef}.`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
