/**
 * Intelligence Brief Generator
 * 
 * Clusters recently scored items by (domain, geography window, 24h) and produces
 * an executive brief with summary, why-it-matters, affected areas, recommended actions.
 * Updates clusters + transitions items to status='briefed'.
 * 
 * LLM (Lovable AI Gateway, google/gemini-2.5-flash) used ONLY for narrative text,
 * confidence capped at 85%, deterministic cluster keys + structure.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { isValidUUID } from "../_shared/input-validation.ts";

interface ScoredItem {
  id: string;
  severity: string;
  urgency: string;
  domain: string | null;
  geography: string[];
  entities: unknown[];
  title: string | null;
  summary: string | null;
  ingested_at: string;
  global_criticality_score: number;
  intelligence_relevance_scores?: { decision_pressure_score: number; business_impact_score: number } | null;
}

function clusterKey(it: ScoredItem): string {
  const geo = (it.geography || []).slice().sort().join("|") || "global";
  return `${(it.domain || "general").toLowerCase()}::${geo}`;
}

async function llmSummary(items: ScoredItem[]): Promise<{ title: string; summary: string; why: string; actions: Array<{ label: string; value: string }> }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const fallback = () => {
    const sample = items.slice(0, 3).map((i) => i.title || i.summary || i.domain).filter(Boolean).join("; ");
    return {
      title: `Intelligence cluster: ${items[0]?.domain || "multi-domain"} (${items.length} signals)`,
      summary: `Cluster size: ${items.length}. Geographies: ${[...new Set(items.flatMap((i) => i.geography || []))].slice(0, 6).join(", ") || "n/a"}. Sample: ${sample}`,
      why: `Decision-pressure aggregate: ${Math.round(items.reduce((s, i) => s + (i.intelligence_relevance_scores?.decision_pressure_score || 0), 0) / Math.max(items.length, 1))}/100. Severity distribution: ${["low","medium","high","critical"].map(s=>`${s}=${items.filter(i=>i.severity===s).length}`).join(" ")}.`,
      actions: [
        { label: "Review", value: "Triage cluster in inbox" },
        { label: "Route", value: "Convert top signal into decision if pressure ≥ 60" },
      ],
    };
  };

  if (!apiKey) return fallback();

  try {
    const prompt = `You are an enterprise risk analyst. Summarize this intelligence cluster strictly as JSON.
Items:
${items.slice(0, 20).map((i, n) => `${n + 1}. [${i.severity}/${i.urgency}] ${i.title || i.summary || "(no title)"} — ${i.domain || "?"} — geo=${(i.geography || []).join(",")}`).join("\n")}

Return JSON: {"title": "...", "summary": "...", "why": "...", "actions": [{"label":"...","value":"..."}, ...]}
Use the "Label: value" anchored style. Do not invent metrics. Be terse.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return fallback();
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    return {
      title: String(parsed.title || "Intelligence cluster").slice(0, 200),
      summary: String(parsed.summary || "").slice(0, 1000),
      why: String(parsed.why || "").slice(0, 800),
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 6) : [],
    };
  } catch {
    return fallback();
  }
}

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

  // Pull scored items from last 24h not yet briefed
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: items, error } = await svc
    .from("aicis_intelligence_items")
    .select("id, severity, urgency, domain, geography, entities, title, summary, ingested_at, global_criticality_score, intelligence_relevance_scores(decision_pressure_score, business_impact_score)")
    .eq("organization_id", body.organization_id)
    .eq("status", "scored")
    .gte("ingested_at", since)
    .order("ingested_at", { ascending: false })
    .limit(500);

  if (error) return json({ error: error.message }, 500);
  if (!items || items.length === 0) return json({ briefs_generated: 0, message: "No scored items" });

  // Cluster
  const groups = new Map<string, ScoredItem[]>();
  for (const it of items as unknown as ScoredItem[]) {
    const k = clusterKey(it);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }

  let briefsCreated = 0;
  let clustersUpserted = 0;

  for (const [key, group] of groups) {
    if (group.length === 0) continue;

    // Determine cluster severity from worst item
    const severityRank = { low: 1, medium: 2, high: 3, critical: 4 } as const;
    const worst = group.reduce((a, b) =>
      (severityRank[a.severity as keyof typeof severityRank] ?? 0) >= (severityRank[b.severity as keyof typeof severityRank] ?? 0) ? a : b
    );

    // Upsert cluster
    const { data: clusterRow } = await svc
      .from("intelligence_clusters")
      .upsert({
        organization_id: body.organization_id,
        cluster_key: key,
        related_item_ids: group.map((g) => g.id),
        source_count: group.length,
        trend_strength: Math.min(1, group.length / 10),
        escalation_velocity: group.length / 24,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "organization_id,cluster_key" })
      .select("id")
      .single();
    clustersUpserted++;

    const narrative = await llmSummary(group);

    const { data: briefRow, error: briefErr } = await svc.from("intelligence_briefs").insert({
      organization_id: body.organization_id,
      cluster_id: clusterRow?.id ?? null,
      title: narrative.title,
      summary: narrative.summary,
      why_it_matters: narrative.why,
      affected_areas: [...new Set(group.flatMap((g) => g.geography || []))].slice(0, 10),
      recommended_actions: narrative.actions,
      severity: worst.severity,
      item_ids: group.map((g) => g.id),
      confidence: 70,
    }).select("id").single();

    if (!briefErr && briefRow) {
      briefsCreated++;
      // Transition items
      await svc.from("aicis_intelligence_items")
        .update({ status: "briefed", cluster_id: clusterRow?.id ?? null })
        .in("id", group.map((g) => g.id));
    }
  }

  return json({ briefs_generated: briefsCreated, clusters_upserted: clustersUpserted, items_processed: items.length });
});
