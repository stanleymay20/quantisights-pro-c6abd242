// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { shouldAllow, recordSuccess, recordFailure, deadLetter } from "../_shared/connector-isolation.ts";
import { upsertCanonicalMetrics } from "../_shared/canonical-mapper.ts";
import { logConnectorEvent, rowToCanonicalMetric, validateMapping, type S3Config } from "../_shared/warehouse-config.ts";

const GW = "https://connector-gateway.lovable.dev/aws_s3";
const API = "https://connector-gateway.lovable.dev/api/v1/sign_storage_url?provider=aws_s3&mode=read";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { connector_id } = await req.json();
    if (!connector_id) return json({ error: "connector_id required" }, 400, cors);

    const { data: connector } = await svc.from("data_connectors").select("*").eq("id", connector_id).single();
    if (!connector) return json({ error: "connector not found" }, 404, cors);
    const cfg = (connector.config ?? {}) as S3Config;
    const m = validateMapping(cfg.mapping);
    if (!m.ok) return json({ error: `config invalid: ${m.reason}` }, 400, cors);
    if (!cfg.prefix) return json({ error: "config.prefix required" }, 400, cors);

    const gate = await shouldAllow(svc, connector.organization_id, connector_id);
    if (!gate.allow) return json({ skipped: true, reason: gate.reason }, 200, cors);

    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    const S3 = Deno.env.get("AWS_S3_API_KEY");
    if (!LOVABLE || !S3) {
      await recordFailure(svc, connector_id, "missing gateway secrets (LOVABLE_API_KEY/AWS_S3_API_KEY)");
      return json({ error: "S3 connector not linked" }, 412, cors);
    }
    const hdr = { Authorization: `Bearer ${LOVABLE}`, "X-Connection-Api-Key": S3 } as const;
    const t0 = Date.now();

    // ── Checkpoint: pull last seen file key ─────────────────────────────
    const { data: ckpt } = await svc.from("connector_sync_checkpoints")
      .select("cursor_value").eq("connector_id", connector_id).eq("cursor_field", "s3_key").maybeSingle();
    const startAfter = ckpt?.cursor_value ?? undefined;

    // ── List objects ────────────────────────────────────────────────────
    const qp = new URLSearchParams({ "list-type": "2", prefix: cfg.prefix, "max-keys": String(cfg.max_files_per_run ?? 25) });
    if (startAfter) qp.set("start-after", startAfter);
    const listRes = await fetch(`${GW}/?${qp}`, { headers: hdr });
    if (!listRes.ok) {
      const msg = `S3 list ${listRes.status}: ${(await listRes.text()).slice(0, 300)}`;
      await recordFailure(svc, connector_id, msg);
      return json({ error: msg }, 502, cors);
    }
    const xml = await listRes.text();
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(x => x[1]).filter(k => k !== startAfter);
    const filePattern = new RegExp(cfg.file_pattern ?? "\\.(csv|json|jsonl)$", "i");
    const targets = keys.filter(k => filePattern.test(k));

    let totalRows = 0, totalInserted = 0;
    const errors: { file: string; reason: string }[] = [];
    let lastKey = startAfter ?? "";

    for (const key of targets) {
      try {
        const sign = await fetch(API, {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ object_path: key }),
        });
        if (!sign.ok) throw new Error(`sign ${sign.status}`);
        const { url } = await sign.json();
        const dl = await fetch(url);
        if (!dl.ok) throw new Error(`download ${dl.status}`);
        const text = await dl.text();
        const fmt = cfg.format ?? (key.endsWith(".jsonl") ? "jsonl" : key.endsWith(".json") ? "json" : "csv");
        const rows = parseFile(text, fmt).slice(0, cfg.max_rows_per_file ?? 50_000);
        totalRows += rows.length;

        const metrics: any[] = [];
        for (let i = 0; i < rows.length; i++) {
          try { metrics.push(rowToCanonicalMetric(rows[i], m.mapping)); }
          catch (e) { errors.push({ file: key, reason: `row ${i}: ${e instanceof Error ? e.message : String(e)}` }); }
        }
        const inserted = await upsertCanonicalMetrics(svc, {
          orgId: connector.organization_id, connectorId: connector_id, sourceType: "s3", metrics,
        });
        totalInserted += inserted;
        lastKey = key;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ file: key, reason: msg });
        await deadLetter(svc, { orgId: connector.organization_id, connectorId: connector_id, errorClass: "s3_object", payload: { key }, errorMessage: msg });
      }
    }

    if (lastKey && lastKey !== startAfter) {
      await svc.from("connector_sync_checkpoints").upsert({
        organization_id: connector.organization_id, connector_id, cursor_field: "s3_key",
        cursor_value: lastKey, updated_at: new Date().toISOString(),
      }, { onConflict: "connector_id,cursor_field" });
    }

    await recordSuccess(svc, connector_id);
    await svc.from("data_connectors").update({
      last_success_at: new Date().toISOString(), consecutive_failures: 0,
      health: errors.length ? "degraded" : "healthy",
    }).eq("id", connector_id);

    const duration_ms = Date.now() - t0;
    logConnectorEvent({
      connector_type: "s3", connector_id, organization_id: connector.organization_id, phase: "complete",
      rows_extracted: totalRows, rows_inserted: totalInserted, rows_failed: errors.length, duration_ms,
    });
    return json({
      success: true, files_processed: targets.length, rows_extracted: totalRows, rows_inserted: totalInserted,
      rows_invalid: errors.length, sample_errors: errors.slice(0, 5), duration_ms,
    }, 200, cors);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(JSON.stringify({ ts: new Date().toISOString(), connector_type: "s3", phase: "error", error: msg }));
    return json({ error: msg }, 500, cors);
  }
});

function parseFile(text: string, fmt: "csv" | "json" | "jsonl"): Record<string, unknown>[] {
  if (fmt === "json") {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [v];
  }
  if (fmt === "jsonl") {
    return text.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
  }
  // CSV (simple — no embedded quoted newlines)
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsv(lines[0]);
  return lines.slice(1).map(l => {
    const cells = splitCsv(l);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => obj[h] = cells[i]);
    return obj;
  });
}
function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function json(b: unknown, s: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
