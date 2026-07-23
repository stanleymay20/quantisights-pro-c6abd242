// @ts-nocheck
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

async function ensureRow(svc: any, orgId: string, connectorId: string): Promise<CircuitState> {
  const { data } = await svc
    .from("connector_circuit_state")
    .select("*")
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (data) return data as CircuitState;
  const { data: created } = await svc
    .from("connector_circuit_state")
    .insert({ organization_id: orgId, connector_id: connectorId })
    .select("*")
    .single();
  return created as CircuitState;
}

export async function shouldAllow(svc: any, orgId: string, connectorId: string): Promise<{ allow: boolean; reason?: string; state: CircuitState }> {
  const s = await ensureRow(svc, orgId, connectorId);
  const now = Date.now();

  // Reset hourly retry window
  if (now - new Date(s.window_started_at).getTime() > HOUR_MS) {
    await svc.from("connector_circuit_state").update({
      retries_used_window: 0,
      window_started_at: new Date(now).toISOString(),
    }).eq("connector_id", connectorId);
    s.retries_used_window = 0;
  }

  if (s.retries_used_window >= s.retry_budget_per_hour) {
    return { allow: false, reason: "retry_budget_exhausted", state: s };
  }

  if (s.state === "open") {
    if (s.next_probe_at && new Date(s.next_probe_at).getTime() <= now) {
      await svc.from("connector_circuit_state").update({ state: "half_open" }).eq("connector_id", connectorId);
      return { allow: true, state: { ...s, state: "half_open" } };
    }
    return { allow: false, reason: "circuit_open", state: s };
  }

  return { allow: true, state: s };
}

export async function recordSuccess(svc: any, connectorId: string): Promise<void> {
  await svc.from("connector_circuit_state").update({
    state: "closed",
    consecutive_failures: 0,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("connector_id", connectorId);
}

export async function recordFailure(svc: any, connectorId: string, errorMessage: string): Promise<{ tripped: boolean }> {
  const { data: cur } = await svc
    .from("connector_circuit_state")
    .select("consecutive_failures, failure_threshold, retries_used_window")
    .eq("connector_id", connectorId)
    .single();
  const next = (cur?.consecutive_failures ?? 0) + 1;
  const threshold = cur?.failure_threshold ?? 5;
  const tripped = next >= threshold;
  const nextProbe = tripped ? new Date(Date.now() + Math.min(30 * 60_000, 60_000 * Math.pow(2, Math.min(next - threshold, 5)))) : null;
  await svc.from("connector_circuit_state").update({
    consecutive_failures: next,
    state: tripped ? "open" : "closed",
    opened_at: tripped ? new Date().toISOString() : null,
    next_probe_at: nextProbe?.toISOString() ?? null,
    last_error: errorMessage.slice(0, 500),
    retries_used_window: (cur?.retries_used_window ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq("connector_id", connectorId);
  return { tripped };
}

export async function deadLetter(svc: any, params: {
  orgId: string;
  connectorId: string;
  streamKey?: string;
  syncRunId?: string;
  payload: unknown;
  errorMessage: string;
  errorClass?: string;
}): Promise<void> {
  // Reuse existing connector_sync_run_errors table as DLQ
  await svc.from("connector_sync_run_errors").insert({
    organization_id: params.orgId,
    connector_id: params.connectorId,
    sync_run_id: params.syncRunId ?? null,
    error_kind: params.errorClass ?? "ingest_error",
    raw_payload: params.payload,
    error_message: params.errorMessage.slice(0, 2000),
    is_resolved: false,
  });
}
