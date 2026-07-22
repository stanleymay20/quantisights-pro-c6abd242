import { fileURLToPath } from "node:url";

const API_BASE = "https://api.cloudflare.com/client/v4";
const HOSTNAME = "www.quantivis.io";
const RULE_REF = "quantivis_enterprise_security_headers";
const RULE_DESCRIPTION = "Quantivis enterprise security headers for www.quantivis.io";
const PHASE = "http_response_headers_transform";
const RULESET_NAME = "Zone-level Response Headers Transform Ruleset";
const RULESET_DESCRIPTION = "Zone-level ruleset that executes response header transform rules.";
const UNSUPPORTED_RULESET_PUT_FIELDS = new Set(["id", "kind", "phase", "version", "last_updated"]);
const OAUTH_BROKER_PATH_PREFIX = "/~oauth/";
const OAUTH_CALLBACK_PATH = "/auth/callback";

export const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://oauth.lovable.app https://*.posthog.com https://*.sentry.io https://browser.sentry-cdn.com",
  "connect-src 'self' https://oauth.lovable.app https://*.supabase.co https://*.sentry.io https://*.posthog.com https://*.ingest.sentry.io wss://*.supabase.co",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "worker-src 'self' blob:",
  "frame-src https://accounts.google.com https://oauth.lovable.app",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

export const permissionsPolicy = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "bluetooth=()",
  "interest-cohort=()",
].join(", ");

export const managedHeaders = {
  "Content-Security-Policy": { operation: "set", value: contentSecurityPolicy },
  "X-Frame-Options": { operation: "set", value: "DENY" },
  "Strict-Transport-Security": {
    operation: "set",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  "X-Content-Type-Options": { operation: "set", value: "nosniff" },
  "Referrer-Policy": { operation: "set", value: "strict-origin-when-cross-origin" },
  "Permissions-Policy": { operation: "set", value: permissionsPolicy },
  "Cross-Origin-Opener-Policy": { operation: "set", value: "same-origin-allow-popups" },
  "Cross-Origin-Resource-Policy": { operation: "set", value: "same-origin" },
};

export function buildCloudflareHeaderRule() {
  const oauthExemptExpression = [
    `not starts_with(http.request.uri.path, "${OAUTH_BROKER_PATH_PREFIX}")`,
    `http.request.uri.path ne "${OAUTH_CALLBACK_PATH}"`,
  ].join(" and ");

  return {
    ref: RULE_REF,
    description: RULE_DESCRIPTION,
    expression: `http.host eq "${HOSTNAME}" and ${oauthExemptExpression}`,
    action: "rewrite",
    action_parameters: { headers: managedHeaders },
    enabled: true,
  };
}

const rule = buildCloudflareHeaderRule();

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

async function listZoneRulesets(env) {
  return await cloudflareRequest(`/zones/${env.CLOUDFLARE_ZONE_ID}/rulesets`, {}, env);
}

async function readZoneRuleset(env, rulesetId) {
  return await cloudflareRequest(`/zones/${env.CLOUDFLARE_ZONE_ID}/rulesets/${rulesetId}`, {}, env);
}

function findResponseHeadersRuleset(rulesets = []) {
  return rulesets.find((ruleset) => ruleset.kind === "zone" && ruleset.phase === PHASE) ?? null;
}

function findManagedRule(ruleset) {
  return (
    ruleset?.rules?.find(
      (existingRule) =>
        existingRule.ref === RULE_REF ||
        existingRule.description === RULE_DESCRIPTION ||
        existingRule.expression === rule.expression,
    ) ?? null
  );
}

function upsertManagedRule(existingRules = []) {
  let replaced = false;
  const rules = existingRules.map((existingRule) => {
    const isManagedRule =
      existingRule.ref === RULE_REF ||
      existingRule.description === RULE_DESCRIPTION ||
      existingRule.expression === rule.expression;

    if (!isManagedRule) return existingRule;
    replaced = true;
    return { ...existingRule, ...rule, id: existingRule.id };
  });

  if (!replaced) rules.push(rule);
  return { rules, replaced };
}

export function stripUnsupportedRulesetPutFields(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripUnsupportedRulesetPutFields(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !UNSUPPORTED_RULESET_PUT_FIELDS.has(key))
      .map(([key, fieldValue]) => [key, stripUnsupportedRulesetPutFields(fieldValue)]),
  );
}

