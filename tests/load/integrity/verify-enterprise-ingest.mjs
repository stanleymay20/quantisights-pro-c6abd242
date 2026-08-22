#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";

const required = ["LOAD_TARGET", "LOAD_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOAD_RUN_ID", "LOAD_INGEST_DATASET_ID"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(2);
  }
}
if (process.env.LOAD_TARGET !== "staging") {
  console.error("Enterprise ingest verification is staging-only");
  process.exit(2);
}

const base = process.env.LOAD_SUPABASE_URL.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const runId = process.env.LOAD_RUN_ID;
const datasetId = process.env.LOAD_INGEST_DATASET_ID;
const timeoutMs = Number(process.env.LOAD_INGEST_DRAIN_TIMEOUT_MS || 10 * 60 * 1000);
const pollMs = Number(process.env.LOAD_INGEST_DRAIN_POLL_MS || 5000);
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const reportsDir = "tests/load/reports";
const reportPath = `${reportsDir}/enterprise-ingest-verification.json`;
const failureFlag = `${reportsDir}/enterprise-ingest-failed.flag`;
mkdirSync(reportsDir, { recursive: true });

async function rest(path, extraHeaders = {}) {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers: { ...headers, ...extraHeaders } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  return response;
}

async function loadJobs() {
  const params = new URLSearchParams();
  params.set("select", "id,status,records_synced,chunks_total,chunks_completed,chunks_failed,error_message,governance_warning,request_id,queued_at,last_progress_at,completed_at");
  params.set("request_id", `like.${runId}-%`);
  params.set("order", "created_at.asc");
  const response = await rest(`data_sync_jobs?${params}`);
  return response.json();
}

const terminal = new Set(["completed", "partial", "failed"]);
const started = Date.now();
let jobs = [];
while (Date.now() - started < timeoutMs) {
  jobs = await loadJobs();
  if (jobs.length > 0 && jobs.every((job) => terminal.has(job.status))) break;
  const active = jobs.filter((job) => !terminal.has(job.status)).length;
  console.log(`waiting for queue drain: jobs=${jobs.length} active=${active}`);
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}

const stuck = jobs.filter((job) => !terminal.has(job.status));
const failed = jobs.filter((job) => job.status === "failed");
const partial = jobs.filter((job) => job.status === "partial");
const badChunks = jobs.filter((job) => Number(job.chunks_failed || 0) > 0);
const incomplete = jobs.filter((job) => Number(job.chunks_completed || 0) + Number(job.chunks_failed || 0) !== Number(job.chunks_total || 0));
const governanceDegraded = jobs.filter((job) => typeof job.governance_warning === "string" && job.governance_warning.trim().length > 0);
const recordedRows = jobs.reduce((sum, job) => sum + Number(job.records_synced || 0), 0);

let persistedRows = 0;
if (jobs.length > 0) {
  const countParams = new URLSearchParams();
  countParams.set("select", "id");
  countParams.set("organization_id", "not.is.null");
  countParams.set("dataset_id", `eq.${datasetId}`);
  countParams.set("segment", `like.${runId}-%`);
  const countResponse = await rest(`metrics?${countParams}`, { Prefer: "count=exact", Range: "0-0" });
  const contentRange = countResponse.headers.get("content-range") || "";
  persistedRows = Number(contentRange.split("/")[1] || 0);
}

const problems = [];
if (jobs.length === 0) problems.push(`no data_sync_jobs found for LOAD_RUN_ID=${runId}`);
if (stuck.length) problems.push(`${stuck.length} jobs did not reach terminal state`);
if (failed.length) problems.push(`${failed.length} jobs failed`);
if (partial.length) problems.push(`${partial.length} jobs were partial`);
if (badChunks.length) problems.push(`${badChunks.length} jobs contain DLQ/failed chunks`);
if (incomplete.length) problems.push(`${incomplete.length} jobs have inconsistent chunk accounting`);
if (governanceDegraded.length) problems.push(`${governanceDegraded.length} jobs have degraded governance/audit evidence`);
if (recordedRows !== persistedRows) problems.push(`persisted rows (${persistedRows}) != job recorded rows (${recordedRows})`);

const report = {
  certification: "enterprise_ingest_queue",
  verified_at: new Date().toISOString(),
  run_id: runId,
  dataset_id: datasetId,
  status: problems.length === 0 ? "pass" : "fail",
  jobs: jobs.length,
  completed_jobs: jobs.filter((job) => job.status === "completed").length,
  partial_jobs: partial.length,
  failed_jobs: failed.length,
  stuck_jobs: stuck.length,
  jobs_with_failed_chunks: badChunks.length,
  jobs_with_incomplete_chunk_accounting: incomplete.length,
  jobs_with_governance_warnings: governanceDegraded.length,
  recorded_rows_synced: recordedRows,
  persisted_load_rows: persistedRows,
  drain_seconds: Math.round((Date.now() - started) / 100) / 10,
  problems,
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (problems.length) {
  writeFileSync(failureFlag, `${problems.join("; ")}\n`);
  console.error(`NO GO: ${problems.join("; ")}`);
  process.exit(1);
}

console.log(`GO: queued enterprise ingestion drained completely with matching persisted-row and governance evidence (${reportPath})`);
