// Intervention Priority Engine
// Recomputes priority + escalation tier for open interventions and flags SLA breaches.
// Emits explicit diagnostics so empty pipelines reveal cause rather than appearing as success.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
};

const OPEN_STATUSES = ["proposed", "acknowledged", "assigned", "in_progress", "escalated"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const correlationId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const orgId: string | null = body.organization_id ?? null;

    // Total count (any status) for the org scope — used to explain zero-op outcomes.
    let totalQ = supabase
      .from("executive_interventions")
      .select("id, status", { count: "exact", head: true });
    if (orgId) totalQ = totalQ.eq("organization_id", orgId);
    const { count: total_count } = await totalQ;

    let q = supabase
      .from("executive_interventions")
      .select("id, organization_id, sla_due_at, status")
      .in("status", OPEN_STATUSES)
      .limit(500);
    if (orgId) q = q.eq("organization_id", orgId);

    const { data: rows, error } = await q;
    if (error) throw error;

    const open_interventions_count = (rows ?? []).length;
    const skipped_closed_count = Math.max(0, (total_count ?? 0) - open_interventions_count);
    let processed = 0;
    let escalated_count = 0;
    const now = Date.now();

    for (const row of rows ?? []) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (row.sla_due_at && new Date(row.sla_due_at).getTime() < now && row.status !== "escalated") {
        updates.status = "escalated";
        updates.escalation_tier = "executive";
        escalated_count += 1;
        await supabase.from("intervention_escalations").insert({
          intervention_id: row.id,
          organization_id: row.organization_id,
          escalated_to_tier: "executive",
          reason: "SLA breach (auto)",
          auto_triggered: true,
        });
      }
      await supabase.from("executive_interventions").update(updates).eq("id", row.id);
      processed += 1;
    }

    let no_op_reason: string | null = null;
    if (open_interventions_count === 0) {
      no_op_reason = (total_count ?? 0) === 0
        ? "no_interventions_exist_for_scope"
        : "all_interventions_closed_or_resolved";
    }

    return new Response(
      JSON.stringify({
        ok: true,
        correlation_id: correlationId,
        organization_id: orgId,
        open_interventions_count,
        skipped_closed_count,
        escalated_count,
        processed,
        total_count: total_count ?? 0,
        no_op_reason,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, correlation_id: correlationId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
