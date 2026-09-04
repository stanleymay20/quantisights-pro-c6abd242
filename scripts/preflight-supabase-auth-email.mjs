#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const action = process.argv[2] || "runtime";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim();
const workerAuthSecret = process.env.EMAIL_QUEUE_WORKER_SECRET?.trim();
const diagnosticPath = process.env.AUTH_EMAIL_PREFLIGHT_DIAGNOSTIC_PATH?.trim();

const STAGING_REF = "cmnihsbdbpubznlkmjbc";
const PRODUCTION_REF = "izgfrekdamlgigehxoqs";
const RETIRED_REF = "itpwpnwzzitkelffttyx";
const ALLOWED_REFS = new Set([STAGING_REF, PRODUCTION_REF]);
const REQUIRED_PROVIDER_SECRETS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL"];
const RESEND_TEST_RECIPIENT = "delivered@resend.dev";
const ALLOWED_ACTIONS = new Set(["provider-input", "runtime"]);

class PreflightError extends Error {
  constructor(code, message, httpStatus = null) {
    super(message);
    this.name = "PreflightError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const raise = (code, message, httpStatus = null) => {
  throw new PreflightError(code, message, httpStatus);
};

const writeDiagnostic = (status, code, httpStatus = null) => {
  if (!diagnosticPath) return;

  const safeAction = ALLOWED_ACTIONS.has(action) ? action : "unsupported";
  const safeProjectRef = ALLOWED_REFS.has(projectRef) ? projectRef : null;
  const payload = {
    action: safeAction,
    status,
    code,
    http_status: Number.isInteger(httpStatus) ? httpStatus : null,
    project_ref: safeProjectRef,
  };

  mkdirSync(dirname(diagnosticPath), { recursive: true });
  writeFileSync(diagnosticPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
};

const fail = (error) => {
  const safeError = error instanceof PreflightError
    ? error
    : new PreflightError(
        "unexpected-preflight-failure",
        "Auth email preflight failed unexpectedly",
      );

  try {
    writeDiagnostic("failure", safeError.code, safeError.httpStatus);
  } catch {
    console.error("::error::Auth email preflight diagnostic could not be written");
  }

  console.error(`::error::${safeError.message}`);
  process.exit(1);
};

const validateInputs = () => {
  if (!accessToken) raise("missing-access-token", "SUPABASE_ACCESS_TOKEN must be set");
  if (!projectRef) raise("missing-project-ref", "SUPABASE_PROJECT_REF must be set");
  if (projectRef === RETIRED_REF) {
    raise("retired-project-ref", "Refusing to preflight Auth email on the retired Supabase project");
  }
  if (!ALLOWED_REFS.has(projectRef)) {
    raise("unrecognised-project-ref", "Unrecognised Supabase project ref");
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    raise("unsupported-action", "Unsupported Auth email preflight action");
  }
  if (action === "runtime" && !workerAuthSecret) {
    raise("worker-auth-secret-missing", "EMAIL_QUEUE_WORKER_SECRET must be set for runtime preflight");
  }
  if (Boolean(resendApiKey) !== Boolean(resendFromEmail)) {
    raise(
      "provider-input-pair-mismatch",
      "RESEND_API_KEY and RESEND_FROM_EMAIL must either both be configured or both be absent",
    );
  }
};

const managementHeaders = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};

const managementRequest = async (path, failureCode, requestLabel) => {
  let response;
  try {
    response = await fetch(`https://api.supabase.com${path}`, {
      method: "GET",
      headers: managementHeaders,
    });
  } catch {
    raise(failureCode, `${requestLabel} request failed`);
  }

  if (!response.ok) {
    raise(failureCode, `${requestLabel} request failed with HTTP ${response.status}`, response.status);
  }

  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    raise(failureCode, `${requestLabel} returned an invalid response`, response.status);
  }
};

const readConfiguredSecretNames = async () => {
  const payload = await managementRequest(
    `/v1/projects/${projectRef}/secrets`,
    "management-secret-list-failed",
    "Supabase Auth email secret-list",
  );
  const entries = Array.isArray(payload) ? payload : payload?.secrets;
  if (!Array.isArray(entries)) {
    raise(
      "management-secret-list-failed",
      "Supabase secret-list response has an unexpected shape",
    );
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
    raise(
      "provider-secret-names-missing",
      `Required Auth email provider secret name(s) missing: ${missing.join(", ")}`,
    );
  }
};

