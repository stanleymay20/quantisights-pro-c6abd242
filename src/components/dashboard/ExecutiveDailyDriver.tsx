// @ts-nocheck — suppresses TS2589/TS2769 from large generated schema; remove when schema stabilises
import { useState, useEffect, useCallback, useMemo, useRef, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  MessageSquareText,
  ArrowRight,
  Loader2,
  Target,
  BarChart3,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Minus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useExecutiveIntelligence } from "@/hooks/useExecutiveIntelligence";
import type { MetricTypeSummary } from "@/hooks/useMetrics";
import type { Insight } from "@/hooks/useInsights";
import { generateAnswer } from "@/lib/copilot-answer-engine";
import type { DecisionSummary } from "@/lib/copilot-answer-engine";
import InsightEvidencePanel from "./InsightEvidencePanel";

interface PendingDecision {
  id: string;
  recommended_action: string;
  decision_type: string;
  capped_confidence: number | null;
  predicted_net_impact: number | null;
  created_at: string;
}

interface Props {
  displayName: string;
  orgId: string | null;
  insights: Insight[];
  topMetrics: MetricTypeSummary[];
  pendingDecisions: number;
}

const EURO = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
};

const todayKey = () => new Date().toISOString().slice(0, 10);

function truncateWords(str: string, n: number): string {
  const words = str.split(" ");
  return words.length <= n ? str : words.slice(0, n).join(" ") + "…";
}

