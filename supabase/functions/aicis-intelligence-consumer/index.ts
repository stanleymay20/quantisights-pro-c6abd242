/**
 * AICIS Intelligence Consumer
 * 
 * Ingests AICIS decision-grade export payloads (api/webhook/manual).
 * - Validates schema + version
 * - Dedupes via content_hash (sha256 of canonical body)
 * - Records batch provenance + observability rollup
 * - Inserts normalized intelligence items
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { isValidUUID } from "../_shared/input-validation.ts";

const SUPPORTED_SCHEMA_VERSIONS = ["1.0", "1.1"];

type RawItem = {
  source_surface: string;
  source_ref?: string;
  severity?: "low" | "medium" | "high" | "critical";
  urgency?: "low" | "normal" | "high" | "immediate";
  domain?: string;
  geography?: string[];
  entities?: unknown[];
  title?: string;
  summary?: string;
  occurred_at?: string;
  global_criticality_score?: number;
  payload?: Record<string, unknown>;
};

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalize).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize((obj as Record<string, unknown>)[k])).join(",") + "}";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const correlationId = req.headers.get("x-request-id") || crypto.randomUUID();
  const startTs = Date.now();

  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { organization_id, batch_ref, schema_version, source, items } = body as {
    organization_id: string;
    batch_ref: string;
    schema_version: string;
    source: string;
    items: RawItem[];
  };

  if (!isValidUUID(organization_id)) return json({ error: "Invalid organization_id" }, 400);
  if (!batch_ref || typeof batch_ref !== "string") return json({ error: "batch_ref required" }, 400);
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(schema_version)) return json({ error: `Unsupported schema_version. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(",")}` }, 400);
  if (!Array.isArray(items)) return json({ error: "items must be an array" }, 400);
  if (items.length > 1000) return json({ error: "items capped at 1000 per batch" }, 400);
  if (!["api", "webhook", "pull", "manual"].includes(source)) return json({ error: "Invalid source" }, 400);

  if (!(await verifyOrgMembership(auth.userId, organization_id))) return json({ error: "Not a member" }, 403);

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Idempotent batch insert
  const { data: existingBatch } = await svc
    .from("aicis_export_batches")
    .select("id, status, item_count, duplicates_suppressed")
    .eq("organization_id", organization_id)
    .eq("batch_ref", batch_ref)
    .maybeSingle();

  if (existingBatch && existingBatch.status === "completed") {
    return json({ batch_id: existingBatch.id, status: "already_processed", item_count: existingBatch.item_count, duplicates_suppressed: existingBatch.duplicates_suppressed });
  }

  const { data: batchRow, error: batchErr } = await svc
    .from("aicis_export_batches")
    .upsert({
      organization_id, batch_ref, source, schema_version,
      item_count: items.length, status: "processing",
    }, { onConflict: "organization_id,batch_ref" })
    .select("id")
    .single();

  if (batchErr || !batchRow) return json({ error: "Batch insert failed", details: batchErr?.message }, 500);
  const batchId = batchRow.id;

  let inserted = 0;
  let duplicates = 0;
  const errors: string[] = [];

  for (const raw of items) {
    try {
      if (!raw.source_surface) { errors.push("missing source_surface"); continue; }
      const hash = await sha256(canonicalize({
        org: organization_id,
        surface: raw.source_surface,
        ref: raw.source_ref ?? null,
        title: raw.title ?? null,
        payload: raw.payload ?? {},
      }));

      const row = {
        organization_id,
        export_batch_id: batchId,
        source_surface: raw.source_surface,
        source_ref: raw.source_ref ?? null,
        content_hash: hash,
        severity: raw.severity ?? "medium",
        urgency: raw.urgency ?? "normal",
        domain: raw.domain ?? null,
        geography: raw.geography ?? [],
        entities: raw.entities ?? [],
        payload: raw.payload ?? {},
        title: raw.title ?? null,
        summary: raw.summary ?? null,
        schema_version,
        global_criticality_score: Math.min(100, Math.max(0, Number(raw.global_criticality_score ?? 0))),
        occurred_at: raw.occurred_at ?? null,
      };

      const { error } = await svc.from("aicis_intelligence_items").insert(row);
      if (error) {
        if (error.code === "23505") duplicates++;
        else errors.push(error.message);
      } else {
        inserted++;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const processingMs = Date.now() - startTs;
  const status = errors.length === items.length ? "failed" : "completed";

  await svc.from("aicis_export_batches").update({
    item_count: inserted,
    duplicates_suppressed: duplicates,
    processing_ms: processingMs,
    status,
    error: errors.length ? errors.slice(0, 5).join("; ") : null,
    completed_at: new Date().toISOString(),
  }).eq("id", batchId);

  // Observability rollup (today)
  const today = new Date().toISOString().slice(0, 10);
  const { data: obs } = await svc.from("intelligence_observability")
    .select("imports_total,imports_failed,duplicates_suppressed,avg_processing_ms")
    .eq("organization_id", organization_id).eq("day", today).maybeSingle();

  if (obs) {
    const newTotal = obs.imports_total + 1;
    const newAvg = Math.round(((obs.avg_processing_ms || 0) * obs.imports_total + processingMs) / newTotal);
    await svc.from("intelligence_observability").update({
      imports_total: newTotal,
      imports_failed: obs.imports_failed + (status === "failed" ? 1 : 0),
      duplicates_suppressed: obs.duplicates_suppressed + duplicates,
      avg_processing_ms: newAvg,
      updated_at: new Date().toISOString(),
    }).eq("organization_id", organization_id).eq("day", today);
  } else {
    await svc.from("intelligence_observability").insert({
      organization_id, day: today,
      imports_total: 1, imports_failed: status === "failed" ? 1 : 0,
      duplicates_suppressed: duplicates, avg_processing_ms: processingMs,
    });
  }

  console.log(`[consumer ${correlationId}] batch=${batchId} inserted=${inserted} dup=${duplicates} errors=${errors.length} ms=${processingMs}`);

  return json({
    batch_id: batchId, status, inserted, duplicates_suppressed: duplicates,
    errors: errors.slice(0, 10), processing_ms: processingMs, correlation_id: correlationId,
  });
});
