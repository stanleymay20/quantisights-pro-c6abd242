/**
 * Connector fault isolation: per-connector circuit breaker + retry budget + DLQ helper.
 * Prevents one failing connector from poisoning the orchestration queue or other connectors.
 *
 * States:
 *  - closed     : healthy, calls flow
 *  - open       : tripped, calls short-circuit until next_probe_at
 *  - half_open  : single probe allowed; success -> closed, failure -> open
 */

const HOUR_MS = 60 * 60 * 1000;

export interface CircuitState {
  state: "closed" | "open" | "half_open";
  consecutive_failures: number;
  failure_threshold: number;
  retry_budget_per_hour: number;
  retries_used_window: number;
  window_started_at: string;
  next_probe_at: string | null;
  last_error: string | null;
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
  single(): PromiseLike<DbResult>;
};

type SingleSelectBuilder = {
  single(): PromiseLike<DbResult>;
};

type InsertBuilder = PromiseLike<DbWriteResult> & {
  select(columns: string): SingleSelectBuilder;
};

type WriteFilterBuilder = PromiseLike<DbWriteResult> & {
  eq(column: string, value: string): WriteFilterBuilder;
};

type CircuitTableClient = {
  select(columns: string): SelectFilterBuilder;
  insert(values: Record<string, unknown>): InsertBuilder;
  update(values: Record<string, unknown>): WriteFilterBuilder;
};

