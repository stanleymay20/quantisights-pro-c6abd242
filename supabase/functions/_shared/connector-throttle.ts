// @ts-nocheck
/**
 * Rate-limit intelligence for vendor APIs that throttle aggressively (HubSpot, Salesforce, ...).
 * Captures remaining_quota / reset_at / Retry-After and grows an adaptive backoff so a noisy
 * tenant cannot starve other tenants' connectors.
 *
 * Use:
 *   await preflightWait(svc, connectorId);                          // before each batch
 *   const res = await fetch(url, opts);
 *   await observeResponse(svc, { orgId, connectorId, vendor, res }); // after each call
 */

const MIN_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 30_000;

interface ThrottleRow {
  adaptive_backoff_ms: number;
  reset_at: string | null;
  remaining_quota: number | null;
  consecutive_throttle_events: number;
}

async function ensureRow(svc: any, orgId: string, connectorId: string, vendor: string): Promise<ThrottleRow> {
  const { data } = await svc
    .from("connector_throttle_state")
    .select("adaptive_backoff_ms,reset_at,remaining_quota,consecutive_throttle_events")
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (data) return data as ThrottleRow;
  const { data: created } = await svc
    .from("connector_throttle_state")
    .insert({ organization_id: orgId, connector_id: connectorId, vendor })
    .select("adaptive_backoff_ms,reset_at,remaining_quota,consecutive_throttle_events")
    .single();
  return created as ThrottleRow;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Block before issuing a request if the connector is currently throttled. */
export async function preflightWait(svc: any, orgId: string, connectorId: string, vendor: string): Promise<void> {
  const row = await ensureRow(svc, orgId, connectorId, vendor);
  const now = Date.now();
  // Honor reset window if vendor told us to wait
  if (row.reset_at) {
    const wait = new Date(row.reset_at).getTime() - now;
    if (wait > 0) await sleep(Math.min(wait, MAX_BACKOFF_MS));
  }
  if (row.adaptive_backoff_ms > 0) await sleep(row.adaptive_backoff_ms);
}

/**
 * Observe a fetch Response and update throttle state.
 * Recognizes HubSpot (X-HubSpot-RateLimit-*) and generic (Retry-After, X-RateLimit-*) headers.
 */
export async function observeResponse(svc: any, params: {
  orgId: string; connectorId: string; vendor: string; res: Response;
}): Promise<{ throttled: boolean; suggestedRetryMs: number }> {
  const h = params.res.headers;
  const status = params.res.status;

  const remaining =
    intOrNull(h.get("x-hubspot-ratelimit-remaining")) ??
    intOrNull(h.get("x-ratelimit-remaining")) ??
    intOrNull(h.get("ratelimit-remaining"));
  const daily =
    intOrNull(h.get("x-hubspot-ratelimit-daily-remaining"));
  const secondsToReset =
    intOrNull(h.get("x-hubspot-ratelimit-interval-milliseconds")) ??
    intOrNull(h.get("x-ratelimit-reset")) ??
    intOrNull(h.get("ratelimit-reset"));
  const retryAfter = intOrNull(h.get("retry-after"));

  const throttled = status === 429 || status === 503;
  let retryMs = 0;
  if (throttled) {
    retryMs = (retryAfter ? retryAfter * 1000 : 0) || Math.min(MAX_BACKOFF_MS, Math.max(MIN_BACKOFF_MS, 1000));
  }

  // Adaptive backoff: grow on throttle, decay on success
  const current = await ensureRow(svc, params.orgId, params.connectorId, params.vendor);
  let nextBackoff = current.adaptive_backoff_ms;
  let consecutive = current.consecutive_throttle_events;
  if (throttled) {
    consecutive += 1;
    nextBackoff = Math.min(MAX_BACKOFF_MS, Math.max(MIN_BACKOFF_MS, (nextBackoff || MIN_BACKOFF_MS) * 2));
  } else if (status < 400) {
    consecutive = 0;
    nextBackoff = Math.max(0, Math.floor(nextBackoff / 2));
  }

  const reset_at = secondsToReset
    ? new Date(Date.now() + (secondsToReset > 1000 ? secondsToReset : secondsToReset * 1000)).toISOString()
    : (throttled && retryMs ? new Date(Date.now() + retryMs).toISOString() : null);

  await svc.from("connector_throttle_state").update({
    remaining_quota: remaining,
    daily_remaining: daily,
    reset_at,
    last_status_code: status,
    last_retry_after_ms: retryMs || null,
    adaptive_backoff_ms: nextBackoff,
    consecutive_throttle_events: consecutive,
    last_throttled_at: throttled ? new Date().toISOString() : current.consecutive_throttle_events > 0 ? new Date().toISOString() : null,
    last_observed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("connector_id", params.connectorId);

  return { throttled, suggestedRetryMs: retryMs };
}

function intOrNull(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
