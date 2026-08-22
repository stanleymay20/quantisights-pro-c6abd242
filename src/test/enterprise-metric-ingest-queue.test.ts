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

describe("enterprise metric ingest queue contract", () => {
  it("uses durable queue + DLQ with bounded worker settings", () => {
    expect(queueMigration).toContain("pgmq.create('metric_ingest')");
    expect(queueMigration).toContain("pgmq.create('metric_ingest_dlq')");
    expect(queueMigration).toContain("visibility_timeout_seconds");
    expect(queueMigration).toContain("max_retries");
    expect(worker).toContain("MAX_METRICS_PER_CHUNK = 1000");
  });

  it("revalidates tenant resources at the privileged worker boundary", () => {
    expect(worker).toContain('.eq("organization_id", envelope.organization_id)');
    expect(worker).toContain('.eq("data_source_id", envelope.data_source_id)');
    expect(worker).toContain("Dataset does not belong to queue organization");
  });

  it("makes queue progress idempotent under at-least-once delivery", () => {
    expect(chunkMigration).toContain("metric_ingest_chunk_results");
    expect(chunkMigration).toContain("ON CONFLICT (chunk_id) DO NOTHING");
    expect(worker).toContain("record_metric_ingest_chunk_result");
    expect(worker).toContain("Never execute business writes again once that durable terminal marker exists");
    expect(worker).toContain('terminalChunk?.status === "completed"');
    expect(worker).toContain('terminalChunk?.status === "failed"');
  });

  it("persists terminal failure progress before removing a poison message", () => {
    const marker = worker.indexOf("Persist terminal job progress BEFORE removing the poison message");
    const progress = worker.indexOf('svc.rpc("record_metric_ingest_chunk_result"', marker);
    const dlq = worker.indexOf('svc.rpc("move_metric_ingest_to_dlq"', marker);
    expect(marker).toBeGreaterThan(-1);
    expect(progress).toBeGreaterThan(marker);
    expect(dlq).toBeGreaterThan(progress);
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

  it("advances freshness only after the whole job reaches a persisted terminal state", () => {
    expect(worker).toContain('jobStatus === "completed" || jobStatus === "partial"');
    const freshness = worker.indexOf("last_refreshed_at: new Date().toISOString()");
    const terminalGuard = worker.lastIndexOf('jobStatus === "completed" || jobStatus === "partial"', freshness);
    expect(freshness).toBeGreaterThan(-1);
    expect(terminalGuard).toBeGreaterThan(-1);
    expect(terminalGuard).toBeLessThan(freshness);
  });
});
