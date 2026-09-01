#!/usr/bin/env node

const action = process.argv[2] || "runtime";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim();

const STAGING_REF = "cmnihsbdbpubznlkmjbc";
const PRODUCTION_REF = "izgfrekdamlgigehxoqs";
const RETIRED_REF = "itpwpnwzzitkelffttyx";
const ALLOWED_REFS = new Set([STAGING_REF, PRODUCTION_REF]);
const REQUIRED_PROVIDER_SECRETS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL"];
const RESEND_TEST_RECIPIENT = "delivered@resend.dev";
const ALLOWED_ACTIONS = new Set(["provider-input", "runtime"]);

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

if (!accessToken) fail("SUPABASE_ACCESS_TOKEN must be set");
if (!projectRef) fail("SUPABASE_PROJECT_REF must be set");
if (projectRef === RETIRED_REF) fail("Refusing to preflight Auth email on the retired Supabase project");
if (!ALLOWED_REFS.has(projectRef)) fail(`Unrecognised Supabase project ref: ${projectRef}`);
if (!ALLOWED_ACTIONS.has(action)) fail(`Unsupported Auth email preflight action: ${action}`);
if (Boolean(resendApiKey) !== Boolean(resendFromEmail)) {
  fail("RESEND_API_KEY and RESEND_FROM_EMAIL must either both be configured or both be absent");
}

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

const getLegacyServiceRoleKey = async () => {
  const payload = await managementRequest(`/v1/projects/${projectRef}/api-keys?reveal=true`);
  const keys = Array.isArray(payload) ? payload : payload?.keys;
  if (!Array.isArray(keys)) {
    throw new Error("Supabase API-key response has an unexpected shape");
  }

  const candidate = keys.find((key) =>
    key?.name === "service_role" || key?.id === "service_role" || key?.role === "service_role"
  );
  const value = candidate?.api_key || candidate?.key || candidate?.value;
  if (typeof value !== "string" || !value.startsWith("eyJ")) {
    throw new Error("Legacy service_role JWT could not be resolved for Auth email runtime preflight");
  }
  return value;
};

// Validate a replacement credential pair before it is written into Supabase.
// This prevents a revoked API key or invalid sender from overwriting a working
// provider configuration. Resend's documented delivered@resend.dev address is
// used so no real user is contacted and domain reputation is not affected.
const verifyProviderInput = async () => {
  if (!resendApiKey || !resendFromEmail) {
    throw new Error("provider-input preflight requires RESEND_API_KEY and RESEND_FROM_EMAIL");
  }

  const runId = process.env.GITHUB_RUN_ID?.trim() || "manual";
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT?.trim() || "0";
  const idempotencyKey = `quantivis-auth-preflight-input-${projectRef}-${runId}-${runAttempt}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [RESEND_TEST_RECIPIENT],
      subject: "Quantivis Auth email provider preflight",
      text: "Controlled provider readiness probe before Auth email transport cutover.",
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend provider-input preflight failed with HTTP ${response.status}`);
  }
};

// When provider credentials are intentionally managed only in Supabase, validate
// them where they actually live. A service-role-authenticated worker preflight
// performs one controlled Resend test send and returns only status metadata; the
// credential values never leave the Edge runtime and are never printed.
const verifySupabaseManagedProvider = async (serviceRoleKey) => {
  const workerUri = `https://${projectRef}.supabase.co/functions/v1/process-email-queue`;
  const response = await fetch(workerUri, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "provider_preflight" }),
  });

  if (response.status === 200) return;
  if (response.status === 401 || response.status === 403) {
    throw new Error(`process-email-queue provider preflight authorization failed with HTTP ${response.status}`);
  }
  if (response.status === 500 || response.status === 503) {
    throw new Error(`process-email-queue provider preflight failed with HTTP ${response.status}`);
  }
  throw new Error(`process-email-queue provider preflight returned unexpected HTTP ${response.status}`);
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
  if (action === "provider-input") {
    await verifyProviderInput();
    console.log(`Replacement Auth email provider input validated for ${projectRef}.`);
    console.log("Resend credential values and provider response bodies were never printed.");
    process.exit(0);
  }

  await verifyProviderSecretPresence();
  const serviceRoleKey = await getLegacyServiceRoleKey();
  await verifySupabaseManagedProvider(serviceRoleKey);
  await verifyWorkerRuntimeWithoutPrivilege();
  console.log(`Independent Auth email runtime preflight passed for ${projectRef}.`);
  console.log("Supabase-managed Resend credentials were validated in the worker; no secret value was printed.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
