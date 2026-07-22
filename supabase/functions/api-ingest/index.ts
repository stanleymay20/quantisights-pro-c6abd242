// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { createSyncJob, failSyncJob, finalizeSyncJob, findIdempotentJob } from "../_shared/ingest-jobs.ts";
import { isRecord, normalizeDateInput, parseJsonBody, sha256Hex, toDateOnly } from "../_shared/ingest-utils.ts";

/**
 * Enterprise API Ingestion Endpoint
 *
 * POST /api-ingest
 * Headers: Authorization or x-api-key, x-request-id (required), x-dataset-id (optional)
 * Body: { records: [...], dataset_name?: string, metric_type?: string }
 */

const MAX_RECORDS = 50_000;
const BATCH_SIZE = 1000;
const MAX_VALUE = 1e12;

type ServiceClient = ReturnType<typeof createClient>;

type AuthContext = {
  userId: string | null;
  orgId: string;
  dataSourceId: string;
  sourceCreatedBy: string | null;
  authMode: "jwt" | "api_key";
};

async function resolveApiDataSource(svc: ServiceClient, orgId: string, userId: string): Promise<{ id: string; created_by: string | null }> {
  const { data: existing } = await svc
    .from("data_sources")
    .select("id,created_by")
    .eq("organization_id", orgId)
    .eq("source_type", "api")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { id: existing.id, created_by: existing.created_by ?? null };
  }

  const { data: created, error } = await svc
    .from("data_sources")
    .insert({
      organization_id: orgId,
      name: "API Ingestion",
      source_type: "api",
      status: "active",
      config: {},
      created_by: userId,
    })
    .select("id,created_by")
    .single();

  if (error || !created?.id) {
    throw new Error(`Failed to create API data source: ${error?.message ?? "unknown error"}`);
  }

  return { id: created.id, created_by: created.created_by ?? null };
}

async function authenticateRequest(req: Request, svc: ServiceClient, supabaseUrl: string, logger: ReturnType<typeof createLogger>): Promise<AuthContext> {
  const authHeader = req.headers.get("authorization");
  const apiKey = req.headers.get("x-api-key");

  if (authHeader) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    }) as any;

    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user?.id) {
      throw new Error("Invalid authorization token");
    }

    const { data: profile } = await svc
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      throw new Error("Organization not found for user");
    }

    logger.setUser(user.id);
    logger.setOrg(profile.organization_id);

    const source = await resolveApiDataSource(svc, profile.organization_id, user.id);

    return {
      userId: user.id,
      orgId: profile.organization_id,
      dataSourceId: source.id,
      sourceCreatedBy: source.created_by,
      authMode: "jwt",
    };
  }

  if (apiKey) {
    const keyHash = await sha256Hex(apiKey);
    const { data: source } = await svc
      .from("data_sources")
      .select("id, organization_id, created_by")
      .eq("credentials_key_hash", keyHash)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!source?.id || !source.organization_id) {
      throw new Error("Invalid API key");
    }

    logger.setOrg(source.organization_id);

    return {
      userId: null,
      orgId: source.organization_id,
      dataSourceId: source.id,
      sourceCreatedBy: source.created_by ?? null,
      authMode: "api_key",
    };
  }

  throw new Error("Authorization header or x-api-key required");
}

