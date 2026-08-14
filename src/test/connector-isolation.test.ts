import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deadLetter,
  recordFailure,
  recordSuccess,
  shouldAllow,
  type CircuitState,
} from "../../supabase/functions/_shared/connector-isolation";

const baseState = (overrides: Partial<CircuitState> = {}): CircuitState => ({
  state: "closed",
  consecutive_failures: 0,
  failure_threshold: 3,
  retry_budget_per_hour: 5,
  retries_used_window: 0,
  window_started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  next_probe_at: null,
  last_error: null,
  ...overrides,
});

type FakeOptions = {
  state?: CircuitState | null;
  failureRead?: Record<string, unknown> | null;
  readError?: unknown;
  writeError?: unknown;
  createState?: CircuitState | null;
  createError?: unknown;
};

function makeWriteBuilder(error: unknown) {
  const promise = Promise.resolve({ error });
  const builder = Object.assign(promise, { eq: vi.fn() });
  builder.eq.mockReturnValue(builder);
  return builder;
}

function makeClient({
  state = baseState(),
  failureRead = null,
  readError = null,
  writeError = null,
  createState = baseState(),
  createError = null,
}: FakeOptions = {}) {
  const maybeSingle = vi.fn(async () => ({ data: state, error: readError }));
  const single = vi.fn(async () => ({
    data:
      failureRead ??
      (state
        ? {
            consecutive_failures: state.consecutive_failures,
            failure_threshold: state.failure_threshold,
            retries_used_window: state.retries_used_window,
          }
        : null),
    error: readError,
  }));
  const selectBuilder = {
    eq: vi.fn(),
    maybeSingle,
    single,
  };
  selectBuilder.eq.mockReturnValue(selectBuilder);

  const createdSingle = vi.fn(async () => ({ data: createState, error: createError }));
  const insertPromise = Object.assign(Promise.resolve({ error: writeError }), {
    select: vi.fn(() => ({ single: createdSingle })),
  });

  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const update = vi.fn((values: Record<string, unknown>) => {
    updates.push(values);
    return makeWriteBuilder(writeError);
  });
  const insert = vi.fn((values: Record<string, unknown>) => {
    inserts.push(values);
    return insertPromise;
  });
  const select = vi.fn(() => selectBuilder);
  const from = vi.fn(() => ({ select, update, insert }));

  return {
    client: { from },
    from,
    selectBuilder,
    maybeSingle,
    single,
    update,
    insert,
    updates,
    inserts,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("connector circuit isolation", () => {
  it("allows a healthy circuit and binds the state lookup to connector and organization", async () => {
    const fake = makeClient();

    const result = await shouldAllow(fake.client, "org-1", "connector-1");

    expect(result.allow).toBe(true);
    expect(result.state.state).toBe("closed");
    expect(fake.selectBuilder.eq).toHaveBeenNthCalledWith(1, "connector_id", "connector-1");
    expect(fake.selectBuilder.eq).toHaveBeenNthCalledWith(2, "organization_id", "org-1");
  });

  it("blocks an open circuit until its probe time", async () => {
    const fake = makeClient({
      state: baseState({
        state: "open",
        next_probe_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      }),
    });

    await expect(shouldAllow(fake.client, "org-1", "connector-1")).resolves.toMatchObject({
      allow: false,
      reason: "circuit_open",
    });
    expect(fake.update).not.toHaveBeenCalled();
  });

  it("moves an open circuit to half-open when the probe time arrives", async () => {
    const fake = makeClient({
      state: baseState({
        state: "open",
        next_probe_at: new Date(Date.now() - 1_000).toISOString(),
      }),
    });

    await expect(shouldAllow(fake.client, "org-1", "connector-1")).resolves.toMatchObject({
      allow: true,
      state: { state: "half_open" },
    });
    expect(fake.updates).toContainEqual({ state: "half_open" });
  });

  it("blocks work when the retry budget is exhausted", async () => {
    const fake = makeClient({
      state: baseState({ retry_budget_per_hour: 3, retries_used_window: 3 }),
    });

    await expect(shouldAllow(fake.client, "org-1", "connector-1")).resolves.toMatchObject({
      allow: false,
      reason: "retry_budget_exhausted",
    });
  });

  it("trips at the configured failure threshold and increments the retry window", async () => {
    const fake = makeClient({
      failureRead: {
        consecutive_failures: 2,
        failure_threshold: 3,
        retries_used_window: 1,
      },
    });

    await expect(recordFailure(fake.client, "connector-1", "gateway failed")).resolves.toEqual({
      tripped: true,
    });
    expect(fake.updates[0]).toMatchObject({
      consecutive_failures: 3,
      state: "open",
      last_error: "gateway failed",
      retries_used_window: 2,
    });
    expect(typeof fake.updates[0]?.next_probe_at).toBe("string");
  });

  it("resets a successful connector and surfaces failed state writes", async () => {
    const healthy = makeClient();
    await expect(recordSuccess(healthy.client, "connector-1")).resolves.toBeUndefined();
    expect(healthy.updates[0]).toMatchObject({ state: "closed", consecutive_failures: 0, last_error: null });

    const broken = makeClient({ writeError: { message: "database unavailable" } });
    await expect(recordSuccess(broken.client, "connector-1")).rejects.toThrow(
      "Unable to record connector success: database unavailable",
    );
  });

  it("surfaces dead-letter persistence failures instead of silently dropping them", async () => {
    const broken = makeClient({ writeError: { message: "DLQ unavailable" } });

    await expect(
      deadLetter(broken.client, {
        orgId: "org-1",
        connectorId: "connector-1",
        payload: { row: 1 },
        errorMessage: "bad row",
      }),
    ).rejects.toThrow("Unable to write connector dead letter: DLQ unavailable");
  });

  it("keeps the helper free of type-check suppression and explicit any", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/connector-isolation.ts"),
      "utf8",
    );
    expect(source).not.toContain("@ts-nocheck");
    expect(source).not.toMatch(/\bany\b/);
    expect(source).toContain('.eq("organization_id", orgId)');
  });
});
