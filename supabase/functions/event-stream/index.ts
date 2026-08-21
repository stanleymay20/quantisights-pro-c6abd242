import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { createSyncJob, failSyncJob, finalizeSyncJob, findIdempotentJob } from "../_shared/ingest-jobs.ts";
import { isRecord, normalizeDateInput, parseJsonBody, sha256Hex, toDateOnly } from "../_shared/ingest-utils.ts";

/**
 * Real-Time Event Streaming Endpoint
 *
 * POST /event-stream
 * Headers: x-api-key, x-event-type (required), x-idempotency-key (required)
 * Body: single event object or array of events (max 1000)
 */

const MAX_EVENTS = 1000;
const MAX_VALUE = 1e12;
const BATCH_SIZE = 500;
const ALLOWED_EVENT_TYPES = new Set(["metric", "decision", "alert", "audit", "custom"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const logger = createLogger("event-stream", req);

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceKey);

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let jobId: string | null = null;

  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) return respond({ error: "x-api-key header required" }, 401);

    const eventType = (req.headers.get("x-event-type") || "").trim().toLowerCase();
    if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) {
      return respond({ error: "x-event-type must be one of: metric, decision, alert, audit, custom" }, 400);
    }

    const idempotencyKey = req.headers.get("x-idempotency-key");
    if (!idempotencyKey) {
      return respond({ error: "x-idempotency-key header required for retry safety" }, 400);
    }

    const keyHash = await sha256Hex(apiKey);
    const { data: source } = await svc
      .from("data_sources")
      .select("id, organization_id")
      .eq("credentials_key_hash", keyHash)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!source?.id || !source.organization_id) {
      return respond({ error: "Invalid API key" }, 401);
    }

    const orgId = source.organization_id;
    const sourceId = source.id;
    logger.setOrg(orgId);

    const existing = await findIdempotentJob(svc, idempotencyKey, orgId, sourceId);
    if (existing) {
      logger.info("idempotent replay", { request_id: idempotencyKey, job_id: existing.id, job_status: existing.status });
      return respond({
        success: existing.status !== "failed",
        idempotent: true,
        event_type: eventType,
        job_id: existing.id,
        job_status: existing.status,
        records: existing.records_synced ?? 0,
        error_message: existing.error_message,
      }, existing.status === "failed" ? 409 : 200);
    }

    jobId = await createSyncJob(svc, {
      dataSourceId: sourceId,
      organizationId: orgId,
      requestId: idempotencyKey,
      status: "running",
    });

    const parsed = await parseJsonBody(req);
    if (parsed.error) {
      await failSyncJob(svc, { jobId, errorMessage: parsed.error });
      return respond({ error: parsed.error }, 400);
    }

    const body = parsed.body;
    const events = Array.isArray(body) ? body : [body];

    if (events.length === 0) {
      await failSyncJob(svc, { jobId, errorMessage: "No events provided" });
      return respond({ error: "No events provided" }, 400);
    }

    if (events.length > MAX_EVENTS) {
      await failSyncJob(svc, { jobId, errorMessage: `Max ${MAX_EVENTS} events per request` });
      return respond({ error: `Max ${MAX_EVENTS} events per request` }, 400);
    }

    const processed: Record<string, unknown>[] = [];
    const errors: string[] = [];

    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      if (!isRecord(evt)) {
        errors.push(`Event ${i}: invalid object payload`);
        continue;
      }

      switch (eventType) {
        case "metric": {
          const date = normalizeDateInput(evt.date ?? evt.timestamp ?? new Date().toISOString());
          if (!date) {
            errors.push(`Event ${i}: invalid date`);
            continue;
          }

          const value = Number.parseFloat(String(evt.value ?? evt.amount ?? ""));
          if (!Number.isFinite(value) || Math.abs(value) > MAX_VALUE) {
            errors.push(`Event ${i}: invalid value`);
            continue;
          }

          processed.push({
            organization_id: orgId,
            dataset_id: typeof evt.dataset_id === "string" ? evt.dataset_id : null,
            metric_type: typeof evt.metric_type === "string"
              ? evt.metric_type
              : typeof evt.type === "string"
                ? evt.type
                : "custom",
            date: toDateOnly(date),
            value,
            region: String(evt.region ?? "").trim(),
            segment: String(evt.segment ?? "").trim(),
            source_type: "stream",
            source_id: sourceId,
            quality_score: 80,
          });
          break;
        }

        case "decision": {
          const confidence = evt.confidence === undefined || evt.confidence === null
            ? null
            : Number.parseFloat(String(evt.confidence));

          processed.push({
            organization_id: orgId,
            recommended_action: typeof evt.action === "string"
              ? evt.action
              : typeof evt.recommended_action === "string"
                ? evt.recommended_action
                : "No action specified",
            decision_type: typeof evt.decision_type === "string" ? evt.decision_type : "operational",
            decision_status: "pending",
            execution_status: "not_started",
            notes: typeof evt.notes === "string"
              ? evt.notes
              : typeof evt.description === "string"
                ? evt.description
                : null,
            confidence_at_decision: Number.isFinite(confidence as number) ? confidence : null,
          });
          break;
        }

        case "alert": {
          processed.push({
            organization_id: orgId,
            actor_type: "external",
            action_type: typeof evt.alert_type === "string" ? evt.alert_type : "external_alert",
            resource_type: typeof evt.resource_type === "string" ? evt.resource_type : "system",
            resource_id: typeof evt.resource_id === "string" ? evt.resource_id : null,
            payload: {
              severity: typeof evt.severity === "string" ? evt.severity : "info",
              message: typeof evt.message === "string"
                ? evt.message
                : typeof evt.description === "string"
                  ? evt.description
                  : null,
              source: "event-stream",
              metadata: isRecord(evt.metadata) ? evt.metadata : {},
            },
          });
          break;
        }

        case "audit": {
          processed.push({
            organization_id: orgId,
            actor_type: typeof evt.actor_type === "string" ? evt.actor_type : "external",
            actor_id: typeof evt.actor_id === "string" ? evt.actor_id : null,
            action_type: typeof evt.action === "string"
              ? evt.action
              : typeof evt.action_type === "string"
                ? evt.action_type
                : "external_event",
            resource_type: typeof evt.resource_type === "string" ? evt.resource_type : "custom",
            resource_id: typeof evt.resource_id === "string" ? evt.resource_id : null,
            payload: isRecord(evt.payload)
              ? evt.payload
              : isRecord(evt.data)
                ? evt.data
                : {},
          });
          break;
        }

        default: {
          processed.push({
            organization_id: orgId,
            actor_type: "external",
            action_type: `custom_${eventType}`,
            resource_type: "event_stream",
            resource_id: typeof evt.id === "string" ? evt.id : null,
            payload: evt,
          });
        }
      }
    }

    let inserted = 0;
    const targetTable = eventType === "metric"
      ? "metrics"
      : eventType === "decision"
        ? "decision_ledger"
        : "audit_log";

    if (processed.length > 0) {
      if (eventType === "metric") {
        for (let i = 0; i < processed.length; i += BATCH_SIZE) {
          const batch = processed.slice(i, i + BATCH_SIZE);
          const { error } = await svc.from("metrics").upsert(batch, {
            onConflict: "organization_id,dataset_id,metric_type,date,region,segment,source_id",
          });
          if (error) errors.push(`Batch ${Math.floor(i / BATCH_SIZE)}: ${error.message}`);
          else inserted += batch.length;
        }
      } else {
        const { error } = await svc.from(targetTable).insert(processed);
        if (error) errors.push(error.message);
        else inserted = processed.length;
      }
    }

    await finalizeSyncJob(svc, { jobId, inserted, errors });

    await svc.from("audit_log").insert({
      organization_id: orgId,
      actor_type: "system",
      action_type: "event_stream_ingest",
      resource_type: "data_source",
      resource_id: sourceId,
      payload: {
        event_type: eventType,
        request_id: idempotencyKey,
        events_received: events.length,
        events_processed: inserted,
        events_rejected: errors.length,
        job_id: jobId,
      },
    });

    logger.info("event stream completed", {
      event_type: eventType,
      request_id: idempotencyKey,
      source_id: sourceId,
      events_received: events.length,
      events_processed: inserted,
      events_rejected: errors.length,
      latency_ms: Date.now() - startTime,
      job_id: jobId,
    });

    return respond({
      success: inserted > 0,
      event_type: eventType,
      events_received: events.length,
      events_processed: inserted,
      events_rejected: errors.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      latency_ms: Date.now() - startTime,
      job_id: jobId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (jobId) {
      await failSyncJob(svc, { jobId, errorMessage: message });
    }
    logger.error("event stream failed", { error: message, latency_ms: Date.now() - startTime, job_id: jobId });
    return respond({ error: message }, 500);
  }
});
