import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  observeResponse,
  parseResetHeaderMs,
  parseRetryAfterMs,
  preflightWait,
  type ThrottleRow,
} from "../../supabase/functions/_shared/connector-throttle";

const baseState = (overrides: Partial<ThrottleRow> = {}): ThrottleRow => ({
  adaptive_backoff_ms: 0,
  reset_at: null,
  remaining_quota: null,
  consecutive_throttle_events: 0,
  last_throttled_at: null,
  ...overrides,
});

type FakeOptions = {
  state?: ThrottleRow | null;
  readError?: unknown;
  writeError?: unknown;
  createState?: ThrottleRow | null;
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
  readError = null,
  writeError = null,
  createState = baseState(),
  createError = null,
}: FakeOptions = {}) {
  const maybeSingle = vi.fn(async () => ({ data: state, error: readError }));
  const selectBuilder = { eq: vi.fn(), maybeSingle };
  selectBuilder.eq.mockReturnValue(selectBuilder);

  const createdSingle = vi.fn(async () => ({ data: createState, error: createError }));
  const insert = vi.fn((_values: Record<string, unknown>) => ({
    select: vi.fn(() => ({ single: createdSingle })),
  }));

  const updates: Array<Record<string, unknown>> = [];
  const updateBuilders: ReturnType<typeof makeWriteBuilder>[] = [];
  const update = vi.fn((values: Record<string, unknown>) => {
    updates.push(values);
    const builder = makeWriteBuilder(writeError);
    updateBuilders.push(builder);
    return builder;
  });
  const select = vi.fn(() => selectBuilder);
  const from = vi.fn(() => ({ select, insert, update }));

  return {
    client: { from },
    from,
    selectBuilder,
    maybeSingle,
    insert,
    update,
    updates,
    updateBuilders,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("connector throttle timing and isolation", () => {
  it("parses Retry-After delay seconds and HTTP dates", () => {
    const now = Date.parse("2026-08-14T17:00:00.000Z");
    expect(parseRetryAfterMs("2", now)).toBe(2_000);
    expect(parseRetryAfterMs("Fri, 14 Aug 2026 17:00:10 GMT", now)).toBe(10_000);
    expect(parseRetryAfterMs("not-a-date", now)).toBeNull();
  });

  it("treats X-RateLimit-Reset epoch seconds as an absolute timestamp", () => {
    const now = Date.parse("2026-08-14T17:00:00.000Z");
    const resetEpochSeconds = Math.floor(now / 1000) + 60;
    expect(parseResetHeaderMs(String(resetEpochSeconds), now, true)).toBe(60_000);
    expect(parseResetHeaderMs("60", now, false)).toBe(60_000);
  });

  it("keeps a 1000ms HubSpot interval at one second, not 1000 seconds", async () => {
    const now = Date.parse("2026-08-14T17:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const fake = makeClient();
    const res = new Response(null, {
      status: 200,
      headers: { "x-hubspot-ratelimit-interval-milliseconds": "1000" },
    });

    await observeResponse(fake.client, {
      orgId: "org-1",
      connectorId: "connector-1",
      vendor: "hubspot",
      res,
    });

    expect(fake.updates[0]?.reset_at).toBe(new Date(now + 1_000).toISOString());
  });

  it("caps direct Retry-After advice while preserving the full reset window", async () => {
    const now = Date.parse("2026-08-14T17:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const fake = makeClient();
    const res = new Response(null, { status: 429, headers: { "retry-after": "120" } });

    await expect(
      observeResponse(fake.client, {
        orgId: "org-1",
        connectorId: "connector-1",
        vendor: "salesforce",
        res,
      }),
    ).resolves.toEqual({ throttled: true, suggestedRetryMs: 30_000 });

    expect(fake.updates[0]).toMatchObject({
      reset_at: new Date(now + 120_000).toISOString(),
      last_retry_after_ms: 30_000,
      adaptive_backoff_ms: 500,
      consecutive_throttle_events: 1,
    });
  });

  it("decays adaptive backoff on success and preserves the last throttle timestamp", async () => {
    const lastThrottledAt = "2026-08-14T16:55:00.000Z";
    const fake = makeClient({
      state: baseState({
        adaptive_backoff_ms: 4_000,
        consecutive_throttle_events: 3,
        last_throttled_at: lastThrottledAt,
      }),
    });

    await expect(
      observeResponse(fake.client, {
        orgId: "org-1",
        connectorId: "connector-1",
        vendor: "hubspot",
        res: new Response(null, { status: 200 }),
      }),
    ).resolves.toEqual({ throttled: false, suggestedRetryMs: 0 });

    expect(fake.updates[0]).toMatchObject({
      adaptive_backoff_ms: 2_000,
      consecutive_throttle_events: 0,
      last_throttled_at: lastThrottledAt,
    });
  });

  it("scopes throttle reads and writes to both connector and organization", async () => {
    const fake = makeClient();
    await observeResponse(fake.client, {
      orgId: "org-1",
      connectorId: "connector-1",
      vendor: "hubspot",
      res: new Response(null, { status: 200 }),
    });

    expect(fake.selectBuilder.eq).toHaveBeenNthCalledWith(1, "connector_id", "connector-1");
    expect(fake.selectBuilder.eq).toHaveBeenNthCalledWith(2, "organization_id", "org-1");
    const writeEq = fake.updateBuilders[0]?.eq;
    expect(writeEq).toHaveBeenNthCalledWith(1, "connector_id", "connector-1");
    expect(writeEq).toHaveBeenNthCalledWith(2, "organization_id", "org-1");
  });

  it("uses the longer reset/backoff pause once instead of sleeping both sequentially", async () => {
    const now = Date.parse("2026-08-14T17:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const fake = makeClient({
      state: baseState({
        adaptive_backoff_ms: 2_000,
        reset_at: new Date(now + 10_000).toISOString(),
      }),
    });

    const started = Date.now();
    const pending = preflightWait(fake.client, "org-1", "connector-1", "hubspot");
    await vi.runAllTimersAsync();
    await pending;
    expect(Date.now() - started).toBe(10_000);
  });

  it("surfaces throttle-state write failures instead of silently losing rate-limit state", async () => {
    const fake = makeClient({ writeError: { message: "throttle store unavailable" } });
    await expect(
      observeResponse(fake.client, {
        orgId: "org-1",
        connectorId: "connector-1",
        vendor: "hubspot",
        res: new Response(null, { status: 429 }),
      }),
    ).rejects.toThrow("Unable to update connector throttle state: throttle store unavailable");
  });

  it("keeps the helper free of type-check suppression and explicit any", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/connector-throttle.ts"),
      "utf8",
    );
    expect(source).not.toContain("@ts-nocheck");
    expect(source).not.toMatch(/\bany\b/);
    expect(source).toContain('.eq("organization_id", orgId)');
    expect(source).toContain('.eq("organization_id", params.orgId)');
  });
});
