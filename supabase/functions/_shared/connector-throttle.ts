/**
 * Rate-limit intelligence for vendor APIs that throttle aggressively (HubSpot, Salesforce, ...).
 * Captures remaining_quota / reset_at / Retry-After and grows an adaptive backoff so a noisy
 * tenant cannot starve other tenants' connectors.
 *
 * Use:
 *   await preflightWait(svc, orgId, connectorId, vendor);              // before each batch
 *   const res = await fetch(url, opts);
 *   await observeResponse(svc, { orgId, connectorId, vendor, res });   // after each call
 */

const MIN_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 30_000;
const EPOCH_SECONDS_FLOOR = 1_000_000_000;
const EPOCH_MILLISECONDS_FLOOR = 1_000_000_000_000;

export interface ThrottleRow {
  adaptive_backoff_ms: number;
  reset_at: string | null;
  remaining_quota: number | null;
  consecutive_throttle_events: number;
  last_throttled_at: string | null;
}

type DbResult = {
  data: unknown;
  error: unknown;
};

type DbWriteResult = {
  error: unknown;
};

type SelectFilterBuilder = {
  eq(column: string, value: string): SelectFilterBuilder;
  maybeSingle(): PromiseLike<DbResult>;
};

type SingleSelectBuilder = {
  single(): PromiseLike<DbResult>;
};

type InsertBuilder = {
  select(columns: string): SingleSelectBuilder;
};

type WriteFilterBuilder = PromiseLike<DbWriteResult> & {
  eq(column: string, value: string): WriteFilterBuilder;
};

type ThrottleTableClient = {
  select(columns: string): SelectFilterBuilder;
  insert(values: Record<string, unknown>): InsertBuilder;
  update(values: Record<string, unknown>): WriteFilterBuilder;
};

