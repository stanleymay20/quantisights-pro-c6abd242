#!/usr/bin/env node

const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();

const STAGING_REF = "cmnihsbdbpubznlkmjbc";
const STAGING_EMAIL_SEND_LIMIT = Number(process.env.STAGING_AUTH_EMAIL_SEND_LIMIT || "120");
const STAGING_PASSWORD_HIBP_ENABLED = true;

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

if (!accessToken) fail("SUPABASE_ACCESS_TOKEN must be set");
if (projectRef !== STAGING_REF) {
  fail(`Refusing to change Auth security configuration outside Quantivis staging (${projectRef || "unset"})`);
}
if (!Number.isInteger(STAGING_EMAIL_SEND_LIMIT) || STAGING_EMAIL_SEND_LIMIT < 30 || STAGING_EMAIL_SEND_LIMIT > 1000) {
  fail("STAGING_AUTH_EMAIL_SEND_LIMIT must be an integer between 30 and 1000");
}

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};

async function request(method, body) {
  const response = await fetch(endpoint, {
    method,
    headers,
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
  const existingEmailLimit = Number(before.rate_limit_email_sent);
  const existingHibp = before.password_hibp_enabled === true;
  const patch = {};

  if (existingEmailLimit !== STAGING_EMAIL_SEND_LIMIT) {
    patch.rate_limit_email_sent = STAGING_EMAIL_SEND_LIMIT;
  }
  if (existingHibp !== STAGING_PASSWORD_HIBP_ENABLED) {
    patch.password_hibp_enabled = STAGING_PASSWORD_HIBP_ENABLED;
  }

  if (Object.keys(patch).length > 0) {
    await request("PATCH", patch);
  }

  const after = await request("GET");
  if (Number(after.rate_limit_email_sent) !== STAGING_EMAIL_SEND_LIMIT) {
    fail(
      `Staging Auth email rate limit verification failed: expected ${STAGING_EMAIL_SEND_LIMIT}, got ${after.rate_limit_email_sent}`,
    );
  }
  if (after.password_hibp_enabled !== STAGING_PASSWORD_HIBP_ENABLED) {
    fail(
      `Staging leaked-password protection verification failed: expected enabled=${STAGING_PASSWORD_HIBP_ENABLED}, got ${String(after.password_hibp_enabled)}`,
    );
  }

  console.log(
    `Verified Quantivis staging Auth baseline: email_send_limit=${STAGING_EMAIL_SEND_LIMIT}/hour, leaked_password_protection=enabled (previous_email_limit=${Number.isFinite(existingEmailLimit) ? existingEmailLimit : "unknown"}, previous_leaked_password_protection=${existingHibp ? "enabled" : "disabled"}).`,
  );
  console.log("Production Auth configuration was not modified.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
