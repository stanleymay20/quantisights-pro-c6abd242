import { fileURLToPath } from "node:url";
import { contentSecurityPolicy, permissionsPolicy } from "./apply-cloudflare-security.mjs";

const API_BASE = "https://api.cloudflare.com/client/v4";
const HOSTNAME = "www.quantivis.io";
const WORKER_NAME = "quantivis-enterprise-security-headers";
const WORKER_ROUTE_PATTERNS = [`https://${HOSTNAME}/*`, `${HOSTNAME}/*`];

export const workerSecurityHeaders = {
  "Content-Security-Policy": contentSecurityPolicy,
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": permissionsPolicy,
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Quantivis-Edge-Security": "cloudflare-worker",
};

const OAUTH_BROKER_PATH_PREFIX = "/~oauth/";
const OAUTH_CALLBACK_PATH = "/auth/callback";

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
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": options.contentType ?? "application/json" }
        : {}),
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
    error.path = path;
    throw error;
  }

  return payload.result;
}

export function buildSecurityWorkerScript(headers = workerSecurityHeaders) {
  return `const SECURITY_HEADERS = ${JSON.stringify(headers, null, 2)};
const OAUTH_BROKER_PATH_PREFIX = ${JSON.stringify(OAUTH_BROKER_PATH_PREFIX)};
const OAUTH_CALLBACK_PATH = ${JSON.stringify(OAUTH_CALLBACK_PATH)};

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    const originResponse = await fetch(request);
    return withSecurityHeaders(originResponse, request);
  } catch (error) {
    const fallback = new Response("Quantivis edge security worker failed before origin response.", {
      status: 502,
      statusText: "Bad Gateway",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Quantivis-Edge-Security-Error": error instanceof Error ? error.name : "unknown",
      },
    });

    return withSecurityHeaders(fallback, request);
  }
}

function withSecurityHeaders(response, request) {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith(OAUTH_BROKER_PATH_PREFIX) || pathname === OAUTH_CALLBACK_PATH) {
    return response;
  }

  const securedResponse = new Response(shouldStripBody(response, request) ? null : response.body, response);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    securedResponse.headers.set(name, value);
  }

  securedResponse.headers.set("X-Quantivis-Edge-Path", new URL(request.url).pathname || "/");

  return securedResponse;
}

function shouldStripBody(response, request) {
  return request.method === "HEAD" || response.status === 204 || response.status === 304;
}
`;
}

async function readZone(env) {
  return await cloudflareRequest(`/zones/${env.CLOUDFLARE_ZONE_ID}`, {}, env);
}

async function putWorkerScript(env, accountId) {
  return await cloudflareRequest(
    `/accounts/${accountId}/workers/scripts/${WORKER_NAME}`,
    {
      method: "PUT",
      contentType: "application/javascript",
      body: buildSecurityWorkerScript(),
    },
    env,
  );
}

async function listWorkerRoutes(env) {
  return await cloudflareRequest(`/zones/${env.CLOUDFLARE_ZONE_ID}/workers/routes?per_page=100`, {}, env);
}

async function upsertWorkerRoute(env) {
  const routes = await listWorkerRoutes(env);
  const appliedRoutes = [];

  for (const pattern of WORKER_ROUTE_PATTERNS) {
    const existingRoute = routes.find((route) => route.pattern === pattern) ?? null;
    const body = JSON.stringify({
      pattern,
      script: WORKER_NAME,
    });

    const route = existingRoute
      ? await cloudflareRequest(
          `/zones/${env.CLOUDFLARE_ZONE_ID}/workers/routes/${existingRoute.id}`,
          { method: "PUT", body },
          env,
        )
      : await cloudflareRequest(
          `/zones/${env.CLOUDFLARE_ZONE_ID}/workers/routes`,
          { method: "POST", body },
          env,
        );

    appliedRoutes.push(route);
  }

  return appliedRoutes;
}

export async function applyEnterpriseSecurityWorker(env = readCloudflareEnvironment()) {
  const zone = await readZone(env);
  const accountId = zone.account?.id;

  if (!accountId) {
    throw new Error("Cloudflare zone account ID was not available.");
  }

  await putWorkerScript(env, accountId);
  const routes = await upsertWorkerRoute(env);

  console.log(`Applied Cloudflare Worker fallback "${WORKER_NAME}".`);
  for (const route of routes) {
    console.log(`Worker route: ${route.pattern ?? "<unknown>"}`);
    console.log(`Worker script: ${route.script ?? WORKER_NAME}`);
  }
  console.log(`Managed headers: ${Object.keys(workerSecurityHeaders).join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  applyEnterpriseSecurityWorker().catch((error) => {
    console.error(error.message);
    if (error.status === 403 || JSON.stringify(error.payload ?? {}).includes('"code":10000')) {
      console.error(
        [
          "Cloudflare Worker fallback requires these API token permissions:",
          "- Zone / Zone / Read",
          "- Zone / DNS / Read",
          "- Zone / Workers Routes / Edit",
          "- Account / Workers Scripts / Edit",
          "Scope the account permission to the Cloudflare account that owns quantivis.io, then rerun the workflow from main.",
        ].join("\n"),
      );
    }
    process.exitCode = 1;
  });
}
