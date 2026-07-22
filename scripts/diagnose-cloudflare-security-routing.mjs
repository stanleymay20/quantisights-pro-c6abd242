const API_BASE = "https://api.cloudflare.com/client/v4";
const HOSTNAME = "www.quantivis.io";
const APEX_HOSTNAME = "quantivis.io";
const PHASE = "http_response_headers_transform";
const RULE_REF = "quantivis_enterprise_security_headers";
const WORKER_NAME = "quantivis-enterprise-security-headers";

function readCloudflareEnvironment(env = process.env) {
  const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID } = env;

  if (!CLOUDFLARE_API_TOKEN) {
    throw new Error("CLOUDFLARE_API_TOKEN is required.");
  }

  if (!CLOUDFLARE_ZONE_ID) {
    throw new Error("CLOUDFLARE_ZONE_ID is required.");
  }

  return { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID };
}

async function cloudflareRequest(path, env = readCloudflareEnvironment()) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
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
    throw new Error(`Cloudflare API ${response.status} ${response.statusText}: ${reason}`);
  }

  return payload.result;
}

function printDnsRecord(record) {
  const proxied = Object.prototype.hasOwnProperty.call(record, "proxied")
    ? String(record.proxied)
    : "<not-applicable>";
  const content = record.content ?? record.data?.target ?? "<hidden>";

  console.log(
    `- ${record.type} ${record.name} -> ${content}; proxied=${proxied}; ttl=${record.ttl}; status=${record.comment_modified_on ? "commented" : "active"}`,
  );
}

function summarizeRule(rule) {
  return {
    id: rule.id ?? "<pending>",
    ref: rule.ref ?? "<none>",
    enabled: rule.enabled,
    expression: rule.expression,
    description: rule.description,
    headers: Object.keys(rule.action_parameters?.headers ?? {}),
  };
}

function routeLooksRelevant(route) {
  return String(route.pattern ?? "").includes(HOSTNAME) || route.script === WORKER_NAME;
}

async function diagnoseCloudflareSecurityRouting(env = readCloudflareEnvironment()) {
  console.log(`Cloudflare security routing diagnosis for ${HOSTNAME}`);

  const zone = await cloudflareRequest(`/zones/${env.CLOUDFLARE_ZONE_ID}`, env);
  console.log(`Zone: ${zone.name} (${zone.id})`);
  console.log(`Zone status: ${zone.status}`);
  console.log(`Zone paused: ${String(zone.paused)}`);
  console.log(`Zone plan: ${zone.plan?.name ?? "<unknown>"}`);
  console.log(`Name servers: ${(zone.name_servers ?? []).join(", ") || "<unknown>"}`);

  for (const name of [HOSTNAME, APEX_HOSTNAME]) {
    const records = await cloudflareRequest(
      `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records?name=${encodeURIComponent(name)}&per_page=100`,
      env,
    );
    console.log(`DNS records for ${name}: ${records.length}`);
    if (records.length === 0) {
      console.log(`- <none>`);
    } else {
      records.forEach(printDnsRecord);
    }
  }

  const rulesets = await cloudflareRequest(`/zones/${env.CLOUDFLARE_ZONE_ID}/rulesets`, env);
  const responseHeaderRulesets = rulesets.filter(
    (ruleset) => ruleset.kind === "zone" && ruleset.phase === PHASE,
  );

  console.log(`Response header transform rulesets: ${responseHeaderRulesets.length}`);

  for (const listedRuleset of responseHeaderRulesets) {
    const ruleset = await cloudflareRequest(
      `/zones/${env.CLOUDFLARE_ZONE_ID}/rulesets/${listedRuleset.id}`,
      env,
    );
    console.log(`Ruleset: ${ruleset.name} (${ruleset.id})`);
    console.log(`Ruleset kind/phase/version: ${ruleset.kind}/${ruleset.phase}/${ruleset.version}`);
    console.log(`Ruleset rules: ${ruleset.rules?.length ?? 0}`);

    for (const rule of ruleset.rules ?? []) {
      const summary = summarizeRule(rule);
      const isQuantivisRule =
        summary.ref === RULE_REF ||
        summary.expression === `http.host eq "${HOSTNAME}"` ||
        summary.expression === `(http.host eq "${HOSTNAME}")` ||
        (summary.expression?.includes(`http.host eq "${HOSTNAME}"`) &&
          summary.expression?.includes("/~oauth/") &&
          summary.expression?.includes("/auth/callback"));
      const prefix = isQuantivisRule ? "Managed Quantivis rule" : "Other rule";

      console.log(`${prefix}: ${summary.description ?? summary.ref}`);
      console.log(`- id: ${summary.id}`);
      console.log(`- ref: ${summary.ref}`);
      console.log(`- enabled: ${String(summary.enabled)}`);
      console.log(`- expression: ${summary.expression}`);
      console.log(`- headers: ${summary.headers.join(", ") || "<none>"}`);
    }
  }

  if (responseHeaderRulesets.length === 0) {
    console.log("No zone-level response header transform ruleset exists in this zone.");
  }

  const workerRoutes = await cloudflareRequest(
    `/zones/${env.CLOUDFLARE_ZONE_ID}/workers/routes?per_page=100`,
    env,
  );
  const relevantWorkerRoutes = workerRoutes.filter(routeLooksRelevant);

  console.log(`Worker routes in zone: ${workerRoutes.length}`);
  console.log(`Relevant Worker routes for ${HOSTNAME}: ${relevantWorkerRoutes.length}`);

  for (const route of relevantWorkerRoutes) {
    console.log(`Worker route: ${route.pattern}`);
    console.log(`- id: ${route.id ?? "<unknown>"}`);
    console.log(`- script: ${route.script ?? "<none>"}`);
    console.log(`- relevant: ${String(routeLooksRelevant(route))}`);
  }

  const disabledRelevantRoutes = relevantWorkerRoutes.filter((route) => !route.script);
  if (disabledRelevantRoutes.length > 0) {
    console.log(
      `Warning: ${disabledRelevantRoutes.length} relevant Worker route(s) have no script and may disable Worker execution.`,
    );
  }
}

diagnoseCloudflareSecurityRouting().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
