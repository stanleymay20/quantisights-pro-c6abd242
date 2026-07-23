/**
 * Intelligence Router
 * 
 * Routes intelligence items / briefs into actionable destinations:
 *  - decision (creates pending decision_ledger row)
 *  - task (creates execution_plan)
 *  - alert (writes notification stub)
 *  - approval (flag for owner)
 *  - owner_assignment (just records ownership)
 * 
 * Requires elevated role (owner/admin). Transitions item.status to 'routed'.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { isValidUUID } from "../_shared/input-validation.ts";

const VALID_ROUTES = ["decision", "task", "approval", "alert", "owner_assignment"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;

  let body: {
    organization_id: string;
    intelligence_item_id?: string;
    brief_id?: string;
    route_type: typeof VALID_ROUTES[number];
    owner_user_id?: string;
    reason?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!isValidUUID(body.organization_id)) return json({ error: "Invalid organization_id" }, 400);
  if (!VALID_ROUTES.includes(body.route_type)) return json({ error: "Invalid route_type" }, 400);
  if (!body.intelligence_item_id && !body.brief_id) return json({ error: "intelligence_item_id or brief_id required" }, 400);
  if (!(await verifyOrgMembership(auth.userId, body.organization_id))) return json({ error: "Not a member" }, 403);

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Elevated role check
  const { data: isElevated } = await svc.rpc("exec_require_elevated_role", {
    _user_id: auth.userId, _org_id: body.organization_id,
  });
  if (!isElevated) return json({ error: "Owner/admin required" }, 403);

  // Resolve source context
  let title = "Intelligence-triggered action";
  let severity = "medium";
  if (body.intelligence_item_id) {
    const { data: item } = await svc.from("aicis_intelligence_items")
      .select("title, summary, severity").eq("id", body.intelligence_item_id).maybeSingle();
    if (item) { title = item.title || item.summary || title; severity = item.severity; }
  } else if (body.brief_id) {
    const { data: brief } = await svc.from("intelligence_briefs")
      .select("title, summary, severity").eq("id", body.brief_id).maybeSingle();
    if (brief) { title = brief.title; severity = brief.severity; }
  }

  let targetTable: string | null = null;
  let targetId: string | null = null;

  // Create destination artifact
  if (body.route_type === "decision") {
    const { data: dec, error } = await svc.from("decision_ledger").insert({
      organization_id: body.organization_id,
      decision_type: "aicis_intelligence",
      decision_status: "pending",
      recommended_action: title,
      decision_origin: "aicis_intelligence",
      notes: `Auto-created from AICIS intelligence. Reason: ${body.reason || "n/a"}`,
      decided_by: body.owner_user_id ?? auth.userId,
    }).select("id").single();
    if (error) return json({ error: `Decision insert failed: ${error.message}` }, 500);
    targetTable = "decision_ledger"; targetId = dec.id;
  } else if (body.route_type === "task") {
    // execution_plans.decision_id is NOT NULL — create a shell decision to anchor the task.
    const { data: shellDec, error: shellErr } = await svc.from("decision_ledger").insert({
      organization_id: body.organization_id,
      decision_type: "aicis_intelligence",
      decision_status: "approved",
      recommended_action: title,
      decision_origin: "aicis_intelligence",
      notes: `Task anchor decision. Reason: ${body.reason || "n/a"}`,
      decided_by: body.owner_user_id ?? auth.userId,
      decided_at: new Date().toISOString(),
    }).select("id").single();
    if (shellErr) return json({ error: `Task anchor decision failed: ${shellErr.message}` }, 500);

    const { data: plan, error } = await svc.from("execution_plans").insert({
      organization_id: body.organization_id,
      decision_id: shellDec.id,
      action_title: title,
      action_description: `Auto-created from AICIS intelligence. ${body.reason || ""}`,
      status: "pending",
      priority: severity === "critical" ? "critical" : severity === "high" ? "high" : "medium",
      owner_user_id: body.owner_user_id ?? null,
      trigger_type: "manual",
    }).select("id").single();
    if (error) return json({ error: `Plan insert failed: ${error.message}` }, 500);
    targetTable = "execution_plans"; targetId = plan.id;
  }
  // alert / approval / owner_assignment: no additional artifact, just route + audit

  const { data: route, error: routeErr } = await svc.from("intelligence_routes").insert({
    organization_id: body.organization_id,
    intelligence_item_id: body.intelligence_item_id ?? null,
    brief_id: body.brief_id ?? null,
    route_type: body.route_type,
    target_table: targetTable,
    target_id: targetId,
    owner_user_id: body.owner_user_id ?? null,
    routed_by: auth.userId,
    reason: body.reason ?? null,
  }).select("id").single();

  if (routeErr) return json({ error: routeErr.message }, 500);

  // Transition item(s)
  if (body.intelligence_item_id) {
    await svc.from("aicis_intelligence_items").update({ status: "routed" }).eq("id", body.intelligence_item_id);
  } else if (body.brief_id) {
    const { data: brief } = await svc.from("intelligence_briefs").select("item_ids").eq("id", body.brief_id).maybeSingle();
    if (brief?.item_ids?.length) {
      await svc.from("aicis_intelligence_items").update({ status: "routed" }).in("id", brief.item_ids);
    }
  }

  // Update observability conversion counter
  if (body.route_type === "decision") {
    const today = new Date().toISOString().slice(0, 10);
    const { data: obs } = await svc.from("intelligence_observability")
      .select("imports_total, items_to_decisions")
      .eq("organization_id", body.organization_id).eq("day", today).maybeSingle();
    if (obs) {
      const newCount = obs.items_to_decisions + 1;
      await svc.from("intelligence_observability").update({
        items_to_decisions: newCount,
        conversion_rate: obs.imports_total > 0 ? Math.round((newCount / obs.imports_total) * 1000) / 10 : 0,
        updated_at: new Date().toISOString(),
      }).eq("organization_id", body.organization_id).eq("day", today);
    }
  }

  return json({ route_id: route.id, target_table: targetTable, target_id: targetId });
});
