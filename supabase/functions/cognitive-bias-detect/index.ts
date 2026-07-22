import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

const BIAS_PATTERNS = [
  {
    type: "anchoring",
    name: "Anchoring Bias",
    detect: (decisions: any[]) => {
      if (decisions.length < 3) return null;
      const firstImpact = Number(decisions[0].predicted_net_impact) || 0;
      const others = decisions.slice(1).map(d => Number(d.predicted_net_impact) || 0);
      const avgDrift = others.reduce((s, v) => s + Math.abs(v - firstImpact), 0) / others.length;
      const range = Math.max(...others) - Math.min(...others);
      if (range > 0 && avgDrift / range < 0.3) {
        return {
          confidence: 70,
          evidence: [`${others.length} decisions cluster within ${Math.round(avgDrift)}% of initial anchor value ${firstImpact}`],
          mitigation: "Re-evaluate each decision independently. Consider using pre-mortem analysis to break away from the initial reference point.",
        };
      }
      return null;
    },
  },
  {
    type: "sunk_cost",
    name: "Sunk Cost Fallacy",
    detect: (decisions: any[]) => {
      const executed = decisions.filter(d => d.execution_status === "completed" && d.outcome_delta != null);
      const negativeOutcomes = executed.filter(d => Number(d.outcome_delta) < 0);
      const followUps = decisions.filter(d =>
        d.decision_status === "approved" &&
        negativeOutcomes.some(neg => d.recommended_action?.toLowerCase().includes(neg.recommended_action?.split(" ")[0]?.toLowerCase()))
      );
      if (followUps.length >= 2) {
        return {
          confidence: 65,
          evidence: [`${followUps.length} new investments follow ${negativeOutcomes.length} negative-outcome decisions in the same domain`],
          mitigation: "Evaluate each investment on its future merit only. Past costs are irrecoverable. Consider a 'clean-slate' analysis.",
        };
      }
      return null;
    },
  },
  {
    type: "confirmation",
    name: "Confirmation Bias",
    detect: (decisions: any[]) => {
      const withConf = decisions.filter(d => d.capped_confidence != null);
      if (withConf.length < 5) return null;
      const approved = withConf.filter(d => d.decision_status === "approved");
      const approvalRate = approved.length / withConf.length;
      const lowConfApproved = approved.filter(d => Number(d.capped_confidence) < 50);
      if (approvalRate > 0.85 && lowConfApproved.length >= 2) {
        return {
          confidence: 60,
          evidence: [
            `${Math.round(approvalRate * 100)}% approval rate across ${withConf.length} decisions`,
            `${lowConfApproved.length} low-confidence (<50%) recommendations still approved`,
          ],
          mitigation: "Assign a 'devil's advocate' reviewer for low-confidence decisions. Require explicit documentation of rejection criteria.",
        };
      }
      return null;
    },
  },
  {
    type: "recency",
    name: "Recency Bias",
    detect: (decisions: any[]) => {
      if (decisions.length < 6) return null;
      const sorted = [...decisions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const recent = sorted.slice(0, 3);
      const older = sorted.slice(3);
      const recentAvgConf = recent.reduce((s, d) => s + (Number(d.capped_confidence) || 50), 0) / recent.length;
      const olderAvgConf = older.reduce((s, d) => s + (Number(d.capped_confidence) || 50), 0) / older.length;
      const drift = Math.abs(recentAvgConf - olderAvgConf);
      if (drift > 15) {
        return {
          confidence: 55,
          evidence: [`Confidence drift of ${Math.round(drift)}% between recent (${Math.round(recentAvgConf)}%) and historical (${Math.round(olderAvgConf)}%) decisions`],
          mitigation: "Weight historical base rates equally with recent data. Use formal Bayesian updating rather than intuitive judgment.",
        };
      }
      return null;
    },
  },
  {
    type: "overconfidence",
    name: "Overconfidence Bias",
    detect: (decisions: any[]) => {
      const completed = decisions.filter(d =>
        d.execution_status === "completed" &&
        d.capped_confidence != null &&
        d.prediction_accuracy_score != null
      );
      if (completed.length < 3) return null;
      const avgConf = completed.reduce((s, d) => s + Number(d.capped_confidence), 0) / completed.length;
      const avgAccuracy = completed.reduce((s, d) => s + Number(d.prediction_accuracy_score), 0) / completed.length;
      const gap = avgConf - avgAccuracy;
      if (gap > 15) {
        return {
          confidence: 75,
          evidence: [
            `Average predicted confidence: ${Math.round(avgConf)}%`,
            `Average actual accuracy: ${Math.round(avgAccuracy)}%`,
            `Calibration gap: ${Math.round(gap)}% overconfident across ${completed.length} completed decisions`,
          ],
          mitigation: "Apply wider uncertainty ranges. Use reference class forecasting to ground predictions in base rates.",
        };
      }
      return null;
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, serviceKey);

    // Use getClaims() for secure JWT validation
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user?.id as string;

    const { organization_id } = await req.json();
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isMember } = await svc.rpc("is_org_member", { _user_id: userId, _org_id: organization_id });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch decision history (org-scoped — correct per entity scoping architecture)
    const { data: decisions } = await svc.from("decision_ledger")
      .select("recommended_action, decision_status, execution_status, capped_confidence, raw_confidence, predicted_net_impact, outcome_delta, prediction_accuracy_score, created_at")
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: true })
      .limit(200);

    if (!decisions || decisions.length < 3) {
      return new Response(JSON.stringify({
        biases: [],
        insufficient_data: true,
        message: "Minimum 3 decisions required for bias detection",
        decisions_analyzed: decisions?.length || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Run all bias detectors
    const detectedBiases: any[] = [];
    for (const pattern of BIAS_PATTERNS) {
      const result = pattern.detect(decisions);
      if (result) {
        detectedBiases.push({
          bias_type: pattern.type,
          bias_name: pattern.name,
          ...result,
        });
      }
    }

    // AI-powered deep analysis with AbortController timeout
    let aiAnalysis = "";
    if (lovableApiKey && detectedBiases.length > 0) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `You are a behavioral economics expert specializing in cognitive biases in executive decision-making. Given detected biases and decision data, provide a 2-3 paragraph analysis explaining the organizational impact, interconnections between biases, and prioritized mitigation strategies. Be specific and actionable. Return plain text only.`,
              },
              {
                role: "user",
                content: `Detected biases: ${JSON.stringify(detectedBiases)}\nDecision summary: ${decisions.length} decisions, ${decisions.filter(d => d.decision_status === "approved").length} approved, ${decisions.filter(d => d.execution_status === "completed").length} completed`,
              },
            ],
          }),
        });
        clearTimeout(timeout);
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          aiAnalysis = aiData.choices?.[0]?.message?.content || "";
        } else {
          await aiResp.text(); // consume body
        }
      } catch (e) {
        clearTimeout(timeout);
        console.error("AI bias analysis error:", e);
      }
    }

    // Store detected biases
    for (const bias of detectedBiases) {
      await svc.from("cognitive_bias_detections").insert({
        organization_id,
        bias_type: bias.bias_type,
        bias_name: bias.bias_name,
        description: `${bias.bias_name} detected in decision patterns`,
        severity: bias.confidence >= 70 ? "high" : bias.confidence >= 50 ? "medium" : "low",
        confidence: bias.confidence,
        evidence: bias.evidence,
        mitigation_suggestion: bias.mitigation,
      });
    }

    // Audit log
    console.log(JSON.stringify({
      event: "cognitive_bias_scan",
      organization_id,
      user_id: userId,
      decisions_analyzed: decisions.length,
      biases_detected: detectedBiases.length,
      bias_types: detectedBiases.map(b => b.bias_type),
    }));

    return new Response(JSON.stringify({
      biases: detectedBiases,
      ai_analysis: aiAnalysis,
      decisions_analyzed: decisions.length,
      scan_timestamp: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("cognitive-bias-detect error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