export function buildEntrypointRulesetPayload(existingRuleset, rules) {
  return {
    rules: stripUnsupportedRulesetPutFields(rules),
  };
}

export function buildCreateRulesetPayload(rules) {
  return {
    name: RULESET_NAME,
    description: RULESET_DESCRIPTION,
    kind: "zone",
    phase: PHASE,
    rules: stripUnsupportedRulesetPutFields(rules),
  };
}

export function validateAppliedRuleset(ruleset) {
  const managedRule = findManagedRule(ruleset);
  const failures = [];

  if (!ruleset) {
    failures.push("Cloudflare response header transform ruleset was not found after apply.");
  }

  if (!managedRule) {
    failures.push(`Managed rule "${RULE_DESCRIPTION}" was not found after apply.`);
  } else {
    const headers = managedRule.action_parameters?.headers ?? {};
    const missingHeaders = Object.keys(managedHeaders).filter((headerName) => !headers[headerName]);

    if (managedRule.enabled !== true) {
      failures.push(`Managed rule exists but is not enabled; enabled=${String(managedRule.enabled)}.`);
    }

    if (managedRule.expression !== rule.expression) {
      failures.push(`Managed rule expression is "${managedRule.expression}", expected "${rule.expression}".`);
    }

    if (missingHeaders.length > 0) {
      failures.push(`Managed rule is missing headers: ${missingHeaders.join(", ")}.`);
    }
  }

  if (failures.length > 0) {
    const error = new Error(`Cloudflare API-side verification failed: ${failures.join(" ")}`);
    error.failures = failures;
    throw error;
  }

  return managedRule;
}

export async function applyEnterpriseSecurityHeaders(env = readCloudflareEnvironment()) {
  const rulesets = await listZoneRulesets(env);
  const listedRuleset = findResponseHeadersRuleset(rulesets);
  const existingRuleset = listedRuleset ? await readZoneRuleset(env, listedRuleset.id) : null;
  const { rules, replaced } = upsertManagedRule(existingRuleset?.rules ?? []);

  const result = existingRuleset
    ? await cloudflareRequest(
        `/zones/${env.CLOUDFLARE_ZONE_ID}/rulesets/${existingRuleset.id}`,
        {
          method: "PUT",
          body: JSON.stringify(buildEntrypointRulesetPayload(existingRuleset, rules)),
        },
        env,
      )
    : await cloudflareRequest(
        `/zones/${env.CLOUDFLARE_ZONE_ID}/rulesets`,
        {
          method: "POST",
          body: JSON.stringify(buildCreateRulesetPayload(rules)),
        },
        env,
      );

  console.log(
    `${existingRuleset ? (replaced ? "Updated" : "Added") : "Created"} Cloudflare response header transform rule "${RULE_DESCRIPTION}".`,
  );
  console.log(`Ruleset ID: ${result.id}`);
  console.log(`Target expression: ${rule.expression}`);
  console.log(`Managed headers: ${Object.keys(managedHeaders).join(", ")}`);

  const appliedRuleset = await readZoneRuleset(env, result.id);
  const appliedRule = validateAppliedRuleset(appliedRuleset);
  console.log(`API verified managed rule ID: ${appliedRule.id ?? "<pending>"}`);
  console.log(`API verified managed rule enabled: ${String(appliedRule.enabled)}`);
  console.log(`API verified managed rule expression: ${appliedRule.expression}`);
  console.log(`API verified managed rule headers: ${Object.keys(appliedRule.action_parameters?.headers ?? {}).join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  applyEnterpriseSecurityHeaders().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
