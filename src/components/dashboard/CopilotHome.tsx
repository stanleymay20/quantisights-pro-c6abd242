import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  MessageSquareText, ArrowRight, ShieldAlert, ClipboardList,
  TrendingUp, FileText, BarChart2, Sparkles,
  Clock, AlertTriangle, CheckCircle2, ChevronRight,
  Euro, Target, Lightbulb, TrendingDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Insight } from "@/hooks/useInsights";
import TrustCard from "@/components/trust/TrustCard";
import WhatIsQuantivis from "@/components/dashboard/WhatIsQuantivis";
import { useOrganization } from "@/hooks/useOrganization";
import { useIndustryLabels } from "@/hooks/useIndustryLanguage";
import { useCopilotTelemetry } from "@/hooks/useCopilotTelemetry";
import type { MetricTypeSummary } from "@/hooks/useMetrics";
import { filterCriticalInsights } from "@/lib/insight-filters";

// ─── Re-used logic from SimpleHome ───────────────────────────────────────────
const metricDecisionRules: Record<string, {
  issue: string; recommendation: string; expectedOutcome: string;
  expectedFinancialImpact: number; costOfDelayPerDay: number;
  expectedRoi: number; confidence: number; risk: "Low" | "Medium" | "High";
  evidence: string[];
}> = {
  marketing_spend_eur: {
    issue: "Marketing spend is moving unpredictably",
    recommendation: "Set a quarterly marketing spend cap and require campaign-level ROI review before new spend is approved.",
    expectedOutcome: "Reduce spend variance by 25–35% and protect cash from low-return campaigns.",
    expectedFinancialImpact: 42000, costOfDelayPerDay: 1150, expectedRoi: 3.2, confidence: 81, risk: "Medium",
    evidence: ["Extreme marketing-spend volatility detected", "Recent trend shows material inconsistency", "Pattern suggests campaign-level budget drift"],
  },
  revenue_eur: {
    issue: "Revenue growing but cost movement may weaken margin quality",
    recommendation: "Approve a margin review by product line and prioritize the highest-gross-profit channels.",
    expectedOutcome: "Protect growth while improving gross profit discipline over the next operating cycle.",
    expectedFinancialImpact: 68000, costOfDelayPerDay: 1800, expectedRoi: 4.1, confidence: 84, risk: "Medium",
    evidence: ["Revenue growth is materially above baseline", "Cost movement rising alongside sales", "Margin-quality risk increases when growth and cost accelerate together"],
  },
  gross_margin_pct: {
    issue: "Gross margin is under pressure",
    recommendation: "Review pricing and supplier costs for the lowest-margin product lines before approving new orders.",
    expectedOutcome: "Stabilize margin and prevent revenue growth from becoming unprofitable growth.",
    expectedFinancialImpact: 52000, costOfDelayPerDay: 1400, expectedRoi: 3.6, confidence: 80, risk: "Medium",
    evidence: ["Gross-margin movement is below desired stability", "Pricing or input-cost pressure may be reducing profit quality", "Margin protection required before scaling volume"],
  },
  cost_eur: {
    issue: "Costs are rising materially",
    recommendation: "Run a cost-driver review and negotiate priority supplier terms before the next purchasing cycle.",
    expectedOutcome: "Lower avoidable cost growth and protect operating margin.",
    expectedFinancialImpact: 47000, costOfDelayPerDay: 1250, expectedRoi: 3.1, confidence: 79, risk: "Medium",
    evidence: ["Cost trend indicates acceleration", "Supplier and production drivers require review", "Uncontrolled cost movement threatens operating margin"],
  },
  inventory_turnover: {
    issue: "Inventory turnover is unstable",
    recommendation: "Reduce replenishment for slow-moving stock and review supplier purchase timing.",
    expectedOutcome: "Free working capital, reduce dead stock risk, and improve warehouse efficiency.",
    expectedFinancialImpact: 35000, costOfDelayPerDay: 960, expectedRoi: 2.8, confidence: 78, risk: "High",
    evidence: ["Inventory-turnover volatility is high", "Low turnover suggests working-capital lockup", "Procurement timing is likely misaligned with demand"],
  },
};

function detectMetric(message: string, category?: string | null) {
  const haystack = `${message} ${category ?? ""}`.toLowerCase();
  return Object.keys(metricDecisionRules).find(m => haystack.includes(m.toLowerCase())) ?? null;
}

