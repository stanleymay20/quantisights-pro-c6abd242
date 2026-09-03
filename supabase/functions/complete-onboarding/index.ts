import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { grantPilotAccess, PILOT_DAYS, PILOT_TIER } from "../_shared/pilot-access.ts";

const INDUSTRY_WEIGHTS: Record<string, Record<string, number>> = {
  saas:          { ceo: 30, cfo: 35, cmo: 40, coo: 20 },
  manufacturing: { ceo: 35, cfo: 45, cmo: 25, coo: 50 },
  retail:        { ceo: 35, cfo: 40, cmo: 45, coo: 35 },
  finance:       { ceo: 40, cfo: 50, cmo: 25, coo: 30 },
  healthcare:    { ceo: 45, cfo: 50, cmo: 20, coo: 40 },
  consulting:    { ceo: 30, cfo: 35, cmo: 35, coo: 30 },
  other:         { ceo: 35, cfo: 40, cmo: 30, coo: 25 },
};

const SIZE_ADJUSTMENTS: Record<string, number> = {
  "1-10": -5,
  "11-50": 0,
  "51-200": 3,
  "201-1000": 6,
  "1000+": 10,
};

const REVENUE_ADJUSTMENTS: Record<string, Record<string, number>> = {
  "pre-revenue": { ceo: 10, cfo: -5, cmo: 5, coo: -3 },
  "0-1m":        { ceo: 5,  cfo: 0,  cmo: 3, coo: 0 },
  "1-10m":       { ceo: 0,  cfo: 3,  cmo: 0, coo: 2 },
  "10-50m":      { ceo: -2, cfo: 5,  cmo: -2, coo: 5 },
  "50-100m":     { ceo: -3, cfo: 8,  cmo: -3, coo: 8 },
  "100m+":       { ceo: -5, cfo: 10, cmo: -5, coo: 10 },
};

const ALLOWED_ROLES = new Set(["ceo", "cfo", "cmo", "coo"]);

