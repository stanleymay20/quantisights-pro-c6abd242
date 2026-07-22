import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

// Industry-weighted baseline risk scores
const INDUSTRY_WEIGHTS: Record<string, Record<string, number>> = {
  saas:          { ceo: 30, cfo: 35, cmo: 40, coo: 20 },
  manufacturing: { ceo: 35, cfo: 45, cmo: 25, coo: 50 },
  retail:        { ceo: 35, cfo: 40, cmo: 45, coo: 35 },
  finance:       { ceo: 40, cfo: 50, cmo: 25, coo: 30 },
  healthcare:    { ceo: 45, cfo: 50, cmo: 20, coo: 40 },
  consulting:    { ceo: 30, cfo: 35, cmo: 35, coo: 30 },
  other:         { ceo: 35, cfo: 40, cmo: 30, coo: 25 },
};

// Size-band adjustment (larger = more operational complexity = higher risk)
const SIZE_ADJUSTMENTS: Record<string, number> = {
  "1-10": -5,
  "11-50": 0,
  "51-200": 3,
  "201-1000": 6,
  "1000+": 10,
};

// Revenue-band sensitivity (higher revenue = higher financial stakes)
const REVENUE_ADJUSTMENTS: Record<string, Record<string, number>> = {
  "pre-revenue": { ceo: 10, cfo: -5, cmo: 5, coo: -3 },
  "0-1m":        { ceo: 5,  cfo: 0,  cmo: 3, coo: 0 },
  "1-10m":       { ceo: 0,  cfo: 3,  cmo: 0, coo: 2 },
  "10-50m":      { ceo: -2, cfo: 5,  cmo: -2, coo: 5 },
  "50-100m":     { ceo: -3, cfo: 8,  cmo: -3, coo: 8 },
  "100m+":       { ceo: -5, cfo: 10, cmo: -5, coo: 10 },
};

function computeBaseScore(role: string, industry: string, sizeBand: string, revenueBand: string): number {
  const industryBase = INDUSTRY_WEIGHTS[industry]?.[role] ?? INDUSTRY_WEIGHTS.other[role] ?? 30;
  const sizeAdj = SIZE_ADJUSTMENTS[sizeBand] ?? 0;
  const revenueAdj = REVENUE_ADJUSTMENTS[revenueBand]?.[role] ?? 0;
  return Math.max(5, Math.min(80, industryBase + sizeAdj + revenueAdj));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(userError.message);
    const user = userData.user;
    if (!user) throw new Error("Not authenticated");

    const { organization_id, roles, kpi_template_id } = await req.json();
    if (!organization_id) throw new Error("organization_id required");

    // Verify caller is a member of the target organization
    const isMember = await verifyOrgMembership(user.id, organization_id);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Forbidden: not a member of this organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch org profile for industry-weighted scoring
    const { data: org } = await supabase
      .from("organizations")
      .select("industry, size_band, revenue_band")
      .eq("id", organization_id)
      .single();

    const industry = org?.industry || "other";
    const sizeBand = org?.size_band || "11-50";
    const revenueBand = org?.revenue_band || "1-10m";

    const selectedRoles = roles || ["ceo", "cfo", "cmo", "coo"];
    const riskScores: Record<string, number> = {};

    // 1. Generate industry-weighted risk indices
    for (const role of selectedRoles) {
      const score = computeBaseScore(role, industry, sizeBand, revenueBand);
      riskScores[role] = score;

      await supabase.from("executive_risk_index").upsert(
        {
          organization_id,
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
        { onConflict: "organization_id,role_type", ignoreDuplicates: false }
      );

      // Create default executive mode
      await supabase.from("executive_modes").upsert(
        {
          organization_id,
          role_type: role,
          priority_kpis: [],
          alert_thresholds: { warning: 50, critical: 75 },
        },
        { onConflict: "organization_id,role_type", ignoreDuplicates: true }
      );
    }

    // 2. Generate initial convergence index
    const scores = Object.values(riskScores);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const dispersion = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length);
    const eciScore = Math.max(0, Math.min(100, Math.round(100 - dispersion * 3)));

    await supabase.from("executive_convergence_index").insert({
      organization_id,
      score: eciScore,
      dispersion: Math.round(dispersion * 100) / 100,
      conflict_penalty: 0,
      volatility_divergence: 0,
      alignment_status:
        eciScore >= 70 ? "aligned" :
        eciScore >= 40 ? "tension" :
        eciScore >= 20 ? "misalignment" : "structural_conflict",
    });

    // 3. Create KPIs from template if selected
    let kpisCreated = 0;
    if (kpi_template_id) {
      const { data: template } = await supabase
        .from("kpi_templates")
        .select("kpis")
        .eq("id", kpi_template_id)
        .single();

      if (template?.kpis) {
        const kpis = template.kpis as any[];
        for (const kpi of kpis) {
          const { error } = await supabase.from("kpis").insert({
            organization_id,
            name: kpi.name,
            formula: kpi.formula,
            aggregation_type: kpi.aggregation_type || "sum",
            description: kpi.description || "",
            created_by: user.id,
            metric_dependencies: [],
            status: "active",
          });
          if (!error) kpisCreated++;
        }
      }
    }

    // 4. Mark onboarding complete
    await supabase
      .from("organizations")
      .update({ onboarding_completed: true })
      .eq("id", organization_id);

    // 5. Create audit log entry (insert an insight record)
    await supabase.from("insights").insert({
      organization_id,
      message: `Onboarding completed: ${selectedRoles.length} executive roles activated, ECI ${eciScore}/100, ${kpisCreated} KPIs deployed. Industry: ${industry}, Size: ${sizeBand}, Revenue: ${revenueBand}.`,
      severity: "info",
      category: "system",
    });

    return new Response(
      JSON.stringify({
        success: true,
        risk_indices: selectedRoles.length,
        risk_scores: riskScores,
        convergence_score: eciScore,
        kpis_created: kpisCreated,
        industry_weights_applied: industry,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
