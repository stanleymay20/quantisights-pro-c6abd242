import { chmod, readFile, unlink, writeFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

const API_BASE = "https://api.supabase.com";
const JIT_TTL_MS = 20 * 60 * 1000;
const STATE_FILE_NAME = "quantivis-supabase-jit-state.json";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function rfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function statePath() {
  return join(requiredEnv("RUNNER_TEMP"), STATE_FILE_NAME);
}

function authHeaders(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...extra,
  };
}

async function apiRequest(path, { method = "GET", body, allowStatuses = [] } = {}) {
  const token = requiredEnv("SUPABASE_ACCESS_TOKEN");
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: authHeaders(token, body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text.slice(0, 500) };
    }
  }

  if (!response.ok && !allowStatuses.includes(response.status)) {
    const message = payload?.message ?? payload?.error ?? response.statusText;
    throw new Error(`Supabase Management API ${method} ${path} failed (${response.status}): ${message}`);
  }

  return { status: response.status, payload };
}

function extractProfileUserId(profile) {
  const candidates = [
    profile?.id,
    profile?.gotrue_id,
    profile?.user_id,
    profile?.user?.id,
  ];
  const userId = candidates.find(isUuid);
  if (!userId) throw new Error("Supabase Management API profile did not contain a user UUID");
  return userId;
}

function readTemporaryAccessState(payload) {
  const state = payload?.state ?? payload?.status ?? payload?.enabled;
  if (state === "enabled" || state === true) return "enabled";
  if (state === "disabled" || state === false) return "disabled";
  throw new Error("Supabase temporary-access response did not contain a recognized enabled/disabled state");
}

function normalizeRole(role) {
  if (!role || typeof role !== "object" || typeof role.role !== "string") return null;
  const normalized = { role: role.role };
  if (role.allowed_networks && typeof role.allowed_networks === "object") {
    normalized.allowed_networks = role.allowed_networks;
  }
  if (Number.isFinite(role.expires_at)) normalized.expires_at = role.expires_at;
  return normalized;
}

function normalizeMapping(value) {
  if (!value || typeof value !== "object") return null;
  const userId = value.user_id ?? value.id;
  if (!isUuid(userId)) return null;
  const roles = Array.isArray(value.user_roles)
    ? value.user_roles.map(normalizeRole).filter(Boolean)
    : Array.isArray(value.roles)
      ? value.roles.map(normalizeRole).filter(Boolean)
      : [];
  return { user_id: userId, user_roles: roles };
}

function findMapping(payload, userId) {
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.mappings)
        ? payload.mappings
        : payload
          ? [payload]
          : [];

  return candidates
    .map(normalizeMapping)
    .find((mapping) => mapping?.user_id === userId) ?? null;
}

async function getExistingMapping(projectRef, userId) {
  const listed = await apiRequest(`/v1/projects/${projectRef}/database/jit/list`, {
    allowStatuses: [403, 404],
  });
  if (listed.status < 400) return findMapping(listed.payload, userId);

  const current = await apiRequest(`/v1/projects/${projectRef}/database/jit`, {
    allowStatuses: [404],
  });
  if (current.status === 404) return null;
  return findMapping(current.payload, userId);
}

async function putMapping(projectRef, mapping) {
  const response = await apiRequest(`/v1/projects/${projectRef}/database/jit`, {
    method: "PUT",
    body: mapping,
    allowStatuses: [404, 405],
  });
  if (response.status !== 404 && response.status !== 405) return;

  await apiRequest(`/v1/projects/${projectRef}/database/jit`, {
    method: "POST",
    body: mapping,
  });
}

async function writeState(state) {
  const path = statePath();
  await writeFile(path, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath(), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function writeGitHubEnv(name, value) {
  const envFile = requiredEnv("GITHUB_ENV");
  if (/\r|\n/.test(value)) throw new Error(`${name} contains an unexpected newline`);
  appendFileSync(envFile, `${name}=${value}\n`, { encoding: "utf8" });
}

function buildPoolerUrl(projectRef, host, token) {
  if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error("SUPABASE_POOLER_HOST is invalid");
  return `postgresql://postgres.${projectRef}:${rfc3986(token)}@${host}:5432/postgres?sslmode=require&options=-c%20jit%3Don`;
}

async function prepare() {
  const projectRef = requiredEnv("SUPABASE_PROJECT_REF");
  const poolerHost = requiredEnv("SUPABASE_POOLER_HOST");
  const token = requiredEnv("SUPABASE_ACCESS_TOKEN");

  const { payload: profile } = await apiRequest("/v1/profile");
  const userId = extractProfileUserId(profile);

  const { payload: accessConfig } = await apiRequest(
    `/v1/projects/${projectRef}/database/jit-access`,
  );
  const initialAccessState = readTemporaryAccessState(accessConfig);
  const previousMapping = await getExistingMapping(projectRef, userId);

  // Persist rollback information before mutating any platform state. The PAT is
  // intentionally never written to disk.
  await writeState({ projectRef, userId, initialAccessState, previousMapping });

  if (initialAccessState !== "enabled") {
    await apiRequest(`/v1/projects/${projectRef}/database/jit-access`, {
      method: "PUT",
      body: { state: "enabled" },
    });
  }

  const temporaryMapping = {
    user_id: userId,
    user_roles: [{
      role: "postgres",
      expires_at: Date.now() + JIT_TTL_MS,
    }],
  };
  await putMapping(projectRef, temporaryMapping);

  const dbUrl = buildPoolerUrl(projectRef, poolerHost, token);
  writeGitHubEnv("SUPABASE_JIT_DB_URL", dbUrl);
  console.log("Prepared short-lived Supabase JIT database access for staging migrations.");
}

async function cleanup() {
  const state = await readState();
  if (!state) {
    console.log("No Supabase JIT state file found; nothing to restore.");
    return;
  }

  const { projectRef, userId, initialAccessState, previousMapping } = state;
  if (!projectRef || !isUuid(userId)) throw new Error("Saved Supabase JIT rollback state is invalid");

  if (previousMapping) {
    await putMapping(projectRef, previousMapping);
  } else {
    await apiRequest(`/v1/projects/${projectRef}/database/jit/${userId}`, {
      method: "DELETE",
      allowStatuses: [404],
    });
  }

  if (initialAccessState === "disabled") {
    await apiRequest(`/v1/projects/${projectRef}/database/jit-access`, {
      method: "PUT",
      body: { state: "disabled" },
    });
  }

  await unlink(statePath()).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
  console.log("Restored Supabase JIT database-access state.");
}

const command = process.argv[2];
try {
  if (command === "prepare") {
    await prepare();
  } else if (command === "cleanup") {
    await cleanup();
  } else {
    throw new Error("Usage: node scripts/supabase-jit-access.mjs <prepare|cleanup>");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error::Supabase JIT access ${command ?? "command"} failed: ${message}`);
  process.exitCode = 1;
}
