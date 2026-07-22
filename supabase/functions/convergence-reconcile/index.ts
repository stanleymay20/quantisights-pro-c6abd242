import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { cronGuard } from "../_shared/cron-guard.ts";
import { verifyCronSecret, cronSecretUnauthorized } from "../_shared/cron-secret.ts";


// --- Configurable thresholds via env vars ---
function envFloat(key: string, fallback: number): number {
  const v = Deno.env.get(key);
  if (!v) return fallback;
  const p = parseFloat(v);
  return isFinite(p) ? p : fallback;
}
function envInt(key: string, fallback: number): number {
  const v = Deno.env.get(key);
  if (!v) return fallback;
  const p = parseInt(v, 10);
  return isFinite(p) ? p : fallback;
}

function getConvergenceConfig() {
  return {
    ceoVsCfoDivergence: envFloat("CONV_CEO_CFO_DIVERGENCE", 30),
    ceoVsCfoPenalty: envFloat("CONV_CEO_CFO_PENALTY", 15),
    cmoLowThreshold: envFloat("CONV_CMO_LOW_THRESHOLD", 40),
    cooHighThreshold: envFloat("CONV_COO_HIGH_THRESHOLD", 70),
    growthExecutionPenalty: envFloat("CONV_GROWTH_EXEC_PENALTY", 8),
    cfoHighThreshold: envFloat("CONV_CFO_HIGH_THRESHOLD", 75),
    ceoLowThreshold: envFloat("CONV_CEO_LOW_THRESHOLD", 50),
    cashExpansionPenalty: envFloat("CONV_CASH_EXP_PENALTY", 15),
    volatilityHighThreshold: envFloat("CONV_VOL_HIGH_THRESHOLD", 80),
    volatilityLowThreshold: envFloat("CONV_VOL_LOW_THRESHOLD", 40),
    operationalImbalancePenalty: envFloat("CONV_OP_IMBAL_PENALTY", 25),
    volatilityDivergenceThreshold: envFloat("CONV_VOL_DIV_THRESHOLD", 35),
    volatilityDivergencePenalty: envFloat("CONV_VOL_DIV_PENALTY", 10),
    alignedThreshold: envInt("CONV_ALIGNED_THRESHOLD", 80),
    tensionThreshold: envInt("CONV_TENSION_THRESHOLD", 60),
    misalignmentThreshold: envInt("CONV_MISALIGNMENT_THRESHOLD", 40),
    reconcileIntervalMs: envInt("CONV_RECONCILE_INTERVAL_MS", 6 * 60 * 60 * 1000),
  };
}

