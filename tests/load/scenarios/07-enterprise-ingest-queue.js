import http from "k6/http";
import { check, fail } from "k6";
import { Counter, Trend } from "k6/metrics";
import { guard } from "../lib/guard.js";

const RATE = Number(__ENV.LOAD_INGEST_RPS || "20");
const BATCH = Number(__ENV.LOAD_INGEST_BATCH || "500");
const DURATION = __ENV.LOAD_INGEST_DURATION || "1m";
const RUN_ID = __ENV.LOAD_RUN_ID || `queued-${Date.now()}`;

if (!Number.isInteger(BATCH) || BATCH < 1 || BATCH > 5000) {
  throw new Error("LOAD_INGEST_BATCH must be an integer between 1 and 5000");
}
if (!Number.isFinite(RATE) || RATE < 1 || RATE > 200) {
  throw new Error("LOAD_INGEST_RPS must be between 1 and 200");
}

const acceptedRecords = new Counter("queued_ingest_records_accepted");
const acceptanceLatency = new Trend("queued_ingest_acceptance_ms", true);

export const options = {
  scenarios: {
    queued_ingest: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: Math.max(10, Math.ceil(RATE / 2)),
      maxVUs: Math.max(50, RATE * 2),
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
    checks: ["rate>0.99"],
    queued_ingest_acceptance_ms: ["p(95)<2000"],
  },
};

export function setup() {
  guard({ stage: "enterprise-ingest-queue", vus: Math.max(50, RATE * 2) });
  if (__ENV.LOAD_TARGET !== "staging") {
    fail("Enterprise queued-ingest certification is staging-only");
  }
  for (const name of ["LOAD_SUPABASE_URL", "LOAD_INGEST_API_KEY", "LOAD_INGEST_DATASET_ID"]) {
    if (!__ENV[name]) fail(`${name} is required`);
  }
  console.log(`Queued ingest target: ${RATE} req/s × ${BATCH} records = ${(RATE * BATCH).toLocaleString()} records/s offered load`);
  console.log(`LOAD_RUN_ID=${RUN_ID}`);
  return { runId: RUN_ID };
}

export default function (state) {
  const requestId = `${state.runId}-${__VU}-${__ITER}`;
  const baseDay = (__ITER % 27) + 1;
  const records = new Array(BATCH);
  for (let i = 0; i < BATCH; i += 1) {
    records[i] = {
      metric_type: `load_metric_${i % 20}`,
      date: `2026-08-${String(baseDay).padStart(2, "0")}`,
      value: (__ITER * BATCH) + i + 0.125,
      region: `load-${__VU}`,
      segment: `${state.runId}-${__VU}-${__ITER}-${i}`,
      quality_score: 100,
    };
  }

  const started = Date.now();
  const response = http.post(
    `${__ENV.LOAD_SUPABASE_URL}/functions/v1/queued-metric-ingest`,
    JSON.stringify({ records }),
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": __ENV.LOAD_INGEST_API_KEY,
        "x-dataset-id": __ENV.LOAD_INGEST_DATASET_ID,
        "x-request-id": requestId,
      },
      tags: { name: "queued_metric_ingest_accept" },
      timeout: "15s",
    },
  );
  acceptanceLatency.add(Date.now() - started);

  let body = null;
  try { body = response.json(); } catch { /* check below reports malformed response */ }

  const ok = check(response, {
    "queued ingest returns 202": (r) => r.status === 202,
    "queued ingest confirms durability": () => body?.accepted === true && body?.durable === true,
    "queued ingest returns job id": () => typeof body?.job_id === "string" && body.job_id.length > 0,
    "queued ingest reports chunks": () => Number(body?.chunks_queued) > 0,
  });

  if (ok) acceptedRecords.add(Number(body?.unique_records_queued || 0));
}
