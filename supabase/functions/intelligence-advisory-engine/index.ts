/**
 * Intelligence Advisory Engine
 * 
 * For each brief without advisories, emit deterministic advisories:
 *  - operational (severity >= medium)
 *  - risk_mitigation (any global criticality > 50 OR decision pressure > 60)
 *  - escalation (severity = critical OR urgency = immediate)
 *  - strategic (cluster size >= 5)
 * 
 * Transitions associated items from 'briefed' → 'advised'.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { isValidUUID } from "../_shared/input-validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;

  let body: { organization_id: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!isValidUUID(body.organization_id)) return json({ error: "Invalid organization_id" }, 400);
  if (!(await verifyOrgMembership(auth.userId, body.organization_id))) return json({ error: "Not a member" }, 403);

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Briefs with no advisories yet (last 7 days)
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const { data: briefs, error } = await svc
    .from("intelligence_briefs")
    .select("id, title, summary, severity, item_ids, generated_at")
    .eq("organization_id", body.organization_id)
    .gte("generated_at", since)
    .order("generated_at", { ascending: false })
    .limit(50);

  if (error) return json({ error: error.message }, 500);
  if (!briefs || briefs.length === 0) return json({ advisories_created: 0, message: "No recent briefs" });

  let created = 0;
  for (const b of briefs) {
    // Skip if already advised
    const { count } = await svc.from("intelligence_advisories")
      .select("id", { count: "exact", head: true })
      .eq("brief_id", b.id);
    if ((count ?? 0) > 0) continue;

    // Fetch items + scores for rule evaluation
    const { data: items } = await svc
      .from("aicis_intelligence_items")
      .select("id, severity, urgency, global_criticality_score, intelligence_relevance_scores(decision_pressure_score, business_impact_score)")
      .in("id", b.item_ids || []);

    const maxPressure = Math.max(0, ...(items || []).map((i: any) => i.intelligence_relevance_scores?.decision_pressure_score ?? 0));
    const maxCrit = Math.max(0, ...(items || []).map((i: any) => i.global_criticality_score ?? 0));
    const hasCritical = (items || []).some((i: any) => i.severity === "critical" || i.urgency === "immediate");

    const advisories: Array<{ kind: string; title: string; body: string; rationale: Record<string, unknown> }> = [];

    if (b.severity !== "low") {
      advisories.push({
        kind: "operational",
        title: `Operational response: ${b.title}`,
        body: `Severity: ${b.severity}. Recommend assigning an owner and reviewing affected operations within 48h.`,
        rationale: { trigger: "severity>=medium" },
      });
    }
    if (maxCrit > 50 || maxPressure > 60) {
      advisories.push({
        kind: "risk_mitigation",
        title: `Risk mitigation required (pressure=${maxPressure}, criticality=${maxCrit})`,
        body: `Decision pressure: ${maxPressure}/100. Global criticality: ${maxCrit}/100. Initiate contingency plan and stakeholder alignment.`,
        rationale: { maxPressure, maxCrit },
      });
    }
    if (hasCritical) {
      advisories.push({
        kind: "escalation",
        title: `Escalate to executive review`,
        body: `One or more items are critical/immediate. Escalate to executive sponsor with 24h SLA.`,
        rationale: { trigger: "critical_or_immediate" },
      });
    }
    if ((b.item_ids || []).length >= 5) {
      advisories.push({
        kind: "strategic",
        title: `Strategic pattern detected — ${(b.item_ids || []).length} converging signals`,
        body: `Cluster size exceeds threshold. Recommend strategic-planning review for systemic implications.`,
        rationale: { cluster_size: (b.item_ids || []).length },
      });
    }

    for (const a of advisories) {
      await svc.from("intelligence_advisories").insert({
        organization_id: body.organization_id,
        brief_id: b.id,
        kind: a.kind,
        title: a.title,
        body: a.body,
        rationale: a.rationale,
        confidence: 70,
      });
      created++;
    }

    if (advisories.length > 0 && (b.item_ids || []).length > 0) {
      await svc.from("aicis_intelligence_items")
        .update({ status: "advised" })
        .in("id", b.item_ids)
        .eq("status", "briefed");
    }
  }

  return json({ advisories_created: created, briefs_examined: briefs.length });
});
