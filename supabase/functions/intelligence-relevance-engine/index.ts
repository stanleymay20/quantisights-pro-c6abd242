/**
 * Intelligence Relevance Engine
 * 
 * For each unscored intelligence item, compute 4 deterministic scores:
 *  - organization_relevance_score (industry/geography/entities overlap)
 *  - business_impact_score (severity × affected entities × geo overlap)
 *  - operational_urgency_score (urgency × recency)
 *  - decision_pressure_score = severity × urgency × exposure × uncertainty (normalized 0-100)
 * 
 * Also transitions item.status: new → scored.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { isValidUUID } from "../_shared/input-validation.ts";

const SEVERITY_WEIGHT: Record<string, number> = { low: 25, medium: 50, high: 75, critical: 100 };
const URGENCY_WEIGHT: Record<string, number> = { low: 20, normal: 45, high: 75, immediate: 100 };

interface OrgProfile {
  industry?: string;
  watched_entities?: string[];
  geography?: string[];
  suppliers?: string[];
}

function arrayOverlap(a: string[] = [], b: string[] = []): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b.map((s) => s.toLowerCase()));
  const hits = a.filter((s) => sb.has(s.toLowerCase())).length;
  return hits / a.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;

  let body: { organization_id: string; limit?: number };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!isValidUUID(body.organization_id)) return json({ error: "Invalid organization_id" }, 400);
  if (!(await verifyOrgMembership(auth.userId, body.organization_id))) return json({ error: "Not a member" }, 403);

  const limit = Math.min(body.limit ?? 200, 500);
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Fetch org identity profile (best-effort)
  const { data: identity } = await svc
    .from("organizational_identity")
    .select("industry_context, strategic_priorities, key_stakeholders")
    .eq("organization_id", body.organization_id)
    .maybeSingle();

  const stakeholders = Array.isArray(identity?.key_stakeholders) ? (identity!.key_stakeholders as Array<{ name?: string } | string>) : [];
  const watched = stakeholders.map((s) => typeof s === "string" ? s : s?.name).filter(Boolean) as string[];
  const profile: OrgProfile = {
    industry: identity?.industry_context ?? undefined,
    watched_entities: watched,
    geography: [],
    suppliers: [],
  };

  // Fetch unscored items (status = new)
  const { data: items, error } = await svc
    .from("aicis_intelligence_items")
    .select("id, severity, urgency, domain, geography, entities, ingested_at, global_criticality_score, occurred_at")
    .eq("organization_id", body.organization_id)
    .eq("status", "new")
    .order("ingested_at", { ascending: false })
    .limit(limit);

  if (error) return json({ error: error.message }, 500);
  if (!items || items.length === 0) return json({ scored: 0, message: "No new items" });

  let scored = 0;
  for (const it of items) {
    const sev = SEVERITY_WEIGHT[it.severity] ?? 50;
    const urg = URGENCY_WEIGHT[it.urgency] ?? 45;
    const geoOverlap = arrayOverlap(it.geography || [], profile.geography || []);
    const entityNames = ((it.entities as Array<{ name?: string }>) || []).map((e) => e?.name).filter(Boolean) as string[];
    const watchedOverlap = arrayOverlap(entityNames, [...(profile.watched_entities || []), ...(profile.suppliers || [])]);

    const industryMatch = profile.industry && it.domain && it.domain.toLowerCase().includes(profile.industry.toLowerCase()) ? 1 : 0;

    // Organization relevance: weighted overlap signals + global criticality floor
    const orgRel = Math.min(100, Math.round(
      geoOverlap * 35 + watchedOverlap * 40 + industryMatch * 25 + (it.global_criticality_score || 0) * 0.3
    ));

    // Business impact: severity × (geo+entity exposure) — but global criticality floors it
    const exposure = Math.max(0.2, geoOverlap * 0.5 + watchedOverlap * 0.5);
    const businessImpact = Math.min(100, Math.round(Math.max(sev * exposure, it.global_criticality_score || 0)));

    // Operational urgency: decays with hours since occurrence
    const occurredMs = it.occurred_at ? new Date(it.occurred_at).getTime() : new Date(it.ingested_at).getTime();
    const hoursSince = Math.max(0, (Date.now() - occurredMs) / 36e5);
    const recencyFactor = Math.max(0.3, 1 - Math.min(hoursSince / 168, 0.7));
    const opUrgency = Math.min(100, Math.round(urg * recencyFactor));

    // Decision pressure = severity × urgency × exposure × uncertainty (uncertainty inverse of confidence proxy)
    const uncertainty = 0.4 + (1 - exposure) * 0.4; // 0.4–0.8
    const pressureRaw = (sev / 100) * (urg / 100) * Math.max(exposure, 0.3) * uncertainty * 100;
    const decisionPressure = Math.min(100, Math.round(pressureRaw * 1.5)); // scale into useful range

    const { error: insErr } = await svc.from("intelligence_relevance_scores").upsert({
      organization_id: body.organization_id,
      intelligence_item_id: it.id,
      organization_relevance_score: orgRel,
      business_impact_score: businessImpact,
      operational_urgency_score: opUrgency,
      decision_pressure_score: decisionPressure,
      factors: { geoOverlap, watchedOverlap, industryMatch, exposure, uncertainty, hoursSince },
    }, { onConflict: "intelligence_item_id" });

    if (!insErr) {
      await svc.from("aicis_intelligence_items").update({ status: "scored" }).eq("id", it.id);
      scored++;
    }
  }

  return json({ scored, examined: items.length });
});