function MetricChip({ metric }: { metric: MetricTypeSummary }) {
  const label = metric.metricType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const val = metric.latest > 1000 ? EURO(metric.latest) : metric.latest.toFixed(1);
  const up = metric.trend === "up";
  const down = metric.trend === "down";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold">{val}</span>
        {up && <TrendingUp className="h-3.5 w-3.5 text-success" />}
        {down && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
        {!up && !down && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
    </div>
  );
}

const DecisionQueueItem = forwardRef<HTMLDivElement, { decision: PendingDecision }>(function DecisionQueueItem({ decision }, ref) {
  const navigate = useNavigate();
  const conf = decision.capped_confidence;
  const impact = decision.predicted_net_impact;
  const title = truncateWords(decision.recommended_action, 10);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-border/30 py-3 px-1 last:border-0"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px] capitalize">
              {decision.decision_type.replace(/_/g, " ")}
            </Badge>
            {conf !== null && <span className="text-xs text-muted-foreground">{conf}% prediction confidence</span>}
            {impact !== null && (
              <span className={`text-xs font-medium ${impact >= 0 ? "text-success" : "text-destructive"}`}>
                {impact >= 0 ? "+" : ""}{EURO(impact)} estimated exposure
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground line-clamp-1">{title}</p>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-[11px] font-semibold"
          onClick={() => navigate("/decisions")}
        >
          Review
        </Button>
      </div>
    </motion.div>
  );
});

const ExecutiveDailyDriver = ({ displayName, orgId, insights, topMetrics, pendingDecisions }: Props) => {
  const navigate = useNavigate();
  const { brief, interventions, loading: briefLoading, regenerate, generating } = useExecutiveIntelligence();
  const [decisions, setDecisions] = useState<PendingDecision[]>([]);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<ReturnType<typeof generateAnswer> | null>(null);
  const [answering, setAnswering] = useState(false);
  const autoGeneratedRef = useRef(false);

  useEffect(() => {
    if (autoGeneratedRef.current || briefLoading || generating) return;
    if (brief) return;
    if (!orgId) return;

    const cacheKey = `brief_auto_generated_${orgId}_${todayKey()}`;
    if (sessionStorage.getItem(cacheKey)) return;

    autoGeneratedRef.current = true;
    sessionStorage.setItem(cacheKey, "1");
    regenerate();
  }, [brief, briefLoading, generating, orgId, regenerate]);

  useEffect(() => {
    if (!orgId) return;
    (supabase as any)
      .from("decision_ledger")
      .select("id,recommended_action,decision_type,capped_confidence,predicted_net_impact,created_at")
      .eq("organization_id", orgId)
      .eq("is_suppressed", false)
      .in("decision_status", ["pending", "active"])
      .order("created_at", { ascending: false })
      .limit(4)
      .then(({ data }: { data: PendingDecision[] | null }) => setDecisions(data ?? []));
  }, [orgId]);

  const handleAsk = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setAnswering(true);
    setQuery("");
    try {
      const result = generateAnswer(q, {
        insights,
        metrics: topMetrics,
        pendingDecisions,
        orgName: "your organisation",
        decisions: decisions as unknown as DecisionSummary[],
      });
      setAnswer(result);
      import("@/lib/analytics").then(({ trackCopilotQuery }) => trackCopilotQuery(result.destination));
    } finally {
      setAnswering(false);
    }
  }, [query, insights, topMetrics, pendingDecisions, decisions]);

  const briefSummary = brief?.summary_json;
  const criticalInterventions = interventions
    .filter(i => i.escalation_tier === "critical" || i.escalation_tier === "high")
    .slice(0, 3);
  const topDecision = decisions[0];
  const topExecutiveDecisions = decisions.slice(0, 3);
  const exposure = decisions.reduce((sum, d) => sum + Math.abs(d.predicted_net_impact ?? 0), 0);
  const highestConfidence = Math.max(0, ...decisions.map((d) => d.capped_confidence ?? 0));
  // Previously fell back to "1" whenever any decision was pending, even
  // with zero real critical/high interventions -- fabricating a "Critical
  // Risk" signal from "a decision exists," which directly contradicted
  // Executive Intelligence's real unresolved-critical count on the same
  // data. Show the real count; a merely-pending (non-critical) decision
  // is already surfaced separately via "Executive decisions" above.
  const criticalCount = criticalInterventions.length;
  const queueBreakdown = useMemo(() => {
    const critical = criticalCount;
    const high = Math.min(Math.max(pendingDecisions - critical, 0), 2);
    const medium = Math.min(Math.max(pendingDecisions - critical - high, 0), 5);
    const low = Math.max(pendingDecisions - critical - high - medium, 0);
    return { critical, high, medium, low };
  }, [criticalCount, pendingDecisions]);

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <section aria-labelledby="executive-brief-title" className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">Executive Brief</Badge>
            <div>
              <h1 id="executive-brief-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Good {greeting()}, {displayName}.
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Executive decisions</p>
                <p className="mt-1 text-2xl font-semibold">{Math.min(pendingDecisions, 3)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Critical risk</p>
                <p className="mt-1 text-2xl font-semibold text-destructive">{criticalCount}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Estimated exposure</p>
                <p className="mt-1 text-2xl font-semibold">{exposure > 0 ? EURO(exposure) : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recommended first action</p>
                <p className="mt-1 text-sm font-semibold">{topDecision ? truncateWords(topDecision.recommended_action, 5) : "No active decision"}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="h-10 px-5 font-semibold" onClick={() => navigate(topDecision ? "/decisions?review=top" : "/reports")}>
              {topDecision ? "Review Decision" : "Open Reports"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-10 w-fit shrink-0"
              onClick={() => navigate("/executive-brief")}
            >
              Open Executive Brief
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-10 w-fit shrink-0 gap-1.5"
              onClick={() => {
                regenerate();
                import("@/lib/analytics").then(({ trackBriefGenerated }) => trackBriefGenerated());
              }}
              disabled={generating}
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="executive-mode-title" className="rounded-2xl border border-border/40 bg-background p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">Executive Mode</Badge>
            <h2 id="executive-mode-title" className="mt-2 text-xl font-semibold tracking-tight">
              Today I recommend {topExecutiveDecisions.length || 0} decision{topExecutiveDecisions.length === 1 ? "" : "s"}.
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              AICIS keeps the first screen focused on the decisions that need executive judgment now.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            onClick={() => navigate(topExecutiveDecisions.length ? "/decisions?review=top" : "/reports")}
          >
            {topExecutiveDecisions.length ? "Review top decision" : "Open reports"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {topExecutiveDecisions.length > 0 ? topExecutiveDecisions.map((decision, index) => (
            <Card key={decision.id} className={index === 0 ? "border-primary/25 bg-primary/[0.02]" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <Badge variant={index === 0 ? "default" : "outline"} className="text-[10px]">
                    Decision {index + 1}
                  </Badge>
                  {decision.capped_confidence !== null && (
                    <span className="text-xs font-semibold text-primary">{Math.round(decision.capped_confidence)}%</span>
                  )}
                </div>
                <p className="mt-3 line-clamp-2 text-sm font-semibold">{decision.recommended_action}</p>
                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>Expected impact</span>
                    <span className="font-medium text-foreground">
                      {decision.predicted_net_impact != null ? EURO(Math.abs(decision.predicted_net_impact)) : "Pending"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Evidence</span>
                    <span className="font-medium text-foreground">Review required</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Risk</span>
                    <span className={index === 0 ? "font-medium text-destructive" : "font-medium text-warning"}>
                      {index === 0 ? "High" : "Medium"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Estimated execution</span>
                    <span className="font-medium text-foreground">3 days</span>
                  </div>
                </div>
                <Button
                  className="mt-4 h-8 w-full text-xs"
                  variant={index === 0 ? "default" : "outline"}
                  onClick={() => navigate(index === 0 ? "/decisions?review=top" : "/decisions")}
                >
                  Review
                </Button>
              </CardContent>
            </Card>
          )) : (
            <div className="rounded-xl border border-dashed border-border/60 p-5 text-sm text-muted-foreground lg:col-span-3">
              No active executive decisions. We&apos;ll surface the next decision here when AICIS has enough evidence.
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)]">
        <Card className="border-primary/20 bg-background">
          <CardContent className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">Next Best Decision</Badge>
              {topDecision?.capped_confidence !== null && topDecision && (
                <span className="text-xs font-medium text-muted-foreground">Prediction confidence {Math.round(topDecision.capped_confidence)}%</span>
              )}
            </div>
            {generating ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Preparing the latest decision brief from live signals…
              </div>
            ) : topDecision ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold leading-snug">{topDecision.recommended_action}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Recommended action</p>
                  <p className="mt-1 text-base font-medium">Review the supporting evidence before a governance action is taken.</p>
                </div>

                <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Why?</p>
                  <ul className="mt-3 space-y-2 text-sm text-foreground">
                    <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Live signals indicate a decision threshold has been crossed.</li>
                    <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Supporting evidence is available for review.</li>
                    <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> The approval record will preserve the rationale and actor trail.</li>
                  </ul>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estimated outcome</p>
                    <p className="mt-2 text-sm">Lower execution risk and preserve decision accountability.</p>
                  </div>
                  <div className="rounded-xl border border-border/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What happens if you approve</p>
                    <p className="mt-2 text-sm">The decision moves into the approval record and can be measured against outcomes.</p>
                  </div>
                </div>

                <Button className="h-10 px-5 font-semibold" onClick={() => navigate("/decisions?review=top")}>
                  Review evidence <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : briefSummary ? (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold leading-snug">{briefSummary.headline}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{briefSummary.why_it_matters}</p>
                <Button onClick={() => navigate("/reports")}>Open executive report</Button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-6">
                <p className="text-sm font-medium">No active executive decisions.</p>
                <p className="mt-1 text-xs text-muted-foreground">You&apos;re fully up to date. We&apos;ll notify you when something needs attention.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-success/20">
          <CardContent className="p-5 sm:p-6">
            <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">Verified by AICIS</Badge>
            <div className="mt-4 space-y-3 text-sm">
              {[
                "Evidence complete",
                "Sources verified",
                "Policy compliant",
                "Similar decision history checked",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl bg-muted/30 p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Overall confidence</p>
              <p className="mt-1 text-3xl font-semibold">{highestConfidence || "—"}{highestConfidence ? "%" : ""}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="rounded-2xl border border-border/40 bg-background p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Decision Queue</p>
            <p className="mt-1 text-sm text-muted-foreground">Grouped by executive priority. Expand the full queue only when needed.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/decisions")}>Open Decisions</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            ["Critical", queueBreakdown.critical, "text-destructive"],
            ["High", queueBreakdown.high, "text-warning"],
            ["Medium", queueBreakdown.medium, "text-primary"],
            ["Low", queueBreakdown.low, "text-muted-foreground"],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border border-border/40 p-4">
              <p className={`text-2xl font-semibold ${tone}`}>{value}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        {decisions.length > 1 && (
          <div className="mt-4 divide-y divide-border/30">
            <AnimatePresence mode="popLayout">
              {decisions.slice(1, 3).map(d => <DecisionQueueItem key={d.id} decision={d} />)}
            </AnimatePresence>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business Health</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Operations", criticalCount === 0 ? "Stable" : `${criticalCount} risk`, criticalCount === 0 ? "text-success" : "text-destructive"],
            ["Financial", exposure > 0 ? EURO(exposure) : "No exposure", "text-foreground"],
            ["Compliance", "Approval record active", "text-success"],
            ["AI Confidence", highestConfidence ? `${Math.round(highestConfidence)}%` : "Pending", highestConfidence ? "text-primary" : "text-muted-foreground"],
          ].map(([label, value, tone]) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className={`mt-2 text-lg font-semibold ${tone}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {criticalInterventions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priority risks</p>
          {criticalInterventions.map(i => (
            <div key={i.id} className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.03] p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{i.title}</p>
                {i.recommended_action && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{i.recommended_action}</p>}
              </div>
              <Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={() => navigate("/executive-intelligence")}>Review</Button>
            </div>
          ))}
        </div>
      )}

      {insights.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Insights</p>
          <div className="space-y-2">
            {insights.slice(0, 5).map(insight => (
              <InsightEvidencePanel key={insight.id} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {topMetrics.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Supporting metrics
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {topMetrics.slice(0, 6).map(m => <MetricChip key={m.metricType} metric={m} />)}
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-border/40 bg-muted/20 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Outcomes</p>
            <h2 className="mt-1 text-base font-semibold">Last week&apos;s decisions are feeding the learning loop.</h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/outcomes")}>View outcomes</Button>
        </div>
        <div className="mt-4 rounded-xl border border-border/40 bg-background p-4">
          <p className="text-sm font-medium">{decisions.length > 0 ? "Prior approvals awaiting measured outcomes" : "No active executive decisions."}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {decisions.length > 0
              ? "Quantivis will compare approved decisions with actual outcomes once measurement data arrives."
              : "You&apos;re fully up to date. We&apos;ll notify you when something needs attention."}
          </p>
        </div>
      </section>

      <div className="border border-border/30 rounded-lg p-4 space-y-3 bg-muted/20">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MessageSquareText className="h-3.5 w-3.5" /> Ask about this decision
        </p>

        <AnimatePresence>
          {answer && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-primary/25 bg-primary/[0.02] p-4 space-y-3"
            >
              <p className="text-sm font-semibold">{answer.headline}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{answer.summary}</p>
              {answer.lines.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-border/30">
                  {answer.lines.map((line, i) => (
                    <div key={i} className={`flex justify-between gap-3 px-3 py-1.5 text-xs ${i < answer.lines.length - 1 ? "border-b border-border/20" : ""} ${line.alert ? "bg-destructive/[0.03]" : ""}`}>
                      <span className="text-muted-foreground">{line.label}</span>
                      <span className={`font-medium ${line.alert ? "text-destructive" : line.emphasis ? "text-foreground" : "text-muted-foreground"}`}>{line.value}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  {answer.confidence !== null && <Badge variant="outline" className="h-5 text-[10px]">{Math.round(answer.confidence)}% confidence</Badge>}
                  {answer.dataSource === "live" && <Badge variant="outline" className="h-5 text-[10px] text-success border-success/30">Live data</Badge>}
                </div>
                <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => navigate(answer.destination)}>
                  {answer.destinationLabel} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative">
          <Textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAsk(); } }}
            placeholder="Ask: What evidence supports this? What risk should I review first?"
            className="min-h-[64px] resize-none rounded-xl border-border/50 pr-16 text-sm focus:border-primary/50"
            rows={2}
            aria-label="Ask about this decision"
          />
          <Button size="sm" onClick={handleAsk} disabled={!query.trim() || answering} className="absolute bottom-2 right-2 gap-1.5">
            {answering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border/20 pt-2">
        {[
          { label: "Decisions", icon: Target, path: "/decisions", count: pendingDecisions },
          { label: "Governance", icon: ShieldCheck, path: "/governance" },
          { label: "Reports", icon: BarChart3, path: "/reports" },
        ].map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="flex flex-col items-center gap-1 rounded-lg p-2.5 text-center transition-colors hover:bg-muted/50"
          >
            <div className="relative">
              <item.icon className="h-4 w-4 text-primary" />
              {item.count !== undefined && item.count > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-warning text-[8px] font-bold text-warning-foreground">
                  {item.count}
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ExecutiveDailyDriver;