const getLegacyServiceRoleKey = async () => {
  const payload = await managementRequest(
    `/v1/projects/${projectRef}/api-keys?reveal=true`,
    "management-api-keys-failed",
    "Supabase service-role key lookup",
  );
  const keys = Array.isArray(payload) ? payload : payload?.keys;
  if (!Array.isArray(keys)) {
    raise(
      "management-api-keys-failed",
      "Supabase API-key response has an unexpected shape",
    );
  }

  const candidate = keys.find((key) =>
    key?.name === "service_role" || key?.id === "service_role" || key?.role === "service_role"
  );
  const value = candidate?.api_key || candidate?.key || candidate?.value;
  if (typeof value !== "string" || !value.startsWith("eyJ")) {
    raise(
      "legacy-service-role-unresolved",
      "Legacy service_role JWT could not be resolved for Auth email runtime preflight",
    );
  }
  return value;
};

// Validate a replacement credential pair before it is written into Supabase.
// This prevents a revoked API key or invalid sender from overwriting a working
// provider configuration. Resend's documented delivered@resend.dev address is
// used so no real user is contacted and domain reputation is not affected.
const verifyProviderInput = async () => {
  if (!resendApiKey || !resendFromEmail) {
    raise(
      "provider-input-missing",
      "provider-input preflight requires RESEND_API_KEY and RESEND_FROM_EMAIL",
    );
  }

  const runId = process.env.GITHUB_RUN_ID?.trim() || "manual";
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT?.trim() || "0";
  const idempotencyKey = `quantivis-auth-preflight-input-${projectRef}-${runId}-${runAttempt}`;

  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
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
  } catch {
    raise("provider-input-network-failed", "Resend provider-input preflight request failed");
  }

  if (!response.ok) {
    raise(
      "provider-input-rejected",
      `Resend provider-input preflight failed with HTTP ${response.status}`,
      response.status,
    );
  }
};

// When provider credentials are intentionally managed only in Supabase, validate
// them where they actually live. A service-role-authenticated worker preflight
// performs one controlled Resend test send and returns only status metadata; the
// credential values never leave the Edge runtime and are never printed.
const verifySupabaseManagedProvider = async (serviceRoleKey) => {
  const workerUri = `https://${projectRef}.supabase.co/functions/v1/process-email-queue`;
  let response;
  try {
    response = await fetch(workerUri, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "provider_preflight" }),
    });
  } catch {
    raise("worker-provider-runtime-failed", "process-email-queue provider preflight request failed");
  }

  if (response.status === 200) return;
  if (response.status === 401 || response.status === 403) {
    raise(
      "worker-provider-auth-failed",
      `process-email-queue provider preflight authorization failed with HTTP ${response.status}`,
      response.status,
    );
  }
  if (response.status === 500 || response.status === 503) {
    raise(
      "worker-provider-runtime-failed",
      `process-email-queue provider preflight failed with HTTP ${response.status}`,
      response.status,
    );
  }
  raise(
    "worker-provider-unexpected",
    `process-email-queue provider preflight returned unexpected HTTP ${response.status}`,
    response.status,
  );
};

const verifyWorkerRuntimeWithoutPrivilege = async () => {
  const workerUri = `https://${projectRef}.supabase.co/functions/v1/process-email-queue`;
  let response;
  try {
    response = await fetch(workerUri, {
      method: "POST",
      headers: {
        Authorization: "Bearer quantivis-auth-email-preflight-invalid",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  } catch {
    raise("invalid-probe-unexpected", "process-email-queue invalid-credential probe request failed");
  }

  if (response.status === 403) return;
  if (response.status >= 200 && response.status < 300) {
    raise(
      "invalid-probe-privilege-bypass",
      "process-email-queue accepted a non-service credential; service-role enforcement is broken",
      response.status,
    );
  }
  if (response.status === 500) {
    raise(
      "invalid-probe-runtime-failed",
      "process-email-queue runtime/provider credentials are missing or invalid",
      response.status,
    );
  }
  if (response.status === 401) {
    raise(
      "invalid-probe-gateway-intercept",
      "process-email-queue did not reach the expected in-function authorization path (HTTP 401, expected 403)",
      response.status,
    );
  }
  raise(
    "invalid-probe-unexpected",
    `process-email-queue preflight returned HTTP ${response.status}, expected 403`,
    response.status,
  );
};

try {
  validateInputs();

  if (action === "provider-input") {
    await verifyProviderInput();
    writeDiagnostic("success", "provider-input-ok");
    console.log(`Replacement Auth email provider input validated for ${projectRef}.`);
    console.log("Resend credential values and provider response bodies were never printed.");
  } else {
    await verifyProviderSecretPresence();
    await verifySupabaseManagedProvider(workerAuthSecret);
    await verifyWorkerRuntimeWithoutPrivilege();
    writeDiagnostic("success", "runtime-ok");
    console.log(`Independent Auth email runtime preflight passed for ${projectRef}.`);
    console.log("Supabase-managed Resend credentials were validated in the worker; no secret value was printed.");
  }
} catch (error) {
  fail(error);
}
