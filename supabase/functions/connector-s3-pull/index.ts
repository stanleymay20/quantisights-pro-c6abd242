import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { shouldAllow, recordSuccess, recordFailure, deadLetter } from "../_shared/connector-isolation.ts";
import { authorizeConnectorInvocation } from "../_shared/connector-invocation-auth.ts";
import { upsertCanonicalMetrics } from "../_shared/canonical-mapper.ts";
import { logConnectorEvent, rowToCanonicalMetric, validateMapping, type S3Config } from "../_shared/warehouse-config.ts";

const GW = "https://connector-gateway.lovable.dev/aws_s3";
const SIGN_API = "https://connector-gateway.lovable.dev/api/v1/sign_storage_url?provider=aws_s3&mode=read";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "S3 pull service unavailable" }, 503, cors);
  const svc = createClient(supabaseUrl, serviceRoleKey);

  try {
    const requestBody = await req.json().catch(() => ({} as Record<string, unknown>));
    const connectorId = typeof requestBody.connector_id === "string" ? requestBody.connector_id : null;
    if (!connectorId) return json({ error: "connector_id required" }, 400, cors);

    const { data: connector, error: connectorError } = await svc.from("data_connectors").select("*").eq("id", connectorId).single();
    if (connectorError || !connector) return json({ error: "connector not found" }, 404, cors);
    if (connector.connector_type !== "s3") return json({ error: "not an S3 connector" }, 400, cors);
    if (typeof connector.organization_id !== "string" || !connector.organization_id) return json({ error: "connector organization missing" }, 500, cors);

    const authHeader = req.headers.get("authorization");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const userClient = anonKey
      ? createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader ?? "" } } })
      : null;
    const invocation = await authorizeConnectorInvocation({
      authHeader,
      serviceRoleKey,
      organizationId: connector.organization_id,
      userClient,
      membershipClient: svc,
    });
    if (!invocation.allowed) {
      return json({ error: invocation.reason === "forbidden" ? "Forbidden" : "Unauthorized" }, invocation.status, cors);
    }

    const cfg = (connector.config ?? {}) as S3Config;
    const mappingResult = validateMapping(cfg.mapping);
    if (!mappingResult.ok) return json({ error: `config invalid: ${mappingResult.reason}` }, 400, cors);
    if (!cfg.prefix) return json({ error: "config.prefix required" }, 400, cors);

    const gate = await shouldAllow(svc, connector.organization_id, connectorId);
    if (!gate.allow) return json({ skipped: true, reason: gate.reason }, 200, cors);

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const s3Key = Deno.env.get("AWS_S3_API_KEY");
    if (!lovableKey || !s3Key) {
      await recordFailure(svc, connectorId, "missing gateway secrets (LOVABLE_API_KEY/AWS_S3_API_KEY)");
      return json({ error: "S3 connector not linked" }, 412, cors);
    }
    const headers = { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": s3Key } as const;
    const startedAt = Date.now();

    const { data: checkpoint, error: checkpointReadError } = await svc.from("connector_sync_checkpoints")
      .select("cursor_value")
      .eq("connector_id", connectorId)
      .eq("cursor_field", "s3_key")
      .maybeSingle();
    if (checkpointReadError) throw new Error(`Failed to read S3 checkpoint: ${checkpointReadError.message}`);
    const startAfter = typeof checkpoint?.cursor_value === "string" ? checkpoint.cursor_value : undefined;

    const maxFiles = Math.min(1000, Math.max(1, Number(cfg.max_files_per_run ?? 25)));
    const params = new URLSearchParams({ "list-type": "2", prefix: cfg.prefix, "max-keys": String(maxFiles) });
    if (startAfter) params.set("start-after", startAfter);
    const listResponse = await fetch(`${GW}/?${params}`, { headers, signal: AbortSignal.timeout(30_000) });
    if (!listResponse.ok) {
      const message = `S3 list ${listResponse.status}: ${(await listResponse.text()).slice(0, 300)}`;
      await recordFailure(svc, connectorId, message);
      return json({ error: message }, 502, cors);
    }

    const xml = await listResponse.text();
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1]).filter((key) => key !== startAfter);
    const filePattern = new RegExp(cfg.file_pattern ?? "\\.(csv|json|jsonl)$", "i");
    const targets = keys.filter((key) => filePattern.test(key));

    let totalRows = 0;
    let totalInserted = 0;
    let processedFiles = 0;
    let lastSafeKey = startAfter ?? "";
    let fileFailure = false;
    const errors: Array<{ file: string; reason: string }> = [];

    for (const key of targets) {
      try {
        const signResponse = await fetch(SIGN_API, {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ object_path: key }),
        });
        if (!signResponse.ok) throw new Error(`sign ${signResponse.status}`);
        const signed = await signResponse.json() as { url?: string };
        if (!signed.url) throw new Error("sign response missing url");

        const download = await fetch(signed.url, { signal: AbortSignal.timeout(60_000) });
        if (!download.ok) throw new Error(`download ${download.status}`);
        const text = await download.text();
        const format: "csv" | "json" | "jsonl" = cfg.format ?? (key.endsWith(".jsonl") ? "jsonl" : key.endsWith(".json") ? "json" : "csv");
        const maxRows = Math.min(250_000, Math.max(1, Number(cfg.max_rows_per_file ?? 50_000)));
        const rows = parseFile(text, format).slice(0, maxRows);
        totalRows += rows.length;

        const metrics = [];
        const rowErrors: Array<{ file: string; reason: string }> = [];
        for (let i = 0; i < rows.length; i++) {
          try {
            metrics.push(rowToCanonicalMetric(rows[i], mappingResult.mapping));
          } catch (error) {
            rowErrors.push({ file: key, reason: `row ${i}: ${error instanceof Error ? error.message : String(error)}` });
          }
        }
        errors.push(...rowErrors);

        const inserted = await upsertCanonicalMetrics(svc, {
          orgId: connector.organization_id,
          connectorId,
          sourceType: "s3",
          metrics,
        });
        if (rows.length > 0 && inserted === 0) {
          throw new Error(`file contained ${rows.length} rows but none were valid for canonical persistence`);
        }

        totalInserted += inserted;
        processedFiles++;
        lastSafeKey = key;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ file: key, reason: message });
        await deadLetter(svc, {
          orgId: connector.organization_id,
          connectorId,
          errorClass: "s3_object",
          payload: { key },
          errorMessage: message,
        });
        fileFailure = true;
        // The checkpoint is ordered. Never advance beyond a failed object or it
        // could be skipped forever on the next start-after run.
        break;
      }
    }

    if (lastSafeKey && lastSafeKey !== startAfter) {
      const { error: checkpointWriteError } = await svc.from("connector_sync_checkpoints").upsert({
        organization_id: connector.organization_id,
        connector_id: connectorId,
        cursor_field: "s3_key",
        cursor_value: lastSafeKey,
        updated_at: new Date().toISOString(),
      }, { onConflict: "connector_id,cursor_field" });
      if (checkpointWriteError) throw new Error(`Failed to persist S3 checkpoint: ${checkpointWriteError.message}`);
    }

    const finalStatus = fileFailure ? (totalInserted > 0 ? "partial" : "failed") : errors.length > 0 ? "partial" : "completed";
    if (fileFailure) await recordFailure(svc, connectorId, errors.at(-1)?.reason ?? "S3 object processing failed");
    else await recordSuccess(svc, connectorId);

    const { error: healthError } = await svc.from("data_connectors").update({
      ...(fileFailure ? {} : { last_success_at: new Date().toISOString(), consecutive_failures: 0 }),
      health: finalStatus === "completed" ? "healthy" : finalStatus === "partial" ? "degraded" : "error",
    }).eq("id", connectorId);
    if (healthError) throw new Error(`Failed to persist S3 connector health: ${healthError.message}`);

    const durationMs = Date.now() - startedAt;
    logConnectorEvent({
      connector_type: "s3",
      connector_id: connectorId,
      organization_id: connector.organization_id,
      phase: finalStatus === "failed" ? "error" : "complete",
      rows_extracted: totalRows,
      rows_inserted: totalInserted,
      rows_failed: errors.length,
      duration_ms: durationMs,
    });
    return json({
      success: finalStatus !== "failed",
      status: finalStatus,
      files_discovered: targets.length,
      files_processed: processedFiles,
      rows_extracted: totalRows,
      rows_inserted: totalInserted,
      rows_invalid: errors.length,
      checkpoint: lastSafeKey || null,
      sample_errors: errors.slice(0, 5),
      duration_ms: durationMs,
    }, finalStatus === "failed" ? 502 : 200, cors);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ ts: new Date().toISOString(), connector_type: "s3", phase: "error", error: message }));
    return json({ error: message }, 500, cors);
  }
});

function parseFile(text: string, format: "csv" | "json" | "jsonl"): Record<string, unknown>[] {
  if (format === "json") {
    const value = JSON.parse(text);
    if (Array.isArray(value)) return value.filter(isRecord);
    return isRecord(value) ? [value] : [];
  }
  if (format === "jsonl") {
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).filter(isRecord);
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsv(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsv(line);
    const object: Record<string, unknown> = {};
    headers.forEach((header, index) => object[header] = cells[index]);
    return object;
  });
}

function splitCsv(line: string): string[] {
  const output: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      output.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  output.push(current);
  return output.map((value) => value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
