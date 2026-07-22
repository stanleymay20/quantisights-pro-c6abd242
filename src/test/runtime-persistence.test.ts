import { describe, expect, it } from "vitest";

import {
  createRuntimePersistence,
  computeExecutionHash,
  MemoryRuntimePersistence,
  NotImplementedError,
  PostgresRuntimePersistence,
  stableRuntimeHash,
  SupabaseRuntimePersistence,
} from "@/lib/runtime-persistence";
import type {
  ExecutionCreateInput,
  ExecutionRecord,
  RuntimePersistence,
  RuntimePersistenceAdapter,
} from "@/lib/runtime-persistence-types";
import type { RuntimeQueueMessage } from "@/lib/runtime-queue-types";

const NOW = "2026-07-09T10:00:00.000Z";
const LATER = "2026-07-09T10:05:00.000Z";
const AFTER_RETENTION = "2026-07-10T10:05:01.000Z";

describe("AG-3E enterprise runtime persistence", () => {
  it("creates an execution with deterministic lifecycle metadata", async () => {
    const { persistence } = persistenceFixture();

    const result = await persistence.createExecution(executionInput());

    expect(result.status).toBe("PERSISTED");
    expect(result.errors).toEqual([]);
    expect(result.execution).toMatchObject({
      execution_id: "exec-001",
      correlation_id: "corr-001",
      request_hash: "hash-001",
      idempotency_key: "idem-001",
      tenant_id: "tenant-a",
      organization_id: "org-a",
      status: "CREATED",
      runtime_version: "ag-3e.1",
      gateway_version: "ag-2.0.0",
      schema_version: "quantivis.execution-record.v1",
      created_at: NOW,
      updated_at: NOW,
      completed_at: null,
      metadata: { channel: "runtime" },
      result: null,
      error: null,
    });
    expect(result.execution?.execution_hash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
  });

  it("rejects duplicate execution identifiers", async () => {
    const { persistence } = persistenceFixture();
    await persistence.createExecution(executionInput());

    const duplicate = await persistence.createExecution(executionInput());

    expect(duplicate.status).toBe("REJECTED");
    expect(duplicate.execution).toBeNull();
    expect(duplicate.errors).toEqual(["duplicate execution_id exec-001"]);
  });

  it("updates an execution through valid lifecycle transitions", async () => {
    const { persistence, clock } = persistenceFixture();
    await persistence.createExecution(executionInput());
    clock.current = LATER;

    const processing = await persistence.updateExecution("tenant-a", "exec-001", {
      status: "PROCESSING",
    });
    const completed = await persistence.updateExecution("tenant-a", "exec-001", {
      status: "COMPLETED",
      result: { decision: "approved" },
    });

    expect(processing.status).toBe("PERSISTED");
    expect(processing.execution).toMatchObject({
      status: "PROCESSING",
      created_at: NOW,
      updated_at: LATER,
      completed_at: null,
    });
    expect(completed.execution).toMatchObject({
      status: "COMPLETED",
      completed_at: LATER,
      result: { decision: "approved" },
    });
    expect(completed.execution?.execution_hash).not.toBe(processing.execution?.execution_hash);
  });

  it("rejects invalid lifecycle transitions and terminal-state mutation", async () => {
    const { persistence } = persistenceFixture();
    await persistence.createExecution(executionInput());
    await persistence.updateExecution("tenant-a", "exec-001", { status: "PROCESSING" });

    const backwards = await persistence.updateExecution("tenant-a", "exec-001", {
      status: "RECEIVED",
    });
    await persistence.updateExecution("tenant-a", "exec-001", { status: "COMPLETED" });
    const afterTerminal = await persistence.updateExecution("tenant-a", "exec-001", {
      status: "PROCESSING",
    });

    expect(backwards.status).toBe("REJECTED");
    expect(backwards.errors).toEqual([
      "invalid execution status transition PROCESSING -> RECEIVED",
    ]);
    expect(afterTerminal.status).toBe("REJECTED");
  });

  it("retrieves executions and lists them deterministically", async () => {
    const { persistence } = persistenceFixture();
    await persistence.createExecution(executionInput());
    await persistence.createExecution(executionInput({
      execution_id: "exec-002",
      correlation_id: "corr-002",
      idempotency_key: "idem-002",
      request_hash: "hash-002",
    }));

    const fetched = await persistence.getExecution("tenant-a", "exec-002");
    const listed = await persistence.listExecutions({ tenant_id: "tenant-a" });

    expect(fetched?.execution_id).toBe("exec-002");
    expect(listed.map((record) => record.execution_id)).toEqual(["exec-001", "exec-002"]);
  });

  it("appends runtime events with monotonic sequence numbers and payload hashes", async () => {
    const { persistence } = persistenceFixture();
    await persistence.createExecution(executionInput());

    const first = await persistence.appendEvent({
      execution_id: "exec-001",
      tenant_id: "tenant-a",
      event_type: "execution.received",
      payload: { source: "gateway" },
    });
    const second = await persistence.appendEvent({
      execution_id: "exec-001",
      tenant_id: "tenant-a",
      event_type: "execution.validated",
      payload: { schema: "quantivis.decision-record.v1" },
    });

    expect(first.status).toBe("APPENDED");
    expect(first.event).toMatchObject({
      execution_id: "exec-001",
      correlation_id: "corr-001",
      tenant_id: "tenant-a",
      organization_id: "org-a",
      event_type: "execution.received",
      sequence_number: 1,
      timestamp: NOW,
      payload: { source: "gateway" },
      runtime_version: "ag-3e.1",
    });
    expect(first.event?.payload_hash).toBe(stableRuntimeHash({ source: "gateway" }));
    expect(second.event?.sequence_number).toBe(2);
    expect(second.event?.event_id).not.toBe(first.event?.event_id);
  });

  it("replays runtime events ordered by sequence_number", async () => {
    const { persistence } = persistenceFixture();
    await persistence.createExecution(executionInput());
    const eventTypes = [
      "execution.received",
      "execution.validated",
      "execution.queued",
      "execution.processing",
      "execution.completed",
    ];
    for (const eventType of eventTypes) {
      await persistence.appendEvent({
        execution_id: "exec-001",
        tenant_id: "tenant-a",
        event_type: eventType,
        payload: { event_type: eventType },
      });
    }

    const replay = await persistence.replayEvents("tenant-a", "exec-001");

    expect(replay.map((event) => event.sequence_number)).toEqual([1, 2, 3, 4, 5]);
    expect(replay.map((event) => event.event_type)).toEqual(eventTypes);
  });

  it("enforces append-only runtime event storage at the adapter boundary", async () => {
    const { persistence, adapter } = persistenceFixture();
    await persistence.createExecution(executionInput());
    const appended = await persistence.appendEvent({
      execution_id: "exec-001",
      tenant_id: "tenant-a",
      event_type: "execution.received",
      payload: {},
    });

    const replayedEvent = appended.event;
    expect(replayedEvent).not.toBeNull();
    expect(() => adapter.appendRuntimeEvent(replayedEvent as never)).toThrowError(
      /append-only violation/,
    );
  });

  it("persists and reloads queue snapshots for crash recovery", async () => {
    const { persistence, clock } = persistenceFixture();

    const saved = await persistence.saveQueueSnapshot({
      tenant_id: "tenant-a",
      messages: [queueMessage("queue-001")],
    });
    clock.current = LATER;
    await persistence.saveQueueSnapshot({
      tenant_id: "tenant-a",
      messages: [queueMessage("queue-001"), queueMessage("queue-002")],
    });

    const loaded = await persistence.loadQueueSnapshot("tenant-a");

    expect(saved.status).toBe("SAVED");
    expect(saved.snapshot?.snapshot_hash).toBe(stableRuntimeHash([queueMessage("queue-001")]));
    expect(loaded).toMatchObject({
      tenant_id: "tenant-a",
      captured_at: LATER,
      runtime_version: "ag-3e.1",
    });
    expect(loaded?.messages.map((message) => message.queue_message_id)).toEqual([
      "queue-001",
      "queue-002",
    ]);
  });

  it("maintains an immutable hash-linked audit chain", async () => {
    const { persistence, adapter } = persistenceFixture();
    await persistence.createExecution(executionInput());

    const first = await persistence.recordAudit(auditInput("execution.created"));
    const second = await persistence.recordAudit(auditInput("execution.updated"));
    const verification = await persistence.verifyAuditChain("tenant-a");

    expect(first.record?.previous_audit_hash).toBeNull();
    expect(second.record?.previous_audit_hash).toBe(first.record?.audit_hash);
    expect(verification).toEqual({ valid: true, length: 2, broken_at: null });

    const forkedRecord = first.record;
    expect(forkedRecord).not.toBeNull();
    expect(() => adapter.createAuditRecord(forkedRecord as never)).toThrowError(
      /audit chain violation/,
    );
  });

  it("isolates executions, events, audits, and snapshots per tenant", async () => {
    const { persistence } = persistenceFixture();
    await persistence.createExecution(executionInput());
    await persistence.createExecution(executionInput({
      execution_id: "exec-b-001",
      tenant_id: "tenant-b",
      organization_id: "org-b",
    }));
    await persistence.appendEvent({
      execution_id: "exec-001",
      tenant_id: "tenant-a",
      event_type: "execution.received",
      payload: {},
    });
    await persistence.recordAudit(auditInput("execution.created"));
    await persistence.saveQueueSnapshot({ tenant_id: "tenant-a", messages: [] });

    expect(await persistence.getExecution("tenant-b", "exec-001")).toBeNull();
    expect(await persistence.listExecutions({ tenant_id: "tenant-b" })).toHaveLength(1);
    expect(await persistence.replayEvents("tenant-b", "exec-001")).toEqual([]);
    expect(await persistence.listAuditRecords("tenant-b")).toEqual([]);
    expect(await persistence.loadQueueSnapshot("tenant-b")).toBeNull();
  });

  it("handles missing executions without throwing", async () => {
    const { persistence } = persistenceFixture();

    const fetched = await persistence.getExecution("tenant-a", "exec-missing");
    const updated = await persistence.updateExecution("tenant-a", "exec-missing", {
      status: "PROCESSING",
    });
    const appended = await persistence.appendEvent({
      execution_id: "exec-missing",
      tenant_id: "tenant-a",
      event_type: "execution.received",
      payload: {},
    });

    expect(fetched).toBeNull();
    expect(updated.status).toBe("REJECTED");
    expect(updated.errors).toEqual(["execution exec-missing not found for tenant tenant-a"]);
    expect(appended.status).toBe("REJECTED");
    expect(appended.event).toBeNull();
  });

  it("deletes expired executions and their events during cleanup", async () => {
    const { persistence, clock } = persistenceFixture();
    await persistence.createExecution(executionInput());
    await persistence.createExecution(executionInput({
      execution_id: "exec-002",
      correlation_id: "corr-002",
      idempotency_key: "idem-002",
      request_hash: "hash-002",
    }));
    await persistence.appendEvent({
      execution_id: "exec-001",
      tenant_id: "tenant-a",
      event_type: "execution.received",
      payload: {},
    });
    clock.current = LATER;
    await persistence.updateExecution("tenant-a", "exec-001", { status: "EXPIRED" });

    const purged = await persistence.purgeExpiredExecutions(LATER);

    expect(purged).toEqual({ deleted_count: 1 });
    expect(await persistence.getExecution("tenant-a", "exec-001")).toBeNull();
    expect(await persistence.replayEvents("tenant-a", "exec-001")).toEqual([]);
    expect(await persistence.getExecution("tenant-a", "exec-002")).not.toBeNull();
  });

  it("deletes terminal executions only after the retention window", async () => {
    const { persistence } = persistenceFixture();
    await persistence.createExecution(executionInput());
    await persistence.updateExecution("tenant-a", "exec-001", {
      status: "COMPLETED",
      now: LATER,
    });

    const beforeRetention = await persistence.purgeExpiredExecutions(LATER);
    const afterRetention = await persistence.purgeExpiredExecutions(AFTER_RETENTION);

    expect(beforeRetention.deleted_count).toBe(0);
    expect(afterRetention.deleted_count).toBe(1);
  });

  it("reports adapter failures as FAILED results instead of throwing", async () => {
    const persistence = createRuntimePersistence({
      adapter: failingAdapter(),
      now: () => NOW,
    });

    const created = await persistence.createExecution(executionInput());
    const appended = await persistence.appendEvent({
      execution_id: "exec-001",
      tenant_id: "tenant-a",
      event_type: "execution.received",
      payload: {},
    });
    const audited = await persistence.recordAudit(auditInput("execution.created"));
    const snapshot = await persistence.saveQueueSnapshot({ tenant_id: "tenant-a", messages: [] });

    expect(created).toEqual({
      status: "FAILED",
      execution: null,
      errors: ["persistence backend unavailable"],
    });
    expect(appended.status).toBe("FAILED");
    expect(audited.status).toBe("FAILED");
    expect(snapshot.status).toBe("FAILED");
  });

  it("scaffolded backends compile but throw NotImplementedError", () => {
    const supabase = new SupabaseRuntimePersistence({ project_url: "https://example.supabase.co" });
    const postgres = new PostgresRuntimePersistence({ connection_reference: "env:QV_RUNTIME_DB" });

    expect(() => supabase.getExecution("tenant-a", "exec-001")).toThrowError(NotImplementedError);
    expect(() => postgres.deleteExpiredExecutions(NOW, 1000)).toThrowError(NotImplementedError);
    expect(supabase.available()).toBe(false);
    expect(postgres.available()).toBe(false);
  });

  it("computes deterministic execution hashes independent of key order", async () => {
    const { persistence: first } = persistenceFixture();
    const { persistence: second } = persistenceFixture();

    const a = await first.createExecution(executionInput());
    const b = await second.createExecution(executionInput());
    const c = await second.updateExecution("tenant-a", "exec-001", {
      status: "RECEIVED",
      now: NOW,
    });

    expect(a.execution?.execution_hash).toBe(b.execution?.execution_hash);
    expect(c.execution?.execution_hash).not.toBe(a.execution?.execution_hash);

    const record = a.execution;
    expect(record).not.toBeNull();
    const { execution_hash: _hash, ...content } = record as ExecutionRecord;
    expect(computeExecutionHash(content)).toBe(record?.execution_hash);
    expect(stableRuntimeHash({ left: 1, right: 2 })).toBe(stableRuntimeHash({ right: 2, left: 1 }));
  });
});

function persistenceFixture(): {
  persistence: RuntimePersistence;
  adapter: MemoryRuntimePersistence;
  clock: { current: string };
} {
  const clock = { current: NOW };
  const adapter = new MemoryRuntimePersistence();
  const persistence = createRuntimePersistence({
    adapter,
    now: () => clock.current,
  });
  return { persistence, adapter, clock };
}

function executionInput(overrides: Partial<ExecutionCreateInput> = {}): ExecutionCreateInput {
  return {
    execution_id: "exec-001",
    correlation_id: "corr-001",
    request_hash: "hash-001",
    idempotency_key: "idem-001",
    tenant_id: "tenant-a",
    organization_id: "org-a",
    metadata: { channel: "runtime" },
    ...overrides,
  };
}

function auditInput(action: string) {
  return {
    execution_id: "exec-001",
    tenant_id: "tenant-a",
    organization_id: "org-a",
    actor: "runtime-service",
    action,
    resource_type: "execution",
    resource_id: "exec-001",
    metadata: { action },
  };
}

function queueMessage(queueMessageId: string): RuntimeQueueMessage {
  return {
    queue_message_id: queueMessageId,
    correlation_id: "corr-001",
    idempotency_key: "idem-001",
    request_hash: "hash-001",
    tenant_id: "tenant-a",
    organization_id: "org-a",
    payload_reference: `payload://runtime/${queueMessageId}`,
    created_at: NOW,
    available_at: NOW,
    attempt_count: 0,
    status: "QUEUED",
    priority: 0,
    expires_at: "2026-07-09T11:00:00.000Z",
    retry_history: [],
    failure_reason: null,
    dead_letter_reason: null,
    acked_at: null,
    completion_reason: null,
  };
}

function failingAdapter(): RuntimePersistenceAdapter {
  const fail = (): never => {
    throw new Error("persistence backend unavailable");
  };
  return {
    createExecution: fail,
    updateExecution: fail,
    getExecution: fail,
    listExecutions: fail,
    appendRuntimeEvent: fail,
    listRuntimeEvents: fail,
    createAuditRecord: fail,
    listAuditRecords: fail,
    saveQueueSnapshot: fail,
    loadQueueSnapshot: fail,
    deleteExpiredExecutions: fail,
    available: () => false,
  };
}
