import { fileURLToPath } from "node:url";

const API_BASE = "https://api.cloudflare.com/client/v4";
const HOSTNAME = "www.quantivis.io";
const PROHIBITED_LOVABLE_A_RECORD = "185.158.133.1";

function readCloudflareEnvironment(env = process.env) {
  const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, LOVABLE_PROXY_ORIGIN } = env;

  if (!CLOUDFLARE_API_TOKEN) {
    throw new Error("CLOUDFLARE_API_TOKEN is required.");
  }

  if (!CLOUDFLARE_ZONE_ID) {
    throw new Error("CLOUDFLARE_ZONE_ID is required.");
  }

  return { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, LOVABLE_PROXY_ORIGIN };
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

function describeRecord(record) {
  return `${record.type} ${record.name} -> ${record.content}; proxied=${String(record.proxied)}`;
}

export function evaluateWwwDnsState(records, lovableProxyOrigin) {
  const normalizedOrigin = normalizeOrigin(lovableProxyOrigin);
  const activeRecords = records.filter((record) => record.name === HOSTNAME);
  const proxiedRecord = activeRecords.find((record) => record.proxied === true);
  const prohibitedARecord = activeRecords.find(
    (record) => record.type === "A" && record.content === PROHIBITED_LOVABLE_A_RECORD,
  );
  const matchingLovableCname = normalizedOrigin
    ? activeRecords.find(
        (record) =>
          record.type === "CNAME" &&
          normalizeOrigin(record.content) === normalizedOrigin &&
          record.proxied === true,
      )
    : null;

  if (matchingLovableCname) {
    return {
      ok: true,
      action: "noop",
      reason: `${HOSTNAME} already uses the Lovable proxy-mode CNAME with Cloudflare proxy enabled.`,
    };
  }

  if (normalizedOrigin) {
    return {
      ok: false,
      action: "upsert-cname",
      reason: `${HOSTNAME} must be converted to proxied CNAME ${normalizedOrigin}.`,
    };
  }

  if (proxiedRecord && !prohibitedARecord) {
    return {
      ok: true,
      action: "noop",
      reason: `${HOSTNAME} has a proxied Cloudflare DNS record.`,
    };
  }

  return {
    ok: false,
    action: "missing-origin",
    reason: [
      `${HOSTNAME} is not safely proxied through this Cloudflare zone.`,
      prohibitedARecord
        ? `It still has the direct Lovable A record ${PROHIBITED_LOVABLE_A_RECORD}, which bypasses Worker/Transform execution when DNS-only and causes Cloudflare Error 1000 when proxied.`
        : "No proxied DNS record was found for the buyer hostname.",
      "Reconnect the domain in Lovable using 'Cloudflare or similar proxy' mode, then add the resulting hostname as the GitHub secret LOVABLE_PROXY_ORIGIN.",
    ].join(" "),
  };
}

async function listDnsRecords(env) {
  return await cloudflareRequest(
    `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records?name=${encodeURIComponent(HOSTNAME)}&per_page=100`,
    {},
    env,
  );
}

async function deleteDnsRecord(env, record) {
  await cloudflareRequest(`/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`, { method: "DELETE" }, env);
}

async function createDnsRecord(env, origin) {
  return await cloudflareRequest(
    `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "CNAME",
        name: HOSTNAME,
        content: origin,
        proxied: true,
        ttl: 1,
        comment: "Managed by Quantivis Cloudflare enterprise security automation.",
      }),
    },
    env,
  );
}

async function updateDnsRecord(env, record, origin) {
  return await cloudflareRequest(
    `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        type: "CNAME",
        name: HOSTNAME,
        content: origin,
        proxied: true,
        ttl: 1,
        comment: record.comment ?? "Managed by Quantivis Cloudflare enterprise security automation.",
      }),
    },
    env,
  );
}

export async function applyCloudflareDns(env = readCloudflareEnvironment()) {
  const origin = normalizeOrigin(env.LOVABLE_PROXY_ORIGIN);
  let records = await listDnsRecords(env);
  const state = evaluateWwwDnsState(records, origin);

  console.log(`Cloudflare DNS state for ${HOSTNAME}:`);
  if (records.length === 0) {
    console.log("- <none>");
  } else {
    for (const record of records) console.log(`- ${describeRecord(record)}`);
  }
  console.log(state.reason);

  if (state.ok) return;

  if (state.action !== "upsert-cname") {
    throw new Error(state.reason);
  }

  const reusableCname = records.find((record) => record.type === "CNAME");

  for (const record of records) {
    if (record.id === reusableCname?.id) continue;
    await deleteDnsRecord(env, record);
    console.log(`Deleted conflicting DNS record: ${describeRecord(record)}`);
  }

  const appliedRecord = reusableCname
    ? await updateDnsRecord(env, reusableCname, origin)
    : await createDnsRecord(env, origin);

  console.log(`Applied DNS record: ${describeRecord(appliedRecord)}`);

  records = await listDnsRecords(env);
  const verifiedState = evaluateWwwDnsState(records, origin);
  if (!verifiedState.ok) {
    throw new Error(`Cloudflare DNS verification failed after apply: ${verifiedState.reason}`);
  }
  console.log(`DNS verified: ${verifiedState.reason}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  applyCloudflareDns().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
