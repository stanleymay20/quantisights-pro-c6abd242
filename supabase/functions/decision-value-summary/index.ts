import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { isValidUUID } from "../_shared/input-validation.ts";

type AttributionRow = {
  currency: string;
  modeled_cost: number | null;
  modeled_roi: number | null;
  verified_value_at_risk: number | null;
  realized_benefit: number | null;
  realized_cost: number | null;
  realized_net_value: number | null;
  attribution_status: "modeled" | "verified" | "measured";
  updated_at: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;

  let body: { organization_id?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.organization_id || !isValidUUID(body.organization_id)) {
    return json({ error: "Valid organization_id required" }, 400);
  }
  if (!(await verifyOrgMembership(auth.userId, body.organization_id))) {
    return json({ error: "Not a member" }, 403);
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await svc
    .from("decision_value_attributions")
    .select("currency,modeled_cost,modeled_roi,verified_value_at_risk,realized_benefit,realized_cost,realized_net_value,attribution_status,updated_at")
    .eq("organization_id", body.organization_id)
    .order("updated_at", { ascending: false })
    .limit(10000);

  if (error) return json({ error: "Decision value summary unavailable" }, 500);

  const rows = (data ?? []) as AttributionRow[];
  const totals = {
    decisions_attributed: rows.length,
    modeled_decisions: rows.filter((r) => r.attribution_status === "modeled").length,
    verified_decisions: rows.filter((r) => r.attribution_status === "verified").length,
    measured_decisions: rows.filter((r) => r.attribution_status === "measured").length,
  };
  const mature = totals.verified_decisions + totals.measured_decisions;

  const byCurrency = new Map<string, {
    currency: string;
    modeled_cost: number;
    modeled_roi: number;
    verified_value_at_risk: number;
    realized_benefit: number;
    realized_cost: number;
    realized_net_value: number;
    rows: number;
  }>();

  for (const row of rows) {
    const key = row.currency || "EUR";
    const current = byCurrency.get(key) ?? {
      currency: key,
      modeled_cost: 0,
      modeled_roi: 0,
      verified_value_at_risk: 0,
      realized_benefit: 0,
      realized_cost: 0,
      realized_net_value: 0,
      rows: 0,
    };
    current.modeled_cost += Number(row.modeled_cost ?? 0);
    current.modeled_roi += Number(row.modeled_roi ?? 0);
    current.verified_value_at_risk += Number(row.verified_value_at_risk ?? 0);
    current.realized_benefit += Number(row.realized_benefit ?? 0);
    current.realized_cost += Number(row.realized_cost ?? 0);
    current.realized_net_value += Number(row.realized_net_value ?? 0);
    current.rows += 1;
    byCurrency.set(key, current);
  }

  return json({
    organization_id: body.organization_id,
    ...totals,
    evidence_maturity_pct: rows.length ? Math.round((mature / rows.length) * 10000) / 100 : 0,
    currencies: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    latest_evidence_at: rows[0]?.updated_at ?? null,
    claim_policy: {
      modeled: "Scenario estimate only; not realised business value",
      verified: "Financial exposure/benefit backed by recorded evidence",
      measured: "Observed post-decision value backed by recorded evidence",
    },
  });
});
