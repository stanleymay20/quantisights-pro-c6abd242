// tests/load/inventory/edge-function-matrix.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const FUNCTIONS_DIR = "supabase/functions";
const ALLOW = new Set(["auth-rate-limiter", "compute-kpi", "executive-copilot", "mock-ai", "compute-iq-score"]);
const BLOCK = new Set([
  "seed-demo-data", "data-export", "auto-create-decisions", "auth-email-hook",
  "connector-pull", "connector-salesforce-pull", "connector-sap-pull",
  "connector-hubspot-pull", "connector-bigquery-pull", "connector-snowflake-pull", "connector-s3-pull",
]);

const fns = readdirSync(FUNCTIONS_DIR).filter((n) => {
  if (n.startsWith("_")) return false;
  const p = join(FUNCTIONS_DIR, n);
  return statSync(p).isDirectory() && existsSync(join(p, "index.ts"));
});

const rows = [["function", "authenticated", "public", "mocked", "load_tested", "excluded", "reason"]];
let silent = 0;

for (const fn of fns) {
  const src = readFileSync(join(FUNCTIONS_DIR, fn, "index.ts"), "utf8");
  const authenticated = /Authorization|verify_jwt|getUser\(\)/.test(src);
  const isPublic = !authenticated;
  const mocked = fn === "mock-ai";
  const loadTested = ALLOW.has(fn);
  const excluded = BLOCK.has(fn);
  let reason = "";
  if (excluded) reason = "destructive/email/connector";
  else if (mocked) reason = "stub";
  else if (!loadTested) { reason = "NOT COVERED"; silent++; }
  rows.push([fn, authenticated, isPublic, mocked, loadTested, excluded, reason]);
}

mkdirSync("tests/load/reports", { recursive: true });
writeFileSync("tests/load/reports/edge-function-matrix.csv", rows.map((r) => r.join(",")).join("\n"));
console.log(`Wrote edge-function-matrix.csv (${fns.length} fns, ${silent} uncovered).`);
if (silent > 0) {
  console.warn(`WARN: ${silent} functions not allow-listed, mocked, or excluded.`);
  if (process.env.LOAD_STRICT_MATRIX === "1") process.exit(1);
}
