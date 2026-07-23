/**
 * ingest-csv-pipeline — server-side CSV ingestion via the unified pipeline.
 *
 * Strangler-pattern entry point: the existing client-side CSV path keeps
 * working. New callers (admin UI, scheduled connectors with csv_upload type,
 * external pipelines) post a CSV body or storage path here and receive a
 * sync_run_id they can poll for status.
 *
 * Body:
 *   { connector_id: uuid, csv_text?: string, request_id?: string,
 *     dry_run?: boolean }
 *
 * Returns: { sync_run_id, status, rows_extracted, rows_valid, rows_invalid,
 *            rows_inserted, dry_run_summary? }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { parseJsonBody } from "../_shared/ingest-utils.ts";
import { parseCsv } from "../_shared/csv-parser.ts";
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
  type FieldMapping,
  type PipelineConnector,
  type RunContext,
} from "../_shared/ingest-pipeline.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
};

interface CsvRequestBody {
  connector_id: string;
  csv_text?: string;
  request_id?: string;
  dry_run?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const log = createLogger("ingest-csv-pipeline", req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing Authorization" });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    ) as any;
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse(401, { error: "Invalid auth" });
    }
    log.setUser(userData.user.id);

    const { body, error: parseErr } = await parseJsonBody(req);
    if (parseErr) return jsonResponse(400, { error: parseErr });
    const payload = body as CsvRequestBody;

    if (!payload?.connector_id || typeof payload.connector_id !== "string") {
      return jsonResponse(400, { error: "connector_id required" });
    }
    if (!payload.csv_text || typeof payload.csv_text !== "string") {
      return jsonResponse(400, { error: "csv_text required" });
    }
    if (payload.csv_text.length > 25 * 1024 * 1024) {
      return jsonResponse(413, { error: "CSV too large (max 25MB)" });
    }

    const svc = makeServiceClient();

    // Load connector + verify membership + role
    const { data: connectorRow, error: cErr } = await svc
      .from("data_connectors")
      .select("id,organization_id,dataset_id,name,connector_type,cursor_field,status")
      .eq("id", payload.connector_id)
      .maybeSingle();

    if (cErr || !connectorRow) {
      return jsonResponse(404, { error: "Connector not found" });
    }
    const connector = connectorRow as PipelineConnector & { status: string };
    log.setOrg(connector.organization_id);

    // Membership + elevated role check
    const { data: roleCheck } = await svc.rpc("exec_require_elevated_role", {
      _user_id: userData.user.id,
      _org_id: connector.organization_id,
    });
    if (!roleCheck) {
      return jsonResponse(403, { error: "Admin or owner role required" });
    }

    if (!connector.dataset_id) {
      return jsonResponse(400, { error: "Connector has no linked dataset" });
    }

    // Load active mapping
    const { data: mappingRow } = await svc
      .from("connector_field_mappings")
      .select("mappings")
      .eq("connector_id", connector.id)
      .eq("is_active", true)
      .maybeSingle();
    const mappings = (mappingRow as { mappings?: Record<string, FieldMapping> } | null)
      ?.mappings ?? {};

    if (Object.keys(mappings).length === 0 && !payload.dry_run) {
      return jsonResponse(400, {
        error:
          "No active field mapping for this connector. Configure mappings or run with dry_run=true.",
      });
    }

    // Parse CSV up-front so dry-run can return preview without creating a run
    const parsed = parseCsv(payload.csv_text);
    log.info("csv parsed", { headers: parsed.headers.length, rows: parsed.rows.length });

    if (payload.dry_run) {
      const transform = transformWithMappings(
        parsed.rows.slice(0, 50).map((r, i) => ({ raw: r, index: i })),
        mappings,
        connector.name,
      );
      return jsonResponse(200, {
        dry_run: true,
        headers: parsed.headers,
        sample_rows: parsed.rows.slice(0, 10),
        valid_count: transform.valid.length,
        invalid_count: transform.invalid.length,
        invalid_samples: transform.invalid.slice(0, 5),
      });
    }

    // Idempotency
    const requestId = payload.request_id ?? crypto.randomUUID();
    const existing = await findExistingRun(svc, connector.id, requestId);
    if (existing) {
      return jsonResponse(200, {
        sync_run_id: existing.id,
        status: existing.status,
        replayed: true,
      });
    }

    // Create run
    const startedAt = Date.now();
    const runId = await createRun(svc, connector, requestId, "manual");
    const ctx: RunContext = {
      connector,
      runId,
      requestId,
      triggeredBy: "manual",
      mappings,
    };
    const stageTimings: Record<string, number> = {};

    try {
      // Stage: extracting
      let t = Date.now();
      await setStage(svc, runId, "extracting", "extracting");
      const rows = parsed.rows.map((r, i) => ({ raw: r, index: i }));
      stageTimings.extracting = Date.now() - t;
      await recordLineage(svc, ctx, "extract", rows.length, {
        headers: parsed.headers,
      });

      // Stage: validating + transforming
      t = Date.now();
      await setStage(svc, runId, "validating", "validating");
      const { valid, invalid } = transformWithMappings(rows, mappings, connector.name);
      stageTimings.validating = Date.now() - t;
      await recordLineage(svc, ctx, "validate", valid.length, {
        invalid: invalid.length,
      });

      // Persist invalid rows as errors (cap at 500 for performance)
      for (const inv of invalid.slice(0, 500)) {
        await recordError(svc, ctx, "validation", inv.reason, inv.index, inv.raw);
      }

      // Stage: persist raw records
      t = Date.now();
      await setStage(svc, runId, "extracted", "extracted");
      await persistRawRecords(svc, ctx, rows);
      stageTimings.persist_raw = Date.now() - t;

      // Stage: transforming → metrics
      t = Date.now();
      await setStage(svc, runId, "transforming", "transforming");
      const { inserted, errors: insertErrors } = await insertMetrics(svc, ctx, valid);
      stageTimings.transforming = Date.now() - t;
      for (const err of insertErrors.slice(0, 500)) {
        await recordError(svc, ctx, "insert", err.reason, err.index);
      }
      await recordLineage(svc, ctx, "transform", inserted, {
        insert_errors: insertErrors.length,
      });

      // Stage: aggregating
      t = Date.now();
      await setStage(svc, runId, "aggregating", "aggregating");
      await refreshAggregates(svc, ctx);
      stageTimings.aggregating = Date.now() - t;
      await recordLineage(svc, ctx, "aggregate", inserted);

      // Finalize
      const result = await finalizeRun(
        svc,
        ctx,
        startedAt,
        {
          rows_extracted: rows.length,
          rows_valid: valid.length,
          rows_invalid: invalid.length + insertErrors.length,
          rows_inserted: inserted,
          rows_skipped: 0,
        },
        stageTimings,
        invalid.length + insertErrors.length > 0
          ? `${invalid.length} validation + ${insertErrors.length} insert errors`
          : undefined,
      );

      log.info("ingest complete", {
        runId,
        status: result.status,
        rows_inserted: result.rows_inserted,
      });

      return jsonResponse(200, { sync_run_id: runId, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("pipeline error", { runId, error: msg });
      await failRun(svc, ctx, startedAt, msg);
      return jsonResponse(500, { sync_run_id: runId, error: msg });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error("fatal", { error: msg });
    return jsonResponse(500, { error: msg });
  }
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
