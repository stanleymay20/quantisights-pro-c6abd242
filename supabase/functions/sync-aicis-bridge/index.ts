// AICIS Bridge v2 — full surface sync with per-surface isolation, pagination,
// idempotent upserts, structured logging, and data-quality checks.
// Secrets (env-only): AICIS_BRIDGE_URL / AICIS_BRIDGE_API_KEY
// (falls back to AICIS_TEST_ENDPOINT_URL / AICIS_TEST_API_KEY for compatibility)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 10 data surfaces + /catalog (introspection) + /stats (counts)
const DATA_SURFACES = [
  "signals",
  "entities",
  "countries",
  "events",
  "predictions",
  "cross_border",
  "cross_domain",
  "recommendations",
  "outcomes",
  "entity_links",
] as const;

// Adaptive page size ladder. Start big; downshift on transient upstream failures.
// Bottom rung (10) added to survive AICIS /signals 30s statement timeout even on 2-day windows.
const PAGE_SIZE_LADDER = [500, 250, 100, 50, 25, 10] as const;
const DEFAULT_PAGE_SIZE = PAGE_SIZE_LADDER[0];

// Per-surface hard page cap per run (heavy surfaces get more pages, but bounded).
// signals now uses 2-day windows over 90 days → up to 45 windows, but cap at 30 per run.
const SURFACE_MAX_PAGES: Record<string, number> = {
  signals: 30,
  entities: 10,
  events: 20,
  countries: 5,
  predictions: 10,
  recommendations: 10,
  outcomes: 10,
  cross_border: 10,
  cross_domain: 10,
  entity_links: 10,
};
const DEFAULT_MAX_PAGES = 10;

// Circuit breaker: after N consecutive failed runs, skip the surface for this window.
// Cooldown is capped at 1 hour — never longer — so a stuck surface always self-heals
// within an hour and gets re-attempted by the next cron run.
const BREAKER_FAILURE_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour (max)

const STALE_HOURS = 24;
const EXPECTED_MIN_COUNTRIES = 211; // AICIS Bridge v2 country universe (UN + sovereign + dependencies)

type Surface = (typeof DATA_SURFACES)[number];

interface SurfaceResult {
  surface: string;
  status: "success" | "failed" | "partial" | "skipped";
  records_pulled: number;
  records_inserted: number;
  records_updated: number;
  records_unchanged: number;
  records_failed: number;
  pages_fetched: number;
  page_size_used: number;
  retries_used: number;
  duration_ms: number;
  resume_cursor: number | null;
  consecutive_failures: number;
  circuit_breaker_open: boolean;
  next_retry_at?: string | null;
  error?: string;
}

const log = (level: string, msg: string, ctx: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...ctx }));

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function pickExternalId(surface: string, rec: Record<string, any>): string {
  return String(
    rec.id ??
      rec[`${surface.replace(/s$/, "")}_id`] ??
      rec.signal_id ??
      rec.entity_id ??
      rec.event_id ??
      rec.prediction_id ??
      rec.recommendation_id ??
      rec.outcome_id ??
      rec.iso3 ??
      rec.code ??
      crypto.randomUUID(),
  );
}

function pickCountry(rec: Record<string, any>): string | null {
  const v = rec.country_iso3 ?? rec.iso3 ?? rec.country ?? null;
  return v ? String(v).toUpperCase().slice(0, 3) : null;
}
function pickDomain(rec: Record<string, any>): string | null {
  const v = rec.domain ?? rec.category ?? rec.sector ?? null;
  return v ? String(v) : null;
}

// Per-request timeout (ms) for the upstream bridge.
// AICIS /signals is known to occasionally hit 30s Postgres statement timeout.
// We give it a hair more headroom + retry, but still bound the total wait.
const FETCH_TIMEOUT_MS = 35_000;
// Retries on transient upstream failures (502/503/504/timeouts).
const MAX_FETCH_RETRIES = 3;
// Honor upstream `Retry-After` for 429s — but cap so a single surface can't stall the whole run.
const MAX_RETRY_AFTER_WAIT_MS = 45_000;

/** Parse retry-after delay (ms) from `Retry-After` header (seconds or HTTP-date) or "Retry after Nms" body text. */
function parseRetryAfterMs(headerVal: string | null, bodyMsg: string | null): number | null {
  if (headerVal) {
    const asInt = parseInt(headerVal, 10);
    if (!isNaN(asInt)) return asInt < 1000 ? asInt * 1000 : asInt;
    const t = Date.parse(headerVal);
    if (!isNaN(t)) return Math.max(0, t - Date.now());
  }
  if (bodyMsg) {
    const m = bodyMsg.match(/[Rr]etry after\s+(\d+)\s*ms/);
    if (m) return parseInt(m[1], 10);
    const s = bodyMsg.match(/[Rr]etry after\s+(\d+)\s*s(?:ec(?:onds?)?)?\b/);
    if (s) return parseInt(s[1], 10) * 1000;
  }
  return null;
}

