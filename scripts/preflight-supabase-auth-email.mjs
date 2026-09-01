#!/usr/bin/env node

const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();

const STAGING_REF = "cmnihsbdbpubznlkmjbc";
const PRODUCTION_REF = "izgfrekdamlgigehxoqs";
const RETIRED_REF = "itpwpnwzzitkelffttyx";
const ALLOWED_REFS = new Set([STAGING_REF, PRODUCTION_REF]);
const REQUIRED_PROVIDER_SECRETS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL"];

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

if (!accessToken) fail("SUPABASE_ACCESS_TOKEN must be set");
if (!projectRef) fail("SUPABASE_PROJECT_REF must be set");
if (projectRef === RETIRED_REF) fail("Refusing to preflight Auth email on the retired Supabase project");
if (!ALLOWED_REFS.has(projectRef)) fail(`Unrecognised Supabase project ref: ${projectRef}`);

const managementHeaders = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};

const managementRequest = async (path) => {
  const response = await fetch(`https://api.supabase.com${path}`, {
    method: "GET",
    headers: managementHeaders,
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
    throw new Error(`GET ${path} failed: ${detail}`);
  }
  return payload ?? {};
};

const readConfiguredSecretNames = async () => {
  const payload = await managementRequest(`/v1/projects/${projectRef}/secrets`);
  const entries = Array.isArray(payload) ? payload : payload?.secrets;
  if (!Array.isArray(entries)) {
    throw new Error("Supabase secret-list response has an unexpected shape");
  }

  return new Set(
    entries
      .map((entry) => entry?.name)
      .filter((name) => typeof name === "string" && name.length > 0),
  );
};

const verifyProviderSecretPresence = async () => {
  const configuredNames = await readConfiguredSecretNames();
  const missing = REQUIRED_PROVIDER_SECRETS.filter((name) => !configuredNames.has(name));
  if (missing.length > 0) {
    throw new Error(`Required Auth email provider secret name(s) missing: ${missing.join(", ")}`);
  }
};

const verifyWorkerRuntimeWithoutPrivilege = async () => {
  const workerUri = `https://${projectRef}.supabase.co/functions/v1/process-email-queue`;
  const response = await fetch(workerUri, {
    method: "POST",
    headers: {
      Authorization: "Bearer quantivis-auth-email-preflight-invalid",
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (response.status === 403) return;
  if (response.status >= 200 && response.status < 300) {
    throw new Error("process-email-queue accepted a non-service credential; service-role enforcement is broken");
  }
  if (response.status === 500) {
    throw new Error("process-email-queue runtime/provider credentials are missing or invalid");
  }
  if (response.status === 401) {
    throw new Error("process-email-queue did not reach the expected in-function authorization path (HTTP 401, expected 403)");
  }
  throw new Error(`process-email-queue preflight returned HTTP ${response.status}, expected 403`);
};

try {
  await verifyProviderSecretPresence();
  await verifyWorkerRuntimeWithoutPrivilege();
  console.log(`Independent Auth email provider preflight passed for ${projectRef}.`);
  console.log("Only provider secret names/presence were inspected; secret values were never requested or printed.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