function formatEuro(v: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

function riskColor(risk: "Low" | "Medium" | "High") {
  if (risk === "High") return "text-destructive";
  if (risk === "Medium") return "text-warning";
  return "text-success";
}

// ─── Suggested prompts ────────────────────────────────────────────────────────
const PROMPTS = [
  { label: "What decisions need my approval?",   icon: ClipboardList, path: "/decisions" },
  { label: "What are my biggest risks?",          icon: ShieldAlert,   path: "/executive-intelligence" },
  { label: "Run a forecast for next quarter",     icon: TrendingUp,    path: "/forecasting" },
  { label: "Prepare a board report",              icon: FileText,      path: "/reports" },
  { label: "Run a what-if scenario",              icon: Sparkles,      path: "/simulations" },
  { label: "Analyse uploaded data",               icon: BarChart2,     path: "/data-upload" },
];

// ─── Props ────────────────────────────────────────────────────────────────────
interface CopilotHomeProps {
  displayName: string;
  insights: Insight[];
  pendingDecisions: number;
  calibrationScore: number | null;
  topMetrics?: MetricTypeSummary[];
  organizationId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
const CopilotHome = ({
  displayName,
  insights,
  pendingDecisions,
  calibrationScore,
  topMetrics,
}: CopilotHomeProps) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const lang = useIndustryLabels(currentOrg?.industry);
  const { logQuery } = useCopilotTelemetry();
  const [query, setQuery] = useState("");

  const firstName = displayName.split(" ")[0];

  const criticalInsights = useMemo(() => filterCriticalInsights(insights), [insights]);
  const alertInsights = useMemo(() => {
    const all = [
      ...criticalInsights.map(i => ({ ...i, _priority: "critical" as const })),
      ...insights.filter(i => i.severity === "medium").map(i => ({ ...i, _priority: "warning" as const })),
    ];
    const seen = new Set<string>();
    return all.filter(i => {
      const metric = detectMetric(i.message, i.category);
      const key = metric ?? `${i.category ?? ""}::${i.message.slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4);
  }, [criticalInsights, insights]);

  const briefs = useMemo(() => alertInsights.map(i => {
    const metric = detectMetric(i.message, i.category);
    const rule = metric ? metricDecisionRules[metric] : null;
    // Convert raw category label (e.g. "sales", "operations") to a proper title
    const rawCategory = i.category ?? "";
    const readableIssue = rawCategory
      ? rawCategory.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + " Performance"
      : "Business anomaly requires review";
    return rule
      ? { ...rule, category: i.category, priority: i._priority }
      : {
          issue: readableIssue,
          recommendation: "Open the decision review and compare the affected metric.",
          expectedOutcome: "Reduce decision uncertainty and prevent reactive action based on a single signal.",
          expectedFinancialImpact: 15000, costOfDelayPerDay: 420, expectedRoi: 1.8,
          confidence: i._priority === "critical" ? 74 : 68, risk: "Medium" as const,
          evidence: ["Anomaly detected in uploaded data", "Business context requires human review"],
          category: i.category, priority: i._priority,
        };
  }), [alertInsights]);

  const totalImpact = briefs.reduce((s, b) => s + b.expectedFinancialImpact, 0);
  const approvalCount = briefs.filter(b => b.risk !== "Low").length;
  const criticalCount = briefs.filter(b => b.risk === "High" || b.priority === "critical").length;
  const hasData = briefs.length > 0 || pendingDecisions > 0 || (topMetrics ?? []).length > 0;

  const handleSubmit = () => {
    if (!query.trim()) return;
    const { destination } = logQuery(query);
    navigate(destination);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* ── First-time explainer: "What is Quantivis?" ──────────────────── */}
      <WhatIsQuantivis />



      {/* ── Copilot input ─────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-center mb-5">
          <h1 className="text-[18px] font-semibold tracking-tight tracking-tight">
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            What decision do you need to make today?
          </p>
        </div>

        <div className="relative">
          <Textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Ask anything — 'What are my biggest risks?' · 'Show pending approvals' · 'Run a supply chain scenario'"
            className="min-h-[72px] text-sm resize-none pr-20 rounded-xl border-border/50 focus:border-primary/40"
            rows={2}
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!query.trim()}
            className="absolute bottom-2.5 right-2.5 gap-1.5"
          >
            <MessageSquareText className="w-3.5 h-3.5" />
            Ask
          </Button>
          <p className="text-[11px] text-muted-foreground mt-1 ml-1">⌘+Enter to send</p>
        </div>
      </motion.div>

      {/* ── Quick stats — always show ────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="grid grid-cols-3 gap-3">
          <Card
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => navigate("/decisions")}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-semibold">Pending</p>
                <p className="text-xl font-bold">{pendingDecisions}</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => navigate("/executive-intelligence")}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-semibold">Open risks</p>
                <p className="text-xl font-bold">{criticalCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => navigate("/decisions")}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-success" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-semibold">Approvals</p>
                <p className="text-xl font-bold">{approvalCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* ── Suggested prompts — show when no data ───────────────────────── */}
      {!hasData && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Suggested</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(lang.copilotPrompts.length > 0
              ? lang.copilotPrompts.map((label, i) => ({
                  label,
                  icon: PROMPTS[i % PROMPTS.length].icon,
                  path: PROMPTS[i % PROMPTS.length].path,
                }))
              : PROMPTS
            ).map(p => (
              <Card
                key={p.path}
                className="cursor-pointer hover:border-primary/40 transition-all hover:bg-muted/20"
                onClick={() => navigate(p.path)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <p.icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-sm flex-1">{p.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-4 text-center">
            <button
              onClick={() => navigate("/data-upload")}
              className="text-xs text-primary hover:underline"
            >
              Upload your first dataset to activate decision intelligence →
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Executive summary — only when data exists ───────────────────── */}
      {hasData && briefs.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Executive summary</p>
              <p className="font-semibold text-sm">
                {briefs.length} priority issue{briefs.length !== 1 ? "s" : ""} detected. Estimated impact: {formatEuro(totalImpact)}.
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {approvalCount} decision{approvalCount !== 1 ? "s" : ""} require approval · {criticalCount} critical risk{criticalCount !== 1 ? "s" : ""} require review
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Decision briefs ──────────────────────────────────────────────── */}
      {hasData && briefs.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Decision briefs</p>
          {briefs.map((brief, i) => (
            <Card
              key={`${brief.issue}-${i}`}
              className="cursor-pointer hover:shadow-sm transition-shadow"
              onClick={() => navigate("/decisions")}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${brief.priority === "critical" ? "text-destructive" : "text-warning"}`}>
                    {brief.priority === "critical"
                      ? <AlertTriangle className="w-4 h-4" />
                      : <TrendingDown className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-semibold leading-snug">
                        {brief.issue.split(" ").slice(0, 7).join(" ")}{brief.issue.split(" ").length > 7 ? "…" : ""}
                      </p>
                      <Badge variant="secondary" className="text-[10px]">{Number(brief.confidence ?? 0).toFixed(1)}% confidence</Badge>
                      <Badge variant="outline" className={`text-[10px] ${riskColor(brief.risk)}`}>{brief.risk} risk</Badge>
                      <Badge variant="secondary" className="text-[10px]">{formatEuro(brief.expectedFinancialImpact)} impact</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{brief.recommendation}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                </div>
                <TrustCard
                  data={{
                    confidence: brief.confidence,
                    evidenceStatus: brief.evidence && brief.evidence.length > 0 ? "verified" : "partial",
                    evidenceSources: brief.evidence ? brief.evidence.map((e: string) => ({ label: e })) : [],
                    governanceStatus: "compliant",
                    sourceKind: "brief",
                  }}
                  className="mt-2"
                />
                <div className="grid gap-2 sm:grid-cols-3 text-xs">
                  <div className="rounded-md bg-muted/40 p-2 flex items-center gap-1.5">
                    <Euro className="w-3 h-3 text-success shrink-0" />
                    <span className="font-semibold">{formatEuro(brief.expectedFinancialImpact)}</span>
                    <span className="text-muted-foreground">impact</span>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3 text-success shrink-0" />
                    <span className="font-semibold">{brief.expectedRoi.toFixed(1)}x</span>
                    <span className="text-muted-foreground">ROI</span>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-warning shrink-0" />
                    <span className="font-semibold">{formatEuro(brief.costOfDelayPerDay)}/day</span>
                    <span className="text-muted-foreground">delay cost</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* ── Key metrics ──────────────────────────────────────────────────── */}
      {hasData && (topMetrics ?? []).length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Key metrics</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(topMetrics ?? []).slice(0, 6).map((m, i) => {
              const pct = m.previousTotal && m.previousTotal !== 0
                ? ((m.total - m.previousTotal) / Math.abs(m.previousTotal)) * 100 : null;
              const pos = (pct ?? 0) >= 0;
              return (
                <Card key={i}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground capitalize truncate">{m.metricType.replace(/_/g, " ")}</p>
                    <p className="text-xl font-bold mt-1">{m.latest >= 1000 ? `${(m.latest / 1000).toFixed(1)}k` : m.latest.toFixed(1)}</p>
                    {pct != null && (
                      <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${pos ? "text-success" : "text-destructive"}`}>
                        {pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {pos ? "+" : ""}{pct.toFixed(1)}%
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ── Calibration score ────────────────────────────────────────────── */}
      {calibrationScore != null && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <p className="text-sm font-medium">Decision accuracy</p>
                </div>
                <span className="text-xl font-bold">{calibrationScore}%</span>
              </div>
              <Progress value={calibrationScore} className="h-1.5" />
              <p className="text-xs text-muted-foreground mt-1.5">Based on past decisions and their measured outcomes.</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Advanced workspaces link ─────────────────────────────────────── */}
      {hasData && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}>
          <div className="text-center pt-2">
            <p className="text-xs text-muted-foreground">
              Need a specific workspace?{" "}
              <button
                onClick={() => navigate("/copilot")}
                className="text-primary hover:underline"
              >
                Open Decision Copilot
              </button>
              {" · "}
              <button
                onClick={() => navigate("/governance")}
                className="text-primary hover:underline"
              >
                Governance
              </button>
              {" · "}
              <button
                onClick={() => navigate("/data-upload")}
                className="text-primary hover:underline"
              >
                Upload data
              </button>
            </p>
          </div>
        </motion.div>
      )}

    </div>
  );
};

export default CopilotHome;
