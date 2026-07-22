// tests/load/release-gate/run-gate.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPORTS = "tests/load/reports";
const criteria = [
  { key: "authentication", check: (s) => (s.metrics?.auth_failures?.values?.count ?? 0) === 0 },
  { key: "authorization_tenant_isolation", check: (s) => (s.metrics?.cross_tenant_leaks?.values?.count ?? 0) === 0 },
  { key: "decision_workflow", check: (s) => (s.metrics?.workflow_success_rate?.values?.rate ?? 0) >= 0.95 },
  { key: "edge_function_failures", check: (s) => (s.metrics?.edge_fn_failures?.values?.count ?? 0) === 0 },
  { key: "ai_orchestration", check: (s) => (s.metrics?.ai_failures?.values?.count ?? 0) < 10 },
  { key: "p95_read", check: (s) => (s.metrics?.["http_req_duration{kind:rest_read}"]?.values?.["p(95)"] ?? 99999) < 2500 },
  { key: "error_rate", check: (s) => (s.metrics?.http_req_failed?.values?.rate ?? 1) < 0.03 },
  { key: "5xx", check: (s) => (s.metrics?.db_5xx?.values?.count ?? 0) === 0 },
];

if (!existsSync(REPORTS)) { console.error("No reports/ directory."); process.exit(1); }
const summaries = readdirSync(REPORTS).filter((f) => f.startsWith("summary-")).map((f) => ({
  stage: f.replace(/^summary-|\.json$/g, ""), data: JSON.parse(readFileSync(join(REPORTS, f), "utf8")),
}));
if (!summaries.length) { console.error("No summary-*.json reports found."); process.exit(1); }

const lines = [`# Release Gate — ${new Date().toISOString()}`, ""];
let go = true;
for (const { stage, data } of summaries) {
  lines.push(`## Stage: ${stage}`);
  for (const c of criteria) {
    const ok = c.check(data);
    if (!ok) go = false;
    lines.push(`- ${ok ? "✓" : "✗"} ${c.key}`);
  }
  lines.push("");
}
const integrityOk = !existsSync(join(REPORTS, "integrity-failed.flag"));
const matrixOk = existsSync(join(REPORTS, "edge-function-matrix.csv"));
lines.push(`- ${integrityOk ? "✓" : "✗"} no_data_corruption`);
lines.push(`- ${matrixOk ? "✓" : "✗"} edge_function_matrix_present`);
if (!integrityOk || !matrixOk) go = false;

lines.unshift(go ? "## VERDICT: **GO**\n" : "## VERDICT: **NO GO**\n");
const out = join(REPORTS, `release-gate-${Date.now()}.md`);
mkdirSync(REPORTS, { recursive: true });
writeFileSync(out, lines.join("\n"));
console.log(lines.join("\n"));
console.log(`\nReport: ${out}`);
process.exit(go ? 0 : 1);
