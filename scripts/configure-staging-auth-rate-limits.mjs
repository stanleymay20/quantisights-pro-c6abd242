#!/usr/bin/env node

const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
const mode = process.argv[2]?.trim() || "full";

const STAGING_REF = "cmnihsbdbpubznlkmjbc";
const STAGING_EMAIL_SEND_LIMIT = Number(process.env.STAGING_AUTH_EMAIL_SEND_LIMIT || "120");
const STAGING_PASSWORD_HIBP_ENABLED = true;
const VALID_MODES = new Set(["full", "security-only"]);

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

if (!accessToken) fail("SUPABASE_ACCESS_TOKEN must be set");
if (projectRef !== STAGING_REF) {
  fail(`Refusing to change Auth security configuration outside Quantivis staging (${projectRef || "unset"})`);
}
if (!VALID_MODES.has(mode)) {
  fail(`Unsupported staging Auth configuration mode: ${mode}`);
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
  const existingHibp = before.password_hibp_enabled === true;

  if (existingHibp !== STAGING_PASSWORD_HIBP_ENABLED) {
    await request("PATCH", { password_hibp_enabled: STAGING_PASSWORD_HIBP_ENABLED });
  }

  const afterSecurity = await request("GET");
  if (afterSecurity.password_hibp_enabled !== STAGING_PASSWORD_HIBP_ENABLED) {
    fail(
      `Staging leaked-password protection verification failed: expected enabled=${STAGING_PASSWORD_HIBP_ENABLED}, got ${String(afterSecurity.password_hibp_enabled)}`,
    );
  }

  console.log(
    `Verified Quantivis staging leaked-password protection=enabled (previous=${existingHibp ? "enabled" : "disabled"}).`,
  );

  if (mode === "security-only") {
    console.log("Security-only mode: Auth email rate-limit configuration was intentionally not changed.");
    console.log("Production Auth configuration was not modified.");
    process.exit(0);
  }

  // Supabase only permits changing rate_limit_email_sent when custom SMTP is
  // configured. Keep this as a separate fail-closed GA email-capacity gate;
  // never make HIBP depend on SMTP availability.
  const beforeRateLimit = await request("GET");
  const existingEmailLimit = Number(beforeRateLimit.rate_limit_email_sent);

  if (existingEmailLimit !== STAGING_EMAIL_SEND_LIMIT) {
    await request("PATCH", { rate_limit_email_sent: STAGING_EMAIL_SEND_LIMIT });
  }

  const afterRateLimit = await request("GET");
  if (Number(afterRateLimit.rate_limit_email_sent) !== STAGING_EMAIL_SEND_LIMIT) {
    fail(
      `Staging Auth email rate limit verification failed: expected ${STAGING_EMAIL_SEND_LIMIT}, got ${afterRateLimit.rate_limit_email_sent}`,
    );
  }

  console.log(
    `Verified Quantivis staging Auth email send limit=${STAGING_EMAIL_SEND_LIMIT}/hour (previous=${Number.isFinite(existingEmailLimit) ? existingEmailLimit : "unknown"}).`,
  );
  console.log("Production Auth configuration was not modified.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
