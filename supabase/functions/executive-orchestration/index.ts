import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

  try {
    const body = await req.json().catch(() => ({}));
    const orgId = body.organization_id;
    const triggerType = body.trigger_type || "manual";

    // SECURITY: organization_id is always required — no all-orgs path
    if (!orgId) {
      return new Response(JSON.stringify({ error: "organization_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const auth = await requireCronOrOrgMember(req, orgId);
    if ("response" in auth) return auth.response;

    const orgIds: string[] = [orgId];

    const results: any[] = [];

    for (const oid of orgIds) {
      const startTime = Date.now();
      const steps: string[] = [];
      let runStatus = "completed";
      let errorMsg: string | null = null;

      // Create orchestration run
      const runResp = await fetch(`${supabaseUrl}/rest/v1/orchestration_runs`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation", Accept: "application/json" },
        body: JSON.stringify({ organization_id: oid, trigger_type: triggerType, status: "running" }),
      });
      const runArr = await runResp.json();
      const run = Array.isArray(runArr) ? runArr[0] : runArr;
      const runId = run?.id;

      try {
        // Phase 1: Independent computations in parallel
        const [kpiResp, sigResp, diagResp] = await Promise.all([
          fetch(`${supabaseUrl}/functions/v1/compute-kpi`, {
            method: "POST", headers,
            body: JSON.stringify({ organization_id: oid }),
          }),
          fetch(`${supabaseUrl}/functions/v1/compute-executive-signals`, {
            method: "POST", headers,
            body: JSON.stringify({ organization_id: oid }),
          }),
          fetch(`${supabaseUrl}/functions/v1/diagnostic-engine`, {
            method: "POST", headers,
            body: JSON.stringify({ organization_id: oid }),
          }),
        ]);
        steps.push(`compute-kpi: ${kpiResp.status}`);
        steps.push(`compute-signals: ${sigResp.status}`);
        steps.push(`diagnostics: ${diagResp.status}`);

        // Phase 2: Advisory (depends on diagnostics)
        const advResp = await fetch(`${supabaseUrl}/functions/v1/prescriptive-advisory`, {
          method: "POST", headers,
          body: JSON.stringify({ organization_id: oid }),
        });
        const advData = await advResp.json();
        steps.push(`advisory: ${advResp.status} (${advData?.total_advisories || 0} advisories)`);

        // Persist advisories + convergence in parallel
        const phase3: Promise<any>[] = [];

        if (advData?.advisories?.length > 0) {
          const instances = advData.advisories.map((a: any) => ({
            organization_id: oid, advisory_type: a.category, title: a.title,
            category: a.category, priority: a.priority, action: a.action,
            expected_impact: a.expected_impact, timeframe: a.timeframe,
            confidence: a.confidence, rationale: a.rationale,
            kpi_affected: a.kpi_affected, playbook_steps: a.playbook_steps,
            status: "open",
          }));
          phase3.push(
            fetch(`${supabaseUrl}/rest/v1/advisory_instances`, {
              method: "POST",
              headers: { ...headers, Prefer: "return=minimal" },
              body: JSON.stringify(instances),
            }).then(() => steps.push(`persisted ${instances.length} advisory instances`))
          );
        }

        phase3.push(
          fetch(`${supabaseUrl}/functions/v1/executive-convergence`, {
            method: "POST", headers,
            body: JSON.stringify({ organization_id: oid }),
          }).then(r => steps.push(`convergence: ${r.status}`))
        );

        await Promise.all(phase3);

        // Step 6: Check if alerts need to be sent
        const riskResp = await fetch(`${supabaseUrl}/rest/v1/executive_risk_index?organization_id=eq.${oid}&select=score,role_type,escalation_required`, { headers });
        const risks = await riskResp.json();
        const criticalRisks = (risks || []).filter((r: any) => r.escalation_required || r.score >= 85);

        if (criticalRisks.length > 0) {
          const alertResp = await fetch(`${supabaseUrl}/functions/v1/send-executive-alert`, {
            method: "POST",
            headers,
            body: JSON.stringify({ organization_id: oid, trigger: "orchestration", risks: criticalRisks }),
          });
          steps.push(`alert-sent: ${alertResp.status} (${criticalRisks.length} critical)`);
        } else {
          steps.push("no-alerts-needed");
        }

        // Audit log
        await fetch(`${supabaseUrl}/rest/v1/audit_log`, {
          method: "POST",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify({
            organization_id: oid,
            actor_type: "system",
            action_type: "orchestration_run",
            resource_type: "orchestration",
            resource_id: runId,
            payload: { trigger_type: triggerType, steps_count: steps.length, critical_risks: criticalRisks?.length || 0 },
          }),
        });

      } catch (err: any) {
        runStatus = "failed";
        errorMsg = err.message;
        steps.push(`error: ${err.message}`);
      }

      const durationMs = Date.now() - startTime;

      // Update run record
      await fetch(`${supabaseUrl}/rest/v1/orchestration_runs?id=eq.${runId}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          status: runStatus,
          steps_completed: steps,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          error_message: errorMsg,
        }),
      });

      results.push({ organization_id: oid, status: runStatus, steps, duration_ms: durationMs });
    }

    return new Response(JSON.stringify({
      success: true,
      organizations_processed: results.length,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
