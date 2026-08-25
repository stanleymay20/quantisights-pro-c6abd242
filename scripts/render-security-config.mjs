import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  OBSERVABILITY_CONNECT_ORIGINS,
  POSTHOG_SCRIPT_ORIGINS,
} from "../config/security-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const files = ["public/_headers", "public/_worker.js", "netlify.toml", "vercel.json"];
const requiredMarkers = [
  ...POSTHOG_SCRIPT_ORIGINS,
  ...OBSERVABILITY_CONNECT_ORIGINS,
  "worker-src 'self' blob:",
];

const failures = [];

for (const path of files) {
  const content = readFileSync(resolve(root, path), "utf8");
  if (content.includes("'unsafe-eval'")) failures.push(`${path}: CSP must not allow unsafe-eval`);
  for (const marker of requiredMarkers) {
    if (!content.includes(marker)) failures.push(`${path}: missing ${marker}`);
  }
}

for (const path of ["scripts/apply-cloudflare-security.mjs", "scripts/apply-cloudflare-security-headers.mjs"]) {
  const content = readFileSync(resolve(root, path), "utf8");
  if (content.includes("'unsafe-eval'")) failures.push(`${path}: CSP must not allow unsafe-eval`);
  if (!content.includes("STANDARD_CSP")) failures.push(`${path}: must use the central CSP source`);
}

const index = readFileSync(resolve(root, "index.html"), "utf8");
if (/http-equiv=["']Content-Security-Policy["']/i.test(index)) {
  failures.push("index.html: CSP must be delivered through HTTP headers");
}

const worker = readFileSync(resolve(root, "public/_worker.js"), "utf8");
for (const marker of ["EMBED_ALLOWED_ORIGINS", "pathname", "/embed"]) {
  if (!worker.includes(marker)) failures.push(`public/_worker.js: missing ${marker}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Security configuration is synchronized.");
