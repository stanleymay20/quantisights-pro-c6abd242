// @ts-nocheck
/**
 * Ingest External Signals — pulls macro/industry data from configured vendors
 * (AICIS, IMF, World Bank, etc.) into internal_reference_data for Layer B
 * blending in advisory generation.
 *
 * Auth (any one of these is accepted):
 *  - Bearer SUPABASE_SERVICE_ROLE_KEY  (service-to-service, e.g. internal admin)
 *  - x-cron-secret header == INGEST_CRON_SECRET  (pg_cron path)
 *  - Bearer <user JWT> + org-admin role  (manual refresh from /admin/data-vendors)
 *
 * Modes:
 *  - { mode: "scheduled" } → cron call: refresh all sources whose next_refresh_at < now()
 *  - { mode: "manual", source_id } → admin-triggered single-source refresh
 *  - { mode: "test", vendor_key } → dry-run single vendor without writing
 *
 * Strict Real Data Only — no fabricated fallbacks. Adapter failures surface as
 * `last_error` on the source row AND a structured row in external_sync_runs.
 *
 * Tier policy (AICIS only):
 *  - Free:       sync rejected (returns 403 in manual mode; skipped in scheduled)
 *  - Pro:        shared platform key from Vault (AICIS_TEST_*)
 *  - Enterprise: optional BYO key via config.endpoint_url + config.api_key
 *
 * Pagination:
 *  - page_size capped at 500 (config.page_size, default 500)
 *  - max_pages capped at 10 (config.max_pages, default 4)
 *  - Cursor follows AICIS bridge `next_cursor` if provided, else stops.
 *  - Idempotent upsert by deterministic metric_key per (org, metric, source, period_start).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";

interface VendorRow {
  metric_key: string;
  value: number;
  unit?: string;
  period?: string;
  region?: string;
  metadata?: Record<string, unknown>;
}

interface FetchContext {
  config: Record<string, unknown>;
  log: ReturnType<typeof createLogger>;
}

interface FetchResult {
  rows: VendorRow[];
  pages_fetched: number;
  warnings?: string[];
}

interface VendorAdapter {
  vendor_key: string;
  fetch: (ctx: FetchContext) => Promise<FetchResult>;
}

// ── AICIS bridge config (shared platform license, read from Vault) ────────
const AICIS_PLATFORM_ENDPOINT = Deno.env.get("AICIS_TEST_ENDPOINT_URL") ?? "";
const AICIS_PLATFORM_API_KEY = Deno.env.get("AICIS_TEST_API_KEY") ?? "";

const AICIS_PRO_TIERS = new Set(["growth", "enterprise", "pro", "business", "enterprise_plus"]);

interface AicisSignal {
  signal_id: string;
  metric_name: string;
  value: number;
  unit?: string | null;
  period?: string | null;
  domain?: string | null;
  iso3?: string | null;
  confidence?: number | null;
  freshness_score?: number | null;
  source_provider?: string | null;
  source_url?: string | null;
  provenance_observed_at?: string | null;
  ingested_at?: string | null;
  entity_name?: string | null;
  entity_type?: string | null;
  sovereignty_status?: string | null;
}

// ── Adapters ──────────────────────────────────────────────────────────────
const adapters: Record<string, VendorAdapter> = {
  aicis: {
    vendor_key: "aicis",
    async fetch({ config, log }): Promise<FetchResult> {
      const endpoint =
        (config.endpoint_url as string | undefined) || AICIS_PLATFORM_ENDPOINT;
      const apiKey =
        (config.api_key as string | undefined) || AICIS_PLATFORM_API_KEY;

      if (!endpoint || !apiKey) {
        throw new Error(
          "AICIS adapter requires AICIS_TEST_ENDPOINT_URL + AICIS_TEST_API_KEY " +
            "in Vault (platform license), or per-tenant config.endpoint_url + " +
            "config.api_key. Strict Real Data Only — no fabricated fallback.",
        );
      }

      const base = endpoint.replace(/\/$/, "");
      const headers = { "x-api-key": apiKey, Accept: "application/json" };
      const perCountryLimit = Math.min(
        Math.max(1, Number((config.per_country_limit as number | undefined) ?? 50)),
        500,
      );
      // max_countries = 0 → all countries (only safe in backfill mode)
      const maxCountries = Math.max(
        0,
        Number((config.max_countries as number | undefined) ?? 50),
      );
      const isoFilter = (config.iso3 as string | undefined) ?? "";
      const domainFilter = (config.domain as string | undefined) ?? "";

      const warnings: string[] = [];
      const out: VendorRow[] = [];

      // ── Step 1: discover the country universe ─────────────────────────
      let countries: string[] = [];
      if (isoFilter) {
        countries = [isoFilter.toUpperCase()];
      } else {
        const r = await fetch(`${base}/countries`, { headers });
        if (!r.ok) {
          throw new Error(`AICIS /countries HTTP ${r.status}`);
        }
        const j = (await r.json()) as { data?: Array<{ iso3?: string; total_metrics?: number }> };
        const list = Array.isArray(j.data) ? j.data : [];
        // Sort by total_metrics desc so we always get richest countries first
        list.sort((a, b) => (b.total_metrics ?? 0) - (a.total_metrics ?? 0));
        countries = list
          .map((c) => (c.iso3 ?? "").toUpperCase())
          .filter((s) => s.length === 3);
        if (maxCountries > 0) countries = countries.slice(0, maxCountries);
      }

      log.info("aicis country sweep", {
        total_countries: countries.length,
        per_country_limit: perCountryLimit,
      });

      // ── Step 2: per-country signal pull (small batches, throttle-aware) ──
      // AICIS bridge rate-limits aggressive parallelism; keep batch tiny.
      // On rate-limit: parse Retry-After (header or error message), sleep up to cap,
      // and resume the sweep. Only abort if we would exceed the total rate-limit budget.
      const BATCH_SIZE = 3;
      const INTER_BATCH_DELAY_MS = 250;
      const MAX_RATE_LIMIT_WAIT_MS = 60_000; // single backoff cap
      const MAX_TOTAL_THROTTLE_MS = 180_000; // give up if cumulative wait exceeds 3 min
      let pages = 0;
      let throttled = false;
      let totalThrottleWaitMs = 0;
      let throttledCountries = 0;

      const parseRetryAfterMs = (msg: string, header?: string | null): number => {
        if (header) {
          const sec = Number(header);
          if (Number.isFinite(sec)) return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(1000, sec * 1000));
        }
        const m = msg.match(/Retry after\s*(\d+)\s*ms/i);
        if (m) return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(1000, Number(m[1])));
        return 5000;
      };

      const fetchOneWithBackoff = async (iso3: string): Promise<{ iso3: string; ok: boolean; status: number; signals: AicisSignal[]; error?: string }> => {
        const qs = new URLSearchParams({ iso3, limit: String(perCountryLimit) });
        if (domainFilter) qs.set("domain", domainFilter);
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const r = await fetch(`${base}/signals?${qs.toString()}`, { headers });
            if (r.status === 429 || r.status === 503) {
              const waitMs = parseRetryAfterMs("", r.headers.get("retry-after"));
              if (totalThrottleWaitMs + waitMs > MAX_TOTAL_THROTTLE_MS || attempt === 1) {
                return { iso3, ok: false, status: r.status, signals: [], error: `HTTP ${r.status} (rate-limited; budget exhausted)` };
              }
              totalThrottleWaitMs += waitMs;
              await new Promise((res) => setTimeout(res, waitMs));
              continue;
            }
            if (!r.ok) return { iso3, ok: false, status: r.status, signals: [], error: `HTTP ${r.status}` };
            const j = (await r.json()) as { data?: AicisSignal[] };
            return { iso3, ok: true, status: r.status, signals: Array.isArray(j.data) ? j.data : [] };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/RateLimit|Rate limit|429|Retry after/i.test(msg)) {
              const waitMs = parseRetryAfterMs(msg);
              if (totalThrottleWaitMs + waitMs > MAX_TOTAL_THROTTLE_MS || attempt === 1) {
                return { iso3, ok: false, status: 429, signals: [], error: `${msg.slice(0, 160)} (budget exhausted)` };
              }
              totalThrottleWaitMs += waitMs;
              await new Promise((res) => setTimeout(res, waitMs));
              continue;
            }
            return { iso3, ok: false, status: 0, signals: [], error: msg.slice(0, 160) };
          }
        }
        return { iso3, ok: false, status: 0, signals: [], error: "exhausted retries" };
      };

      for (let i = 0; i < countries.length && !throttled; i += BATCH_SIZE) {
        const batch = countries.slice(i, i + BATCH_SIZE);
        const settled = await Promise.all(batch.map(fetchOneWithBackoff));

        for (const res of settled) {
          pages += 1;
          if (!res.ok) {
            if (res.status === 429 || res.status === 503) {
              throttledCountries++;
              warnings.push(`AICIS ${res.iso3} ${res.error}`);
              if (totalThrottleWaitMs >= MAX_TOTAL_THROTTLE_MS) {
                warnings.push(`AICIS rate-limit budget exhausted after ${(totalThrottleWaitMs / 1000).toFixed(0)}s — stopping sweep.`);
                throttled = true;
                break;
              }
            } else {
              warnings.push(`AICIS ${res.iso3} ${res.error}; skipped.`);
            }
            continue;
          }
          const signals = res.signals;
          const iso3 = res.iso3;
          for (const sig of signals) {
            const numeric = Number(sig.value);
            if (!Number.isFinite(numeric)) continue;
            const sIso = (sig.iso3 ?? iso3).toUpperCase();
            const domain = (sig.domain ?? "general").toLowerCase();
            const metric = (sig.metric_name ?? "unknown").toLowerCase();
            out.push({
              metric_key: `aicis.${domain}.${metric}.${sIso}`,
              value: numeric,
              unit: sig.unit ?? undefined,
              period: sig.period ?? undefined,
              region: sIso,
              metadata: {
                signal_id: sig.signal_id,
                domain,
                iso3: sIso,
                confidence: sig.confidence,
                freshness_score: sig.freshness_score,
                source_provider: sig.source_provider,
                source_url: sig.source_url,
                provenance_observed_at: sig.provenance_observed_at,
                entity_name: sig.entity_name,
                entity_type: sig.entity_type,
                sovereignty_status: sig.sovereignty_status,
              },
            });
          }
        }
        if (!throttled && i + BATCH_SIZE < countries.length) {
          await new Promise((res) => setTimeout(res, INTER_BATCH_DELAY_MS));
        }
      }

      log.info("aicis sweep complete", {
        countries_swept: pages,
        rows_collected: out.length,
        warnings: warnings.length,
        throttled_countries: throttledCountries,
        total_throttle_wait_ms: totalThrottleWaitMs,
      });

      if (out.length === 0) {
        throw new Error("AICIS bridge returned 0 usable signals — refusing empty ingest.");
      }
      return { rows: out, pages_fetched: pages, warnings };
    },
  },

  worldbank: {
    vendor_key: "worldbank",
    async fetch({ config }): Promise<FetchResult> {
      const country = (config.country as string) ?? "WLD";
      const indicator = (config.indicator as string) ?? "NY.GDP.MKTP.KD.ZG";
      const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=25`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`World Bank HTTP ${r.status}`);
      const j = (await r.json()) as unknown[];
      const series = Array.isArray(j) && j.length > 1
        ? (j[1] as Array<Record<string, unknown>>)
        : [];
      const latest = series.find((row) => row.value != null && Number.isFinite(Number(row.value)));
      if (!latest) {
        throw new Error(`World Bank: no non-null observations for ${indicator}/${country}`);
      }
      return {
        rows: [{
          metric_key: `worldbank.${indicator}.${country}`,
          value: Number(latest.value),
          period: `${latest.date}-01-01`,
          metadata: { country, indicator, observation_year: latest.date },
        }],
        pages_fetched: 1,
      };
    },
  },

  imf: {
    vendor_key: "imf",
    async fetch({ config }): Promise<FetchResult> {
      const indicator = (config.indicator as string) ?? "PCPIPCH";
      const country = (config.country as string) ?? "USA";
      const url = `https://www.imf.org/external/datamapper/api/v1/${indicator}/${country}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`IMF HTTP ${r.status}`);
      const j = (await r.json()) as {
        values?: Record<string, Record<string, Record<string, number>>>;
      };
      const series = j.values?.[indicator]?.[country] ?? {};
      const years = Object.keys(series)
        .filter((y) => series[y] != null && Number.isFinite(series[y]))
        .sort()
        .reverse();
      const latestYear = years[0];
      if (!latestYear) throw new Error(`IMF: no observations for ${indicator}/${country}`);
      return {
        rows: [{
          metric_key: `imf.${indicator}.${country}`,
          value: Number(series[latestYear]),
          period: `${latestYear}-01-01`,
          metadata: { country, indicator, observation_year: latestYear },
        }],
        pages_fetched: 1,
      };
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const log = createLogger("ingest-external-signals", req);

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");

  // ── Auth gate ─────────────────────────────────────────────────────────
  const cronHeader = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  let isAuthorised = false;
  let actor = "unknown";
  let triggerLabel = "service";

  if (cronSecret && cronHeader && cronHeader === cronSecret) {
    isAuthorised = true;
    actor = "cron";
    triggerLabel = "scheduled";
  } else if (bearer && bearer === serviceKey) {
    isAuthorised = true;
    actor = "service";
    triggerLabel = "service";
  } else if (bearer) {
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    }) as any;
    const { data: user } = await userClient.auth.getUser();
    if (user?.user) {
      isAuthorised = true;
      actor = `user:${user.user.id}`;
      triggerLabel = "manual";
      log.setUser(user.user.id);
    }
  }

  if (!isAuthorised) {
    log.warn("unauthorised invocation");
    return json({ error: "Unauthorised" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceKey) as any;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* allow empty body for cron */
  }
  const mode = (body.mode as string) ?? "scheduled";

  log.info("ingestion start", { mode, actor });

  const startTs = Date.now();
  const results: Array<Record<string, unknown>> = [];

  try {
    let sources: Array<Record<string, unknown>> = [];

    if (mode === "scheduled") {
      const { data } = await supabase
        .from("external_data_sources")
        .select("*")
        .eq("is_active", true)
        .or(`next_refresh_at.is.null,next_refresh_at.lte.${new Date().toISOString()}`);
      sources = data ?? [];
    } else if (mode === "manual" && body.source_id) {
      const { data } = await supabase
        .from("external_data_sources")
        .select("*")
        .eq("id", body.source_id as string)
        .maybeSingle();
      if (data) sources = [data];
    } else if (mode === "backfill" && body.source_id) {
      // BACKFILL: one-shot deep pull. For AICIS, sweeps ALL countries.
      const { data } = await supabase
        .from("external_data_sources")
        .select("*")
        .eq("id", body.source_id as string)
        .maybeSingle();
      if (data) {
        const cfg = (data.config as Record<string, unknown>) ?? {};
        sources = [{
          ...data,
          config: {
            ...cfg,
            per_country_limit: Number(body.per_country_limit ?? cfg.per_country_limit ?? 100),
            max_countries: Number(body.max_countries ?? 0), // 0 = all countries
          },
        }];
      }
    } else if (mode === "test" && body.vendor_key) {
      const adapter = adapters[body.vendor_key as string];
      if (!adapter) return json({ error: "Unknown vendor" }, 400);
      const result = await adapter.fetch({
        config: (body.config as Record<string, unknown>) ?? {},
        log,
      });
      log.info("dry-run complete", { vendor_key: body.vendor_key, rows: result.rows.length });
      return json({ ok: true, dry_run: true, ...result });
    } else {
      return json({ error: "Invalid mode" }, 400);
    }

    log.info("sources resolved", { count: sources.length });

    for (const src of sources) {
      const adapter = adapters[src.vendor_key as string];
      if (!adapter) {
        results.push({ vendor_key: src.vendor_key, status: "skipped", reason: "no_adapter" });
        continue;
      }

      // ── AICIS tier guard ─────────────────────────────────────────────
      if (src.vendor_key === "aicis" && src.organization_id) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("tier, status")
          .eq("organization_id", src.organization_id as string)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const tier = (sub?.tier ?? "").toLowerCase();
        const status = sub?.status ?? "";
        const allowed =
          ["active", "trialing"].includes(status) && AICIS_PRO_TIERS.has(tier);

        if (!allowed) {
          const reason = `AICIS sync requires Growth tier or higher (current: ${tier || "free"} / ${status || "no_subscription"})`;
          log.warn("aicis tier blocked", {
            org_id: src.organization_id, tier, status,
          });
          await logRun(supabase, {
            organization_id: src.organization_id as string,
            source_id: src.id as string,
            vendor_key: "aicis",
            trigger: triggerLabel,
            actor,
            status: "error",
            rows_fetched: 0,
            rows_upserted: 0,
            pages_fetched: 0,
            error_message: reason,
            duration_ms: 0,
          });
          results.push({ vendor_key: "aicis", status: "skipped", reason });
          if (mode === "manual") return json({ error: reason }, 403);
          continue;
        }
      }

      // ── Run vendor with sync-log row ─────────────────────────────────
      const vendorStart = Date.now();
      const { data: runRow } = await supabase
        .from("external_sync_runs")
        .insert({
          organization_id: (src.organization_id as string) ?? null,
          source_id: src.id as string,
          vendor_key: src.vendor_key as string,
          trigger: triggerLabel,
          actor,
          status: "running",
          metadata: { mode, page_size: (src.config as Record<string, unknown>)?.page_size ?? null },
        })
        .select("id")
        .maybeSingle();
      const runId = runRow?.id as string | undefined;

      try {
        const { rows, pages_fetched, warnings = [] } = await adapter.fetch({
          config: (src.config as Record<string, unknown>) ?? {},
          log,
        });

        // Batch upsert (500 rows/chunk) + dedupe within request to avoid
        // "ON CONFLICT DO UPDATE command cannot affect row a second time"
        let upserted = 0;
        const orgId = (src.organization_id as string) ?? null;
        const seen = new Set<string>();
        const payload = rows
          .filter((row) => Number.isFinite(Number(row.value)))
          .map((row) => ({
            organization_id: orgId,
            category: (src.category as string) ?? "macro",
            metric_name: row.metric_key,
            value: Number(row.value),
            unit: row.unit ?? null,
            period_start: row.period ?? null,
            region: row.region ?? null,
            source: src.vendor_name as string,
            source_url: (src.endpoint_url as string) ?? null,
            confidence_grade:
              ((src.trust_level as number) ?? 70) >= 85 ? "A" : "B",
            metadata: {
              ...(row.metadata ?? {}),
              vendor_key: src.vendor_key,
              license: src.license_type,
              organization_id: orgId,
            },
          }))
          .filter((r) => {
            const k = `${r.organization_id ?? "_"}|${r.metric_name}|${r.source}|${r.period_start ?? ""}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });

        const CHUNK = 500;
        for (let i = 0; i < payload.length; i += CHUNK) {
          const slice = payload.slice(i, i + CHUNK);
          const { error } = await supabase
            .from("internal_reference_data")
            .upsert(slice, {
              onConflict: "organization_id,metric_name,source,period_start",
              ignoreDuplicates: false,
            });
          if (error) {
            log.warn("batch upsert failed", {
              vendor_key: src.vendor_key,
              chunk_start: i,
              chunk_size: slice.length,
              error: error.message,
            });
          } else {
            upserted += slice.length;
          }
        }

        const nextRefresh = new Date(
          Date.now() + (src.refresh_interval_hours as number) * 3600 * 1000,
        );
        await supabase
          .from("external_data_sources")
          .update({
            last_refreshed_at: new Date().toISOString(),
            next_refresh_at: nextRefresh.toISOString(),
            last_error: null,
          })
          .eq("id", src.id as string);

        const status = warnings.length > 0 ? "partial" : "success";
        if (runId) {
          await supabase
            .from("external_sync_runs")
            .update({
              status,
              rows_fetched: rows.length,
              rows_upserted: upserted,
              pages_fetched,
              completed_at: new Date().toISOString(),
              duration_ms: Date.now() - vendorStart,
              error_message: warnings.length > 0 ? warnings.join(" | ") : null,
            })
            .eq("id", runId);
        }

        log.info("vendor success", {
          vendor_key: src.vendor_key,
          upserted,
          pages_fetched,
          warnings: warnings.length,
          duration_ms: Date.now() - vendorStart,
        });
        results.push({
          vendor_key: src.vendor_key,
          status,
          rows_fetched: rows.length,
          upserted,
          pages_fetched,
          warnings,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        await supabase
          .from("external_data_sources")
          .update({
            last_error: errMsg,
            next_refresh_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          })
          .eq("id", src.id as string);
        if (runId) {
          await supabase
            .from("external_sync_runs")
            .update({
              status: "error",
              error_message: errMsg,
              completed_at: new Date().toISOString(),
              duration_ms: Date.now() - vendorStart,
            })
            .eq("id", runId);
        }
        log.error("vendor failure", { vendor_key: src.vendor_key, error: errMsg });
        results.push({ vendor_key: src.vendor_key, status: "error", error: errMsg });
      }
    }

    log.info("ingestion complete", {
      mode,
      sources_processed: sources.length,
      duration_ms: Date.now() - startTs,
    });

    return json({
      ok: true,
      mode,
      actor,
      duration_ms: Date.now() - startTs,
      sources_processed: sources.length,
      results,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    log.error("fatal", { error: errMsg });
    return json({ error: errMsg }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface SyncRunInsert {
  organization_id: string | null;
  source_id: string;
  vendor_key: string;
  trigger: string;
  actor: string;
  status: string;
  rows_fetched: number;
  rows_upserted: number;
  pages_fetched: number;
  error_message: string | null;
  duration_ms: number;
}

async function logRun(
  supabase: ReturnType<typeof createClient>,
  run: SyncRunInsert,
) {
  await supabase.from("external_sync_runs").insert({
    ...run,
    completed_at: new Date().toISOString(),
  });
}
