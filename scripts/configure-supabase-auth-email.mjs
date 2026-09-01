#!/usr/bin/env node

const action = process.argv[2] || "configure";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
const hookSecret = process.env.SEND_EMAIL_HOOK_SECRET?.trim();

const STAGING_REF = "cmnihsbdbpubznlkmjbc";
const PRODUCTION_REF = "izgfrekdamlgigehxoqs";
const RETIRED_REF = "itpwpnwzzitkelffttyx";
const ALLOWED_REFS = new Set([STAGING_REF, PRODUCTION_REF]);

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

if (!accessToken) fail("SUPABASE_ACCESS_TOKEN must be set");
if (!projectRef) fail("SUPABASE_PROJECT_REF must be set");
if (projectRef === RETIRED_REF) fail("Refusing to configure Auth email on the retired Supabase project");
if (!ALLOWED_REFS.has(projectRef)) fail(`Unrecognised Supabase project ref: ${projectRef}`);
if (!["disable", "configure", "verify"].includes(action)) fail(`Unsupported action: ${action}`);

const managementHeaders = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};

const managementRequest = async (path, { method = "GET", body } = {}) => {
  const response = await fetch(`https://api.supabase.com${path}`, {
    method,
    headers: managementHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
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
    throw new Error(`${method} ${path} failed: ${detail}`);
  }
  return payload ?? {};
};

const authConfigPath = `/v1/projects/${projectRef}/config/auth`;
const hookUri = `https://${projectRef}.supabase.co/functions/v1/auth-email-hook`;
const workerUri = `https://${projectRef}.supabase.co/functions/v1/process-email-queue`;
const runSql = async (query) => managementRequest(
  `/v1/projects/${projectRef}/database/query`,
  { method: "POST", body: { query } },
);

const getLegacyApiKeys = async () => {
  const payload = await managementRequest(`/v1/projects/${projectRef}/api-keys?reveal=true`);
  const keys = Array.isArray(payload) ? payload : payload?.keys;
  if (!Array.isArray(keys)) throw new Error("Supabase API-key response has an unexpected shape");

  const findKey = (role) => {
    const candidate = keys.find((key) =>
      key?.name === role || key?.id === role || key?.role === role
    );
    const value = candidate?.api_key || candidate?.key || candidate?.value;
    if (typeof value !== "string" || !value.startsWith("eyJ")) {
      throw new Error(`Legacy ${role} JWT could not be resolved`);
    }
    return value;
  };

  return {
    anonKey: findKey("anon"),
    serviceRoleKey: findKey("service_role"),
  };
};

// The worker validates provider/runtime environment variables before its own
// service-role authorization check. Calling it with a valid anon JWT therefore
// provides a no-send health probe: a correctly configured worker must return
// 403, while missing provider/runtime credentials return 500. A 2xx response
// would be a security defect because anonymous callers must never process mail.
const verifyWorkerRuntime = async (anonKey) => {
  const response = await fetch(workerUri, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (response.status !== 403) {
    if (response.status >= 200 && response.status < 300) {
      throw new Error("process-email-queue accepted an anon invocation; service-role enforcement is broken");
    }
    if (response.status === 500) {
      throw new Error("process-email-queue runtime/provider credentials are missing or invalid");
    }
    throw new Error(`process-email-queue no-send health probe returned HTTP ${response.status}, expected 403`);
  }
};

const readInfrastructure = async () => {
  const infrastructure = await runSql(`
SELECT
  EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'email_queue_service_role_key'
  ) AS vault_secret_present,
  EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'process-email-queue'
      AND active = true
      AND schedule = '10 seconds'
  ) AS worker_cron_active,
  (SELECT count(*) FROM cron.job WHERE jobname = 'process-email-queue') AS worker_cron_count;
`);
  return Array.isArray(infrastructure) ? infrastructure[0] : infrastructure?.[0];
};

const verifyConfiguredTransport = async (anonKey) => {
  const failures = [];
  const authConfig = await managementRequest(authConfigPath);
  if (authConfig.hook_send_email_enabled !== true) failures.push("Send Email Hook is not enabled");
  if (authConfig.hook_send_email_uri !== hookUri) failures.push("Send Email Hook URI does not match the active project");
  if (!authConfig.hook_send_email_secrets) failures.push("Send Email Hook secret is not configured");

  const row = await readInfrastructure();
  if (!row?.vault_secret_present) failures.push("email_queue_service_role_key is missing from Vault");
  if (!row?.worker_cron_active) failures.push("process-email-queue cron is not active at 10 seconds");
  if (Number(row?.worker_cron_count) !== 1) failures.push("process-email-queue cron is not unique");

  try {
    await verifyWorkerRuntime(anonKey);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  if (failures.length > 0) {
    throw new Error(failures.join("; "));
  }
};

if (action === "disable") {
  try {
    await managementRequest(authConfigPath, {
      method: "PATCH",
      body: { hook_send_email_enabled: false },
    });

    // A disabled Auth hook is not enough if an old queue worker remains active.
    // Stop the custom dispatcher too so no authentication/transactional email
    // depends on an unavailable external provider. Messages remain durable in
    // PGMQ until a provider-backed configure run re-enables the worker.
    await runSql(`
DO $$
DECLARE
  worker_job_id bigint;
BEGIN
  FOR worker_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'process-email-queue'
  LOOP
    PERFORM cron.unschedule(worker_job_id);
  END LOOP;
END $$;
`);

    const verified = await managementRequest(authConfigPath);
    if (verified.hook_send_email_enabled === true) {
      fail("Send Email Hook remained enabled after disable request");
    }

    const workerState = await runSql(`
SELECT count(*)::int AS worker_cron_count
FROM cron.job
WHERE jobname = 'process-email-queue';
`);
    const workerRow = Array.isArray(workerState) ? workerState[0] : workerState?.[0];
    if (Number(workerRow?.worker_cron_count) !== 0) {
      fail("process-email-queue cron remained configured after disable request");
    }

    console.log(`Custom Auth email hook and queue worker disabled for ${projectRef}.`);
    process.exit(0);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

try {
  const { anonKey, serviceRoleKey } = await getLegacyApiKeys();

  if (action === "verify") {
    await verifyConfiguredTransport(anonKey);
    console.log(`Independent Auth email transport verified for ${projectRef}.`);
    console.log("Provider credentials, hook secret, and service-role values were never printed.");
    process.exit(0);
  }

  if (!hookSecret) fail("SEND_EMAIL_HOOK_SECRET must be set for configure");
  if (!/^v1,whsec_[A-Za-z0-9+/=_-]{32,}$/.test(hookSecret)) {
    fail("SEND_EMAIL_HOOK_SECRET must use the v1,whsec_ Standard Webhooks format");
  }

  // Fail before enabling the hook/cron if the already-deployed worker cannot
  // prove that its independent provider/runtime configuration is present.
  // Client Acceptance then remains red instead of silently falling back to a
  // different mail path.
  await verifyWorkerRuntime(anonKey);

  const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const setupSql = `
BEGIN;
DO $$
DECLARE
  worker_job_id bigint;
BEGIN
  FOR worker_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'process-email-queue'
  LOOP
    PERFORM cron.unschedule(worker_job_id);
  END LOOP;
END $$;
DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
SELECT vault.create_secret(
  ${sqlLiteral(serviceRoleKey)},
  'email_queue_service_role_key',
  'Service-role credential used only by the database email queue cron to invoke process-email-queue'
);

SELECT cron.schedule(
  'process-email-queue',
  '10 seconds',
  $cron$
  SELECT net.http_post(
    url := ${sqlLiteral(workerUri)},
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  WHERE
    (
      EXISTS (SELECT 1 FROM pgmq.q_auth_emails LIMIT 1)
      OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails LIMIT 1)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.email_send_state
      WHERE retry_after_until IS NOT NULL AND retry_after_until > now()
    );
  $cron$
);
COMMIT;
`;

  await runSql(setupSql);

  // The hook secret is rotated only after the Edge Function secret has been
  // installed by the deployment workflow. Re-enable the hook with the same
  // secret and the native Supabase Edge Function URI.
  await managementRequest(authConfigPath, {
    method: "PATCH",
    body: {
      hook_send_email_enabled: true,
      hook_send_email_uri: hookUri,
      hook_send_email_secrets: hookSecret,
    },
  });

  await verifyConfiguredTransport(anonKey);

  console.log(`Auth email hook + queue worker verified for ${projectRef}.`);
  console.log(`Hook URI: ${hookUri}`);
  console.log("Provider credentials, service-role, and webhook secret values were never printed.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
