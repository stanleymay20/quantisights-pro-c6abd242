// @ts-nocheck
/**
 * connector-sheets-pull
 *
 * Google Sheets connector using service account authentication.
 * Reads a user-specified spreadsheet range, auto-detects column types, and
 * maps numeric columns to canonical metrics.
 *
 * Column detection heuristics:
 *   - date/period column: first column whose values parse as dates
 *   - metric columns: any numeric column
 *   - dimension columns: remaining text columns → stored as segment/region
 *
 * Canonical metrics: derived from spreadsheet column names (snake_case).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveConnectorCredentials } from "../_shared/connector-credentials.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

function j(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function getServiceAccountToken(serviceAccountJson: string, scopes: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
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
  const keyBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(`${header}.${claim}`)
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
  return (await tokenRes.json()).access_token;
}

function toSnakeCase(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const { connector_id } = await req.json().catch(() => ({}));
    if (!connector_id) return j({ error: "connector_id required" }, 400, req);

    const { data: connector, error: cErr } = await svc
      .from("data_connectors").select("*").eq("id", connector_id).single();
    if (cErr || !connector) return j({ error: "connector not found" }, 404, req);

    const orgId = connector.organization_id;

    // Auth guard: this function writes directly to the metrics table using the
    // service role key, bypassing RLS. Without this check, anyone who learns or
    // guesses a connector_id could trigger a sync and have arbitrary spreadsheet
    // data written into another org's metrics. Allows either the scheduler's
    // cron secret or a verified user who is a member of the connector's org.
    const guard = await requireCronOrOrgMember(req, orgId);
    if (!guard.ok) return guard.response;

    const creds = await resolveConnectorCredentials(svc, connector_id);
    const cfg = connector.config ?? {};

    const serviceAccountJson = creds.serviceAccountJson ?? creds.service_account_json;
    const spreadsheetId = creds.spreadsheetId ?? cfg.spreadsheetId;
    const sheetRange = creds.sheetRange ?? cfg.sheetRange ?? "Sheet1!A:Z";

    if (!serviceAccountJson || !spreadsheetId) {
      return j({ error: "Google Sheets credentials incomplete: serviceAccountJson and spreadsheetId required" }, 412, req);
    }

    const errors: string[] = [];
    const metrics: any[] = [];
    const now = new Date();

    const baseFields = {
      organization_id: orgId,
      dataset_id: connector.dataset_id ?? null,
      source_type: "connector",
      source_id: connector.data_source_id ?? connector_id,
      quality_score: 85,
      region: "",
      segment: "",
    };

    // Get Google token
    let token: string;
    try {
      token = await getServiceAccountToken(serviceAccountJson, "https://www.googleapis.com/auth/spreadsheets.readonly");
    } catch (e) {
      return j({ error: `Auth failed: ${e instanceof Error ? e.message : String(e)}` }, 401, req);
    }

    // Fetch spreadsheet values
    const encodedRange = encodeURIComponent(sheetRange);
    const sheetsRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!sheetsRes.ok) {
      const txt = await sheetsRes.text();
      return j({ error: `Sheets API error [${sheetsRes.status}]: ${txt.slice(0, 300)}` }, 502, req);
    }

    const sheetsData = await sheetsRes.json();
    const rows: any[][] = sheetsData.values ?? [];

    if (rows.length < 2) {
      return j({ success: true, records: 0, errors: ["Spreadsheet has no data rows"] }, 200, req);
    }

    // First row = headers
    const headers = (rows[0] as string[]).map(toSnakeCase);
    const dataRows = rows.slice(1);

    // Detect column types
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

      const numVal = parseFloat(String(firstDataRow[i] ?? ""));
      if (!isNaN(numVal) && sampleVal !== "") {
        numericCols.push({ idx: i, name: h });
      } else {
        dimensionCols.push({ idx: i, name: h });
      }
    }

    if (dateColIdx === -1) {
      // No date column found — use current month for all rows
      dateColIdx = -1;
    }

    const defaultDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    for (const row of dataRows) {
      let dateKey = defaultDateKey;
      if (dateColIdx >= 0 && row[dateColIdx]) {
        const d = parseDate(String(row[dateColIdx]));
        if (d) {
          dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        }
      }

      // Build segment from dimension columns
      const segmentParts = dimensionCols
        .map(dc => String(row[dc.idx] ?? "").trim())
        .filter(v => v);
      const segment = segmentParts.join(" | ");

      for (const nc of numericCols) {
        const rawVal = row[nc.idx];
        const numVal = parseFloat(String(rawVal ?? ""));
        if (isNaN(numVal)) continue;

        metrics.push({
          ...baseFields,
          metric_type: nc.name,
          value: numVal,
          date: dateKey,
          segment: segment || "",
        });
      }
    }

    if (metrics.length > 0) {
      // Batch in groups of 500
      for (let i = 0; i < metrics.length; i += 500) {
        const batch = metrics.slice(i, i + 500);
        const { error: uErr } = await svc.from("metrics").upsert(batch, {
          onConflict: "organization_id,metric_type,date,region,segment,source_id",
          ignoreDuplicates: false,
        });
        if (uErr) errors.push(`DB upsert batch ${i}: ${uErr.message}`);
      }
    }

    await svc.from("data_connectors").update({
      status: errors.length === 0 ? "active" : "partial",
      last_synced_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq("id", connector_id);

    return j({
      success: true,
      records: metrics.length,
      columns_detected: numericCols.map(c => c.name),
      date_column: dateColIdx >= 0 ? headers[dateColIdx] : null,
      errors,
    }, 200, req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return j({ error: msg }, 500, req);
  }
});
