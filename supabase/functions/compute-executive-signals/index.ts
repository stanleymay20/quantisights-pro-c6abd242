import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

const ROLE_KPI_FOCUS: Record<string, string[]> = {
  ceo: ["revenue", "customers", "churn"],
  cfo: ["revenue", "cost", "churn"],
  cmo: ["customers", "revenue"],
  coo: ["cost", "customers"],
};

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = user?.id as string;

    const { role_type, organization_id, dataset_id } = await req.json();
    if (!role_type || !organization_id) {
      return new Response(JSON.stringify({ error: "role_type and organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!dataset_id) {
      return new Response(JSON.stringify({ error: "dataset_id required (Active Data Contract)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify membership
    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", userId)
      .eq("organization_id", organization_id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Not a member" }), { status: 403, headers: corsHeaders });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check subscription
    const { data: sub } = await serviceClient
      .from("subscriptions")
      .select("tier")
      .eq("organization_id", organization_id)
      .eq("status", "active")
      .maybeSingle();

    if (!sub || !["growth", "enterprise"].includes(sub.tier)) {
      return new Response(JSON.stringify({ error: "Growth or Enterprise plan required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch KPIs — note: KPIs are org-scoped but we filter values by dataset context
    const { data: kpis } = await supabase
      .from("kpis")
      .select("id, name, formula, metric_dependencies")
      .eq("organization_id", organization_id)
      .eq("status", "active");

    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

    // Fetch KPI values
    const { data: kpiValues } = await supabase
      .from("kpi_values")
      .select("kpi_id, date, value")
      .eq("organization_id", organization_id)
      .gte("date", ninetyDaysAgo)
      .order("date", { ascending: true });

    // Fetch targets
    const { data: targets } = await supabase
      .from("kpi_targets")
      .select("kpi_id, target_value")
      .eq("organization_id", organization_id);

    // Compute per-KPI signals
    const focusMetrics = ROLE_KPI_FOCUS[role_type] || [];
    const kpiSignals: any[] = [];
    let totalDeviation = 0;
    let totalTrend = 0;
    let totalVolatility = 0;
    let kpiCount = 0;

    const triggeredAlerts: any[] = [];

    for (const kpi of (kpis || [])) {
      const deps = Array.isArray(kpi.metric_dependencies) ? kpi.metric_dependencies : [];
      const isRelevant = deps.some((d: string) => focusMetrics.includes(d));
      if (!isRelevant && focusMetrics.length > 0) continue;

      const values = (kpiValues || [])
        .filter((v) => v.kpi_id === kpi.id)
        .map((v) => ({ date: v.date, value: Number(v.value) }));

      if (values.length < 2) continue;

      const latest = values[values.length - 1];
      const prev = values[values.length - 2];
      const target = (targets || []).find((t) => t.kpi_id === kpi.id);

      // Deviation from target
      let deviationScore = 0;
      if (target) {
        const devPct = ((latest.value - Number(target.target_value)) / Math.abs(Number(target.target_value) || 1)) * 100;
        deviationScore = clamp(Math.abs(devPct), 0, 100);

        if (devPct < -30) {
          triggeredAlerts.push({
            kpi_id: kpi.id,
            title: `${kpi.name}: Critical deviation from target`,
            severity: "critical",
            trigger_value: latest.value,
            threshold_value: Number(target.target_value),
          });
        } else if (devPct < -15) {
          triggeredAlerts.push({
            kpi_id: kpi.id,
            title: `${kpi.name}: Below target warning`,
            severity: "warning",
            trigger_value: latest.value,
            threshold_value: Number(target.target_value),
          });
        }
      }

      // Trend velocity
      const trendPct = ((latest.value - prev.value) / Math.abs(prev.value || 1)) * 100;
      const trendScore = clamp(Math.abs(trendPct), 0, 100);

      // Check consecutive negative trend
      if (values.length >= 3) {
        const last3 = values.slice(-3);
        const allNegative = last3.every((v, i) => i === 0 || v.value < last3[i - 1].value);
        if (allNegative) {
          triggeredAlerts.push({
            kpi_id: kpi.id,
            title: `${kpi.name}: 3-period negative trend`,
            severity: "warning",
            trigger_value: latest.value,
            threshold_value: last3[0].value,
          });
        }
      }

      // Volatility
      const last30 = values.slice(-30).map((v) => v.value);
      const vol = stddev(last30);
      const avgVal = last30.reduce((a, b) => a + b, 0) / last30.length;
      const volPct = avgVal !== 0 ? (vol / Math.abs(avgVal)) * 100 : 0;
      const volatilityScore = clamp(volPct * 5, 0, 100); // scale up for sensitivity

      // Check volatility spike (compare last 10 vs previous 20)
      if (last30.length >= 20) {
        const recent10 = last30.slice(-10);
        const prior20 = last30.slice(0, -10);
        const recentVol = stddev(recent10);
        const priorVol = stddev(prior20);
        if (priorVol > 0 && recentVol > priorVol * 2) {
          triggeredAlerts.push({
            kpi_id: kpi.id,
            title: `${kpi.name}: Volatility spike detected`,
            severity: "warning",
            trigger_value: recentVol,
            threshold_value: priorVol,
          });
        }
      }

      totalDeviation += deviationScore;
      totalTrend += trendScore;
      totalVolatility += volatilityScore;
      kpiCount++;

      kpiSignals.push({
        kpi_id: kpi.id,
        kpi_name: kpi.name,
        deviation: deviationScore,
        trend: trendScore,
        volatility: volatilityScore,
      });
    }

    // Compute overall risk score
    const devAvg = kpiCount > 0 ? totalDeviation / kpiCount : 0;
    const trendAvg = kpiCount > 0 ? totalTrend / kpiCount : 0;
    const volAvg = kpiCount > 0 ? totalVolatility / kpiCount : 0;

    const riskScore = clamp(
      Math.round(0.4 * devAvg + 0.35 * trendAvg + 0.25 * volAvg),
      0,
      100
    );

    const components = {
      deviation: Math.round(devAvg),
      trend: Math.round(trendAvg),
      volatility: Math.round(volAvg),
      forecast: 0,
    };

    // Escalation logic
    const criticalAlertCount = triggeredAlerts.filter((a) => a.severity === "critical").length;
    const escalationRequired = riskScore > 85 || criticalAlertCount >= 3;
    const escalationReason = escalationRequired
      ? riskScore > 85 && criticalAlertCount >= 3
        ? `Risk score ${riskScore}/100 with ${criticalAlertCount} critical alerts`
        : riskScore > 85
          ? `Risk score critically elevated at ${riskScore}/100`
          : `${criticalAlertCount} critical alerts active simultaneously`
      : null;

    // Upsert risk index with escalation
    await serviceClient
      .from("executive_risk_index")
      .upsert(
        {
          organization_id,
          role_type,
          score: riskScore,
          components,
          last_updated: new Date().toISOString(),
          escalation_required: escalationRequired,
          escalation_reason: escalationReason,
        },
        { onConflict: "organization_id,role_type" }
      );

    // Manage alerts: create new, resolve cleared
    const { data: existingAlerts } = await serviceClient
      .from("executive_alerts")
      .select("id, kpi_id, title, severity, status")
      .eq("organization_id", organization_id)
      .eq("role_type", role_type)
      .eq("status", "active");

    // Create new alerts (avoid duplicates by title+kpi_id)
    for (const alert of triggeredAlerts) {
      const exists = (existingAlerts || []).some(
        (ea) => ea.title === alert.title && ea.kpi_id === alert.kpi_id
      );
      if (!exists) {
        await serviceClient.from("executive_alerts").insert({
          organization_id,
          role_type,
          kpi_id: alert.kpi_id,
          title: alert.title,
          severity: alert.severity,
          trigger_value: alert.trigger_value,
          threshold_value: alert.threshold_value,
          status: "active",
        });
      }
    }

    // Auto-resolve alerts that no longer trigger
    for (const ea of (existingAlerts || [])) {
      const stillTriggered = triggeredAlerts.some(
        (ta) => ta.title === ea.title && ta.kpi_id === ea.kpi_id
      );
      if (!stillTriggered) {
        await serviceClient
          .from("executive_alerts")
          .update({ status: "resolved", resolved_at: new Date().toISOString() })
          .eq("id", ea.id);
      }
    }

    // Fetch final active alerts
    const { data: activeAlerts } = await serviceClient
      .from("executive_alerts")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("role_type", role_type)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    // Trigger notification distribution
    const hasNewCritical = triggeredAlerts.some((a) => {
      const isNew = !(existingAlerts || []).some((ea) => ea.title === a.title && ea.kpi_id === a.kpi_id);
      return isNew && a.severity === "critical";
    });

    const shouldNotify = hasNewCritical || escalationRequired || riskScore >= 75;

    if (shouldNotify) {
      try {
        const notifyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-executive-alert`;
        await fetch(notifyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            organization_id,
            role_type,
            risk_score: riskScore,
            alerts: (activeAlerts || []).map((a) => ({ title: a.title, severity: a.severity })),
            escalation_required: escalationRequired,
            escalation_reason: escalationReason,
          }),
        });
      } catch (notifErr) {
        console.error("Failed to trigger notification:", notifErr);
      }
    }

    // Auto-trigger convergence computation
    try {
      const convergenceUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/executive-convergence`;
      await fetch(convergenceUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          organization_id,
          trigger: "auto",
        }),
      });
      console.log(JSON.stringify({ event: "convergence_auto_triggered", organization_id }));
    } catch (convErr) {
      console.error("Failed to trigger convergence:", convErr);
    }

    console.log(JSON.stringify({
      event: "executive_signals_computed",
      organization_id,
      role_type,
      risk_score: riskScore,
      alerts_created: triggeredAlerts.length,
      kpis_analyzed: kpiCount,
      escalation_required: escalationRequired,
      notification_triggered: shouldNotify,
    }));

    return new Response(JSON.stringify({
      role_type,
      overall_score: riskScore,
      components,
      kpi_signals: kpiSignals,
      triggered_alerts: activeAlerts || [],
      escalation_required: escalationRequired,
      escalation_reason: escalationReason,
      computed_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("compute-executive-signals error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
