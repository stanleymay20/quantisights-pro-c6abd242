/**
 * Intelligence Consumption Test Harness (admin-only, non-production)
 *
 * Actions (POST { organization_id, action }):
 *  - seed     : create [TEST] batch, 3 items, scores, brief, advisory, route+decision
 *  - resolve  : mark the test decision completed (triggers memory writeback)
 *  - verify   : report current state of the harness chain
 *  - cleanup  : delete every record where test_mode marker is present
 *  - full     : seed → resolve → verify → cleanup (single round-trip report)
 *
 * Test markers:
 *  - aicis_export_batches.batch_ref starts with "TEST-"
 *  - aicis_intelligence_items.payload.test_mode = true AND title starts with "[TEST]"
 *  - intelligence_briefs.title starts with "[TEST]"
 *  - intelligence_advisories.title starts with "[TEST]"
 *  - intelligence_routes.reason starts with "test_harness"
 *  - decision_ledger.notes starts with "[TEST]"
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { isValidUUID } from "../_shared/input-validation.ts";

type Action = "seed" | "resolve" | "verify" | "cleanup" | "full";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d, null, 2), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;

  let body: { organization_id: string; action: Action };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!isValidUUID(body.organization_id)) return json({ error: "Invalid organization_id" }, 400);
  if (!["seed", "resolve", "verify", "cleanup", "full"].includes(body.action))
    return json({ error: "Invalid action" }, 400);
  if (!(await verifyOrgMembership(auth.userId, body.organization_id)))
    return json({ error: "Not a member" }, 403);

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Elevated-role gate
  const { data: isElevated } = await svc.rpc("exec_require_elevated_role", {
    _user_id: auth.userId, _org_id: body.organization_id,
  });
  if (!isElevated) return json({ error: "Owner/admin required" }, 403);

  const org = body.organization_id;
  const report: Record<string, unknown> = { action: body.action, organization_id: org };

  const seed = async () => {
    const batchRef = `TEST-${Date.now()}`;
    const { data: batch, error: bErr } = await svc.from("aicis_export_batches").insert({
      organization_id: org,
      batch_ref: batchRef,
      source: "manual",
      schema_version: "1.0",
      item_count: 3,
      status: "completed",
      completed_at: new Date().toISOString(),
      processing_ms: 1,
    }).select("id, batch_ref").single();
    if (bErr) throw new Error(`batch: ${bErr.message}`);

    const severities = ["medium", "high", "critical"];
    const urgencies = ["normal", "high", "immediate"];
    const items: Array<{ id: string }> = [];
    for (let i = 0; i < 3; i++) {
      const hash = `test-${batchRef}-${i}`;
      const { data: item, error } = await svc.from("aicis_intelligence_items").insert({
        organization_id: org,
        export_batch_id: batch.id,
        source_surface: "test.signal",
        source_ref: hash,
        content_hash: hash,
        severity: severities[i],
        urgency: urgencies[i],
        domain: "test_harness",
        geography: ["XX"],
        entities: [{ name: "TestEntity" }],
        payload: { test_mode: true, idx: i },
        title: `[TEST] Synthetic intelligence #${i + 1}`,
        summary: `Synthetic test item ${i + 1} from harness ${batchRef}`,
        global_criticality_score: 40 + i * 20,
        occurred_at: new Date().toISOString(),
        status: "new",
      }).select("id").single();
      if (error) throw new Error(`item ${i}: ${error.message}`);
      items.push(item);
    }

    // Scores
    for (const it of items) {
      await svc.from("intelligence_relevance_scores").insert({
        organization_id: org,
        intelligence_item_id: it.id,
        organization_relevance_score: 70,
        business_impact_score: 65,
        operational_urgency_score: 60,
        decision_pressure_score: 72,
        factors: { test_mode: true },
      });
      await svc.from("aicis_intelligence_items").update({ status: "scored" }).eq("id", it.id);
    }

    // Brief
    const { data: brief, error: brErr } = await svc.from("intelligence_briefs").insert({
      organization_id: org,
      title: "[TEST] Harness convergence brief",
      summary: "Three synthetic test items converged.",
      why_it_matters: "Verifies brief generation path.",
      affected_areas: ["test"],
      recommended_actions: [{ label: "Action", value: "Verify routing" }],
      severity: "high",
      item_ids: items.map((i) => i.id),
      confidence: 70,
    }).select("id").single();
    if (brErr) throw new Error(`brief: ${brErr.message}`);
    await svc.from("aicis_intelligence_items").update({ status: "briefed" }).in("id", items.map((i) => i.id));

    // Advisory
    const { data: advisory, error: aErr } = await svc.from("intelligence_advisories").insert({
      organization_id: org,
      brief_id: brief.id,
      kind: "operational",
      title: "[TEST] Operational advisory from harness",
      body: "Verifies advisory engine path.",
      rationale: { test_mode: true },
      confidence: 70,
    }).select("id").single();
    if (aErr) throw new Error(`advisory: ${aErr.message}`);
    await svc.from("aicis_intelligence_items").update({ status: "advised" }).in("id", items.map((i) => i.id));

    // Decision + route (use the first item as primary)
    const primaryItem = items[0].id;
    const { data: dec, error: dErr } = await svc.from("decision_ledger").insert({
      organization_id: org,
      decision_type: "aicis_intelligence",
      decision_status: "pending",
      execution_status: "not_started",
      recommended_action: "[TEST] Harness verification action",
      decision_origin: "aicis_intelligence",
      notes: `[TEST] Created by intelligence-test-harness for batch ${batchRef}`,
      decided_by: auth.userId,
    }).select("id").single();
    if (dErr) throw new Error(`decision: ${dErr.message}`);

    const { data: route, error: rErr } = await svc.from("intelligence_routes").insert({
      organization_id: org,
      intelligence_item_id: primaryItem,
      brief_id: brief.id,
      route_type: "decision",
      target_table: "decision_ledger",
      target_id: dec.id,
      routed_by: auth.userId,
      reason: "test_harness seed",
    }).select("id").single();
    if (rErr) throw new Error(`route: ${rErr.message}`);

    await svc.from("aicis_intelligence_items").update({ status: "routed" }).in("id", items.map((i) => i.id));

    // Observability bump
    const today = new Date().toISOString().slice(0, 10);
    await svc.from("intelligence_observability").upsert({
      organization_id: org,
      day: today,
      imports_total: 3,
      items_to_decisions: 1,
      conversion_rate: 33.3,
    }, { onConflict: "organization_id,day" });

    return {
      batch_id: batch.id,
      batch_ref: batch.batch_ref,
      item_ids: items.map((i) => i.id),
      brief_id: brief.id,
      advisory_id: advisory.id,
      route_id: route.id,
      decision_id: dec.id,
    };
  };

  const resolve = async () => {
    // Resolve most recent [TEST] decision routed by harness
    const { data: route } = await svc.from("intelligence_routes")
      .select("id, target_id, intelligence_item_id")
      .eq("organization_id", org)
      .eq("target_table", "decision_ledger")
      .ilike("reason", "test_harness%")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!route?.target_id) return { resolved: false, reason: "No test route found" };

    const { error } = await svc.from("decision_ledger").update({
      decision_status: "approved",
      execution_status: "completed",
      execution_completed_at: new Date().toISOString(),
      outcome_measured_at: new Date().toISOString(),
      outcome_delta: 10,
      chosen_action: "[TEST] Executed",
    }).eq("id", route.target_id);
    if (error) return { resolved: false, error: error.message };

    // Give the trigger a tick
    await new Promise((r) => setTimeout(r, 200));
    return { resolved: true, decision_id: route.target_id, route_id: route.id, intelligence_item_id: route.intelligence_item_id };
  };

  const verify = async () => {
    const [batches, items, scores, briefs, advisories, routes, memory, decisions, obs] = await Promise.all([
      svc.from("aicis_export_batches").select("id, batch_ref", { count: "exact" }).eq("organization_id", org).ilike("batch_ref", "TEST-%"),
      svc.from("aicis_intelligence_items").select("id, status, title", { count: "exact" }).eq("organization_id", org).ilike("title", "[TEST]%"),
      svc.from("intelligence_relevance_scores").select("intelligence_item_id", { count: "exact" }).eq("organization_id", org).contains("factors", { test_mode: true }),
      svc.from("intelligence_briefs").select("id", { count: "exact" }).eq("organization_id", org).ilike("title", "[TEST]%"),
      svc.from("intelligence_advisories").select("id", { count: "exact" }).eq("organization_id", org).ilike("title", "[TEST]%"),
      svc.from("intelligence_routes").select("id, target_id, intelligence_item_id", { count: "exact" }).eq("organization_id", org).ilike("reason", "test_harness%"),
      svc.from("intelligence_memory").select("id, effectiveness_rating, observed_outcome, intelligence_item_id, route_id").eq("organization_id", org).ilike("attribution_notes", "Auto-recorded from decision%"),
      svc.from("decision_ledger").select("id, decision_status, execution_status, outcome_delta").eq("organization_id", org).ilike("notes", "[TEST]%"),
      svc.from("intelligence_observability").select("imports_total, items_to_decisions, conversion_rate, day").eq("organization_id", org).eq("day", new Date().toISOString().slice(0, 10)).maybeSingle(),
    ]);

    const testItemIds = (items.data || []).map((i) => i.id);
    const memForTest = (memory.data || []).filter((m) => testItemIds.includes(m.intelligence_item_id as string));
    const resolvedItems = (items.data || []).filter((i) => i.status === "resolved").length;

    return {
      batches: batches.count ?? 0,
      items: items.count ?? 0,
      items_resolved: resolvedItems,
      scores: scores.count ?? 0,
      briefs: briefs.count ?? 0,
      advisories: advisories.count ?? 0,
      routes: routes.count ?? 0,
      decisions: (decisions.data || []).length,
      decision_states: (decisions.data || []).map((d) => ({ id: d.id, decision_status: d.decision_status, execution_status: d.execution_status, outcome_delta: d.outcome_delta })),
      memory_rows: memForTest.length,
      memory_sample: memForTest[0] ?? null,
      observability_today: obs.data ?? null,
    };
  };

  const cleanup = async () => {
    // Order matters: memory + routes first (FK to decisions/items), then decisions, advisories, briefs, scores+items (cascade), batches
    const { data: routes } = await svc.from("intelligence_routes").select("id, target_id, intelligence_item_id")
      .eq("organization_id", org).ilike("reason", "test_harness%");
    const routeIds = (routes || []).map((r) => r.id);
    const decisionIds = (routes || []).map((r) => r.target_id).filter(Boolean) as string[];

    const memDel = await svc.from("intelligence_memory").delete({ count: "exact" }).eq("organization_id", org)
      .in("route_id", routeIds.length ? routeIds : ["00000000-0000-0000-0000-000000000000"]);
    const routeDel = await svc.from("intelligence_routes").delete({ count: "exact" }).eq("organization_id", org).ilike("reason", "test_harness%");
    const decDel = decisionIds.length
      ? await svc.from("decision_ledger").delete({ count: "exact" }).eq("organization_id", org).in("id", decisionIds)
      : { count: 0 };
    const advDel = await svc.from("intelligence_advisories").delete({ count: "exact" }).eq("organization_id", org).ilike("title", "[TEST]%");
    const briefDel = await svc.from("intelligence_briefs").delete({ count: "exact" }).eq("organization_id", org).ilike("title", "[TEST]%");
    // scores cascade with items; explicitly delete items (which cascades to scores/feedback/memory leftovers)
    const itemDel = await svc.from("aicis_intelligence_items").delete({ count: "exact" }).eq("organization_id", org).ilike("title", "[TEST]%");
    const batchDel = await svc.from("aicis_export_batches").delete({ count: "exact" }).eq("organization_id", org).ilike("batch_ref", "TEST-%");

    return {
      memory_deleted: memDel.count ?? 0,
      routes_deleted: routeDel.count ?? 0,
      decisions_deleted: decDel.count ?? 0,
      advisories_deleted: advDel.count ?? 0,
      briefs_deleted: briefDel.count ?? 0,
      items_deleted: itemDel.count ?? 0,
      batches_deleted: batchDel.count ?? 0,
    };
  };

  try {
    if (body.action === "seed") report.seed = await seed();
    else if (body.action === "resolve") report.resolve = await resolve();
    else if (body.action === "verify") report.verify = await verify();
    else if (body.action === "cleanup") report.cleanup = await cleanup();
    else if (body.action === "full") {
      report.seed = await seed();
      report.resolve = await resolve();
      report.verify = await verify();
      report.cleanup = await cleanup();
      report.post_cleanup_verify = await verify();
    }
    return json({ ok: true, ...report });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message, ...report }, 500);
  }
});