type ThrottleClient = {
  from(table: string): ThrottleTableClient;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asThrottleClient(value: unknown): ThrottleClient | null {
  if (!isRecord(value) || typeof value.from !== "function") return null;
  return value as ThrottleClient;
}

function requireClient(value: unknown): ThrottleClient {
  const client = asThrottleClient(value);
  if (!client) throw new Error("Invalid connector throttle client");
  return client;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return String(error);
}

function assertWriteSucceeded(error: unknown, operation: string): void {
  if (error) throw new Error(`${operation}: ${errorMessage(error)}`);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseThrottleRow(value: unknown): ThrottleRow | null {
  if (!isRecord(value)) return null;
  const adaptiveBackoff = finiteNumber(value.adaptive_backoff_ms);
  const remainingQuota = value.remaining_quota === null ? null : finiteNumber(value.remaining_quota);
  const consecutive = finiteNumber(value.consecutive_throttle_events);
  const resetAt = value.reset_at;
  const lastThrottledAt = value.last_throttled_at;

  if (
    adaptiveBackoff == null || adaptiveBackoff < 0 ||
    consecutive == null || consecutive < 0 ||
    (value.remaining_quota !== null && remainingQuota == null) ||
    (resetAt !== null && (typeof resetAt !== "string" || !Number.isFinite(Date.parse(resetAt)))) ||
    (lastThrottledAt !== null && (typeof lastThrottledAt !== "string" || !Number.isFinite(Date.parse(lastThrottledAt))))
  ) {
    return null;
  }

  return {
    adaptive_backoff_ms: adaptiveBackoff,
    reset_at: typeof resetAt === "string" ? resetAt : null,
    remaining_quota: remainingQuota,
    consecutive_throttle_events: consecutive,
    last_throttled_at: typeof lastThrottledAt === "string" ? lastThrottledAt : null,
  };
}

async function ensureRow(
  svc: ThrottleClient,
  orgId: string,
  connectorId: string,
  vendor: string,
): Promise<ThrottleRow> {
  const { data, error } = await svc
    .from("connector_throttle_state")
    .select("adaptive_backoff_ms,reset_at,remaining_quota,consecutive_throttle_events,last_throttled_at")
    .eq("connector_id", connectorId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`Unable to read connector throttle state: ${errorMessage(error)}`);
  const existing = parseThrottleRow(data);
  if (existing) return existing;
  if (data != null) throw new Error("Connector throttle state is malformed");

  const { data: created, error: createError } = await svc
    .from("connector_throttle_state")
    .insert({ organization_id: orgId, connector_id: connectorId, vendor })
    .select("adaptive_backoff_ms,reset_at,remaining_quota,consecutive_throttle_events,last_throttled_at")
    .single();

  if (createError) throw new Error(`Unable to create connector throttle state: ${errorMessage(createError)}`);
  const parsed = parseThrottleRow(created);
  if (!parsed) throw new Error("Created connector throttle state is malformed");
  return parsed;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const clampBackoff = (ms: number): number => Math.min(MAX_BACKOFF_MS, Math.max(0, Math.round(ms)));

/** Block before issuing a request if the connector is currently throttled. */
export async function preflightWait(
  svc: unknown,
  orgId: string,
  connectorId: string,
  vendor: string,
): Promise<void> {
  const client = requireClient(svc);
  const row = await ensureRow(client, orgId, connectorId, vendor);
  const resetWait = row.reset_at ? Math.max(0, new Date(row.reset_at).getTime() - Date.now()) : 0;
  // A reset window and adaptive backoff describe the same pre-request pause. Honor the longer
  // one instead of sleeping twice, and cap each attempt so long vendor windows remain responsive.
  const waitMs = clampBackoff(Math.max(resetWait, row.adaptive_backoff_ms));
  if (waitMs > 0) await sleep(waitMs);
}

/**
 * Observe a fetch Response and update throttle state.
 * Recognizes HubSpot (X-HubSpot-RateLimit-*) and generic (Retry-After, X-RateLimit-*) headers.
 */
export async function observeResponse(svc: unknown, params: {
  orgId: string;
  connectorId: string;
  vendor: string;
  res: Response;
}): Promise<{ throttled: boolean; suggestedRetryMs: number }> {
  const client = requireClient(svc);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const h = params.res.headers;
  const status = params.res.status;

  const remaining =
    numberOrNull(h.get("x-hubspot-ratelimit-remaining")) ??
    numberOrNull(h.get("x-ratelimit-remaining")) ??
    numberOrNull(h.get("ratelimit-remaining"));
  const daily = numberOrNull(h.get("x-hubspot-ratelimit-daily-remaining"));

  const retryAfterMs = parseRetryAfterMs(h.get("retry-after"), now);
  const hubspotIntervalMs = nonNegativeNumberOrNull(h.get("x-hubspot-ratelimit-interval-milliseconds"));
  const xRateLimitResetMs = parseResetHeaderMs(h.get("x-ratelimit-reset"), now, true);
  const rateLimitResetMs = parseResetHeaderMs(h.get("ratelimit-reset"), now, false);

  const throttled = status === 429 || status === 503;

  // Adaptive backoff: grow on throttle, decay on success.
  const current = await ensureRow(client, params.orgId, params.connectorId, params.vendor);
  let nextBackoff = current.adaptive_backoff_ms;
  let consecutive = current.consecutive_throttle_events;
  if (throttled) {
    consecutive += 1;
    nextBackoff = Math.min(
      MAX_BACKOFF_MS,
      Math.max(MIN_BACKOFF_MS, (nextBackoff || MIN_BACKOFF_MS) * 2),
    );
  } else if (status < 400) {
    consecutive = 0;
    nextBackoff = Math.max(0, Math.floor(nextBackoff / 2));
  }

  // Callers may sleep suggestedRetryMs directly. Keep that recommendation bounded even if a
  // vendor sends a very long Retry-After; reset_at preserves the full server-provided window.
  const retryMs = throttled
    ? clampBackoff(Math.max(MIN_BACKOFF_MS, retryAfterMs ?? 0, nextBackoff))
    : 0;

  const resetDelayMs = maxNullable(
    hubspotIntervalMs,
    xRateLimitResetMs,
    rateLimitResetMs,
    throttled ? retryAfterMs : null,
  );
  const resetAt = resetDelayMs != null && resetDelayMs > 0
    ? new Date(now + resetDelayMs).toISOString()
    : throttled && retryMs > 0
      ? new Date(now + retryMs).toISOString()
      : null;

  const { error } = await client
    .from("connector_throttle_state")
    .update({
      remaining_quota: remaining,
      daily_remaining: daily,
      reset_at: resetAt,
      last_status_code: status,
      last_retry_after_ms: retryMs || null,
      adaptive_backoff_ms: nextBackoff,
      consecutive_throttle_events: consecutive,
      last_throttled_at: throttled ? nowIso : current.last_throttled_at,
      last_observed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("connector_id", params.connectorId)
    .eq("organization_id", params.orgId);
  assertWriteSucceeded(error, "Unable to update connector throttle state");

  return { throttled, suggestedRetryMs: retryMs };
}

function numberOrNull(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nonNegativeNumberOrNull(value: string | null): number | null {
  const n = numberOrNull(value);
  return n != null && n >= 0 ? n : null;
}

/** Retry-After supports either delay-seconds or an HTTP-date. */
export function parseRetryAfterMs(value: string | null, nowMs = Date.now()): number | null {
  const delaySeconds = nonNegativeNumberOrNull(value);
  if (delaySeconds != null) return delaySeconds * 1000;
  if (!value) return null;
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs) : null;
}

/**
 * Convert reset headers to a duration from now.
 * X-RateLimit-Reset commonly uses Unix epoch seconds; RateLimit-Reset commonly uses delta seconds.
 * Both epoch milliseconds and seconds are accepted defensively.
 */
export function parseResetHeaderMs(
  value: string | null,
  nowMs = Date.now(),
  preferEpoch = false,
): number | null {
  const n = nonNegativeNumberOrNull(value);
  if (n == null) return null;
  if (n >= EPOCH_MILLISECONDS_FLOOR) return Math.max(0, n - nowMs);
  if (preferEpoch && n >= EPOCH_SECONDS_FLOOR) return Math.max(0, n * 1000 - nowMs);
  return n * 1000;
}

function maxNullable(...values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null && Number.isFinite(value));
  return present.length > 0 ? Math.max(...present) : null;
}
