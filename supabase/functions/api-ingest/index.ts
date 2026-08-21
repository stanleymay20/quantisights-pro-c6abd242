import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { createSyncJob, failSyncJob, finalizeSyncJob, findIdempotentJob } from "../_shared/ingest-jobs.ts";
import { isRecord, normalizeDateInput, parseJsonBody, sha256Hex, toDateOnly } from "../_shared/ingest-utils.ts";

const MAX_RECORDS = 50_000;
const BATCH_SIZE = 1000;
const MAX_VALUE = 1e12;
const METRIC_CONFLICT_KEY = "organization_id,dataset_id,metric_type,date,region,segment,source_id";

type ServiceClient = ReturnType<typeof createClient<any>>;

type AuthContext = {
  userId: string | null;
  orgId: string;
  dataSourceId: string;
  sourceCreatedBy: string | null;
  authMode: "jwt" | "api_key";
};

async function resolveApiDataSource(
  svc: ServiceClient,
  orgId: string,
  userId: string,
): Promise<{ id: string; created_by: string | null }> {
  const { data: existing, error: existingError } = await svc
    .from("data_sources")
    .select("id,created_by")
    .eq("organization_id", orgId)
    .eq("source_type", "api")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`Failed to resolve API data source: ${existingError.message}`);
  if (existing?.id) return { id: existing.id, created_by: existing.created_by ?? null };

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

async function authenticateRequest(
  req: Request,
  svc: ServiceClient,
  supabaseUrl: string,
  logger: ReturnType<typeof createLogger>,
): Promise<AuthContext> {
  const authHeader = req.headers.get("authorization");
  const apiKey = req.headers.get("x-api-key");

  if (authHeader) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anonKey) throw new Error("Supabase auth configuration unavailable");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user?.id) throw new Error("Invalid authorization token");

    const { data: profile, error: profileError } = await svc
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw new Error(`Organization lookup failed: ${profileError.message}`);
    if (!profile?.organization_id) throw new Error("Organization not found for user");

    const { data: membership, error: membershipError } = await svc
      .from("organization_members")
      .select("role")
      .eq("organization_id", profile.organization_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) throw new Error(`Membership lookup failed: ${membershipError.message}`);
    if (!membership) throw new Error("User is not a member of organization");

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
    const { data: source, error: sourceError } = await svc
      .from("data_sources")
      .select("id,organization_id,created_by")
      .eq("credentials_key_hash", keyHash)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (sourceError) throw new Error(`API key lookup failed: ${sourceError.message}`);
    if (!source?.id || !source.organization_id) throw new Error("Invalid API key");

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
    const { data, error } = await svc
      .from("datasets")
      .select("id")
      .eq("id", datasetIdHeader)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) throw new Error(`Dataset lookup failed: ${error.message}`);
    if (!data?.id) throw new Error("x-dataset-id not found for organization");
    return data.id;
  }

  if (!datasetName) return null;

  const { data: existing, error: existingError } = await svc
    .from("datasets")
    .select("id")
    .eq("organization_id", orgId)
    .eq("name", datasetName)
    .maybeSingle();
  if (existingError) throw new Error(`Dataset lookup failed: ${existingError.message}`);
  if (existing?.id) return existing.id;
  if (!uploadedBy) return null;

  const { data: created, error } = await svc
    .from("datasets")
    .insert({
      organization_id: orgId,
      name: datasetName,
      uploaded_by: uploadedBy,
      status: "active",
      row_count: 0,
      current_version: 1,
    })
    .select("id")
    .single();
  if (error || !created?.id) {
    throw new Error(`Failed to create dataset: ${error?.message ?? "unknown error"}`);
  }
  return created.id;
}

