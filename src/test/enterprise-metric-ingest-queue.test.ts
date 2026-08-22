import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const producer = readFileSync(resolve(process.cwd(), "supabase/functions/queued-metric-ingest/index.ts"), "utf8");
const worker = readFileSync(resolve(process.cwd(), "supabase/functions/process-metric-ingest-queue/index.ts"), "utf8");
const queueMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260822062000_enterprise_metric_ingest_queue.sql"), "utf8");
const chunkMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260822062500_metric_ingest_chunk_idempotency.sql"), "utf8");
const enqueueMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260822064000_atomic_metric_ingest_enqueue.sql"), "utf8");
const backpressureMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260822065000_metric_ingest_backpressure.sql"), "utf8");
const scopedIdempotencyMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260822065500_scope_sync_request_id_by_source.sql"), "utf8");
const claimMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260822070000_claim_metric_ingest_job.sql"), "utf8");
const capacityMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260822071000_metric_ingest_worker_capacity.sql"), "utf8");
const freshnessMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260822071500_atomic_metric_job_freshness.sql"), "utf8");
const persistenceMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260822072000_atomic_metric_chunk_persistence.sql"), "utf8");
const governanceMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260822103500_metric_ingest_governance_warning.sql"), "utf8");

describe("enterprise metric ingest queue contract", () => {
  it("uses durable queue + DLQ with bounded worker settings", () => {
    expect(queueMigration).toContain("pgmq.create('metric_ingest')");
    expect(queueMigration).toContain("pgmq.create('metric_ingest_dlq')");
    expect(queueMigration).toContain("visibility_timeout_seconds");
    expect(queueMigration).toContain("max_retries");
    expect(capacityMigration).toContain("worker_concurrency");
    expect(capacityMigration).toContain("max_chunks_per_run");
    expect(capacityMigration).toContain("max_runtime_ms");
    expect(worker).toContain("MAX_METRICS_PER_CHUNK = 1000");
  });

  it("revalidates tenant resources transactionally at the privileged persistence boundary", () => {
    expect(persistenceMigration).toContain("dataset does not belong to organization");
    expect(persistenceMigration).toContain("data source does not belong to organization");
    expect(persistenceMigration).toContain("sync job does not belong to organization/source");
    expect(worker).toContain("persist_metric_ingest_chunk");
  });

  it("makes queue progress idempotent under at-least-once delivery", () => {
    expect(chunkMigration).toContain("metric_ingest_chunk_results");
    expect(chunkMigration).toContain("ON CONFLICT (chunk_id) DO NOTHING");
    expect(persistenceMigration).toContain("metric_ingest_chunk_results");
    expect(persistenceMigration).toContain("IF FOUND THEN");
    expect(worker).toContain('result.chunk_status === "failed"');
  });

  it("persists business rows and durable chunk progress in one transaction", () => {
    expect(persistenceMigration).toContain("INSERT INTO public.metrics");
    expect(persistenceMigration).toContain("record_metric_ingest_chunk_result");
    expect(persistenceMigration).toContain("validated chunk row count mismatch");
    expect(worker).not.toContain('svc.from("metrics").upsert');
  });

  it("persists terminal failure progress before removing a poison message", () => {
    const progress = worker.indexOf('svc.rpc("record_metric_ingest_chunk_result"');
    const dlqAfterProgress = worker.indexOf("await moveToDlq(svc, raw, message)", progress);
    expect(progress).toBeGreaterThan(-1);
    expect(dlqAfterProgress).toBeGreaterThan(progress);
  });

  it("atomically enqueues the complete chunk set", () => {
    expect(enqueueMigration).toContain("enqueue_metric_ingest_job");
    expect(enqueueMigration).toContain("FOREACH _chunk");
    expect(enqueueMigration).toContain("chunks_total = _count");
    expect(producer).toContain("enqueue_metric_ingest_job");
  });

  it("serializes admission and enforces bounded backlog", () => {
    expect(backpressureMigration).toContain("FOR UPDATE");
    expect(backpressureMigration).toContain("METRIC_QUEUE_BACKPRESSURE");
    expect(backpressureMigration).toContain("_outstanding + _count > _max_depth");
    expect(producer).toContain("Retry-After");
    expect(producer).toContain("retryable: true");
  });

  it("scopes idempotency by tenant/source and atomically claims request ids", () => {
    expect(scopedIdempotencyMigration).toContain("organization_id, data_source_id, request_id");
    expect(claimMigration).toContain("ON CONFLICT (organization_id, data_source_id, request_id)");
    expect(producer).toContain("claim_metric_ingest_job");
  });

  it("returns 202 only after durable acceptance and rejects partial validation", () => {
    expect(producer).toContain("Queued batch rejected because one or more records are invalid");
    expect(producer).toContain("durable: true");
    expect(producer).toContain("}, 202)");
  });

  it("surfaces audit degradation instead of silently presenting full governance health", () => {
    expect(governanceMigration).toContain("governance_warning");
    expect(producer).toContain("governance_degraded");
    expect(producer).toContain("Acceptance audit failed");
    expect(producer).toContain('update({ governance_warning: governanceWarning })');
  });

  it("atomically advances freshness only when all chunks reach a persisted terminal state", () => {
    expect(freshnessMigration).toContain("_job.chunks_completed + _job.chunks_failed");
    expect(freshnessMigration).toContain("IF _status IN ('completed', 'partial')");
    expect(freshnessMigration).toContain("UPDATE public.datasets");
    expect(worker).not.toContain("last_refreshed_at");
  });

  it("drains multiple batches with bounded concurrency and runtime", () => {
    expect(worker).toContain("while (");
    expect(worker).toContain("state.max_chunks_per_run");
    expect(worker).toContain("state.max_runtime_ms");
    expect(worker).toContain("Promise.all(group.map");
    expect(worker).toContain("state.worker_concurrency");
  });
});
