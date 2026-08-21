import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

async function responseError(response: Response, label: string): Promise<Error> {
  const body = await response.text().catch(() => "");
  return new Error(`${label} failed (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
}

async function requireOk(response: Response, label: string): Promise<Response> {
  if (!response.ok) throw await responseError(response, label);
  return response;
}

async function parseJsonSafe(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return respond({ error: "Orchestration service unavailable" }, 503);

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  try {
    const body = await req.json().catch(() => ({})) as {
      organization_id?: string;
      trigger_type?: string;
    };
    const orgId = body.organization_id;
    const triggerType = body.trigger_type || "manual";
    if (!orgId) return respond({ error: "organization_id is required" }, 400);

    const auth = await requireCronOrOrgMember(req, orgId);
    if ("response" in auth) return auth.response;

    const startTime = Date.now();
    const steps: string[] = [];
    let runStatus: "completed" | "failed" = "completed";
    let errorMsg: string | null = null;
    let runId: string | null = null;

    try {
      const runResp = await requireOk(await fetch(`${supabaseUrl}/rest/v1/orchestration_runs`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation", Accept: "application/json" },
        body: JSON.stringify({ organization_id: orgId, trigger_type: triggerType, status: "running" }),
      }), "create orchestration run");
      const runPayload = await runResp.json();
      const run = Array.isArray(runPayload) ? runPayload[0] : runPayload;
      runId = run?.id ?? null;
      if (!runId) throw new Error("create orchestration run returned no run id");

      // Phase 1 is only complete when all three required computations return 2xx.
      const [kpiResp, sigResp, diagResp] = await Promise.all([
        fetch(`${supabaseUrl}/functions/v1/compute-kpi`, {
          method: "POST", headers,
          body: JSON.stringify({ organization_id: orgId }),
        }),
        fetch(`${supabaseUrl}/functions/v1/compute-executive-signals`, {
          method: "POST", headers,
          body: JSON.stringify({ organization_id: orgId }),
        }),
        fetch(`${supabaseUrl}/functions/v1/diagnostic-engine`, {
          method: "POST", headers,
          body: JSON.stringify({ organization_id: orgId }),
        }),
      ]);
      await requireOk(kpiResp, "compute-kpi");
      await requireOk(sigResp, "compute-executive-signals");
      await requireOk(diagResp, "diagnostic-engine");
      steps.push("compute-kpi: ok", "compute-signals: ok", "diagnostics: ok");

      const advResp = await requireOk(await fetch(`${supabaseUrl}/functions/v1/prescriptive-advisory`, {
        method: "POST", headers,
        body: JSON.stringify({ organization_id: orgId }),
      }), "prescriptive-advisory");
      const advData = await parseJsonSafe(advResp);
      const advisories = Array.isArray(advData.advisories) ? advData.advisories as Record<string, unknown>[] : [];
      steps.push(`advisory: ok (${advisories.length} advisories)`);

      const phase3: Promise<void>[] = [];
      if (advisories.length > 0) {
        const instances = advisories.map((a) => ({
          organization_id: orgId,
          advisory_type: a.category,
          title: a.title,
          category: a.category,
          priority: a.priority,
          action: a.action,
          expected_impact: a.expected_impact,
          timeframe: a.timeframe,
          confidence: a.confidence,
          rationale: a.rationale,
          kpi_affected: a.kpi_affected,
          playbook_steps: a.playbook_steps,
          status: "open",
        }));
        phase3.push((async () => {
          await requireOk(await fetch(`${supabaseUrl}/rest/v1/advisory_instances`, {
            method: "POST",
            headers: { ...headers, Prefer: "return=minimal" },
            body: JSON.stringify(instances),
          }), "persist advisory instances");
          steps.push(`persisted ${instances.length} advisory instances`);
        })());
      }

      phase3.push((async () => {
        await requireOk(await fetch(`${supabaseUrl}/functions/v1/executive-convergence`, {
          method: "POST", headers,
          body: JSON.stringify({ organization_id: orgId }),
        }), "executive-convergence");
        steps.push("convergence: ok");
      })());
      await Promise.all(phase3);

      const riskResp = await requireOk(await fetch(
        `${supabaseUrl}/rest/v1/executive_risk_index?organization_id=eq.${encodeURIComponent(orgId)}&select=score,role_type,escalation_required`,
        { headers },
      ), "load executive risk index");
      const risksPayload = await riskResp.json();
      if (!Array.isArray(risksPayload)) throw new Error("executive risk index returned invalid response");
      const criticalRisks = risksPayload.filter((raw) => {
        const risk = raw as Record<string, unknown>;
        return risk.escalation_required === true || Number(risk.score ?? 0) >= 85;
      });

      if (criticalRisks.length > 0) {
        await requireOk(await fetch(`${supabaseUrl}/functions/v1/send-executive-alert`, {
          method: "POST",
          headers,
          body: JSON.stringify({ organization_id: orgId, trigger: "orchestration", risks: criticalRisks }),
        }), "send-executive-alert");
        steps.push(`alert-sent: ok (${criticalRisks.length} critical)`);
      } else {
        steps.push("no-alerts-needed");
      }

      await requireOk(await fetch(`${supabaseUrl}/rest/v1/audit_log`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          organization_id: orgId,
          actor_type: "system",
          action_type: "orchestration_run",
          resource_type: "orchestration",
          resource_id: runId,
          payload: {
            trigger_type: triggerType,
            steps_count: steps.length,
            critical_risks: criticalRisks.length,
          },
        }),
      }), "write orchestration audit log");
    } catch (err: unknown) {
      runStatus = "failed";
      errorMsg = err instanceof Error ? err.message : String(err);
      steps.push(`error: ${errorMsg}`);
    }

    const durationMs = Date.now() - startTime;
    if (runId) {
      const finalizeResp = await fetch(`${supabaseUrl}/rest/v1/orchestration_runs?id=eq.${encodeURIComponent(runId)}`, {
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
      if (!finalizeResp.ok) {
        const finalizeError = await responseError(finalizeResp, "finalize orchestration run");
        // If the business workflow was otherwise successful but its audit ledger
        // cannot be finalized, the endpoint itself must still fail closed.
        runStatus = "failed";
        errorMsg = errorMsg ? `${errorMsg}; ${finalizeError.message}` : finalizeError.message;
        steps.push(`error: ${finalizeError.message}`);
      }
    }

    const result = {
      organization_id: orgId,
      run_id: runId,
      status: runStatus,
      steps,
      duration_ms: durationMs,
      error: errorMsg,
    };
    return respond({
      success: runStatus === "completed",
      organizations_processed: 1,
      results: [result],
    }, runStatus === "completed" ? 200 : 500);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return respond({ error: message }, 500);
  }
});