async function bridgeFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
  params: Record<string, string | number> = {},
): Promise<{ ok: boolean; status: number; body: any; error?: string; retries?: number }> {
  const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  let lastError: string | undefined;
  let lastStatus = 0;
  let lastBody: any = null;

  for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        headers: {
          "x-api-key": apiKey,
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text };
      }
      if (res.ok) {
        return { ok: true, status: res.status, body, retries: attempt };
      }
      lastStatus = res.status;
      lastBody = body;
      lastError = `HTTP ${res.status}: ${text.slice(0, 200)}`;
      // Only retry transient upstream failures
      const transient = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504 || res.status === 500;
      // Also treat upstream "Rate limit exceeded" 200/4xx body as throttled
      const bodyMsg = typeof body === "object" && body && "error" in body ? String((body as any).error) : text;
      const isRateLimited = res.status === 429 || /rate limit/i.test(bodyMsg);
      if (!transient && !isRateLimited || attempt === MAX_FETCH_RETRIES) {
        if (!transient && !isRateLimited) {
          return { ok: false, status: res.status, body, error: lastError, retries: attempt };
        }
      }
      // Honor Retry-After if present (rate-limited)
      if (isRateLimited) {
        const wait = parseRetryAfterMs(res.headers.get("retry-after"), bodyMsg);
        if (wait !== null && wait > 0 && wait <= MAX_RETRY_AFTER_WAIT_MS && attempt < MAX_FETCH_RETRIES) {
          await new Promise((r) => setTimeout(r, wait + 250));
          continue;
        }
        if (wait !== null && wait > MAX_RETRY_AFTER_WAIT_MS) {
          // Refuse to block run beyond cap — surface as transient and let caller downshift/retry next run.
          return { ok: false, status: res.status, body, error: `Rate limited: Retry-After ${wait}ms exceeds cap`, retries: attempt };
        }
      }
      if (attempt === MAX_FETCH_RETRIES) {
        return { ok: false, status: res.status, body, error: lastError, retries: attempt };
      }
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      lastError = msg.includes("aborted") ? `Request timed out after ${FETCH_TIMEOUT_MS}ms` : msg;
      lastStatus = 0;
      if (attempt === MAX_FETCH_RETRIES) {
        return { ok: false, status: 0, body: null, error: lastError, retries: attempt };
      }
    }
    // Exponential backoff: 1s, 2s, 4s (+ small jitter)
    const backoff = Math.min(8000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 250);
    await new Promise((r) => setTimeout(r, backoff));
  }
  return { ok: false, status: lastStatus, body: lastBody, error: lastError, retries: MAX_FETCH_RETRIES };
}

function extractRecords(body: any): { items: any[]; total?: number } {
  if (!body) return { items: [] };
  if (Array.isArray(body)) return { items: body };
  if (Array.isArray(body.data)) return { items: body.data, total: body.total ?? body.count };
  if (Array.isArray(body.items)) return { items: body.items, total: body.total ?? body.count };
  if (Array.isArray(body.results)) return { items: body.results, total: body.total ?? body.count };
  return { items: [] };
}