function metricIdentity(metric: Record<string, unknown>): string {
  return [
    metric.organization_id ?? "",
    metric.dataset_id ?? "",
    metric.metric_type ?? "",
    metric.date ?? "",
    metric.region ?? "",
    metric.segment ?? "",
    metric.source_id ?? "",
  ].join("\u001f");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const logger = createLogger("api-ingest", req);
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    logger.error("missing required Supabase environment configuration");
    return respond({ error: "API ingestion service unavailable" }, 503);
  }
  const svc = createClient(supabaseUrl, serviceKey);
  let jobId: string | null = null;

  try {
    const requestId = req.headers.get("x-request-id");
    if (!requestId) return respond({ error: "x-request-id header required for idempotency" }, 400);

    const auth = await authenticateRequest(req, svc, supabaseUrl, logger);
    const existing = await findIdempotentJob(svc, requestId, auth.orgId, auth.dataSourceId);
    if (existing) {
      logger.info("idempotent replay", {
        request_id: requestId,
        job_id: existing.id,
        job_status: existing.status,
      });
      return respond({
        success: existing.status === "completed" || existing.status === "partial",
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
    const candidateMetrics: Record<string, unknown>[] = [];
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
      candidateMetrics.push({
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

    if (candidateMetrics.length === 0) {
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

    const deduped = new Map<string, Record<string, unknown>>();
    for (const metric of candidateMetrics) deduped.set(metricIdentity(metric), metric);
    const metrics = Array.from(deduped.values());
    const duplicateCount = candidateMetrics.length - metrics.length;
    if (duplicateCount > 0) {
      logger.info("deduplicated metric identities within request", { duplicate_count: duplicateCount });
    }

    let inserted = 0;
    for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
      const batch = metrics.slice(i, i + BATCH_SIZE);
      const { error } = await svc.from("metrics").upsert(batch, { onConflict: METRIC_CONFLICT_KEY });
      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE)}: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }

    const jobStatus = await finalizeSyncJob(svc, { jobId, inserted, errors });

    // Freshness is evidence that something was actually persisted. Never move
    // last_refreshed_at forward on a zero-write run, and never replace the
    // dataset's cumulative row_count with only the latest request size.
    let totalDatasetMetrics: number | null = null;
    if (datasetId && inserted > 0) {
      const { count, error: countError } = await svc
        .from("metrics")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", auth.orgId)
        .eq("dataset_id", datasetId);
      if (countError) throw new Error(`Dataset metric count refresh failed: ${countError.message}`);
      totalDatasetMetrics = count ?? inserted;

      const { error: datasetUpdateError } = await svc
        .from("datasets")
        .update({
          row_count: totalDatasetMetrics,
          last_refreshed_at: new Date().toISOString(),
          status: "active",
        })
        .eq("id", datasetId)
        .eq("organization_id", auth.orgId);
      if (datasetUpdateError) throw new Error(`Dataset freshness update failed: ${datasetUpdateError.message}`);
    }

    const { error: auditError } = await svc.from("audit_log").insert({
      organization_id: auth.orgId,
      actor_type: auth.authMode === "jwt" ? "user" : "system",
      actor_id: auth.userId,
      action_type: "api_ingest",
      resource_type: "data_source",
      resource_id: auth.dataSourceId,
      payload: {
        job_id: jobId,
        request_id: requestId,
        job_status: jobStatus,
        records_received: records.length,
        unique_metric_identities: metrics.length,
        duplicate_identities_collapsed: duplicateCount,
        records_inserted: inserted,
        records_rejected: errors.length,
        dataset_id: datasetId,
      },
    });
    if (auditError) logger.error("audit log write failed", { error: auditError.message, job_id: jobId });

    logger.info("ingest completed", {
      request_id: requestId,
      data_source_id: auth.dataSourceId,
      dataset_id: datasetId,
      job_status: jobStatus,
      records_received: records.length,
      records_inserted: inserted,
      records_rejected: errors.length,
      execution_ms: Date.now() - startTime,
      job_id: jobId,
    });

    const responseBody = {
      success: inserted > 0,
      job_id: jobId,
      job_status: jobStatus,
      records_received: records.length,
      unique_metric_identities: metrics.length,
      duplicate_identities_collapsed: duplicateCount,
      records_inserted: inserted,
      records_rejected: errors.length,
      dataset_id: datasetId,
      dataset_metric_count: totalDatasetMetrics,
      validation_errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      execution_ms: Date.now() - startTime,
      api_version: "v1",
    };

    if (inserted === 0) return respond(responseBody, 500);
    return respond(responseBody, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (jobId) {
      try {
        await failSyncJob(svc, { jobId, errorMessage: message });
      } catch (bookkeepingError) {
        logger.error("failed to mark sync job failed", {
          job_id: jobId,
          error: bookkeepingError instanceof Error ? bookkeepingError.message : String(bookkeepingError),
        });
      }
    }
    logger.error("ingest failed", { error: message, execution_ms: Date.now() - startTime, job_id: jobId });
    const status = [
      "Invalid authorization token",
      "Invalid API key",
      "Authorization header or x-api-key required",
    ].includes(message)
      ? 401
      : ["Organization not found for user", "User is not a member of organization"].includes(message)
        ? 403
        : message === "x-dataset-id not found for organization"
          ? 400
          : 500;
    return respond({ error: message, job_id: jobId }, status);
  }
});