interface RiskComponents { deviation: number; trend: number; volatility: number; forecast: number; }
interface RoleRisk { role_type: string; score: number; components: RiskComponents; }
interface Conflict { rule_triggered: string; severity: string; role_1: string; role_2: string; description: string; }

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function computeConvergence(roles: RoleRisk[]) {
  if (roles.length < 2) return null;
  const cfg = getConvergenceConfig();

  const scores = roles.map(r => r.score);
  const dispersion = Math.round(stddev(scores) * 100) / 100;

  const conflicts: Conflict[] = [];
  let conflictPenalty = 0;

  const roleMap: Record<string, RoleRisk> = {};
  for (const r of roles) roleMap[r.role_type] = r;

  if (roleMap.ceo && roleMap.cfo && Math.abs(roleMap.ceo.score - roleMap.cfo.score) > cfg.ceoVsCfoDivergence) {
    conflicts.push({ rule_triggered: "strategic_financial_divergence", severity: "high", role_1: "ceo", role_2: "cfo",
      description: `CEO risk (${roleMap.ceo.score}) and CFO risk (${roleMap.cfo.score}) diverge by ${Math.abs(roleMap.ceo.score - roleMap.cfo.score)} points` });
    conflictPenalty += cfg.ceoVsCfoPenalty;
  }

  if (roleMap.cmo && roleMap.coo && roleMap.cmo.score < cfg.cmoLowThreshold && roleMap.coo.score > cfg.cooHighThreshold) {
    conflicts.push({ rule_triggered: "growth_execution_strain", severity: "medium", role_1: "cmo", role_2: "coo",
      description: `CMO low risk (${roleMap.cmo.score}) while COO elevated (${roleMap.coo.score}) — growth vs execution strain` });
    conflictPenalty += cfg.growthExecutionPenalty;
  }

  if (roleMap.cfo && roleMap.ceo && roleMap.cfo.score > cfg.cfoHighThreshold && roleMap.ceo.score < cfg.ceoLowThreshold) {
    conflicts.push({ rule_triggered: "cash_expansion_mismatch", severity: "high", role_1: "cfo", role_2: "ceo",
      description: `CFO cash risk (${roleMap.cfo.score}) while CEO pursues expansion (${roleMap.ceo.score})` });
    conflictPenalty += cfg.cashExpansionPenalty;
  }

  for (const r of roles) {
    const vol = (r.components as any)?.volatility ?? 0;
    if (vol > cfg.volatilityHighThreshold) {
      const othersLow = roles.filter(o => o.role_type !== r.role_type).every(o => ((o.components as any)?.volatility ?? 0) < cfg.volatilityLowThreshold);
      if (othersLow) {
        conflicts.push({ rule_triggered: "operational_imbalance", severity: "critical", role_1: r.role_type, role_2: "all_others",
          description: `${r.role_type.toUpperCase()} volatility (${vol}) vastly exceeds others` });
        conflictPenalty += cfg.operationalImbalancePenalty;
      }
    }
  }

  const volatilities = roles.map(r => (r.components as any)?.volatility ?? 0);
  let volatilityDivergence = 0;
  if (Math.max(...volatilities) - Math.min(...volatilities) > cfg.volatilityDivergenceThreshold) {
    volatilityDivergence = cfg.volatilityDivergencePenalty;
  }

  const score = clamp(Math.round(100 - (dispersion + conflictPenalty + volatilityDivergence)), 0, 100);

  let alignmentStatus = "aligned";
  if (score >= cfg.alignedThreshold) alignmentStatus = "aligned";
  else if (score >= cfg.tensionThreshold) alignmentStatus = "tension";
  else if (score >= cfg.misalignmentThreshold) alignmentStatus = "misalignment";
  else alignmentStatus = "structural_conflict";

  return { score, dispersion, conflict_penalty: conflictPenalty, volatility_divergence: volatilityDivergence, alignment_status: alignmentStatus, conflicts };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  if (!verifyCronSecret(req)) return cronSecretUnauthorized(corsHeaders);

  // Advisory lock — prevent overlapping cron runs
  const guard = await cronGuard("convergence-reconcile");
  if (!guard.acquired) return guard.earlyResponse(corsHeaders);


  const startTime = Date.now();
  const cfg = getConvergenceConfig();

  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: subs } = await serviceClient
      .from("subscriptions")
      .select("organization_id, tier")
      .eq("status", "active")
      .in("tier", ["growth", "enterprise"]);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ message: "No eligible organizations", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < subs.length; i += 10) {
      const batch = subs.slice(i, i + 10);
      await Promise.all(batch.map(async (sub) => {
        const orgId = sub.organization_id;
        try {
          const { data: latest } = await serviceClient
            .from("executive_convergence_index")
            .select("score, created_at")
            .eq("organization_id", orgId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const { data: riskRows } = await serviceClient
            .from("executive_risk_index")
            .select("role_type, score, components")
            .eq("organization_id", orgId);

          const roles: RoleRisk[] = (riskRows || []).map((r: any) => ({
            role_type: r.role_type, score: r.score, components: r.components,
          }));

          if (roles.length < 2) { skipped++; return; }

          const result = computeConvergence(roles);
          if (!result) { skipped++; return; }

          if (latest) {
            const lastAge = Date.now() - new Date(latest.created_at).getTime();
            if (latest.score === result.score && lastAge < cfg.reconcileIntervalMs) {
              skipped++;
              return;
            }
          }

          await serviceClient.from("executive_convergence_index").insert({
            organization_id: orgId,
            score: result.score,
            dispersion: result.dispersion,
            conflict_penalty: result.conflict_penalty,
            volatility_divergence: result.volatility_divergence,
            alignment_status: result.alignment_status,
          });

          await serviceClient.from("executive_conflicts")
            .update({ resolved_at: new Date().toISOString() })
            .eq("organization_id", orgId)
            .is("resolved_at", null);

          for (const c of result.conflicts) {
            await serviceClient.from("executive_conflicts").insert({
              organization_id: orgId, ...c,
            });
          }

          console.log(JSON.stringify({
            event: "convergence_reconciled",
            organization_id: orgId,
            score: result.score,
            alignment_status: result.alignment_status,
            conflicts_count: result.conflicts.length,
          }));

          processed++;
        } catch (orgErr) {
          errors++;
          console.error(`Convergence reconcile error for org ${orgId}:`, orgErr);
        }
      }));
    }

    const duration = Date.now() - startTime;

    const summary = {
      event: "convergence_reconcile_batch",
      total_eligible: subs.length,
      processed, skipped, errors,
      duration_ms: duration,
      avg_per_org_ms: processed > 0 ? Math.round(duration / processed) : 0,
    };

    console.log(JSON.stringify(summary));

    await guard.succeed(summary);
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("convergence-reconcile error:", e);
    await guard.fail(e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
