/**
 * connector-sheets-pull
 *
 * Google Sheets connector using service account authentication. Reads a
 * user-specified range, derives canonical metrics, and persists them with the
 * same dataset-scoped identity used by every other ingestion path.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveConnectorCredentials } from "../_shared/connector-credentials.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const METRIC_CONFLICT_KEY = "organization_id,dataset_id,metric_type,date,region,segment,source_id";
const BATCH_SIZE = 500;

type MetricRow = {
  organization_id: string;
  dataset_id: string | null;
  source_type: string;
  source_id: string;
  quality_score: number;
  region: string;
  segment: string;
  metric_type: string;
  value: number;
  date: string;
};

function j(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function getServiceAccountToken(serviceAccountJson: string, scopes: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson) as { client_email?: string; private_key?: string };
  if (!sa.client_email || !sa.private_key) throw new Error("Service account JSON is missing client_email/private_key");

  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const claim = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: scopes,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const pem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "");
  const keyBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claim}.${sigB64}`,
  });
  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    throw new Error(`Google token error [${tokenRes.status}]: ${txt.slice(0, 300)}`);
  }
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("Google token response did not include access_token");
  return token.access_token;
}

function toSnakeCase(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function metricIdentity(row: MetricRow): string {
  return [
    row.organization_id,
    row.dataset_id ?? "",
    row.metric_type.trim().toLowerCase(),
    row.date,
    row.region.trim(),
    row.segment.trim(),
    row.source_id,
  ].join("\u001f");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return j({ error: "Connector service unavailable" }, 503, req);
  const svc = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const payload = await req.json().catch(() => ({})) as { connector_id?: string };
    const connectorId = payload.connector_id;
    if (!connectorId) return j({ error: "connector_id required" }, 400, req);

    const { data: connector, error: cErr } = await svc
      .from("data_connectors")
      .select("id,organization_id,dataset_id,data_source_id,config,status")
      .eq("id", connectorId)
      .single();
    if (cErr || !connector) return j({ error: "connector not found" }, 404, req);

    const orgId = connector.organization_id as string;
    const guard = await requireCronOrOrgMember(req, orgId);
    if (!guard.ok) return guard.response;

    let datasetId: string | null = connector.dataset_id ?? null;
    if (datasetId) {
      const { data: ownedDataset, error: datasetError } = await svc
        .from("datasets")
        .select("id")
        .eq("id", datasetId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (datasetError) return j({ error: "Dataset scope validation failed" }, 500, req);
      if (!ownedDataset?.id) return j({ error: "Connector dataset does not belong to this organization" }, 400, req);
      datasetId = ownedDataset.id;
    }

    const creds = await resolveConnectorCredentials(svc, connectorId);
    const cfg = (connector.config ?? {}) as Record<string, unknown>;
    const serviceAccountJson = creds.serviceAccountJson ?? creds.service_account_json;
    const spreadsheetId = creds.spreadsheetId ?? (typeof cfg.spreadsheetId === "string" ? cfg.spreadsheetId : undefined);
    const sheetRange = creds.sheetRange ?? (typeof cfg.sheetRange === "string" ? cfg.sheetRange : undefined) ?? "Sheet1!A:Z";

    if (!serviceAccountJson || !spreadsheetId) {
      return j({ error: "Google Sheets credentials incomplete: serviceAccountJson and spreadsheetId required" }, 412, req);
    }

    let token: string;
    try {
      token = await getServiceAccountToken(serviceAccountJson, "https://www.googleapis.com/auth/spreadsheets.readonly");
    } catch (e) {
      return j({ error: `Auth failed: ${e instanceof Error ? e.message : String(e)}` }, 401, req);
    }

    const encodedRange = encodeURIComponent(sheetRange);
    const sheetsRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!sheetsRes.ok) {
      const txt = await sheetsRes.text();
      return j({ error: `Sheets API error [${sheetsRes.status}]: ${txt.slice(0, 300)}` }, 502, req);
    }

    const sheetsData = await sheetsRes.json() as { values?: unknown[][] };
    const rows = sheetsData.values ?? [];
    if (rows.length < 2) {
      return j({ success: true, status: "no_data", records: 0, errors: ["Spreadsheet has no data rows"] }, 200, req);
    }

    const headers = (rows[0] as unknown[]).map((value) => toSnakeCase(String(value ?? "")));
    const dataRows = rows.slice(1);
    const firstDataRow = dataRows[0] || [];
    let dateColIdx = -1;
    const numericCols: { idx: number; name: string }[] = [];
    const dimensionCols: { idx: number; name: string }[] = [];

    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      const sampleVal = String(firstDataRow[i] ?? "");
      if (dateColIdx === -1 && (
        h.includes("date") || h.includes("period") || h.includes("month") || h.includes("year") ||
        parseDate(sampleVal) !== null
      )) {
        dateColIdx = i;
        continue;
      }
      const numVal = Number.parseFloat(sampleVal);
      if (Number.isFinite(numVal) && sampleVal !== "") numericCols.push({ idx: i, name: h || `metric_${i}` });
      else dimensionCols.push({ idx: i, name: h || `dimension_${i}` });
    }

    if (numericCols.length === 0) {
      return j({ success: false, status: "failed", records: 0, error: "No numeric metric columns detected" }, 400, req);
    }

    const now = new Date();
    const defaultDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const sourceId = connector.data_source_id ?? connectorId;
    const candidates: MetricRow[] = [];

    for (const row of dataRows) {
      let dateKey = defaultDateKey;
      if (dateColIdx >= 0 && row[dateColIdx]) {
        const d = parseDate(String(row[dateColIdx]));
        if (d) dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      }
      const segment = dimensionCols
        .map((dc) => String(row[dc.idx] ?? "").trim())
        .filter(Boolean)
        .join(" | ");

      for (const nc of numericCols) {
        const numVal = Number.parseFloat(String(row[nc.idx] ?? ""));
        if (!Number.isFinite(numVal)) continue;
        candidates.push({
          organization_id: orgId,
          dataset_id: datasetId,
          source_type: "connector",
          source_id: sourceId,
          quality_score: 85,
          region: "",
          segment,
          metric_type: nc.name,
          value: numVal,
          date: dateKey,
        });
      }
    }

    const deduped = new Map<string, MetricRow>();
    for (const row of candidates) deduped.set(metricIdentity(row), row);
    const metrics = Array.from(deduped.values());
    const errors: string[] = [];
    let persisted = 0;

    for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
      const batch = metrics.slice(i, i + BATCH_SIZE);
      const { error } = await svc.from("metrics").upsert(batch, {
        onConflict: METRIC_CONFLICT_KEY,
        ignoreDuplicates: false,
      });
      if (!error) {
        persisted += batch.length;
        continue;
      }

      // Isolate malformed rows instead of losing the full batch.
      for (const row of batch) {
        const { error: rowError } = await svc.from("metrics").upsert(row, { onConflict: METRIC_CONFLICT_KEY });
        if (rowError) errors.push(rowError.message);
        else persisted++;
      }
    }

    const status = persisted === 0 ? "failed" : errors.length > 0 ? "partial" : "active";
    const connectorPatch: Record<string, unknown> = {
      status,
      updated_at: now.toISOString(),
    };
    if (persisted > 0) connectorPatch.last_synced_at = now.toISOString();
    const { error: connectorUpdateError } = await svc
      .from("data_connectors")
      .update(connectorPatch)
      .eq("id", connectorId)
      .eq("organization_id", orgId);
    if (connectorUpdateError) errors.push(`Connector state update: ${connectorUpdateError.message}`);

    return j({
      success: persisted > 0,
      status,
      records: persisted,
      generated_records: candidates.length,
      unique_records: metrics.length,
      duplicates_collapsed: candidates.length - metrics.length,
      columns_detected: numericCols.map((c) => c.name),
      date_column: dateColIdx >= 0 ? headers[dateColIdx] : null,
      errors,
    }, persisted === 0 ? 500 : 200, req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return j({ error: msg }, 500, req);
  }
});
