import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { createLogger } from "../_shared/logger.ts";

const MAX_METRICS_LENGTH = 50_000;
const MAX_CONTEXT_LENGTH = 2_000;
const GATEWAY_TIMEOUT_MS = 40_000;
const GATEWAY_ATTEMPTS = 2;

const SYSTEM_PROMPT = `You are Quantivis — an AI Decision Intelligence System designed to analyze business performance, identify hidden losses, and recommend high-impact strategic actions.

Your goal is NOT to describe data. Your goal is to diagnose the business like a top-tier strategy consultant (McKinsey/BCG level) and present clear, actionable insights that drive decision-making.

OUTPUT REQUIREMENTS — follow this exact structure using markdown headers:

## Executive Summary
3–5 sentences. Clear, human, CEO-level explanation. Answer: "What is happening in this business?" Be specific — reference numbers and trends.

## Key Findings
3–5 bullet points. Each MUST include:
- **Insight**: What you found
- **Business impact**: Quantified (€/$/%, or risk level)
- **Explanation**: Why this matters in 1 sentence

## Hidden Value / Loss Estimation
Estimate with reasoning:
- Revenue at risk or lost
- Inefficiency cost (operational waste)
- Risk exposure (unmitigated downside)
Present as a clear table or bullet list with monetary estimates. If approximating, state the basis (e.g., "Based on 8% industry average applied to reported revenue").

## Root Cause Analysis
Explain WHY the issues are happening. Link to specific causes:
- Data quality gaps (missing fields, inconsistencies)
- Structural issues (team, process, technology)
- Operational inefficiencies (bottlenecks, waste)
- Governance gaps (no tracking, no accountability)

## Priority Action Plan
3–5 actions in a numbered list. Each MUST include ALL of:
- **Action**: Specific instruction (not vague — state exactly what to do)
- **Owner**: Who should execute (e.g., CFO, Head of Sales, COO)
- **Expected impact**: Quantified result (€/% improvement)
- **Timeline**: When results should appear (30/60/90 days)
- **Priority**: 🔴 High / 🟡 Medium / 🟢 Low

## Strategic Insight
One powerful paragraph that reframes the situation. This should be the most memorable takeaway — the kind of insight that makes a CEO pause and think. End with a forward-looking statement about what happens if action is taken vs. not.

## Methodology Note
One sentence explaining the analytical basis: "This analysis is based on [N] data points across [dimensions], using [statistical/heuristic] methods. Confidence level: [High/Medium/Low] based on data completeness."

RULES:
- Do NOT be generic. Reference specific numbers, metrics, and patterns from the data.
- Do NOT repeat metrics without interpretation.
- Always translate data → meaning → action → expected outcome.
- If data is incomplete, explicitly say what is missing and how it affects confidence.
- Use clear business language, not technical jargon.
- Be confident but honest — never fabricate numbers not derivable from the data.
- Use bold text for key numbers and findings.
- Every action must be specific enough that someone can execute it tomorrow.
- Keep total response under 900 words for readability.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const log = createLogger("strategy-session", req);
  const startedAt = Date.now();

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed", code: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json", Allow: "POST" },
    });
  }

  const clientAddress = req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const rateLimit = checkRateLimit(`strategy-session:${clientAddress}`, 10, 10 * 60 * 1_000);
  if (!rateLimit.allowed) {
    log.warn("Public analysis rate limit exceeded", { durationMs: Date.now() - startedAt });
    return rateLimitResponse(rateLimit.retryAfterMs, req);
  }

  try {
    const { metrics, companyContext } = await req.json();
    
    if (!metrics || (typeof metrics === 'string' && metrics.trim().length === 0)) {
      return new Response(
        JSON.stringify({ error: "No data provided for analysis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof metrics !== "string" || metrics.length > MAX_METRICS_LENGTH) {
      return new Response(JSON.stringify({ error: "Business data must be text no larger than 50,000 characters", code: "invalid_metrics" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (companyContext != null && (typeof companyContext !== "string" || companyContext.length > MAX_CONTEXT_LENGTH)) {
      return new Response(JSON.stringify({ error: "Company context must be text no larger than 2,000 characters", code: "invalid_context" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      log.error("Analysis dependency is not configured", { dependency: "lovable_ai_gateway" });
      return new Response(JSON.stringify({ error: "Analysis service is not configured", code: "dependency_not_configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      });
    }

    const userPrompt = `Analyze this business data and provide a full strategic diagnosis:

${companyContext ? `COMPANY CONTEXT: ${companyContext}\n\n` : ""}DATA:
${typeof metrics === 'string' ? metrics : JSON.stringify(metrics, null, 2)}

Provide your full diagnosis following the required output structure.`;

    let response: Response | null = null;
    for (let attempt = 1; attempt <= GATEWAY_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
      try {
        response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
            "X-Request-ID": log.requestId,
            "Idempotency-Key": req.headers.get("idempotency-key") ?? log.requestId,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
            stream: true,
          }),
          signal: controller.signal,
        });
      } catch (error) {
        log.warn("Analysis dependency request failed", {
          attempt,
          dependency: "lovable_ai_gateway",
          failure: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network_error",
        });
        if (attempt === GATEWAY_ATTEMPTS) {
          return new Response(JSON.stringify({ error: "Analysis service is temporarily unreachable", code: "dependency_unreachable" }), {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "5" },
          });
        }
        continue;
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok || ![429, 502, 503, 504].includes(response.status) || attempt === GATEWAY_ATTEMPTS) break;
      await response.body?.cancel();
    }

    if (!response) {
      return new Response(JSON.stringify({ error: "Analysis service is temporarily unreachable", code: "dependency_unreachable" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "5" },
      });
    }

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment.", code: "dependency_rate_limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Analysis service temporarily unavailable. Please try again later.", code: "dependency_capacity_unavailable" }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
        });
      }
      const t = await response.text();
      log.error("Analysis dependency rejected request", { dependency: "lovable_ai_gateway", status: response.status, responseLength: t.length });
      return new Response(JSON.stringify({ error: "Analysis engine error", code: "dependency_error" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log.info("Analysis stream started", { dependency: "lovable_ai_gateway", durationMs: Date.now() - startedAt });
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "X-Request-ID": log.requestId,
        "X-Deployment-ID": Deno.env.get("DENO_DEPLOYMENT_ID") ?? "unavailable",
      },
    });
  } catch (e) {
    log.error("Public analysis request failed", { durationMs: Date.now() - startedAt, errorType: e instanceof SyntaxError ? "invalid_json" : "internal_error" });
    return new Response(JSON.stringify({
      error: e instanceof SyntaxError ? "Request body must be valid JSON" : "Analysis request failed",
      code: e instanceof SyntaxError ? "invalid_json" : "internal_error",
    }), {
      status: e instanceof SyntaxError ? 400 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