type CircuitClient = {
  from(table: string): CircuitTableClient;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asCircuitClient(value: unknown): CircuitClient | null {
  if (!isRecord(value) || typeof value.from !== "function") return null;
  return value as CircuitClient;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return String(error);
}

function assertWriteSucceeded(error: unknown, operation: string): void {
  if (error) throw new Error(`${operation}: ${errorMessage(error)}`);
}

function finiteNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseCircuitState(value: unknown): CircuitState | null {
  if (!isRecord(value)) return null;
  const state = value.state;
  const consecutiveFailures = finiteNumber(value, "consecutive_failures");
  const failureThreshold = finiteNumber(value, "failure_threshold");
  const retryBudget = finiteNumber(value, "retry_budget_per_hour");
  const retriesUsed = finiteNumber(value, "retries_used_window");
  const windowStartedAt = value.window_started_at;
  const nextProbeAt = value.next_probe_at;
  const lastError = value.last_error;

  if (state !== "closed" && state !== "open" && state !== "half_open") return null;
  if (
    consecutiveFailures == null ||
    failureThreshold == null ||
    retryBudget == null ||
    retriesUsed == null ||
    typeof windowStartedAt !== "string" ||
    !Number.isFinite(Date.parse(windowStartedAt)) ||
    (nextProbeAt !== null && typeof nextProbeAt !== "string") ||
    (typeof nextProbeAt === "string" && !Number.isFinite(Date.parse(nextProbeAt))) ||
    (lastError !== null && typeof lastError !== "string")
  ) {
    return null;
  }

  return {
    state,
    consecutive_failures: consecutiveFailures,
    failure_threshold: failureThreshold,
    retry_budget_per_hour: retryBudget,
    retries_used_window: retriesUsed,
    window_started_at: windowStartedAt,
    next_probe_at: typeof nextProbeAt === "string" ? nextProbeAt : null,
    last_error: typeof lastError === "string" ? lastError : null,
  };
}

function requireClient(svc: unknown): CircuitClient {
  const client = asCircuitClient(svc);
  if (!client) throw new Error("Invalid connector circuit client");
  return client;
}

async function ensureRow(svc: CircuitClient, orgId: string, connectorId: string): Promise<CircuitState> {
  const { data, error } = await svc
    .from("connector_circuit_state")
    .select("*")
    .eq("connector_id", connectorId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`Unable to read connector circuit state: ${errorMessage(error)}`);

  const existing = parseCircuitState(data);
  if (existing) return existing;
  if (data != null) throw new Error("Connector circuit state is malformed");

  const { data: created, error: createError } = await svc
    .from("connector_circuit_state")
    .insert({ organization_id: orgId, connector_id: connectorId })
    .select("*")
    .single();
  if (createError) {
    throw new Error(`Unable to create connector circuit state: ${errorMessage(createError)}`);
  }

  const parsed = parseCircuitState(created);
  if (!parsed) throw new Error("Created connector circuit state is malformed");
  return parsed;
}

export async function shouldAllow(
  svc: unknown,
  orgId: string,
  connectorId: string,
): Promise<{ allow: boolean; reason?: string; state: CircuitState }> {
  const client = requireClient(svc);
  const s = await ensureRow(client, orgId, connectorId);
  const now = Date.now();

  // Reset hourly retry window
  if (now - new Date(s.window_started_at).getTime() > HOUR_MS) {
    const { error } = await client.from("connector_circuit_state").update({
      retries_used_window: 0,
      window_started_at: new Date(now).toISOString(),
    }).eq("connector_id", connectorId);
    assertWriteSucceeded(error, "Unable to reset connector retry window");
    s.retries_used_window = 0;
  }

  if (s.retries_used_window >= s.retry_budget_per_hour) {
    return { allow: false, reason: "retry_budget_exhausted", state: s };
  }

  if (s.state === "open") {
    if (s.next_probe_at && new Date(s.next_probe_at).getTime() <= now) {
      const { error } = await client
        .from("connector_circuit_state")
        .update({ state: "half_open" })
        .eq("connector_id", connectorId);
      assertWriteSucceeded(error, "Unable to move connector circuit to half-open");
      return { allow: true, state: { ...s, state: "half_open" } };
    }
    return { allow: false, reason: "circuit_open", state: s };
  }

  return { allow: true, state: s };
}

export async function recordSuccess(svc: unknown, connectorId: string): Promise<void> {
  const client = requireClient(svc);
  const { error } = await client.from("connector_circuit_state").update({
    state: "closed",
    consecutive_failures: 0,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("connector_id", connectorId);
  assertWriteSucceeded(error, "Unable to record connector success");
}

export async function recordFailure(
  svc: unknown,
  connectorId: string,
  failureMessage: string,
): Promise<{ tripped: boolean }> {
  const client = requireClient(svc);
  const { data: currentData, error: readError } = await client
    .from("connector_circuit_state")
    .select("consecutive_failures, failure_threshold, retries_used_window")
    .eq("connector_id", connectorId)
    .single();
  if (readError) {
    throw new Error(`Unable to read connector failure state: ${errorMessage(readError)}`);
  }
  if (!isRecord(currentData)) throw new Error("Connector failure state is missing");

  const currentFailures = finiteNumber(currentData, "consecutive_failures") ?? 0;
  const threshold = finiteNumber(currentData, "failure_threshold") ?? 5;
  const retriesUsed = finiteNumber(currentData, "retries_used_window") ?? 0;
  const next = currentFailures + 1;
  const tripped = next >= threshold;
  const nextProbe = tripped
    ? new Date(
        Date.now() +
          Math.min(30 * 60_000, 60_000 * Math.pow(2, Math.min(next - threshold, 5))),
      )
    : null;

  const { error: writeError } = await client.from("connector_circuit_state").update({
    consecutive_failures: next,
    state: tripped ? "open" : "closed",
    opened_at: tripped ? new Date().toISOString() : null,
    next_probe_at: nextProbe?.toISOString() ?? null,
    last_error: failureMessage.slice(0, 500),
    retries_used_window: retriesUsed + 1,
    updated_at: new Date().toISOString(),
  }).eq("connector_id", connectorId);
  assertWriteSucceeded(writeError, "Unable to record connector failure");
  return { tripped };
}

export async function deadLetter(svc: unknown, params: {
  orgId: string;
  connectorId: string;
  streamKey?: string;
  syncRunId?: string;
  payload: unknown;
  errorMessage: string;
  errorClass?: string;
}): Promise<void> {
  const client = requireClient(svc);
  // Reuse existing connector_sync_run_errors table as DLQ
  const { error } = await client.from("connector_sync_run_errors").insert({
    organization_id: params.orgId,
    connector_id: params.connectorId,
    sync_run_id: params.syncRunId ?? null,
    error_kind: params.errorClass ?? "ingest_error",
    raw_payload: params.payload,
    error_message: params.errorMessage.slice(0, 2000),
    is_resolved: false,
  });
  assertWriteSucceeded(error, "Unable to write connector dead letter");
}
