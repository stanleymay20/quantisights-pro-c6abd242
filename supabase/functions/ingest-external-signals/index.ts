/**
 * Pull licensed external signals into internal_reference_data.
 *
 * System/cron callers may run scheduled, backfill and test modes.
 * Human callers may run only manual mode and must be an owner/admin of the
 * source organization. Strict real-data-only: fetched-but-not-persisted data
 * is a failed run and never advances source freshness.
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

type ServiceClient = ReturnType<typeof createClient>;
type SourceRow = Record<string, unknown>;

const AICIS_PLATFORM_ENDPOINT = Deno.env.get("AICIS_TEST_ENDPOINT_URL") ?? "";
const AICIS_PLATFORM_API_KEY = Deno.env.get("AICIS_TEST_API_KEY") ?? "";
const AICIS_PRO_TIERS = new Set(["growth", "enterprise", "pro", "business", "enterprise_plus"]);
const SYSTEM_MODES = new Set(["scheduled", "backfill", "test"]);

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

const adapters: Record<string, VendorAdapter> = {
  aicis: {
    vendor_key: "aicis",
    async fetch({ config, log }): Promise<FetchResult> {
      const endpoint = (config.endpoint_url as string | undefined) || AICIS_PLATFORM_ENDPOINT;
      const apiKey = (config.api_key as string | undefined) || AICIS_PLATFORM_API_KEY;
      if (!endpoint || !apiKey) {
        throw new Error("AICIS adapter configuration is unavailable; refusing fabricated fallback data.");
      }

      const base = endpoint.replace(/\/$/, "");
      const headers = { "x-api-key": apiKey, Accept: "application/json" };
      const perCountryLimit = Math.min(Math.max(1, Number(config.per_country_limit ?? 50)), 500);
      const maxCountries = Math.max(0, Number(config.max_countries ?? 50));
      const isoFilter = typeof config.iso3 === "string" ? config.iso3 : "";
      const domainFilter = typeof config.domain === "string" ? config.domain : "";
      const warnings: string[] = [];
      const out: VendorRow[] = [];

      let countries: string[] = [];
      if (isoFilter) {
        countries = [isoFilter.toUpperCase()];
      } else {
        const response = await fetch(`${base}/countries`, { headers, signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`AICIS /countries HTTP ${response.status}`);
        const payload = await response.json() as { data?: Array<{ iso3?: string; total_metrics?: number }> };
        const list = Array.isArray(payload.data) ? payload.data : [];
        list.sort((a, b) => (b.total_metrics ?? 0) - (a.total_metrics ?? 0));
        countries = list
          .map((country) => (country.iso3 ?? "").toUpperCase())
          .filter((iso3) => iso3.length === 3);
        if (maxCountries > 0) countries = countries.slice(0, maxCountries);
      }

      log.info("aicis country sweep", { total_countries: countries.length, per_country_limit: perCountryLimit });

      const BATCH_SIZE = 3;
      const INTER_BATCH_DELAY_MS = 250;
      const MAX_RATE_LIMIT_WAIT_MS = 60_000;
      const MAX_TOTAL_THROTTLE_MS = 180_000;
      let pages = 0;
      let throttled = false;
      let totalThrottleWaitMs = 0;
      let throttledCountries = 0;

      const retryAfterMs = (message: string, header?: string | null): number => {
        if (header) {
          const seconds = Number(header);
          if (Number.isFinite(seconds)) return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(1000, seconds * 1000));
        }
        const match = message.match(/Retry after\s*(\d+)\s*ms/i);
        return match ? Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(1000, Number(match[1]))) : 5000;
      };

      const fetchCountry = async (iso3: string): Promise<{ iso3: string; ok: boolean; status: number; signals: AicisSignal[]; error?: string }> => {
        const params = new URLSearchParams({ iso3, limit: String(perCountryLimit) });
        if (domainFilter) params.set("domain", domainFilter);

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await fetch(`${base}/signals?${params}`, { headers, signal: AbortSignal.timeout(30_000) });
            if (response.status === 429 || response.status === 503) {
              const waitMs = retryAfterMs("", response.headers.get("retry-after"));
              if (totalThrottleWaitMs + waitMs > MAX_TOTAL_THROTTLE_MS || attempt === 1) {
                return { iso3, ok: false, status: response.status, signals: [], error: `HTTP ${response.status} (rate-limit budget exhausted)` };
              }
              totalThrottleWaitMs += waitMs;
              await new Promise((resolve) => setTimeout(resolve, waitMs));
              continue;
            }
            if (!response.ok) return { iso3, ok: false, status: response.status, signals: [], error: `HTTP ${response.status}` };
            const payload = await response.json() as { data?: AicisSignal[] };
            return { iso3, ok: true, status: response.status, signals: Array.isArray(payload.data) ? payload.data : [] };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/RateLimit|Rate limit|429|Retry after/i.test(message)) {
              const waitMs = retryAfterMs(message);
              if (totalThrottleWaitMs + waitMs > MAX_TOTAL_THROTTLE_MS || attempt === 1) {
                return { iso3, ok: false, status: 429, signals: [], error: `${message.slice(0, 160)} (budget exhausted)` };
              }
              totalThrottleWaitMs += waitMs;
              await new Promise((resolve) => setTimeout(resolve, waitMs));
              continue;
            }
            return { iso3, ok: false, status: 0, signals: [], error: message.slice(0, 160) };
          }
        }
        return { iso3, ok: false, status: 0, signals: [], error: "exhausted retries" };
      };

      for (let i = 0; i < countries.length && !throttled; i += BATCH_SIZE) {
        const settled = await Promise.all(countries.slice(i, i + BATCH_SIZE).map(fetchCountry));
        for (const result of settled) {
          pages++;
          if (!result.ok) {
            if (result.status === 429 || result.status === 503) {
              throttledCountries++;
              warnings.push(`AICIS ${result.iso3} ${result.error}`);
              if (totalThrottleWaitMs >= MAX_TOTAL_THROTTLE_MS) {
                warnings.push(`AICIS rate-limit budget exhausted after ${Math.round(totalThrottleWaitMs / 1000)}s.`);
                throttled = true;
                break;
              }
            } else {
              warnings.push(`AICIS ${result.iso3} ${result.error}; skipped.`);
            }
            continue;
          }

          for (const signal of result.signals) {
            const value = Number(signal.value);
            if (!Number.isFinite(value)) continue;
            const iso3 = (signal.iso3 ?? result.iso3).toUpperCase();
            const domain = (signal.domain ?? "general").toLowerCase();
            const metric = (signal.metric_name ?? "unknown").toLowerCase();
            out.push({
              metric_key: `aicis.${domain}.${metric}.${iso3}`,
              value,
              unit: signal.unit ?? undefined,
              period: signal.period ?? signal.provenance_observed_at ?? signal.ingested_at ?? undefined,
              region: iso3,
              metadata: {
                signal_id: signal.signal_id,
                domain,
                iso3,
                confidence: signal.confidence,
                freshness_score: signal.freshness_score,
                source_provider: signal.source_provider,
                source_url: signal.source_url,
                provenance_observed_at: signal.provenance_observed_at,
                entity_name: signal.entity_name,
                entity_type: signal.entity_type,
                sovereignty_status: signal.sovereignty_status,
              },
            });
          }
        }
        if (!throttled && i + BATCH_SIZE < countries.length) {
          await new Promise((resolve) => setTimeout(resolve, INTER_BATCH_DELAY_MS));
        }
      }

      log.info("aicis sweep complete", {
        countries_swept: pages,
        rows_collected: out.length,
        warnings: warnings.length,
        throttled_countries: throttledCountries,
        total_throttle_wait_ms: totalThrottleWaitMs,
      });
      if (out.length === 0) throw new Error("AICIS bridge returned 0 usable signals — refusing empty ingest.");
      return { rows: out, pages_fetched: pages, warnings };
    },
  },

  worldbank: {
    vendor_key: "worldbank",
    async fetch({ config }): Promise<FetchResult> {
      const country = typeof config.country === "string" ? config.country : "WLD";
      const indicator = typeof config.indicator === "string" ? config.indicator : "NY.GDP.MKTP.KD.ZG";
      const response = await fetch(
        `https://api.worldbank.org/v2/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(indicator)}?format=json&per_page=25`,
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok) throw new Error(`World Bank HTTP ${response.status}`);
      const payload = await response.json() as unknown[];
      const series = Array.isArray(payload) && payload.length > 1
        ? payload[1] as Array<Record<string, unknown>>
        : [];
      const latest = series.find((row) => row.value != null && Number.isFinite(Number(row.value)));
      if (!latest) throw new Error(`World Bank: no non-null observations for ${indicator}/${country}`);
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
      const indicator = typeof config.indicator === "string" ? config.indicator : "PCPIPCH";
      const country = typeof config.country === "string" ? config.country : "USA";
      const response = await fetch(
        `https://www.imf.org/external/datamapper/api/v1/${encodeURIComponent(indicator)}/${encodeURIComponent(country)}`,
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok) throw new Error(`IMF HTTP ${response.status}`);
      const payload = await response.json() as { values?: Record<string, Record<string, Record<string, number>>> };
      const series = payload.values?.[indicator]?.[country] ?? {};
      const years = Object.keys(series).filter((year) => Number.isFinite(series[year])).sort().reverse();
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
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "External ingestion service unavailable" }, 503);

  const cronHeader = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  let actorType: "cron" | "service" | "user" | null = null;
  let actorUserId: string | null = null;
  let actor = "unknown";
  let triggerLabel = "service";

  if (cronSecret && cronHeader && timingSafeEqual(cronHeader, cronSecret)) {
    actorType = "cron";
    actor = "cron";
    triggerLabel = "scheduled";
  } else if (bearer && timingSafeEqual(bearer, serviceKey)) {
    actorType = "service";
    actor = "service";
  } else if (bearer) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (!error && user?.id) {
      actorType = "user";
      actorUserId = user.id;
      actor = `user:${user.id}`;
      triggerLabel = "manual";
      log.setUser(user.id);
    }
  }

  if (!actorType) {
    log.warn("unauthorised invocation");
    return json({ error: "Unauthorised" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    // Empty body is valid for scheduled cron invocation.
  }
  const mode = typeof body.mode === "string" ? body.mode : "scheduled";
  if (!["scheduled", "manual", "backfill", "test"].includes(mode)) return json({ error: "Invalid mode" }, 400);
  if (actorType === "user" && SYSTEM_MODES.has(mode)) {
    return json({ error: `${mode} mode is restricted to system/cron callers` }, 403);
  }

  log.info("ingestion start", { mode, actor });
  const startTs = Date.now();
  const results: Array<Record<string, unknown>> = [];

  try {
    let sources: SourceRow[] = [];

    if (mode === "scheduled") {
      const { data, error } = await supabase
        .from("external_data_sources")
        .select("*")
        .eq("is_active", true)
        .or(`next_refresh_at.is.null,next_refresh_at.lte.${new Date().toISOString()}`);
      if (error) throw new Error(`Failed to resolve scheduled sources: ${error.message}`);
      sources = (data ?? []) as SourceRow[];
    } else if ((mode === "manual" || mode === "backfill") && typeof body.source_id === "string") {
      const { data, error } = await supabase
        .from("external_data_sources")
        .select("*")
        .eq("id", body.source_id)
        .maybeSingle();
      if (error) throw new Error(`Failed to resolve external source: ${error.message}`);
      if (!data) return json({ error: "External source not found" }, 404);
      sources = [data as SourceRow];
      if (mode === "backfill") {
        const config = isRecord(data.config) ? data.config : {};
        sources = [{
          ...data,
          config: {
            ...config,
            per_country_limit: boundedNumber(body.per_country_limit ?? config.per_country_limit, 1, 500, 100),
            max_countries: boundedNumber(body.max_countries, 0, 1000, 0),
          },
        }];
      }
    } else if (mode === "test" && typeof body.vendor_key === "string") {
      const adapter = adapters[body.vendor_key];
      if (!adapter) return json({ error: "Unknown vendor" }, 400);
      const result = await adapter.fetch({ config: isRecord(body.config) ? body.config : {}, log });
      log.info("dry-run complete", { vendor_key: body.vendor_key, rows: result.rows.length });
      return json({ ok: true, dry_run: true, ...result });
    } else {
      return json({ error: "source_id is required for manual/backfill mode" }, 400);
    }

    if (actorType === "user") {
      if (sources.length !== 1 || !actorUserId) return json({ error: "Manual refresh requires exactly one source" }, 403);
      const orgId = typeof sources[0].organization_id === "string" ? sources[0].organization_id : null;
      if (!orgId) return json({ error: "Source is not attached to an organization" }, 403);
      const { data: membership, error } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", orgId)
        .eq("user_id", actorUserId)
        .maybeSingle();
      if (error) throw new Error(`Failed to verify organization administrator: ${error.message}`);
      if (!membership || !["owner", "admin"].includes(String(membership.role))) {
        return json({ error: "Owner or admin role required for manual external refresh" }, 403);
      }
    }

    log.info("sources resolved", { count: sources.length });

    for (const src of sources) {
      const vendorKey = typeof src.vendor_key === "string" ? src.vendor_key : "";
      const sourceId = typeof src.id === "string" ? src.id : "";
      const orgId = typeof src.organization_id === "string" ? src.organization_id : null;
      const adapter = adapters[vendorKey];
      if (!sourceId) {
        results.push({ vendor_key: vendorKey, status: "error", error: "source id missing" });
        continue;
      }
      if (!adapter) {
        results.push({ vendor_key: vendorKey, status: "skipped", reason: "no_adapter" });
        continue;
      }

      if (vendorKey === "aicis" && orgId) {
        const { data: subscription, error } = await supabase
          .from("subscriptions")
          .select("tier, status")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(`Failed to verify AICIS entitlement: ${error.message}`);
        const tier = String(subscription?.tier ?? "").toLowerCase();
        const status = String(subscription?.status ?? "");
        const allowed = ["active", "trialing"].includes(status) && AICIS_PRO_TIERS.has(tier);
        if (!allowed) {
          const reason = `AICIS sync requires Growth tier or higher (current: ${tier || "free"} / ${status || "no_subscription"})`;
          await logRun(supabase, {
            organization_id: orgId,
            source_id: sourceId,
            vendor_key: vendorKey,
            trigger: triggerLabel,
            actor,
            status: "error",
            rows_fetched: 0,
            rows_upserted: 0,
            pages_fetched: 0,
            error_message: reason,
            duration_ms: 0,
          });
          results.push({ vendor_key: vendorKey, status: "skipped", reason });
          if (mode === "manual") return json({ error: reason }, 403);
          continue;
        }
      }

      const vendorStart = Date.now();
      const { data: runRow, error: runCreateError } = await supabase
        .from("external_sync_runs")
        .insert({
          organization_id: orgId,
          source_id: sourceId,
          vendor_key: vendorKey,
          trigger: triggerLabel,
          actor,
          status: "running",
          metadata: { mode, page_size: isRecord(src.config) ? src.config.page_size ?? null : null },
        })
        .select("id")
        .single();
      if (runCreateError || !runRow?.id) {
        results.push({ vendor_key: vendorKey, status: "error", error: `Failed to create sync run: ${runCreateError?.message ?? "missing id"}` });
        continue;
      }
      const runId = String(runRow.id);

      try {
        const fetched = await adapter.fetch({ config: isRecord(src.config) ? src.config : {}, log });
        const warnings = [...(fetched.warnings ?? [])];
        const seen = new Set<string>();
        let invalidPeriods = 0;

        const payload = fetched.rows
          .filter((row) => Number.isFinite(Number(row.value)))
          .flatMap((row) => {
            const period = normalizePeriod(row.period);
            if (row.period && !period) {
              invalidPeriods++;
              return [];
            }
            const record = {
              organization_id: orgId,
              category: typeof src.category === "string" ? src.category : "macro",
              metric_name: row.metric_key,
              value: Number(row.value),
              unit: row.unit ?? null,
              period_start: period,
              region: row.region ?? null,
              source: typeof src.vendor_name === "string" ? src.vendor_name : vendorKey,
              source_url: typeof src.endpoint_url === "string" ? src.endpoint_url : null,
              confidence_grade: Number(src.trust_level ?? 70) >= 85 ? "A" : "B",
              metadata: {
                ...(row.metadata ?? {}),
                vendor_key: vendorKey,
                license: src.license_type ?? null,
                organization_id: orgId,
              },
            };
            const key = `${record.organization_id ?? "_"}|${record.metric_name}|${record.source}|${record.period_start ?? ""}`;
            if (seen.has(key)) return [];
            seen.add(key);
            return [record];
          });

        if (invalidPeriods > 0) warnings.push(`${invalidPeriods} rows rejected because period could not be normalized to a date`);
        if (fetched.rows.length > 0 && payload.length === 0) {
          throw new Error(`Fetched ${fetched.rows.length} rows but none were valid for persistence`);
        }

        const writeErrors: string[] = [];
        let upserted = 0;
        for (let i = 0; i < payload.length; i += 500) {
          const chunk = payload.slice(i, i + 500);
          const { error } = await supabase.from("internal_reference_data").upsert(chunk, {
            onConflict: "organization_id,metric_name,source,period_start",
            ignoreDuplicates: false,
          });
          if (!error) {
            upserted += chunk.length;
            continue;
          }

          log.warn("batch upsert failed; falling back to row writes", {
            vendor_key: vendorKey,
            chunk_start: i,
            chunk_size: chunk.length,
            error: error.message,
          });
          for (const row of chunk) {
            const { error: rowError } = await supabase.from("internal_reference_data").upsert(row, {
              onConflict: "organization_id,metric_name,source,period_start",
              ignoreDuplicates: false,
            });
            if (rowError) writeErrors.push(`${row.metric_name}: ${rowError.message}`);
            else upserted++;
          }
        }

        if (writeErrors.length > 0) warnings.push(`${writeErrors.length} reference rows failed to persist: ${writeErrors.slice(0, 5).join(" | ")}`);
        if (payload.length > 0 && upserted === 0) {
          throw new Error(`Fetched ${fetched.rows.length} rows, prepared ${payload.length}, but persisted 0`);
        }

        const refreshHours = boundedNumber(src.refresh_interval_hours, 1, 24 * 30, 24);
        const status = warnings.length > 0 ? "partial" : "success";
        const warningMessage = warnings.length > 0 ? warnings.join(" | ").slice(0, 4000) : null;

        const { error: sourceUpdateError } = await supabase
          .from("external_data_sources")
          .update({
            last_refreshed_at: new Date().toISOString(),
            next_refresh_at: new Date(Date.now() + refreshHours * 3600 * 1000).toISOString(),
            last_error: warningMessage,
          })
          .eq("id", sourceId);
        if (sourceUpdateError) throw new Error(`Failed to update source freshness: ${sourceUpdateError.message}`);

        await finalizeRun(supabase, runId, {
          status,
          rows_fetched: fetched.rows.length,
          rows_upserted: upserted,
          pages_fetched: fetched.pages_fetched,
          error_message: warningMessage,
          duration_ms: Date.now() - vendorStart,
        });

        log.info("vendor complete", {
          vendor_key: vendorKey,
          status,
          upserted,
          pages_fetched: fetched.pages_fetched,
          warnings: warnings.length,
          duration_ms: Date.now() - vendorStart,
        });
        results.push({
          vendor_key: vendorKey,
          status,
          rows_fetched: fetched.rows.length,
          upserted,
          pages_fetched: fetched.pages_fetched,
          warnings,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const { error: sourceError } = await supabase
          .from("external_data_sources")
          .update({
            last_error: message,
            next_refresh_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          })
          .eq("id", sourceId);
        if (sourceError) log.error("failed to record source error", { source_id: sourceId, error: sourceError.message });

        try {
          await finalizeRun(supabase, runId, {
            status: "error",
            rows_fetched: 0,
            rows_upserted: 0,
            pages_fetched: 0,
            error_message: message,
            duration_ms: Date.now() - vendorStart,
          });
        } catch (finalizeError) {
          log.error("failed to finalize external sync run", {
            run_id: runId,
            error: finalizeError instanceof Error ? finalizeError.message : String(finalizeError),
          });
        }
        log.error("vendor failure", { vendor_key: vendorKey, error: message });
        results.push({ vendor_key: vendorKey, status: "error", error: message });
      }
    }

    const failed = results.filter((result) => result.status === "error").length;
    const partial = results.filter((result) => result.status === "partial").length;
    const overallStatus = failed > 0 ? (failed === results.length ? "failed" : "partial") : partial > 0 ? "partial" : "completed";

    log.info("ingestion complete", {
      mode,
      status: overallStatus,
      sources_processed: sources.length,
      duration_ms: Date.now() - startTs,
    });

    return json({
      ok: failed === 0,
      status: overallStatus,
      mode,
      actor,
      duration_ms: Date.now() - startTs,
      sources_processed: sources.length,
      results,
    }, overallStatus === "failed" ? 502 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("fatal", { error: message });
    return json({ error: message }, 500);
  }
});

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

interface SyncRunUpdate {
  status: string;
  rows_fetched: number;
  rows_upserted: number;
  pages_fetched: number;
  error_message: string | null;
  duration_ms: number;
}

async function logRun(supabase: ServiceClient, run: SyncRunInsert) {
  const { error } = await supabase.from("external_sync_runs").insert({
    ...run,
    completed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Failed to write external sync run: ${error.message}`);
}

async function finalizeRun(supabase: ServiceClient, runId: string, update: SyncRunUpdate) {
  const { error } = await supabase.from("external_sync_runs").update({
    ...update,
    completed_at: new Date().toISOString(),
  }).eq("id", runId);
  if (error) throw new Error(`Failed to finalize external sync run: ${error.message}`);
}

function normalizePeriod(raw?: string): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (/^\d{4}$/.test(value)) return `${value}-01-01`;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  const quarter = value.match(/^(\d{4})-?Q([1-4])$/i);
  if (quarter) return `${quarter[1]}-${String((Number(quarter[2]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
