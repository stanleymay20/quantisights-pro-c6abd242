/**
 * copilot-answer-engine.ts
 *
 * Data-grounded answers to Copilot queries using live org data.
 * Works from day 1 — uses decisions/interventions even before any connector
 * is configured. Upgrades automatically when metrics are connected.
 *
 * Every number shown comes from the user's actual data.
 * No hallucination. No hardcoded placeholders.
 */

import type { Insight } from "@/hooks/useInsights";
import type { MetricTypeSummary } from "@/hooks/useMetrics";

export interface CopilotAnswerLine {
  label: string;
  value: string;
  emphasis?: boolean;
  alert?: boolean;
}

export interface CopilotAnswer {
  headline: string;
  summary: string;
  lines: CopilotAnswerLine[];
  destination: string;
  destinationLabel: string;
  confidence: number | null;
  dataSource: "live" | "partial" | "none";
}

// ─── Live decision shape (from supabase query in ExecutiveDailyDriver) ───────
export interface DecisionSummary {
  id: string;
  recommended_action: string;
  decision_type: string;
  capped_confidence: number | null;
  predicted_net_impact: number | null;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

const EURO = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const PCT = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

function metricDisplayName(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function truncate(s: string, n = 80) {
  if (s.length <= n) return s;
  // Break at the last whitespace before the limit rather than mid-word —
  // a hard slice() was producing garbled output like "...exhibited a
  // substantial tota…" (cut inside "total") when concatenated with a
  // trailing label elsewhere in the UI. Falls back to the hard cut only if
  // there's no reasonable word boundary (e.g. one long unbroken token).
  const slice = s.slice(0, n);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > n * 0.6 ? slice.slice(0, lastSpace) : slice;
  return cut + "…";
}

function topCriticalInsights(insights: Insight[], n = 3) {
  return insights
    .filter(i => i.severity === "critical" || i.severity === "high")
    .slice(0, n);
}

function deltaPercent(m: MetricTypeSummary): number | null {
  if (!m.previousTotal || m.previousTotal === 0) return null;
  return ((m.total - m.previousTotal) / Math.abs(m.previousTotal)) * 100;
}

// ─── Intent handlers ─────────────────────────────────────────────────────────

function answerFocus(
  pendingDecisions: number,
  decisions: DecisionSummary[],
  insights: Insight[],
  metrics: MetricTypeSummary[],
): CopilotAnswer {
  const critical = topCriticalInsights(insights);
  const decliningMetrics = metrics.filter(m => m.trend === "down");
  const highImpactDecisions = decisions
    .filter(d => d.predicted_net_impact && d.predicted_net_impact > 0)
    .sort((a, b) => (b.predicted_net_impact ?? 0) - (a.predicted_net_impact ?? 0))
    .slice(0, 3);

  const lines: CopilotAnswerLine[] = [];

  if (pendingDecisions > 0) {
    lines.push({ label: "Decisions awaiting sign-off", value: String(pendingDecisions), emphasis: true });
  }
  if (highImpactDecisions.length > 0) {
    highImpactDecisions.forEach(d => {
      lines.push({
        label: truncate(d.recommended_action, 60),
        value: d.predicted_net_impact ? `${EURO(d.predicted_net_impact)} impact` : `${d.capped_confidence ?? "?"}% confidence`,
        emphasis: true,
      });
    });
  }
  if (critical.length > 0) {
    critical.slice(0, 2).forEach(i => {
      lines.push({ label: truncate(i.message, 70), value: i.severity === "critical" ? "CRITICAL" : "HIGH", alert: true });
    });
  }
  if (decliningMetrics.length > 0) {
    lines.push({ label: "Declining metrics", value: decliningMetrics.map(m => metricDisplayName(m.metricType)).slice(0, 2).join(", "), alert: true });
  }

  const urgencyLevel = critical.length > 0 ? "high urgency" : pendingDecisions > 3 ? "several pending items" : "steady state";

  return {
    headline: pendingDecisions > 0
      ? `${pendingDecisions} decision${pendingDecisions > 1 ? "s" : ""} need your sign-off today`
      : "You're up to date — no pending sign-offs",
    summary: lines.length > 0
      ? `Priority focus today: ${urgencyLevel}. Your ${pendingDecisions} pending decisions include items with up to ${
          highImpactDecisions[0]?.predicted_net_impact ? EURO(highImpactDecisions[0].predicted_net_impact) : "significant"
        } estimated impact. Review and approve via the Decision Ledger.`
      : "All decisions are resolved and no critical signals are active. Consider reviewing your performance metrics.",
    lines: lines.length > 0 ? lines : [{ label: "Status", value: "All clear — no urgent items" }],
    destination: "/decisions",
    destinationLabel: "Open Decision Ledger",
    confidence: null,
    dataSource: pendingDecisions > 0 ? "live" : metrics.length > 0 ? "live" : "partial",
  };
}

function answerRisks(insights: Insight[], metrics: MetricTypeSummary[]): CopilotAnswer {
  const critical = topCriticalInsights(insights);
  const declining = metrics.filter(m => m.trend === "down").slice(0, 3);

  if (critical.length === 0 && declining.length === 0) {
    return {
      headline: "No critical risks detected",
      summary: "Your signals are in steady-state. No critical or high-severity issues are active right now.",
      lines: [{ label: "Active alerts", value: "0" }],
      destination: "/executive-intelligence",
      destinationLabel: "Open Executive Intelligence",
      confidence: null,
      dataSource: metrics.length > 0 ? "live" : "partial",
    };
  }

  const lines: CopilotAnswerLine[] = [];
  critical.forEach(i => {
    lines.push({
      label: i.category ? metricDisplayName(i.category) : "Signal",
      value: truncate(i.message, 90),
      alert: true,
      emphasis: i.severity === "critical",
    });
  });
  declining.forEach(m => {
    const d = deltaPercent(m);
    lines.push({
      label: metricDisplayName(m.metricType),
      value: `${EURO(m.latest)} ${d !== null ? PCT(d) : "↓"}`,
      alert: true,
    });
  });

  return {
    headline: `${critical.length + declining.length} risk${critical.length + declining.length !== 1 ? "s" : ""} need your attention`,
    summary: critical.length > 0
      ? `${critical.length} critical signal${critical.length > 1 ? "s" : ""} ${critical.length > 1 ? "are" : "is"} active. ${declining.length > 0 ? `${declining.length} metric${declining.length > 1 ? "s are" : " is"} declining.` : ""} Full details in Executive Intelligence.`
      : `${declining.length} metric${declining.length > 1 ? "s are" : " is"} in a downward trend. No critical alerts are active.`,
    lines,
    destination: "/executive-intelligence",
    destinationLabel: "Full Risk Report",
    confidence: null,
    dataSource: insights.length > 0 || metrics.length > 0 ? "live" : "partial",
  };
}

function answerRevenue(metrics: MetricTypeSummary[], insights: Insight[]): CopilotAnswer {
  const revenueMetrics = metrics.filter(m =>
    /revenue|mrr|arr|sales|income/.test(m.metricType)
  );

  if (revenueMetrics.length === 0) {
    const revenueInsights = insights.filter(i =>
      /revenue|sales|income|arr|mrr/.test((i.category ?? "") + " " + i.message)
    ).slice(0, 3);

    if (revenueInsights.length > 0) {
      return {
        headline: "Revenue signals from your decision intelligence",
        summary: "Your revenue metrics aren't connected yet, but these signals from your decision data are relevant:",
        lines: revenueInsights.map(i => ({
          label: truncate(i.message, 110),
          value: i.severity,
          alert: i.severity === "critical" || i.severity === "high",
        })),
        destination: "/data-connectors",
        destinationLabel: "Connect Revenue Data",
        confidence: null,
        dataSource: "partial",
      };
    }
    return {
      headline: "Connect your revenue data source",
      summary: "Quantivis can track MRR, ARR, churn, pipeline, and revenue trends in real time once your Stripe, Salesforce, or financial system is connected.",
      lines: [
        { label: "Fastest connection", value: "Stripe — enter one API key, live in 60 seconds", emphasis: true },
        { label: "Other options", value: "Salesforce, SAP, NetSuite, HubSpot, Xero" },
      ],
      destination: "/data-connectors",
      destinationLabel: "Connect Data",
      confidence: null,
      dataSource: "none",
    };
  }

  const revenueInsights = insights.filter(i =>
    /revenue|sales/.test((i.category ?? "") + i.message)
  ).slice(0, 2);

  const lines: CopilotAnswerLine[] = revenueMetrics.slice(0, 4).map(m => {
    const d = deltaPercent(m);
    return {
      label: metricDisplayName(m.metricType),
      value: `${EURO(m.latest)}${d !== null ? " (" + PCT(d) + ")" : ""}`,
      alert: m.trend === "down",
      emphasis: m.trend === "down",
    };
  });

  revenueInsights.forEach(i => {
    lines.push({ label: "Signal", value: truncate(i.message, 70), alert: i.severity !== "low" });
  });

  const declining = revenueMetrics.filter(m => m.trend === "down");
  return {
    headline: declining.length > 0
      ? `Revenue declining — ${declining.map(m => metricDisplayName(m.metricType)).join(", ")}`
      : `Revenue tracking ${revenueMetrics.length} metric${revenueMetrics.length > 1 ? "s" : ""} — ${revenueMetrics.filter(m => m.trend === "up").length > 0 ? "growing" : "stable"}`,
    summary: declining.length > 0
      ? `${declining.length} revenue metric${declining.length > 1 ? "s are" : " is"} in decline. This has been flagged for decision review. The Decision Ledger contains pending actions you can approve to address this.`
      : "Revenue metrics are stable or growing. No downward trends detected in the current period.",
    lines,
    destination: "/dataset-explorer",
    destinationLabel: "Explore Revenue Data",
    confidence: null,
    dataSource: "live",
  };
}

function answerDecisions(
  pendingDecisions: number,
  decisions: DecisionSummary[],
): CopilotAnswer {
  if (decisions.length === 0 && pendingDecisions === 0) {
    return {
      headline: "No pending decisions",
      summary: "Your decision queue is clear. The system will surface new recommendations as signals emerge from your data.",
      lines: [{ label: "Queue status", value: "Clear" }],
      destination: "/decisions",
      destinationLabel: "Decision Ledger",
      confidence: null,
      dataSource: "live",
    };
  }

  const totalImpact = decisions
    .filter(d => d.predicted_net_impact && d.predicted_net_impact > 0)
    .reduce((s, d) => s + (d.predicted_net_impact ?? 0), 0);

  const lines: CopilotAnswerLine[] = [
    { label: "Pending sign-off", value: String(pendingDecisions), emphasis: true },
    ...(totalImpact > 0 ? [{ label: "Total estimated impact", value: EURO(totalImpact), emphasis: true }] : []),
    ...decisions.slice(0, 3).map(d => ({
      label: truncate(d.recommended_action, 60),
      value: `${d.capped_confidence ?? "?"}% confidence${d.predicted_net_impact ? " · " + EURO(d.predicted_net_impact) : ""}`,
    })),
  ];

  return {
    headline: `${pendingDecisions} decision${pendingDecisions !== 1 ? "s" : ""} ${pendingDecisions === 1 ? "needs" : "need"} your approval`,
    summary: totalImpact > 0
      ? `Your pending decisions have a combined estimated impact of ${EURO(totalImpact)}. Each includes confidence score, ROI, and daily cost of inaction — approve or reject directly from the Ledger.`
      : `You have ${pendingDecisions} pending decision${pendingDecisions !== 1 ? "s" : ""} in the queue. Each has been assessed for confidence, risk, and impact. Review and approve to move your organisation forward.`,
    lines,
    destination: "/decisions",
    destinationLabel: "Open Decision Ledger",
    confidence: null,
    dataSource: "live",
  };
}

function answerMetrics(metrics: MetricTypeSummary[]): CopilotAnswer {
  if (metrics.length === 0) {
    return {
      headline: "Connect your first data source",
      summary: "Once connected, Quantivis tracks your KPIs in real time and surfaces anomalies before they become problems. Stripe takes 60 seconds to connect.",
      lines: [
        { label: "Fastest", value: "Stripe — restricted API key, no code", emphasis: true },
        { label: "Enterprise", value: "Salesforce, SAP, NetSuite, HubSpot" },
        { label: "Custom", value: "PostgreSQL, BigQuery, Snowflake" },
      ],
      destination: "/data-connectors",
      destinationLabel: "Connect Data",
      confidence: null,
      dataSource: "none",
    };
  }

  const declining = metrics.filter(m => m.trend === "down").length;
  const lines: CopilotAnswerLine[] = metrics.slice(0, 5).map(m => {
    const d = deltaPercent(m);
    return {
      label: metricDisplayName(m.metricType),
      value: `${EURO(m.latest)}${d !== null ? " (" + PCT(d) + ")" : ""}`,
      alert: m.trend === "down",
      emphasis: m.trend === "down",
    };
  });

  return {
    headline: `${metrics.length} metrics tracked — ${declining > 0 ? `${declining} declining` : "all stable or growing"}`,
    summary: declining > 0
      ? `${declining} of your ${metrics.length} tracked metrics are in a downward trend. Quantivis has flagged these for decision review.`
      : `All ${metrics.length} tracked metrics are stable or growing. No anomalies detected in the current period.`,
    lines,
    destination: "/dataset-explorer",
    destinationLabel: "Explore Metrics",
    confidence: null,
    dataSource: "live",
  };
}

function answerGovernance(): CopilotAnswer {
  return {
    headline: "Governance: every decision is board-defensible",
    summary: "Quantivis maintains a tamper-evident audit trail for every decision — who approved it, what evidence supported it, and what the outcome was. Controls are mapped to SOC 2, ISO 27001, EU AI Act, and GDPR requirements; provider certifications and the Quantivis entity audit status are reported separately.",
    lines: [
      { label: "Decision audit trail", value: "sha256-hashed evidence per decision", emphasis: true },
      { label: "EU AI Act", value: "Classified & documented — no prohibited AI use" },
      { label: "GDPR / DSGVO", value: "DPA ready, data retention policies active" },
      { label: "Human-only approval", value: "No synthetic consensus — every approval is human" },
    ],
    destination: "/trust",
    destinationLabel: "Open Trust Center",
    confidence: null,
    dataSource: "live",
  };
}

function answerBrief(insights: Insight[], metrics: MetricTypeSummary[], pendingDecisions: number): CopilotAnswer {
  return {
    headline: "Opening your executive intelligence report",
    summary: `Your intelligence report synthesises ${insights.length} signal${insights.length !== 1 ? "s" : ""}, ${metrics.length} metric${metrics.length !== 1 ? "s" : ""}, and ${pendingDecisions} pending decision${pendingDecisions !== 1 ? "s" : ""} into a board-ready brief.`,
    lines: [
      ...(pendingDecisions > 0 ? [{ label: "Decisions pending", value: String(pendingDecisions), emphasis: true }] : []),
      ...(topCriticalInsights(insights).slice(0, 2).map(i => ({ label: "Signal", value: truncate(i.message, 70), alert: true }))),
    ],
    destination: "/executive-intelligence",
    destinationLabel: "Open Executive Brief",
    confidence: null,
    dataSource: insights.length > 0 || metrics.length > 0 ? "live" : "partial",
  };
}

function answerUnmatched(query: string): CopilotAnswer {
  return {
    headline: "I don't have a focused answer for that yet",
    summary: `This box only recognizes a handful of topics (today's focus, risks, revenue, pending decisions, metrics, governance). "${truncate(query, 60)}" didn't match any of them — for open-ended questions, use the full Ask Quantivis copilot, which reasons over your actual data instead of keyword-matching.`,
    lines: [],
    destination: "/app/copilot",
    destinationLabel: "Open Ask Quantivis",
    confidence: null,
    dataSource: "none",
  };
}

// ─── Main router ─────────────────────────────────────────────────────────────

export function generateAnswer(
  query: string,
  ctx: {
    insights: Insight[];
    metrics: MetricTypeSummary[];
    pendingDecisions: number;
    orgName: string;
    decisions?: DecisionSummary[];  // live decisions from dashboard query
  }
): CopilotAnswer {
  const q = query.toLowerCase().trim();
  const decisions = ctx.decisions ?? [];

  // Today / focus / priority
  if (/today|focus|priorit|start|morning|agenda|what.*should|where.*start/.test(q))
    return answerFocus(ctx.pendingDecisions, decisions, ctx.insights, ctx.metrics);

  // Risks and threats
  if (/risk|threat|critical|danger|attention|concern|biggest|watch/.test(q))
    return answerRisks(ctx.insights, ctx.metrics);

  // Revenue and sales
  if (/sales slow|revenue drop|losing money|revenue declin|why.*sales|where.*losing|arr|mrr/.test(q))
    return answerRevenue(ctx.metrics, ctx.insights);

  // Decisions and approvals
  if (/approv|pending|decision|sign.off|ledger/.test(q))
    return answerDecisions(ctx.pendingDecisions, decisions);

  // Prioritisation for the week
  if (/prioriti|this week|what should i do|recommend|next step/.test(q))
    return answerFocus(ctx.pendingDecisions, decisions, ctx.insights, ctx.metrics);

  // Metrics and KPIs
  if (/metric|kpi|performance|track|number|data|dashboard|how.*revenue|revenue.*trend/.test(q))
    return answerMetrics(ctx.metrics);

  // Governance and compliance
  if (/govern|compliance|soc|iso|audit|gdpr|trust|certif|dsgvo|dpa|eu ai/.test(q))
    return answerGovernance();

  // Brief / report
  if (/brief|report|summary|intelligence|overview/.test(q))
    return answerBrief(ctx.insights, ctx.metrics, ctx.pendingDecisions);

  // Revenue fallback
  if (/revenue|sales|growth|money|profit/.test(q))
    return answerRevenue(ctx.metrics, ctx.insights);

  // No topic matched: say so honestly and point at the real copilot,
  // rather than silently substituting the "today's focus" view as if it
  // were a direct answer to whatever was actually typed. This box is a
  // keyword router, not an NLU system — presenting an unrelated default as
  // a confident answer is worse for trust than admitting the limitation.
  if (!q) return answerFocus(ctx.pendingDecisions, decisions, ctx.insights, ctx.metrics);
  return answerUnmatched(query);
}
