import { fileURLToPath } from "node:url";

const API_BASE = "https://api.cloudflare.com/client/v4";
const HOSTNAME = "www.quantivis.io";
const APEX_HOSTNAME = "quantivis.io";
const MANAGED_HOSTNAMES = [HOSTNAME, APEX_HOSTNAME];
const PROHIBITED_LOVABLE_A_RECORD = "185.158.133.1";

function readCloudflareEnvironment(env = process.env) {
  const {
    CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ZONE_ID,
    APP_PROXY_ORIGIN,
    LOVABLE_PROXY_ORIGIN,
  } = env;

  if (!CLOUDFLARE_API_TOKEN) throw new Error("CLOUDFLARE_API_TOKEN is required.");
  if (!CLOUDFLARE_ZONE_ID) throw new Error("CLOUDFLARE_ZONE_ID is required.");

  return {
    CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ZONE_ID,
    APP_PROXY_ORIGIN,
    LOVABLE_PROXY_ORIGIN,
  };
}

async function cloudflareRequest(path, options = {}, env = readCloudflareEnvironment()) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.success === false) {
    const messages = [
      ...(payload.errors ?? []).map((error) => `${error.code}: ${error.message}`),
      ...(payload.messages ?? []).map((message) => message.message),
    ].filter(Boolean);
    const reason = messages.length > 0 ? messages.join("; ") : response.statusText;
    const error = new Error(`Cloudflare API ${response.status} ${response.statusText}: ${reason}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload.result;
}

function normalizeOrigin(origin) {
  return String(origin ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\.$/, "")
    .replace(/\/.*$/, "");
}

// APP_PROXY_ORIGIN is the vendor-neutral production contract. The legacy
// LOVABLE_PROXY_ORIGIN fallback keeps existing deployments working while the
// origin is migrated without requiring a coordinated secret rotation.
export function resolveProxyOrigin(env = process.env) {
  return normalizeOrigin(env.APP_PROXY_ORIGIN || env.LOVABLE_PROXY_ORIGIN);
}

function describeRecord(record) {
  return `${record.type} ${record.name} -> ${record.content}; proxied=${String(record.proxied)}`;
}

function evaluateDnsState(records, proxyOrigin, hostname) {
  const normalizedOrigin = normalizeOrigin(proxyOrigin);
  const activeRecords = records.filter((record) => record.name === hostname);
  const proxiedRecord = activeRecords.find((record) => record.proxied === true);
  const prohibitedARecord = activeRecords.find(
    (record) => record.type === "A" && record.content === PROHIBITED_LOVABLE_A_RECORD,
  );
  const matchingProxyCname = normalizedOrigin
    ? activeRecords.find(
        (record) =>
          record.type === "CNAME" &&
          normalizeOrigin(record.content) === normalizedOrigin &&
          record.proxied === true,
      )
    : null;

  if (matchingProxyCname) {
    return {
      ok: true,
      action: "noop",
      reason: `${hostname} already uses the configured proxy-origin CNAME with Cloudflare proxy enabled.`,
    };
  }
  if (normalizedOrigin) {
    return {
      ok: false,
      action: "upsert-cname",
      reason: `${hostname} must be converted to proxied CNAME ${normalizedOrigin}.`,
    };
  }
  if (proxiedRecord && !prohibitedARecord) {
    return {
      ok: true,
      action: "noop",
      reason: `${hostname} has a proxied Cloudflare DNS record.`,
    };
  }
  return {
    ok: false,
    action: "missing-origin",
    reason: [
      `${hostname} is not safely proxied through this Cloudflare zone.`,
      prohibitedARecord
        ? `It still has the direct Lovable A record ${PROHIBITED_LOVABLE_A_RECORD}.`
        : "No proxied DNS record was found for this hostname.",
      "Set APP_PROXY_ORIGIN to the approved frontend origin and rerun the Cloudflare workflow.",
      "LOVABLE_PROXY_ORIGIN remains a temporary backward-compatible fallback.",
    ].join(" "),
  };
}

export function evaluateWwwDnsState(records, proxyOrigin) {
  return evaluateDnsState(records, proxyOrigin, HOSTNAME);
}

export function evaluateApexDnsState(records, proxyOrigin) {
  return evaluateDnsState(records, proxyOrigin, APEX_HOSTNAME);
}

async function listDnsRecords(env, hostname) {
  return await cloudflareRequest(
    `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records?name=${encodeURIComponent(hostname)}&per_page=100`,
    {},
    env,
  );
}

async function deleteDnsRecord(env, record) {
  await cloudflareRequest(`/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`, { method: "DELETE" }, env);
}

async function createDnsRecord(env, origin, hostname) {
  return await cloudflareRequest(
    `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "CNAME",
        name: hostname,
        content: origin,
        proxied: true,
        ttl: 1,
        comment: "Managed by Quantivis Cloudflare enterprise security automation.",
      }),
    },
    env,
  );
}

async function updateDnsRecord(env, record, origin, hostname) {
  return await cloudflareRequest(
    `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        type: "CNAME",
        name: hostname,
        content: origin,
        proxied: true,
        ttl: 1,
        comment: record.comment ?? "Managed by Quantivis Cloudflare enterprise security automation.",
      }),
    },
    env,
  );
}

async function ensureManagedHostname(env, origin, hostname) {
  let records = await listDnsRecords(env, hostname);
  let state = evaluateDnsState(records, origin, hostname);

  console.log(`Cloudflare DNS state for ${hostname}:`);
  if (records.length === 0) console.log("- <none>");
  else for (const record of records) console.log(`- ${describeRecord(record)}`);
  console.log(state.reason);

  if (state.ok) return;
  if (state.action !== "upsert-cname") throw new Error(state.reason);

  const reusableCname = records.find((record) => record.type === "CNAME");
  for (const record of records) {
    if (record.id === reusableCname?.id) continue;
    await deleteDnsRecord(env, record);
    console.log(`Deleted conflicting DNS record: ${describeRecord(record)}`);
  }

  const appliedRecord = reusableCname
    ? await updateDnsRecord(env, reusableCname, origin, hostname)
    : await createDnsRecord(env, origin, hostname);
  console.log(`Applied DNS record: ${describeRecord(appliedRecord)}`);

  records = await listDnsRecords(env, hostname);
  state = evaluateDnsState(records, origin, hostname);
  if (!state.ok) throw new Error(`Cloudflare DNS verification failed after apply: ${state.reason}`);
  console.log(`DNS verified: ${state.reason}`);
}

export async function applyCloudflareDns(env = readCloudflareEnvironment()) {
  const origin = resolveProxyOrigin(env);
  for (const hostname of MANAGED_HOSTNAMES) {
    await ensureManagedHostname(env, origin, hostname);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  applyCloudflareDns().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
