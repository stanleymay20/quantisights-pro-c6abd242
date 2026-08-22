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

const enterpriseIngestCriteria = [
  { key: "queued_acceptance_error_rate", check: (s) => (s.metrics?.http_req_failed?.values?.rate ?? 1) < 0.01 },
  { key: "queued_acceptance_checks", check: (s) => (s.metrics?.checks?.values?.rate ?? 0) > 0.99 },
  { key: "queued_acceptance_p95", check: (s) => (s.metrics?.queued_ingest_acceptance_ms?.values?.["p(95)"] ?? 99999) < 2000 },
  { key: "queued_records_accepted", check: (s) => (s.metrics?.queued_ingest_records_accepted?.values?.count ?? 0) > 0 },
];

if (!existsSync(REPORTS)) { console.error("No reports/ directory."); process.exit(1); }
const summaries = readdirSync(REPORTS).filter((f) => f.startsWith("summary-")).map((f) => ({
  stage: f.replace(/^summary-|\.json$/g, ""), data: JSON.parse(readFileSync(join(REPORTS, f), "utf8")),
}));
if (!summaries.length) { console.error("No summary-*.json reports found."); process.exit(1); }

const lines = [`# Release Gate — ${new Date().toISOString()}`, ""];
let go = true;
let enterpriseIngestPresent = false;
for (const { stage, data } of summaries) {
  lines.push(`## Stage: ${stage}`);
  const stageCriteria = stage === "enterprise-ingest-queue" ? enterpriseIngestCriteria : criteria;
  if (stage === "enterprise-ingest-queue") enterpriseIngestPresent = true;
  for (const c of stageCriteria) {
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

if (enterpriseIngestPresent) {
  const verificationPath = join(REPORTS, "enterprise-ingest-verification.json");
  const failedFlag = join(REPORTS, "enterprise-ingest-failed.flag");
  let verificationOk = false;
  let verification = null;
  if (existsSync(verificationPath) && !existsSync(failedFlag)) {
    try {
      verification = JSON.parse(readFileSync(verificationPath, "utf8"));
      verificationOk = verification?.status === "pass"
        && Number(verification?.jobs ?? 0) > 0
        && Number(verification?.failed_jobs ?? 0) === 0
        && Number(verification?.partial_jobs ?? 0) === 0
        && Number(verification?.stuck_jobs ?? 0) === 0
        && Number(verification?.jobs_with_failed_chunks ?? 0) === 0
        && Number(verification?.jobs_with_incomplete_chunk_accounting ?? 0) === 0
        && Number(verification?.recorded_rows_synced ?? -1) === Number(verification?.persisted_load_rows ?? -2)
        && Number(verification?.persisted_load_rows ?? 0) > 0;
    } catch {
      verificationOk = false;
    }
  }
  lines.push(`- ${verificationOk ? "✓" : "✗"} enterprise_ingest_durable_drain_integrity`);
  if (verification) {
    lines.push(`  - jobs: ${verification.jobs}`);
    lines.push(`  - persisted rows: ${verification.persisted_load_rows}`);
    lines.push(`  - drain seconds: ${verification.drain_seconds}`);
  }
  if (!verificationOk) go = false;
}

lines.unshift(go ? "## VERDICT: **GO**\n" : "## VERDICT: **NO GO**\n");
const out = join(REPORTS, `release-gate-${Date.now()}.md`);
mkdirSync(REPORTS, { recursive: true });
writeFileSync(out, lines.join("\n"));
console.log(lines.join("\n"));
console.log(`\nReport: ${out}`);
process.exit(go ? 0 : 1);