async function syncSurface(
  supabase: any,
  orgId: string,
  surface: Surface,
  baseUrl: string,
  apiKey: string,
  triggeredBy: string | null,
  triggerType: string,
  catalogSchema: any,
  prevState: {
    metadata: Record<string, any>;
    consecutive_failures: number;
  },
): Promise<SurfaceResult> {
  const t0 = Date.now();

  // Resume cursor & last successful page size from prior run metadata.
  const resumeOffset = Number.isFinite(prevState.metadata?.resume_offset)
    ? Number(prevState.metadata.resume_offset)
    : 0;
  // Surfaces that historically time out on the upstream Postgres (statement_timeout)
  // start at a smaller page size to keep each round-trip well under 30s.
  // signals: pin to ladder floor (10) — upstream choked even on 25 with 7-day windows.
  const SLOW_SURFACE_START_SIZE: Record<string, number> = { signals: 10, events: 250 };
  const slowDefault = SLOW_SURFACE_START_SIZE[surface];
  const preferredSize = PAGE_SIZE_LADDER.includes(prevState.metadata?.last_page_size)
    ? Number(prevState.metadata.last_page_size)
    : (slowDefault ?? DEFAULT_PAGE_SIZE);
  let pageSizeIdx = PAGE_SIZE_LADDER.indexOf(preferredSize as any);
  if (pageSizeIdx < 0) pageSizeIdx = PAGE_SIZE_LADDER.indexOf(slowDefault as any);
  if (pageSizeIdx < 0) pageSizeIdx = 0;
  // For signals: force the floor even if a prior run cached a larger size.
  if (surface === "signals") pageSizeIdx = PAGE_SIZE_LADDER.length - 1;

  const maxPagesForSurface = SURFACE_MAX_PAGES[surface] ?? DEFAULT_MAX_PAGES;

  // Create run row
  const { data: runRow, error: runErr } = await supabase
    .from("aicis_sync_runs")
    .insert({
      organization_id: orgId,
      surface,
      status: "running",
      triggered_by: triggeredBy,
      trigger_type: triggerType,
      started_at: new Date().toISOString(),
      last_offset: resumeOffset,
      metadata: { resume_from: resumeOffset, page_size_start: PAGE_SIZE_LADDER[pageSizeIdx] },
    })
    .select("id")
    .single();
  if (runErr) {
    log("error", "run_insert_failed", { surface, err: runErr.message });
    return {
      surface,
      status: "failed",
      records_pulled: 0,
      records_inserted: 0,
      records_updated: 0,
      records_unchanged: 0,
      records_failed: 0,
      pages_fetched: 0,
      page_size_used: PAGE_SIZE_LADDER[pageSizeIdx],
      retries_used: 0,
      duration_ms: Date.now() - t0,
      resume_cursor: resumeOffset,
      consecutive_failures: prevState.consecutive_failures,
      circuit_breaker_open: false,
      error: runErr.message,
    };
  }
  const runId = runRow.id;

  let pulled = 0,
    inserted = 0,
    updated = 0,
    unchanged = 0,
    failed = 0,
    pages = 0,
    retriesUsed = 0;
  let offset = resumeOffset;
  let lastError: string | undefined;
  let partial = false;
  let totalAvailable: number | undefined;
  const allHashes: string[] = [];
  const seenIds = new Set<string>();
  let duplicateIds = 0;
  let missingCountry = 0;
  let missingDomain = 0;
  let exhausted = false; // true when upstream returned a short page (we caught up)

  // SIGNALS: upstream Postgres hits 30s statement_timeout on offset-pagination's full COUNT(*).
  // Switch to date-window slicing for the trailing 90 days in 2-day chunks (tightened from 7 to
  // shrink the upstream working set further). Same upsert/dedupe path.
  const useDateWindow = surface === "signals";
  const dateWindows: Array<{ since: string; until: string }> = [];
  if (useDateWindow) {
    const SLICE_DAYS = 2;
    const LOOKBACK_DAYS = 90;
    const now = new Date();
    for (let d = 0; d < LOOKBACK_DAYS; d += SLICE_DAYS) {
      const until = new Date(now.getTime() - d * 86400_000).toISOString().slice(0, 10);
      const since = new Date(now.getTime() - (d + SLICE_DAYS) * 86400_000).toISOString().slice(0, 10);
      dateWindows.push({ since, until });
    }
  }
  let windowIdx = 0;

  while (pages < maxPagesForSurface) {
    const currentPageSize = PAGE_SIZE_LADDER[pageSizeIdx];
    const params: Record<string, string | number> = useDateWindow
      ? { limit: currentPageSize, offset: 0, since: dateWindows[windowIdx].since, until: dateWindows[windowIdx].until }
      : { limit: currentPageSize, offset };
    const r = await bridgeFetch(baseUrl, apiKey, `/${surface}`, params);
    retriesUsed += r.retries ?? 0;

    if (!r.ok) {
      // Adaptive downshift on transient upstream pain (timeouts/500/503/504/429).
      const transient = r.status === 0 || r.status === 429 || r.status === 500 || r.status === 502 || r.status === 503 || r.status === 504;
      if (transient && pageSizeIdx < PAGE_SIZE_LADDER.length - 1) {
        const nextSize = PAGE_SIZE_LADDER[pageSizeIdx + 1];
        log("warn", "page_size_downshift", { surface, from: currentPageSize, to: nextSize, http_status: r.status, error: r.error });
        await supabase.from("aicis_sync_errors").insert({
          organization_id: orgId,
          run_id: runId,
          surface,
          error_code: "page_size_downshift",
          error_message: `Downshifting page_size ${currentPageSize} → ${nextSize}: ${r.error}`,
          http_status: r.status,
          context: { offset, pages, from: currentPageSize, to: nextSize },
        });
        pageSizeIdx++;
        continue; // retry same offset with smaller page
      }

      // Exhausted ladder or non-transient error.
      lastError = r.error;
      await supabase.from("aicis_sync_errors").insert({
        organization_id: orgId,
        run_id: runId,
        surface,
        error_code: "fetch_failed",
        error_message: r.error ?? "fetch failed",
        http_status: r.status,
        context: { offset, pages, page_size: currentPageSize },
      });
      await supabase.from("aicis_data_quality_checks").insert({
        organization_id: orgId,
        run_id: runId,
        surface,
        check_type: "pagination_failed",
        severity: "error",
        passed: false,
        count_affected: 1,
        details: { offset, http_status: r.status, page_size: currentPageSize },
      });
      partial = pulled > 0;
      break;
    }
    const { items, total } = extractRecords(r.body);
    if (typeof total === "number") totalAvailable = total;
    pages++;

    if (!items.length) {
      exhausted = true;
      break;
    }

    // Upsert items
    const rows = await Promise.all(
      items.map(async (rec: any) => {
        const ext = pickExternalId(surface, rec);
        if (seenIds.has(ext)) duplicateIds++;
        seenIds.add(ext);
        const country = pickCountry(rec);
        const domain = pickDomain(rec);
        if (!country && ["signals", "countries", "events", "predictions"].includes(surface))
          missingCountry++;
        if (!domain && ["signals", "predictions", "recommendations"].includes(surface))
          missingDomain++;
        const hash = await sha256(JSON.stringify(rec));
        allHashes.push(hash);
        return {
          organization_id: orgId,
          surface,
          external_id: ext,
          content_hash: hash,
          country_iso3: country,
          domain,
          payload: rec,
          source_run_id: runId,
        };
      }),
    );

    const { data: existing } = await supabase
      .from("aicis_ingested_records")
      .select("external_id, content_hash")
      .eq("organization_id", orgId)
      .eq("surface", surface)
      .in("external_id", rows.map((r) => r.external_id));
    const existingMap = new Map<string, string>(
      (existing ?? []).map((e: any) => [e.external_id, e.content_hash]),
    );

    let pageInserted = 0,
      pageUpdated = 0,
      pageUnchanged = 0,
      pageFailed = 0;

    const toWrite = rows.filter((row) => {
      const prev = existingMap.get(row.external_id);
      if (!prev) {
        pageInserted++;
        return true;
      }
      if (prev !== row.content_hash) {
        pageUpdated++;
        return true;
      }
      pageUnchanged++;
      return false;
    });

    if (toWrite.length > 0) {
      const { error: upErr } = await supabase
        .from("aicis_ingested_records")
        .upsert(toWrite, { onConflict: "organization_id,surface,external_id" });
      if (upErr) {
        pageInserted = 0;
        pageUpdated = 0;
        for (const row of toWrite) {
          const prev = existingMap.get(row.external_id);
          const isNew = !prev;
          const { error: singleErr } = await supabase
            .from("aicis_ingested_records")
            .upsert(row, { onConflict: "organization_id,surface,external_id" });
          if (singleErr) {
            pageFailed++;
            await supabase.from("aicis_sync_errors").insert({
              organization_id: orgId,
              run_id: runId,
              surface,
              error_code: "upsert_failed",
              error_message: singleErr.message.slice(0, 500),
              context: { external_id: row.external_id },
            });
          } else if (isNew) pageInserted++;
          else pageUpdated++;
        }
      }
    }
    inserted += pageInserted;
    updated += pageUpdated;
    unchanged += pageUnchanged;
    failed += pageFailed;
    pulled += items.length;

    if (useDateWindow) {
      // One page per date-window per run (windows are small enough). Advance to next window.
      windowIdx++;
      if (windowIdx >= dateWindows.length) {
        exhausted = true;
        break;
      }
      continue;
    }

    if (items.length < currentPageSize) {
      exhausted = true;
      break;
    }
    offset += items.length;
  }

  // Resume cursor: if we hit page cap or transient error mid-stream, persist offset to resume next run.
  // If exhausted (upstream returned everything), reset to 0 for full re-scan next time.
  const resumeCursor: number | null = exhausted ? 0 : offset;
  const finalPageSize = PAGE_SIZE_LADDER[pageSizeIdx];

  // Aggregate checksum
  const checksum = allHashes.length
    ? await sha256(allHashes.sort().join(""))
    : null;

  // Run-level data quality checks
  const qcInserts: any[] = [];
  if (pulled === 0) {
    qcInserts.push({
      organization_id: orgId,
      run_id: runId,
      surface,
      check_type: "empty_surface",
      severity: "warning",
      passed: false,
      count_affected: 0,
      details: {},
    });
  }
  if (missingCountry > 0) {
    qcInserts.push({
      organization_id: orgId,
      run_id: runId,
      surface,
      check_type: "missing_country",
      severity: "warning",
      passed: false,
      count_affected: missingCountry,
      details: { of: pulled },
    });
  }
  if (missingDomain > 0) {
    qcInserts.push({
      organization_id: orgId,
      run_id: runId,
      surface,
      check_type: "missing_domain",
      severity: "warning",
      passed: false,
      count_affected: missingDomain,
      details: { of: pulled },
    });
  }
  if (duplicateIds > 0) {
    qcInserts.push({
      organization_id: orgId,
      run_id: runId,
      surface,
      check_type: "duplicate_ids",
      severity: "warning",
      passed: false,
      count_affected: duplicateIds,
      details: {},
    });
  }
  // Country-universe completeness check (only for /countries surface)
  if (surface === "countries") {
    const distinctCountriesPulled = seenIds.size;
    if (distinctCountriesPulled < EXPECTED_MIN_COUNTRIES) {
      qcInserts.push({
        organization_id: orgId,
        run_id: runId,
        surface,
        check_type: "coverage_incomplete",
        severity: "error",
        passed: false,
        count_affected: EXPECTED_MIN_COUNTRIES - distinctCountriesPulled,
        details: {
          expected_min: EXPECTED_MIN_COUNTRIES,
          observed: distinctCountriesPulled,
          message: `AICIS country coverage below expected universe (${distinctCountriesPulled}/${EXPECTED_MIN_COUNTRIES})`,
        },
      });
    } else {
      qcInserts.push({
        organization_id: orgId,
        run_id: runId,
        surface,
        check_type: "coverage_complete",
        severity: "info",
        passed: true,
        count_affected: distinctCountriesPulled,
        details: { observed: distinctCountriesPulled, expected_min: EXPECTED_MIN_COUNTRIES },
      });
    }
  }
  // Schema drift: compare keys against catalog
  if (catalogSchema && catalogSchema[surface] && pulled > 0) {
    const expected: string[] = Array.isArray(catalogSchema[surface])
      ? catalogSchema[surface]
      : Object.keys(catalogSchema[surface] ?? {});
    if (expected.length) {
      const { data: sample } = await supabase
        .from("aicis_ingested_records")
        .select("payload")
        .eq("organization_id", orgId)
        .eq("surface", surface)
        .order("ingested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sample?.payload) {
        const actual = Object.keys(sample.payload);
        const missing = expected.filter((k) => !actual.includes(k));
        const extra = actual.filter((k) => !expected.includes(k));
        if (missing.length || extra.length) {
          qcInserts.push({
            organization_id: orgId,
            run_id: runId,
            surface,
            check_type: "schema_drift",
            severity: "warning",
            passed: false,
            count_affected: missing.length + extra.length,
            details: { missing, extra },
          });
        }
      }
    }
  }
  if (qcInserts.length) await supabase.from("aicis_data_quality_checks").insert(qcInserts);

  const status: SurfaceResult["status"] = lastError
    ? partial
      ? "partial"
      : "failed"
    : "success";
  const duration = Date.now() - t0;

  await supabase
    .from("aicis_sync_runs")
    .update({
      status,
      completed_at: new Date().toISOString(),
      duration_ms: duration,
      records_pulled: pulled,
      records_inserted: inserted,
      records_updated: updated,
      records_failed: failed,
      pages_fetched: pages,
      last_offset: offset,
      next_offset: resumeCursor,
      payload_checksum: checksum,
      error_message: lastError ?? null,
      metadata: {
        total_available: totalAvailable,
        duplicate_ids: duplicateIds,
        records_unchanged: unchanged,
        page_size_used: finalPageSize,
        retries_used: retriesUsed,
        resume_offset_next: resumeCursor,
        exhausted,
        max_pages_for_surface: maxPagesForSurface,
      },
    })
    .eq("id", runId);

  // Surface-level rolling status
  const { data: totalRow } = await supabase
    .from("aicis_ingested_records")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("surface", surface);
  const totalRecords = (totalRow as any)?.count ?? 0;

  const prevFailures = prevState.consecutive_failures ?? 0;
  const consecFailures = status === "failed" ? prevFailures + 1 : 0;

  // Circuit breaker: open after N consecutive failures, cooldown 1h.
  const breakerOpen = consecFailures >= BREAKER_FAILURE_THRESHOLD;
  const breakerUntil = breakerOpen
    ? new Date(Date.now() + BREAKER_COOLDOWN_MS).toISOString()
    : null;

  // Build schema fingerprint from latest sample
  let fingerprint: string | null = null;
  if (pulled > 0) {
    const { data: sample } = await supabase
      .from("aicis_ingested_records")
      .select("payload")
      .eq("organization_id", orgId)
      .eq("surface", surface)
      .order("ingested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sample?.payload) fingerprint = await sha256(Object.keys(sample.payload).sort().join("|"));
  }

  await supabase
    .from("aicis_sync_surface_status")
    .upsert(
      {
        organization_id: orgId,
        surface,
        last_run_id: runId,
        last_status: status,
        last_attempt_at: new Date().toISOString(),
        last_success_at: status === "success" ? new Date().toISOString() : undefined,
        last_error_at: lastError ? new Date().toISOString() : undefined,
        last_error_message: lastError ?? null,
        total_records: totalRecords,
        records_available: totalAvailable ?? null,
        consecutive_failures: consecFailures,
        schema_fingerprint: fingerprint,
        freshness_seconds: 0,
        circuit_breaker_until: breakerUntil,
        metadata: {
          ...(prevState.metadata ?? {}),
          last_page_size: finalPageSize,
          last_retries_used: retriesUsed,
          resume_offset: resumeCursor ?? 0,
          last_pages_fetched: pages,
          last_max_pages: maxPagesForSurface,
          last_records_unchanged: unchanged,
          last_run_duration_ms: duration,
          breaker_opened_at: breakerOpen ? new Date().toISOString() : (prevState.metadata?.breaker_opened_at ?? null),
        },
      },
      { onConflict: "organization_id,surface" },
    );

  log("info", "surface_synced", {
    surface,
    status,
    pulled,
    inserted,
    updated,
    unchanged,
    failed,
    pages,
    page_size_used: finalPageSize,
    retries_used: retriesUsed,
    duration_ms: duration,
    resume_cursor: resumeCursor,
    consecutive_failures: consecFailures,
    circuit_breaker_open: breakerOpen,
    next_retry_at: breakerUntil,
  });

  return {
    surface,
    status,
    records_pulled: pulled,
    records_inserted: inserted,
    records_updated: updated,
    records_unchanged: unchanged,
    records_failed: failed,
    pages_fetched: pages,
    page_size_used: finalPageSize,
    retries_used: retriesUsed,
    duration_ms: duration,
    resume_cursor: resumeCursor,
    consecutive_failures: consecFailures,
    circuit_breaker_open: breakerOpen,
    next_retry_at: breakerUntil,
    error: lastError,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BRIDGE_URL =
    Deno.env.get("AICIS_BRIDGE_URL") ?? Deno.env.get("AICIS_TEST_ENDPOINT_URL");
  const BRIDGE_KEY =
    Deno.env.get("AICIS_BRIDGE_API_KEY") ?? Deno.env.get("AICIS_TEST_API_KEY");

  if (!BRIDGE_URL || !BRIDGE_KEY) {
    return new Response(
      JSON.stringify({
        error: "AICIS bridge not configured (AICIS_BRIDGE_URL/AICIS_BRIDGE_API_KEY missing)",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const CRON_SECRET = Deno.env.get("INGEST_CRON_SECRET");
  const cronHeader = req.headers.get("x-cron-secret");

  // Parse body early so we can support cron-triggered, multi-org sweeps
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let user: { id: string } | null = null;
  let orgId: string | null = body.organization_id ?? null;
  const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

  if (!isCron) {
    // User-triggered: require valid JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    user = { id: userRes.user.id };
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    orgId = profile?.organization_id ?? null;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "no organization" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else if (!orgId) {
    return new Response(
      JSON.stringify({ error: "cron trigger requires organization_id in body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const triggerType = body.trigger_type ?? (isCron ? "cron" : "manual");
  const requestedSurfaces: Surface[] = Array.isArray(body.surfaces) && body.surfaces.length
    ? (body.surfaces as Surface[]).filter((s) => DATA_SURFACES.includes(s))
    : [...DATA_SURFACES];

  // For manual triggers (user-initiated), require admin/owner
  if (triggerType === "manual" && user) {
    const { data: member } = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    const role = member?.role;
    if (role !== "owner" && role !== "admin") {
      return new Response(
        JSON.stringify({ error: "forbidden: only owners/admins can trigger sync" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  log("info", "sync_started", {
    org_id: orgId,
    user_id: user?.id ?? null,
    is_cron: isCron,
    surfaces: requestedSurfaces.length,
  });

  // 1. Catalog (introspection — schema fingerprints)
  const catalogRes = await bridgeFetch(BRIDGE_URL, BRIDGE_KEY, "/catalog");
  let catalogSchema: any = null;
  if (catalogRes.ok) {
    catalogSchema = catalogRes.body?.schemas ?? catalogRes.body?.surfaces ?? catalogRes.body;
  } else {
    log("warn", "catalog_fetch_failed", { error: catalogRes.error });
  }

  // 2. Stats (optional — counts)
  const statsRes = await bridgeFetch(BRIDGE_URL, BRIDGE_KEY, "/stats");
  const stats = statsRes.ok ? statsRes.body : null;

  // 3. Pre-fetch surface state for circuit-breaker + cursor resume (single round-trip).
  const { data: prevStates } = await supabase
    .from("aicis_sync_surface_status")
    .select("surface, metadata, consecutive_failures, circuit_breaker_until")
    .eq("organization_id", orgId)
    .in("surface", requestedSurfaces);
  const stateMap = new Map<string, { metadata: Record<string, any>; consecutive_failures: number; circuit_breaker_until: string | null }>(
    (prevStates ?? []).map((s: any) => [s.surface, {
      metadata: s.metadata ?? {},
      consecutive_failures: s.consecutive_failures ?? 0,
      circuit_breaker_until: s.circuit_breaker_until ?? null,
    }]),
  );

  // 4. Sync each surface, isolated. Skip if circuit breaker is open AND still in the future.
  //    Stuck-row guard: rows with consecutive_failures > 0 AND circuit_breaker_until IS NULL
  //    are ALWAYS eligible for retry (never trapped). Cap any breaker open at 1h max so
  //    stale long-expiry rows still self-heal.
  const now = Date.now();
  const results: SurfaceResult[] = [];
  for (const surface of requestedSurfaces) {
    const prevState = stateMap.get(surface) ?? { metadata: {}, consecutive_failures: 0, circuit_breaker_until: null };
    const rawBreakerUntilMs = prevState.circuit_breaker_until ? Date.parse(prevState.circuit_breaker_until) : 0;
    // Cap effective breaker at 1h from now — older rows that somehow got a longer expiry are released.
    const effectiveBreakerUntilMs = Math.min(rawBreakerUntilMs, now + BREAKER_COOLDOWN_MS);
    const breakerOpen = effectiveBreakerUntilMs > now;
    const stuckButEligible = prevState.consecutive_failures > 0 && !prevState.circuit_breaker_until;

    if (breakerOpen) {
      log("warn", "surface_skipped_breaker_open", {
        surface,
        reason: "circuit_breaker_open",
        until: new Date(effectiveBreakerUntilMs).toISOString(),
        raw_until: prevState.circuit_breaker_until,
        consecutive_failures: prevState.consecutive_failures,
      });
      results.push({
        surface,
        status: "skipped",
        records_pulled: 0,
        records_inserted: 0,
        records_updated: 0,
        records_unchanged: 0,
        records_failed: 0,
        pages_fetched: 0,
        page_size_used: 0,
        retries_used: 0,
        duration_ms: 0,
        resume_cursor: prevState.metadata?.resume_offset ?? 0,
        consecutive_failures: prevState.consecutive_failures,
        circuit_breaker_open: true,
        next_retry_at: new Date(effectiveBreakerUntilMs).toISOString(),
        error: "circuit_breaker_open",
      });
      continue;
    }

    log("info", "surface_retry_eligible", {
      surface,
      reason: stuckButEligible
        ? "stuck_row_no_breaker_recovery"
        : prevState.consecutive_failures > 0
          ? "breaker_expired_retry"
          : "normal_run",
      consecutive_failures: prevState.consecutive_failures,
      prev_breaker_until: prevState.circuit_breaker_until,
    });
    try {
      const r = await syncSurface(
        supabase,
        orgId,
        surface,
        BRIDGE_URL,
        BRIDGE_KEY,
        user?.id ?? null,
        triggerType,
        catalogSchema,
        { metadata: prevState.metadata, consecutive_failures: prevState.consecutive_failures },
      );
      results.push(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log("error", "surface_crashed", { surface, err: msg });
      results.push({
        surface,
        status: "failed",
        records_pulled: 0,
        records_inserted: 0,
        records_updated: 0,
        records_unchanged: 0,
        records_failed: 0,
        pages_fetched: 0,
        page_size_used: 0,
        retries_used: 0,
        duration_ms: 0,
        resume_cursor: null,
        consecutive_failures: prevState.consecutive_failures + 1,
        circuit_breaker_open: false,
        error: msg,
      });
      await supabase.from("aicis_sync_errors").insert({
        organization_id: orgId,
        surface,
        error_code: "surface_crashed",
        error_message: msg,
      });
    }
  }

  const summary = {
    organization_id: orgId,
    surfaces_attempted: results.length,
    surfaces_succeeded: results.filter((r) => r.status === "success").length,
    surfaces_partial: results.filter((r) => r.status === "partial").length,
    surfaces_failed: results.filter((r) => r.status === "failed").length,
    surfaces_skipped: results.filter((r) => r.status === "skipped").length,
    total_pulled: results.reduce((s, r) => s + r.records_pulled, 0),
    total_inserted: results.reduce((s, r) => s + r.records_inserted, 0),
    total_updated: results.reduce((s, r) => s + r.records_updated, 0),
    total_unchanged: results.reduce((s, r) => s + r.records_unchanged, 0),
    catalog_ok: catalogRes.ok,
    stats_ok: statsRes.ok,
    stats,
    results,
  };

  // --- external_data_sources writeback -------------------------------------------------
  // Update the AICIS source row so downstream health/freshness dashboards reflect reality.
  // Rules:
  //  - last_refreshed_at + next_refresh_at: bump iff at least ONE surface succeeded or partial.
  //  - last_error: ONLY set when EVERY attempted surface failed (skipped doesn't count as failure).
  //  - Preserve partial-success: error cleared on any landing, even if other surfaces failed.
  try {
    const anyLanded = summary.surfaces_succeeded + summary.surfaces_partial > 0;
    const attempted = results.filter((r) => r.status !== "skipped");
    const allFailed = attempted.length > 0 && attempted.every((r) => r.status === "failed");
    const failedSurfaces = results.filter((r) => r.status === "failed").map((r) => r.surface);

    const { data: srcRow } = await supabase
      .from("external_data_sources")
      .select("id, refresh_interval_hours")
      .eq("organization_id", orgId)
      .eq("vendor_key", "aicis")
      .maybeSingle();

    if (srcRow?.id) {
      const intervalH = Number(srcRow.refresh_interval_hours) || 6;
      const nowIso = new Date().toISOString();
      const nextRefreshIso = new Date(Date.now() + intervalH * 3600 * 1000).toISOString();

      const patch: Record<string, unknown> = {};
      if (anyLanded) {
        patch.last_refreshed_at = nowIso;
        patch.next_refresh_at = nextRefreshIso;
        patch.last_error = null; // clear on any landing — preserves partial-success semantics
      }
      if (allFailed) {
        patch.last_error = `All ${attempted.length} attempted surfaces failed: ${failedSurfaces.join(", ")}`.slice(0, 500);
      }

      if (Object.keys(patch).length > 0) {
        await supabase.from("external_data_sources").update(patch).eq("id", srcRow.id);
        log("info", "source_writeback", {
          source_id: srcRow.id,
          organization_id: orgId,
          any_landed: anyLanded,
          all_failed: allFailed,
          patch_keys: Object.keys(patch),
          next_refresh_at: patch.next_refresh_at ?? null,
        });
      } else {
        log("info", "source_writeback_skipped", {
          source_id: srcRow.id,
          reason: "no_attempted_surfaces",
          summary: { succeeded: summary.surfaces_succeeded, failed: summary.surfaces_failed, skipped: summary.surfaces_skipped },
        });
      }
    } else {
      log("warn", "source_writeback_no_row", { organization_id: orgId });
    }
  } catch (e) {
    log("warn", "source_writeback_failed", { error: e instanceof Error ? e.message : String(e) });
  }
  // --- end writeback --------------------------------------------------------------------

  // Audit
  await supabase.from("audit_log").insert({
    organization_id: orgId,
    actor_id: user?.id ?? null,
    actor_type: isCron ? "system" : "user",
    action_type: "aicis_sync_triggered",
    resource_type: "aicis_bridge",
    resource_id: orgId.toString(),
    payload: {
      trigger_type: triggerType,
      ...summary,
      stale_threshold_hours: STALE_HOURS,
    },
  });

  // Staleness alert: any surface whose last_success_at is older than STALE_HOURS
  // (or has never succeeded) is recorded as a separate audit_log row so /system-health
  // and downstream alerting can fire. Cheap query — single round-trip.
  try {
    const staleCutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000).toISOString();
    const { data: stale } = await supabase
      .from("aicis_sync_surface_status")
      .select("surface,last_status,last_success_at,consecutive_failures,last_error_message")
      .eq("organization_id", orgId)
      .or(`last_success_at.is.null,last_success_at.lt.${staleCutoff}`);
    if (stale && stale.length > 0) {
      await supabase.from("audit_log").insert({
        organization_id: orgId,
        actor_type: "system",
        action_type: "aicis_surface_stale",
        resource_type: "aicis_bridge",
        resource_id: orgId.toString(),
        payload: {
          stale_threshold_hours: STALE_HOURS,
          stale_count: stale.length,
          surfaces: stale,
        },
      });
      log("warn", "stale_surfaces_detected", { stale_count: stale.length });
    }
  } catch (e) {
    log("warn", "staleness_check_failed", { error: e instanceof Error ? e.message : String(e) });
  }

  log("info", "sync_completed", summary);

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