async function resolveDataset(
  svc: ServiceClient,
  params: {
    orgId: string;
    datasetIdHeader: string | null;
    datasetName?: string;
    uploadedBy: string | null;
    rowCount: number;
  },
): Promise<string | null> {
  const { orgId, datasetIdHeader, datasetName, uploadedBy, rowCount } = params;

  if (datasetIdHeader) {
    const { data } = await svc
      .from("datasets")
      .select("id")
      .eq("id", datasetIdHeader)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!data?.id) {
      throw new Error("x-dataset-id not found for organization");
    }

    return data.id;
  }

  if (!datasetName) {
    return null;
  }

  const { data: existing } = await svc
    .from("datasets")
    .select("id")
    .eq("organization_id", orgId)
    .eq("name", datasetName)
    .maybeSingle();

  if (existing?.id) {
    return existing.id;
  }

  if (!uploadedBy) {
    return null;
  }

  const { data: created, error } = await svc
    .from("datasets")
    .insert({
      organization_id: orgId,
      name: datasetName,
      uploaded_by: uploadedBy,
      status: "active",
      row_count: rowCount,
      current_version: 1,
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    throw new Error(`Failed to create dataset: ${error?.message ?? "unknown error"}`);
  }

  return created.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const logger = createLogger("api-ingest", req);

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceKey) as any;

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let jobId: string | null = null;

  try {
    const requestId = req.headers.get("x-request-id");
    if (!requestId) return respond({ error: "x-request-id header required for idempotency" }, 400);

    const auth = await authenticateRequest(req, svc, supabaseUrl, logger);

    const existing = await findIdempotentJob(svc, requestId, auth.orgId, auth.dataSourceId);
    if (existing) {
      logger.info("idempotent replay", { request_id: requestId, job_id: existing.id, job_status: existing.status });
      return respond({
        success: existing.status !== "failed",
        idempotent_replay: true,
        job_id: existing.id,
        job_status: existing.status,
        records_synced: existing.records_synced ?? 0,
        error_message: existing.error_message,
      }, existing.status === "failed" ? 409 : 200);
    }

    const parsed = await parseJsonBody(req);
    if (parsed.error) return respond({ error: parsed.error }, 400);

    const body = parsed.body;
    let records: unknown[] = [];
    let defaultMetricType: string | undefined;
    let datasetName: string | undefined;

    if (Array.isArray(body)) {
      records = body;
    } else if (isRecord(body)) {
      if (Array.isArray(body.records)) records = body.records;
      else if (Array.isArray(body.data)) records = body.data;
      else records = [body];

      defaultMetricType = typeof body.metric_type === "string"
        ? body.metric_type
        : typeof body.default_metric_type === "string"
          ? body.default_metric_type
          : undefined;

      datasetName = typeof body.dataset_name === "string" ? body.dataset_name : undefined;
    } else {
      return respond({ error: "Invalid payload. Expected object or array." }, 400);
    }

    if (records.length === 0) return respond({ error: "No records provided" }, 400);
    if (records.length > MAX_RECORDS) {
      return respond({ error: `Max ${MAX_RECORDS} records per request. Received: ${records.length}` }, 400);
    }

    jobId = await createSyncJob(svc, {
      dataSourceId: auth.dataSourceId,
      organizationId: auth.orgId,
      requestId,
      status: "running",
    });

    const datasetId = await resolveDataset(svc, {
      orgId: auth.orgId,
      datasetIdHeader: req.headers.get("x-dataset-id"),
      datasetName,
      uploadedBy: auth.userId ?? auth.sourceCreatedBy,
      rowCount: records.length,
    });

    const errors: string[] = [];
    const metrics: Record<string, unknown>[] = [];
    const minDate = new Date();
    minDate.setFullYear(minDate.getFullYear() - 5);

    for (let i = 0; i < records.length; i++) {
      const raw = records[i];
      if (!isRecord(raw)) {
        errors.push(`Record ${i}: invalid object payload`);
        continue;
      }

      const dateRaw = raw.date ?? raw.period ?? raw.timestamp;
      const date = normalizeDateInput(dateRaw);
      if (!date) {
        errors.push(`Record ${i}: invalid date`);
        continue;
      }

      if (new Date(date) < minDate) {
        errors.push(`Record ${i}: date older than 5 years`);
        continue;
      }

      const rawValue = raw.value ?? raw.amount ?? raw.metric_value;
      const value = Number.parseFloat(String(rawValue ?? ""));
      if (!Number.isFinite(value) || Math.abs(value) > MAX_VALUE) {
        errors.push(`Record ${i}: invalid value`);
        continue;
      }

      const metricType = typeof raw.metric_type === "string"
        ? raw.metric_type
        : typeof raw.type === "string"
          ? raw.type
          : typeof raw.metric === "string"
            ? raw.metric
            : defaultMetricType || "custom";

      metrics.push({
        organization_id: auth.orgId,
        dataset_id: datasetId,
        metric_type: metricType,
        date: toDateOnly(date),
        value,
        region: String(raw.region ?? raw.country ?? "").trim(),
        segment: String(raw.segment ?? raw.category ?? "").trim(),
        source_type: "api",
        source_id: auth.dataSourceId,
        quality_score: 85,
      });
    }

    if (metrics.length === 0) {
      await finalizeSyncJob(svc, { jobId, inserted: 0, errors });
      return respond({
        success: false,
        job_id: jobId,
        records_received: records.length,
        records_inserted: 0,
        records_rejected: errors.length,
        validation_errors: errors.slice(0, 20),
      }, 400);
    }

    let inserted = 0;
    for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
      const batch = metrics.slice(i, i + BATCH_SIZE);
      const { error } = await svc.from("metrics").upsert(batch, {
        onConflict: "organization_id,metric_type,date,region,segment,source_id",
      });

      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE)}: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }

    await finalizeSyncJob(svc, { jobId, inserted, errors });

    if (datasetId) {
      await svc.from("datasets").update({
        row_count: inserted,
        last_refreshed_at: new Date().toISOString(),
        status: "active",
      }).eq("id", datasetId);
    }

    await svc.from("audit_log").insert({
      organization_id: auth.orgId,
      actor_type: auth.authMode === "jwt" ? "user" : "system",
      actor_id: auth.userId,
      action_type: "api_ingest",
      resource_type: "data_source",
      resource_id: auth.dataSourceId,
      payload: {
        job_id: jobId,
        request_id: requestId,
        records_received: records.length,
        records_inserted: inserted,
        records_rejected: errors.length,
        dataset_id: datasetId,
      },
    });

    logger.info("ingest completed", {
      request_id: requestId,
      data_source_id: auth.dataSourceId,
      dataset_id: datasetId,
      records_received: records.length,
      records_inserted: inserted,
      records_rejected: errors.length,
      execution_ms: Date.now() - startTime,
      job_id: jobId,
    });

    return respond({
      success: inserted > 0,
      job_id: jobId,
      records_received: records.length,
      records_inserted: inserted,
      records_rejected: errors.length,
      dataset_id: datasetId,
      validation_errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      execution_ms: Date.now() - startTime,
      api_version: "v1",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (jobId) {
      await failSyncJob(svc, { jobId, errorMessage: message });
    }
    logger.error("ingest failed", { error: message, execution_ms: Date.now() - startTime, job_id: jobId });
    return respond({ error: message }, [
      "Invalid authorization token",
      "Invalid API key",
      "Authorization header or x-api-key required",
      "Organization not found for user",
      "x-dataset-id not found for organization",
    ].includes(message) ? 401 : 500);
  }
});
