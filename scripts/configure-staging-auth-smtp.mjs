#!/usr/bin/env node

const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim();

const STAGING_REF = "cmnihsbdbpubznlkmjbc";
const EXPECTED_FROM_EMAIL = "alerts@quantivis.io";
const SMTP_HOST = "smtp.resend.com";
const SMTP_PORT = 465;
const SMTP_USER = "resend";
const SMTP_SENDER_NAME = "Quantivis";

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

if (!accessToken) fail("SUPABASE_ACCESS_TOKEN must be set");
if (projectRef !== STAGING_REF) {
  fail(`Refusing to configure Auth SMTP outside Quantivis staging (${projectRef || "unset"})`);
}
if (!resendApiKey) fail("RESEND_API_KEY must be set");
if (!resendFromEmail) fail("RESEND_FROM_EMAIL must be set");
if (resendFromEmail.toLowerCase() !== EXPECTED_FROM_EMAIL) {
  fail(`RESEND_FROM_EMAIL must be ${EXPECTED_FROM_EMAIL} for the controlled staging SMTP configuration`);
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
    throw new Error(`${method} Auth SMTP config failed: ${detail}`);
  }
  return payload;
}

try {
  // Never print the provider password or the full Auth configuration response.
  await request("PATCH", {
    smtp_admin_email: resendFromEmail,
    smtp_host: SMTP_HOST,
    smtp_port: SMTP_PORT,
    smtp_user: SMTP_USER,
    smtp_pass: resendApiKey,
    smtp_sender_name: SMTP_SENDER_NAME,
  });

  const after = await request("GET");
  const mismatches = [];
  if (after.smtp_admin_email !== EXPECTED_FROM_EMAIL) mismatches.push("smtp_admin_email");
  if (after.smtp_host !== SMTP_HOST) mismatches.push("smtp_host");
  if (Number(after.smtp_port) !== SMTP_PORT) mismatches.push("smtp_port");
  if (after.smtp_user !== SMTP_USER) mismatches.push("smtp_user");
  if (after.smtp_sender_name !== SMTP_SENDER_NAME) mismatches.push("smtp_sender_name");

  if (mismatches.length > 0) {
    fail(`Staging custom SMTP read-back verification failed for: ${mismatches.join(", ")}`);
  }

  console.log(`Verified Quantivis staging custom SMTP host=${SMTP_HOST} port=${SMTP_PORT} sender=${EXPECTED_FROM_EMAIL}.`);
  console.log("SMTP password was never printed or read back into logs.");
  console.log("Production Auth configuration was not modified.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
