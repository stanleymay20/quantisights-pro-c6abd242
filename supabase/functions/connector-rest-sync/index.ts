/**
 * connector-rest-sync — REST API source connector via the unified pipeline.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { parseJsonBody } from "../_shared/ingest-utils.ts";
import { withRetry } from "../_shared/retry.ts";
import { safeOutboundFetch } from "../_shared/outbound-http.ts";
import {
  createRun,
  failRun,
  finalizeRun,
  findExistingRun,
  insertMetrics,
  makeServiceClient,
  persistRawRecords,
  recordError,
  recordLineage,
  refreshAggregates,
  setStage,
  transformWithMappings,
  type ExtractedRow,
  type FieldMapping,
  type PipelineConnector,
  type RunContext,
} from "../_shared/ingest-pipeline.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-cron-secret",
};

interface RestRequest {
  connector_id: string;
  request_id?: string;
  triggered_by?: "manual" | "schedule" | "api";
}

interface RestConfig {
  url: string;
  method?: string;
  auth?: {
    kind: "none" | "bearer" | "header" | "query";
    header_name?: string;
    query_param?: string;
  };
  data_path?: string;
  pagination?: {
    kind?: "none" | "page" | "cursor";
    page_param?: string;
    page_size_param?: string;
    page_size?: number;
    max_pages?: number;
    cursor_param?: string;
    cursor_path?: string;
  };
  incremental?: {
    kind?: "none" | "since_param";
    since_param?: string;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const log = createLogger("connector-rest-sync", req);

  try {
    const authHeader = req.headers.get("Authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    const isCron = Boolean(cronSecret);

    let actorId = "system";
    if (!isCron) {
      if (!authHeader) return jsonResponse(401, { error: "Missing auth" });
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      ) as any;
      const { data: u, error: uErr } = await userClient.auth.getUser();
      if (uErr || !u?.user) return jsonResponse(401, { error: "Invalid auth" });
      actorId = u.user.id;
      log.setUser(actorId);
    } else {
      const svcCheck = makeServiceClient();
      const { data: expected, error: cronSecretError } = await svcCheck.rpc("get_ingest_cron_secret");
      if (cronSecretError || !expected || expected !== cronSecret) {
        return jsonResponse(401, { error: "Invalid cron secret" });
      }
    }

    const { body, error: parseErr } = await parseJsonBody(req);
    if (parseErr) return jsonResponse(400, { error: parseErr });
    const payload = body as RestRequest;
    if (!payload?.connector_id) return jsonResponse(400, { error: "connector_id required" });

    const svc = makeServiceClient();
    const { data: cRow, error: cErr } = await svc
      .from("data_connectors")
      .select("id,organization_id,dataset_id,name,connector_type,cursor_field,config,vault_secret_name,status")
      .eq("id", payload.connector_id)
      .maybeSingle();
    if (cErr || !cRow) return jsonResponse(404, { error: "Connector not found" });

    const connectorRow = cRow as PipelineConnector & {
      config: RestConfig;
      vault_secret_name: string | null;
      status: string;
    };
    if (connectorRow.connector_type !== "rest_api") {
      return jsonResponse(400, { error: "Connector is not rest_api type" });
    }
    if (connectorRow.status === "paused") return jsonResponse(409, { error: "Connector paused" });
    log.setOrg(connectorRow.organization_id);

    if (!isCron) {
      const { data: roleOk, error: roleError } = await svc.rpc("exec_require_elevated_role", {
        _user_id: actorId,
        _org_id: connectorRow.organization_id,
      });
      if (roleError || !roleOk) return jsonResponse(403, { error: "Admin or owner required" });
    }
    if (!connectorRow.dataset_id) return jsonResponse(400, { error: "Connector has no dataset" });

    const { data: mRow, error: mappingError } = await svc
      .from("connector_field_mappings")
      .select("mappings")
      .eq("connector_id", connectorRow.id)
      .eq("is_active", true)
      .maybeSingle();
    if (mappingError) return jsonResponse(500, { error: "Failed to load connector mapping" });
    const mappings = (mRow as { mappings?: Record<string, FieldMapping> } | null)?.mappings ?? {};
    if (Object.keys(mappings).length === 0) {
      return jsonResponse(400, { error: "No active field mapping" });
    }

    const requestId = payload.request_id ?? crypto.randomUUID();
    const existing = await findExistingRun(svc, connectorRow.id, requestId);
    if (existing) {
      return jsonResponse(200, { sync_run_id: existing.id, status: existing.status, replayed: true });
    }

    const { data: lockOk, error: lockError } = await svc.rpc("connector_try_lock", {
      _connector_id: connectorRow.id,
    });
    if (lockError) return jsonResponse(500, { error: "Failed to acquire connector lock" });
    if (!lockOk) {
      return jsonResponse(409, { error: "Another sync is in progress for this connector" });
    }

    const startedAt = Date.now();
    let checkpointBefore: Record<string, unknown> | null = null;
    if (connectorRow.cursor_field) {
      const { data: cp, error: checkpointReadError } = await svc
        .from("connector_sync_checkpoints")
        .select("cursor_value")
        .eq("connector_id", connectorRow.id)
        .eq("cursor_field", connectorRow.cursor_field)
        .maybeSingle();
      if (checkpointReadError) {
        await svc.rpc("connector_release_lock", { _connector_id: connectorRow.id });
        return jsonResponse(500, { error: "Failed to load connector checkpoint" });
      }
      if (cp && (cp as { cursor_value?: string }).cursor_value) {
        checkpointBefore = {
          [connectorRow.cursor_field]: (cp as { cursor_value: string }).cursor_value,
        };
      }
    }

    const runId = await createRun(
      svc,
      connectorRow,
      requestId,
      payload.triggered_by ?? (isCron ? "schedule" : "manual"),
      checkpointBefore,
    );
    const ctx: RunContext = {
      connector: connectorRow,
      runId,
      requestId,
      triggeredBy: payload.triggered_by ?? (isCron ? "schedule" : "manual"),
      mappings,
      checkpointBefore,
    };
    const stageTimings: Record<string, number> = {};

    try {
      let secret: string | null = null;
      if (connectorRow.vault_secret_name) {
        const { data: sec, error: secretError } = await svc.rpc("get_connector_secret", {
          _secret_name: connectorRow.vault_secret_name,
        });
        if (secretError) throw new Error("Failed to resolve connector credential");
        secret = (sec as string | null) ?? null;
      }

      let t = Date.now();
      await setStage(svc, runId, "extracting", "extracting");
      const extracted = await extractRest(connectorRow.config, secret, checkpointBefore, log);
      stageTimings.extracting = Date.now() - t;
      await recordLineage(svc, ctx, "extract", extracted.rows.length, { pages: extracted.pages });

      t = Date.now();
      await setStage(svc, runId, "validating", "validating");
      const { valid, invalid } = transformWithMappings(extracted.rows, mappings, connectorRow.name);
      stageTimings.validating = Date.now() - t;
      for (const inv of invalid.slice(0, 500)) {
        await recordError(svc, ctx, "validation", inv.reason, inv.index, inv.raw);
      }
      await recordLineage(svc, ctx, "validate", valid.length, { invalid: invalid.length });

      t = Date.now();
      await setStage(svc, runId, "extracted", "extracted");
      await persistRawRecords(svc, ctx, extracted.rows);
      stageTimings.persist_raw = Date.now() - t;

      t = Date.now();
      await setStage(svc, runId, "transforming", "transforming");
      const { inserted, errors: insertErrors } = await insertMetrics(svc, ctx, valid);
      stageTimings.transforming = Date.now() - t;
      for (const err of insertErrors.slice(0, 500)) {
        await recordError(svc, ctx, "insert", err.reason, err.index);
      }
      await recordLineage(svc, ctx, "transform", inserted, { insert_errors: insertErrors.length });

      t = Date.now();
      await setStage(svc, runId, "aggregating", "aggregating");
      const aggregateResult = await refreshAggregates(svc, ctx);
      stageTimings.aggregating = Date.now() - t;
      await recordLineage(svc, ctx, "aggregate", inserted, {
        ok: aggregateResult.ok,
        errors: aggregateResult.errors,
      });

      let checkpointAfter: Record<string, unknown> | null = null;
      if (connectorRow.cursor_field && valid.length > 0) {
        const cursorSrc = Object.entries(mappings).find(
          ([, m]) => m.canonical === connectorRow.cursor_field,
        )?.[0];
        if (cursorSrc) {
          const max = extracted.rows
            .map((r) => String(r.raw[cursorSrc] ?? ""))
            .filter(Boolean)
            .sort()
            .pop();
          if (max) checkpointAfter = { [connectorRow.cursor_field]: max };
        }
      }

      const issues: string[] = [];
      if (invalid.length || insertErrors.length) {
        issues.push(`${invalid.length} validation + ${insertErrors.length} insert errors`);
      }
      if (!aggregateResult.ok) {
        issues.push(`aggregation degraded: ${aggregateResult.errors.join("; ")}`);
      }

      const result = await finalizeRun(
        svc,
        ctx,
        startedAt,
        {
          rows_extracted: extracted.rows.length,
          rows_valid: valid.length,
          rows_invalid: invalid.length + insertErrors.length,
          rows_inserted: inserted,
          rows_skipped: 0,
        },
        stageTimings,
        issues.length ? issues.join(" | ") : undefined,
        checkpointAfter,
      );

      log.info("rest sync complete", {
        runId,
        status: result.status,
        aggregate_ok: aggregateResult.ok,
        rows_inserted: result.rows_inserted,
      });
      return jsonResponse(200, {
        sync_run_id: runId,
        aggregate_ok: aggregateResult.ok,
        ...result,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("rest sync failed", { runId, error: msg });
      await failRun(svc, ctx, startedAt, msg);
      return jsonResponse(500, { sync_run_id: runId, error: msg });
    } finally {
      const { error: releaseError } = await svc.rpc("connector_release_lock", {
        _connector_id: connectorRow.id,
      });
      if (releaseError) log.error("connector lock release failed", { error: releaseError.message });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error("fatal", { error: msg });
    return jsonResponse(500, { error: msg });
  }
});

async function extractRest(
  config: RestConfig,
  secret: string | null,
  checkpoint: Record<string, unknown> | null,
  log: ReturnType<typeof createLogger>,
): Promise<{ rows: ExtractedRow[]; pages: number }> {
  if (!config?.url) throw new Error("REST connector config missing 'url'");

  const method = (config.method ?? "GET").toUpperCase();
  const auth = config.auth ?? { kind: "none" };
  const pagination = config.pagination ?? { kind: "none" };
  const incremental = config.incremental ?? { kind: "none" };
  const dataPath = config.data_path;
  const pageSize = pagination.page_size ?? 100;
  const maxPages = pagination.max_pages ?? 50;

  const allRows: ExtractedRow[] = [];
  let page = 1;
  let cursor: string | null = null;
  let pagesFetched = 0;

  while (pagesFetched < maxPages) {
    const url = new URL(config.url);
    if (auth.kind === "query" && auth.query_param && secret) {
      url.searchParams.set(auth.query_param, secret);
    }

    if (
      incremental.kind === "since_param" &&
      incremental.since_param &&
      checkpoint?.[Object.keys(checkpoint)[0]]
    ) {
      const cursorField = Object.keys(checkpoint)[0];
      url.searchParams.set(incremental.since_param, String(checkpoint[cursorField]));
    }

    if (pagination.kind === "page" && pagination.page_param) {
      url.searchParams.set(pagination.page_param, String(page));
      if (pagination.page_size_param) {
        url.searchParams.set(pagination.page_size_param, String(pageSize));
      }
    } else if (pagination.kind === "cursor" && pagination.cursor_param && cursor) {
      url.searchParams.set(pagination.cursor_param, cursor);
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (auth.kind === "bearer" && secret) {
      headers.Authorization = `Bearer ${secret}`;
    } else if (auth.kind === "header" && auth.header_name && secret) {
      headers[auth.header_name] = secret;
    }

    const json = await withRetry(
      async () => {
        const resp = await safeOutboundFetch(url, { method, headers });
        if (resp.status >= 500) throw new Error(`Upstream ${resp.status}`);
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`REST ${resp.status}: ${text.slice(0, 500)}`);
        }
        return await resp.json();
      },
      { attempts: 3, backoffMs: 500, maxBackoffMs: 5000 },
    );

    const items = pickPath(json, dataPath);
    if (!Array.isArray(items)) {
      throw new Error(`Expected array at ${dataPath ?? "root"}, got ${typeof items}`);
    }
    log.info("page fetched", { page, items: items.length });
    pagesFetched++;

    for (const item of items) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        allRows.push({ raw: item as Record<string, unknown>, index: allRows.length });
      }
    }
    if (items.length === 0) break;

    if (pagination.kind === "page") {
      if (items.length < pageSize) break;
      page++;
    } else if (pagination.kind === "cursor" && pagination.cursor_path) {
      const next = pickPath(json, pagination.cursor_path);
      if (typeof next !== "string" || !next) break;
      cursor = next;
    } else {
      break;
    }
  }

  return { rows: allRows, pages: pagesFetched };
}

function pickPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
