/**
 * Phase 6A — Configurable Threshold Registry
 *
 * Resolves per-org governance thresholds (NOT statistical confidence caps).
 * Returns the supplied fallback when no override exists.
 *
 * Known threshold keys (non-exhaustive):
 *   - aicis.risk_threshold        (default 0.60)
 *   - aicis.urgency_hours         (default 72)
 *   - intervention.high_tier      (default 80)
 *   - intervention.medium_tier    (default 60)
 *   - intervention.low_tier       (default 35)
 *   - governance.confidence_floor (default 50)
 *   - governance.confidence_ceiling (default 90)
 */

const cache = new Map<string, { value: number; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function getThreshold(
  supabaseUrl: string,
  serviceKey: string,
  organizationId: string,
  thresholdKey: string,
  fallback: number,
): Promise<number> {
  const cacheKey = `${organizationId}:${thresholdKey}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/governance_thresholds?organization_id=eq.${organizationId}&threshold_key=eq.${encodeURIComponent(thresholdKey)}&effective_to=is.null&order=effective_from.desc&limit=1&select=threshold_value`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!resp.ok) {
      cache.set(cacheKey, { value: fallback, expiresAt: Date.now() + TTL_MS });
      return fallback;
    }
    const rows = await resp.json();
    const value = rows?.[0]?.threshold_value !== undefined ? Number(rows[0].threshold_value) : fallback;
    cache.set(cacheKey, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  } catch {
    return fallback;
  }
}

export function invalidateThresholdCache(orgId?: string) {
  if (orgId) {
    for (const k of cache.keys()) if (k.startsWith(`${orgId}:`)) cache.delete(k);
  } else {
    cache.clear();
  }
}