function computeBaseScore(role: string, industry: string, sizeBand: string, revenueBand: string): number {
  const industryBase = INDUSTRY_WEIGHTS[industry]?.[role] ?? INDUSTRY_WEIGHTS.other[role] ?? 30;
  const sizeAdj = SIZE_ADJUSTMENTS[sizeBand] ?? 0;
  const revenueAdj = REVENUE_ADJUSTMENTS[revenueBand]?.[role] ?? 0;
  return Math.max(5, Math.min(80, industryBase + sizeAdj + revenueAdj));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Onboarding runtime configuration is unavailable" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const organizationId = typeof body?.organization_id === "string" ? body.organization_id : "";
    const rawRoles = Array.isArray(body?.roles) ? body.roles : ["ceo", "cfo", "cmo", "coo"];
    const kpiTemplateId = typeof body?.kpi_template_id === "string" && body.kpi_template_id ? body.kpi_template_id : null;
    const startPilot = body?.start_pilot !== false;

    if (!organizationId) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const selectedRoles = [...new Set(rawRoles.filter((role: unknown): role is string =>
      typeof role === "string" && ALLOWED_ROLES.has(role),
    ))];
    if (selectedRoles.length === 0 || selectedRoles.length !== rawRoles.length) {
      return new Response(JSON.stringify({ error: "roles contains an unsupported executive role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Onboarding mutates organization-wide configuration and can consume a
    // one-time commercial pilot. Membership alone is insufficient authority.
    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) throw new Error(`Membership lookup failed: ${membershipError.message}`);
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Only an organization owner or admin can complete onboarding" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("industry, size_band, revenue_band, onboarding_completed")
      .eq("id", organizationId)
      .maybeSingle();
    if (orgError) throw new Error(`Organization lookup failed: ${orgError.message}`);
    if (!org) throw new Error("Organization not found");

    const industry = org.industry || "other";
    const sizeBand = org.size_band || "11-50";
    const revenueBand = org.revenue_band || "1-10m";
    const riskScores: Record<string, number> = {};

    for (const role of selectedRoles) {
      const score = computeBaseScore(role, industry, sizeBand, revenueBand);
      riskScores[role] = score;

      const { error: riskError } = await supabase.from("executive_risk_index").upsert(
        {
          organization_id: organizationId,
          role_type: role,
          score,
          components: {
            deviation: Math.round(score * 0.3),
            trend: Math.round(score * 0.25),
            volatility: Math.round(score * 0.2),
            forecast: Math.round(score * 0.25),
          },
          last_updated: new Date().toISOString(),
          escalation_required: score >= 75,
          escalation_reason: score >= 75 ? `High baseline risk for ${role.toUpperCase()} in ${industry} sector` : null,
        },
        { onConflict: "organization_id,role_type", ignoreDuplicates: false },
      );
      if (riskError) throw new Error(`Risk index write failed for ${role}: ${riskError.message}`);

      const { error: modeError } = await supabase.from("executive_modes").upsert(
        {
          organization_id: organizationId,
          role_type: role,
          priority_kpis: [],
          alert_thresholds: { warning: 50, critical: 75 },
        },
        { onConflict: "organization_id,role_type", ignoreDuplicates: true },
      );
      if (modeError) throw new Error(`Executive mode write failed for ${role}: ${modeError.message}`);
    }

    const scores = Object.values(riskScores);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const dispersion = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length);
    const eciScore = Math.max(0, Math.min(100, Math.round(100 - dispersion * 3)));
    const convergencePayload = {
      organization_id: organizationId,
      score: eciScore,
      dispersion: Math.round(dispersion * 100) / 100,
      conflict_penalty: 0,
      volatility_divergence: 0,
      alignment_status:
        eciScore >= 70 ? "aligned" :
        eciScore >= 40 ? "tension" :
        eciScore >= 20 ? "misalignment" : "structural_conflict",
    };

    // Keep retries idempotent within the convergence table's unique hourly window.
    const hourStart = new Date();
    hourStart.setUTCMinutes(0, 0, 0);
    const { data: existingConvergence, error: convergenceLookupError } = await supabase
      .from("executive_convergence_index")
      .select("id")
      .eq("organization_id", organizationId)
      .gte("created_at", hourStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (convergenceLookupError) throw new Error(`Convergence lookup failed: ${convergenceLookupError.message}`);

    if (existingConvergence?.id) {
      const { error } = await supabase
        .from("executive_convergence_index")
        .update(convergencePayload)
        .eq("id", existingConvergence.id);
      if (error) throw new Error(`Convergence update failed: ${error.message}`);
    } else {
      const { error } = await supabase.from("executive_convergence_index").insert(convergencePayload);
      if (error) throw new Error(`Convergence insert failed: ${error.message}`);
    }

    let kpisCreated = 0;
    if (kpiTemplateId) {
      const { data: template, error: templateError } = await supabase
        .from("kpi_templates")
        .select("kpis")
        .eq("id", kpiTemplateId)
        .maybeSingle();
      if (templateError) throw new Error(`KPI template lookup failed: ${templateError.message}`);
      if (!template) throw new Error("Selected KPI template was not found");

      const kpis = Array.isArray(template.kpis) ? template.kpis : [];
      const { data: existingKpis, error: existingKpisError } = await supabase
        .from("kpis")
        .select("name")
        .eq("organization_id", organizationId);
      if (existingKpisError) throw new Error(`Existing KPI lookup failed: ${existingKpisError.message}`);
      const existingNames = new Set((existingKpis ?? []).map((row: any) => String(row.name)));

      for (const kpi of kpis) {
        if (!kpi || typeof kpi.name !== "string" || typeof kpi.formula !== "string") continue;
        const name = kpi.name.trim().slice(0, 200);
        if (!name || existingNames.has(name)) continue;

        const { error } = await supabase.from("kpis").insert({
          organization_id: organizationId,
          name,
          formula: kpi.formula,
          aggregation_type: typeof kpi.aggregation_type === "string" ? kpi.aggregation_type : "sum",
          description: typeof kpi.description === "string" ? kpi.description : "",
          created_by: user.id,
          metric_dependencies: [],
          status: "active",
        });
        if (error) throw new Error(`KPI insert failed for ${name}: ${error.message}`);
        existingNames.add(name);
        kpisCreated += 1;
      }
    }

    const pilot = startPilot
      ? await grantPilotAccess(supabase, organizationId)
      : {
          active: false,
          granted: false,
          alreadyUsed: false,
          reason: "skipped_for_paid_checkout" as const,
          tier: PILOT_TIER,
          trialEnd: null,
        };

    const { error: completeError } = await supabase
      .from("organizations")
      .update({ onboarding_completed: true })
      .eq("id", organizationId);
    if (completeError) throw new Error(`Onboarding completion write failed: ${completeError.message}`);

    const { error: insightError } = await supabase.from("insights").insert({
      organization_id: organizationId,
      message: `Onboarding completed: ${selectedRoles.length} executive roles activated, ECI ${eciScore}/100, ${kpisCreated} KPIs deployed. Industry: ${industry}, Size: ${sizeBand}, Revenue: ${revenueBand}. Pilot access: ${pilot.reason}.`,
      severity: "info",
      category: "system",
    });
    if (insightError) throw new Error(`Onboarding audit insight failed: ${insightError.message}`);

    return new Response(JSON.stringify({
      success: true,
      risk_indices: selectedRoles.length,
      risk_scores: riskScores,
      convergence_score: eciScore,
      kpis_created: kpisCreated,
      industry_weights_applied: industry,
      pilot: {
        active: pilot.active,
        granted: pilot.granted,
        already_used: pilot.alreadyUsed,
        reason: pilot.reason,
        tier: pilot.tier,
        trial_end: pilot.trialEnd,
        days: PILOT_DAYS,
        default_tier: PILOT_TIER,
        no_card_required: true,
        auto_renews: false,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
