import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const producer = readFileSync(resolve(process.cwd(), "supabase/functions/queued-metric-ingest/index.ts"), "utf8");
const worker = readFileSync(resolve(process.cwd(), "supabase/functions/process-metric-ingest-queue/index.ts"), "utf8");
const queueMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260822062000_enterprise_metric_ingest_queue.sql"), "utf8");
const chunkMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260822062500_metric_ingest_chunk_idempotency.sql"), "utf8");
const enqueueMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260822064000_atomic_metric_ingest_enqueue.sql"), "utf8");

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
  });

  it("atomically enqueues the complete chunk set", () => {
    expect(enqueueMigration).toContain("enqueue_metric_ingest_job");
    expect(enqueueMigration).toContain("FOREACH _chunk");
    expect(enqueueMigration).toContain("chunks_total = _count");
    expect(producer).toContain("enqueue_metric_ingest_job");
  });

  it("returns 202 only after durable acceptance and rejects partial validation", () => {
    expect(producer).toContain("Queued batch rejected because one or more records are invalid");
    expect(producer).toContain("durable: true");
    expect(producer).toContain("}, 202)");
  });

  it("moves exhausted messages to DLQ and advances freshness only at terminal job state", () => {
    expect(worker).toContain("move_metric_ingest_to_dlq");
    expect(worker).toContain('jobStatus === "completed" || jobStatus === "partial"');
    expect(worker).not.toContain("last_refreshed_at: new Date().toISOString(),\n      });");
  });
});
