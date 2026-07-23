import { useState, useEffect, memo } from "react";
import { GitCompare, TrendingUp, Target, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

interface ContextPerformance {
  contextId: string;
  contextName: string;
  decisionType: string;
  totalDecisions: number;
  successRate: number;
  avgAccuracy: number;
  pendingEvaluation: number;
}

interface CrossContextAnalyticsProps {
  organizationId: string;
}

const MIN_BASELINE_SAMPLE = 10;
const PRELIMINARY_SAMPLE = 30;

const CrossContextAnalytics = memo(({ organizationId }: CrossContextAnalyticsProps) => {
  const [data, setData] = useState<ContextPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const [contextsRes, decisionsRes, outcomesRes] = await Promise.all([
        supabase
          .from("decision_contexts")
          .select("id, name, decision_type")
          .eq("organization_id", organizationId)
          .eq("status", "active"),
        supabase
          .from("decision_ledger")
          .select("id, decision_context_id, decision_status")
          .eq("organization_id", organizationId)
          .not("decision_context_id", "is", null),
        supabase
          .from("decision_outcomes")
          .select("decision_id, outcome_status, accuracy_score")
          .eq("organization_id", organizationId),
      ]);

      if (contextsRes.error || decisionsRes.error || outcomesRes.error) {
        const msg = contextsRes.error?.message || decisionsRes.error?.message || outcomesRes.error?.message || "Fetch failed";
        console.error("CrossContextAnalytics error:", msg);
        setError(msg);
        setLoading(false);
        return;
      }

      const contexts = contextsRes.data ?? [];
      const decisions = decisionsRes.data ?? [];
      const outcomes = outcomesRes.data ?? [];

      if (contexts.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const outcomeByDecision = new Map<string, { outcome_status: string; accuracy_score: number | null }>();
      outcomes.forEach((o) => outcomeByDecision.set(o.decision_id, o));

      const perfMap = new Map<string, ContextPerformance>();

      for (const ctx of contexts) {
        perfMap.set(ctx.id, {
          contextId: ctx.id,
          contextName: ctx.name,
          decisionType: ctx.decision_type,
          totalDecisions: 0,
          successRate: 0,
          avgAccuracy: 0,
          pendingEvaluation: 0,
        });
      }

      for (const d of decisions) {
        if (!d.decision_context_id) continue;
        const perf = perfMap.get(d.decision_context_id);
        if (!perf) continue;
        perf.totalDecisions++;

        const outcome = outcomeByDecision.get(d.id);
        if (outcome) {
          if (outcome.outcome_status === "success" || outcome.outcome_status === "partial_success") {
            perf.successRate++;
          }
          if (outcome.accuracy_score != null) {
            perf.avgAccuracy += outcome.accuracy_score;
          }
        } else {
          perf.pendingEvaluation++;
        }
      }

      // Normalize
      const results: ContextPerformance[] = [];
      perfMap.forEach(perf => {
        const evaluated = perf.totalDecisions - perf.pendingEvaluation;
        if (evaluated > 0) {
          perf.successRate = Math.round((perf.successRate / evaluated) * 100);
          perf.avgAccuracy = Math.round(perf.avgAccuracy / evaluated);
        } else {
          perf.successRate = 0;
          perf.avgAccuracy = 0;
        }
        results.push(perf);
      });

      results.sort((a, b) => b.totalDecisions - a.totalDecisions);
      setData(results);
      setLoading(false);
    };

    fetchData();
  }, [organizationId]);

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6">
          <div className="h-24 rounded bg-muted/30 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6 text-center">
          <AlertTriangle className="w-6 h-6 text-destructive/60 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Failed to load cross-context analytics</p>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6 text-center">
          <GitCompare className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No decision contexts with tracked decisions yet.</p>
        </CardContent>
      </Card>
    );
  }

  const typeLabel = (t: string) => t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <GitCompare className="w-3.5 h-3.5" /> Cross-Context Decision Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.filter(d => d.totalDecisions > 0).slice(0, 6).map((ctx) => {
          const evaluated = ctx.totalDecisions - ctx.pendingEvaluation;
          const hasCredibleBaseline = evaluated >= MIN_BASELINE_SAMPLE;
          const isPreliminary = evaluated >= MIN_BASELINE_SAMPLE && evaluated < PRELIMINARY_SAMPLE;
          return (
            <div key={ctx.contextId} className="p-3 rounded-lg border border-border/30 bg-card/50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-foreground truncate">{ctx.contextName}</span>
                  <Badge variant="outline" className="text-[9px] shrink-0">{typeLabel(ctx.decisionType)}</Badge>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{ctx.totalDecisions} decisions</span>
              </div>

              {evaluated > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Success Rate</p>
                    {hasCredibleBaseline ? (
                      <>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-primary" />
                          <span className={`text-sm font-bold ${ctx.successRate >= 60 ? "text-primary" : "text-destructive"}`}>
                            {isPreliminary ? "Preliminary " : ""}{ctx.successRate}%
                          </span>
                        </div>
                        <Progress value={ctx.successRate} className="h-0.5 mt-1" />
                      </>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-sm font-bold text-muted-foreground">Building baseline</span>
                        <p className="text-[9px] text-muted-foreground/70">Needs {MIN_BASELINE_SAMPLE - evaluated} more evaluated decisions</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Avg Accuracy</p>
                    <div className="flex items-center gap-1">
                      <Target className="w-3 h-3 text-primary" />
                      <span className="text-sm font-bold text-foreground">{Math.round(ctx.avgAccuracy)}%</span>
                    </div>
                    <Progress value={ctx.avgAccuracy} className="h-0.5 mt-1" />
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Evaluated</p>
                    <span className="text-sm font-bold text-foreground">{evaluated}/{ctx.totalDecisions}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <AlertTriangle className="w-3 h-3" />
                  <span className="text-[10px]">{ctx.pendingEvaluation} decisions pending evaluation</span>
                </div>
              )}
            </div>
          );
        })}

        {data.every(d => d.totalDecisions === 0) && (
          <p className="text-xs text-center text-muted-foreground py-2">
            Decisions exist but none are linked to contexts yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
});

CrossContextAnalytics.displayName = "CrossContextAnalytics";

export default CrossContextAnalytics;
