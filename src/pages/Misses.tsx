import { useState, useEffect, useMemo } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle, TrendingDown, Target, XCircle, CheckCircle2, Activity, Crosshair,
} from "lucide-react";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface Decision {
  id: string;
  recommended_action: string;
  decision_type: string;
  confidence_at_decision: number | null;
  capped_confidence: number | null;
  calibration_error: number | null;
  prediction_accuracy_score: number | null;
  outcome_delta: number | null;
  actual_value: number | null;
  baseline_value: number | null;
  predicted_net_impact: number | null;
  execution_status: string;
  decided_at: string | null;
  outcome_measured_at: string | null;
  created_at: string;
}

/**
 * A "True Miss" is a prediction error — the system was confident about the wrong outcome.
 * This is distinct from a "Bad Outcome" (negative business result regardless of prediction).
 *
 * Priority order (strongest signal first):
 * 1. predicted_net_impact > 0 but actual outcome_delta ≤ 0 (predicted gains that didn't materialize)
 * 2. prediction_accuracy_score < 50 (explicit accuracy metric below threshold)
 * 3. abs(calibration_error) > 40 (large gap between predicted and actual)
 * 4. High confidence (≥60%) + negative outcome (weakest — can punish correct pessimism)
 */
function isTrueMiss(d: Decision): boolean {
  // Priority 1: Predicted positive impact but outcome negative/zero (strongest signal)
  if (d.predicted_net_impact !== null && d.predicted_net_impact > 0 && (d.outcome_delta ?? 0) <= 0) return true;

  // Priority 2: Explicit prediction accuracy score below threshold
  if (d.prediction_accuracy_score !== null && d.prediction_accuracy_score < 50) return true;

  // Priority 3: Large calibration error
  if (d.calibration_error !== null && Math.abs(d.calibration_error) > 40) return true;

  // Priority 4 (fallback): High confidence + bad outcome
  const conf = d.confidence_at_decision ?? d.capped_confidence ?? 0;
  if (conf >= 60 && (d.outcome_delta ?? 0) < 0) return true;

  return false;
}

function isBadOutcome(d: Decision): boolean {
  return (d.outcome_delta ?? 0) < 0;
}

const MissesPage = () => {
  const { currentOrgId } = useOrganization();
  const { activeDatasetId } = useProject();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrgId) return;
    (async () => {
      setLoading(true);
      // decision_ledger is org-scoped by design (decisions span datasets)
      const { data } = await supabase
        .from("decision_ledger")
        .select("id, recommended_action, decision_type, confidence_at_decision, capped_confidence, calibration_error, prediction_accuracy_score, outcome_delta, actual_value, baseline_value, predicted_net_impact, execution_status, decided_at, outcome_measured_at, created_at")
        .eq("organization_id", currentOrgId)
        .eq("execution_status", "completed")
        .order("created_at", { ascending: false })
        .limit(200);
      if (data) setDecisions(data as Decision[]);
      setLoading(false);
    })();
  }, [currentOrgId]);

  const { trueMisses, badOutcomes, hits, measured, trueMissRate, avgMissCalError, avgHitCalError, worstMiss } = useMemo(() => {
    const measured = decisions.filter(d => d.outcome_delta !== null);
    const trueMisses = measured.filter(isTrueMiss);
    const badOutcomes = measured.filter(d => isBadOutcome(d) && !isTrueMiss(d));
    const hits = measured.filter(d => !isTrueMiss(d) && !isBadOutcome(d));
    const trueMissRate = measured.length > 0 ? (trueMisses.length / measured.length * 100) : 0;

    const avgMissCalError = trueMisses.length > 0
      ? trueMisses.reduce((s, d) => s + Math.abs(d.calibration_error || 0), 0) / trueMisses.length
      : 0;
    const avgHitCalError = hits.length > 0
      ? hits.reduce((s, d) => s + Math.abs(d.calibration_error || 0), 0) / hits.length
      : 0;

    const worstMiss = trueMisses.length > 0
      ? trueMisses.reduce((worst, d) => {
          const worstErr = Math.abs(worst.calibration_error || 0);
          const dErr = Math.abs(d.calibration_error || 0);
          return dErr > worstErr ? d : worst;
        }, trueMisses[0])
      : null;

    return { trueMisses, badOutcomes, hits, measured, trueMissRate, avgMissCalError, avgHitCalError, worstMiss };
  }, [decisions]);

  const renderDecisionRow = (d: Decision) => {
    const conf = d.confidence_at_decision || d.capped_confidence || 0;
    return (
      <div key={d.id} className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/30 border">
        <div className="flex-1 min-w-0 mr-4">
          <p className="text-sm text-foreground truncate">{d.recommended_action}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {d.decision_type} · {d.outcome_measured_at ? new Date(d.outcome_measured_at).toLocaleDateString() : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Outcome</p>
            <p className={`text-sm font-bold tabular-nums ${(d.outcome_delta || 0) < 0 ? "text-destructive" : "text-success"}`}>
              {(d.outcome_delta || 0) >= 0 ? "+" : ""}{(d.outcome_delta || 0).toFixed(1)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Confidence</p>
            <p className="text-sm font-bold tabular-nums">{conf}%</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Cal Error</p>
            <p className="text-sm font-bold text-warning tabular-nums">{Math.abs(d.calibration_error || 0).toFixed(0)}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <DatasetRequired moduleName="Missed Signals">
    <>
        <header className="h-14 border-b border-border/30 flex items-center px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <SidebarMobileToggle />
          <div className="ml-3">
            <h1 className="text-[18px] font-semibold tracking-tight">Missed Signals</h1>
            <p className="text-xs text-muted-foreground">Prediction accuracy — where predictions diverged from reality. Transparency builds trust.</p>
          </div>
        </header>

        <SectionErrorBoundary sectionName="Missed Signals">
        <main className="flex-1 p-8 overflow-auto space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Measured</p>
                <p className="text-2xl font-bold mt-1">{measured.length}</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/20">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Crosshair className="w-3 h-3" /> True Misses</p>
                <p className="text-2xl font-bold mt-1 text-destructive">{trueMisses.length}</p>
              </CardContent>
            </Card>
            <Card className="border-warning/20">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><TrendingDown className="w-3 h-3" /> Bad Outcomes</p>
                <p className="text-2xl font-bold mt-1 text-warning">{badOutcomes.length}</p>
              </CardContent>
            </Card>
            <Card className="border-success/20">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><CheckCircle2 className="w-3 h-3" /> Hits</p>
                <p className="text-2xl font-bold mt-1 text-success">{hits.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">True Miss Rate</p>
                <p className={`text-2xl font-bold mt-1 ${trueMissRate > 40 ? "text-destructive" : trueMissRate > 20 ? "text-warning" : "text-success"}`}>
                  {trueMissRate.toFixed(0)}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Activity className="w-3 h-3" /> Avg Cal Error</p>
                <p className="text-2xl font-bold mt-1 text-warning">{avgMissCalError.toFixed(0)}</p>
                <p className="text-[10px] text-muted-foreground">misses vs {avgHitCalError.toFixed(0)} hits</p>
              </CardContent>
            </Card>
          </div>

          {/* Worst miss */}
          {worstMiss && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  Largest Prediction Error
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-foreground">{worstMiss.recommended_action}</p>
                <div className="flex gap-3 text-xs">
                  <Badge variant="destructive">Outcome: {(worstMiss.outcome_delta || 0) >= 0 ? "+" : ""}{(worstMiss.outcome_delta || 0).toFixed(1)}%</Badge>
                  <Badge variant="outline">Confidence: {worstMiss.confidence_at_decision || worstMiss.capped_confidence || 0}%</Badge>
                  <Badge variant="outline">Cal Error: {Math.abs(worstMiss.calibration_error || 0).toFixed(0)}</Badge>
                  {worstMiss.predicted_net_impact !== null && (
                    <Badge variant="outline">Predicted Impact: {worstMiss.predicted_net_impact > 0 ? "+" : ""}{worstMiss.predicted_net_impact.toFixed(0)}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabbed lists */}
          <Tabs defaultValue="true-misses">
            <TabsList>
              <TabsTrigger value="true-misses" className="gap-1.5">
                <Crosshair className="w-3.5 h-3.5" /> True Misses ({trueMisses.length})
              </TabsTrigger>
              <TabsTrigger value="bad-outcomes" className="gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" /> Bad Outcomes ({badOutcomes.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="true-misses">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Crosshair className="w-4 h-4 text-destructive" />
                    True Misses — Prediction Was Wrong
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    The model was confident about the wrong direction — predicted gains that didn't materialize, or high confidence with opposite results.
                  </p>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : trueMisses.length === 0 ? (
                    <div className="text-center py-12 space-y-2">
                      <Target className="w-10 h-10 mx-auto text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No true misses recorded yet.</p>
                      <p className="text-xs text-muted-foreground">Complete decisions with outcome measurement to populate this dashboard.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">{trueMisses.map(renderDecisionRow)}</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bad-outcomes">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-warning" />
                    Bad Outcomes — But Prediction May Have Been Correct
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Negative business result, but the system correctly flagged risk or assigned low confidence — this is calibration working as intended.
                  </p>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : badOutcomes.length === 0 ? (
                    <div className="text-center py-12 space-y-2">
                      <CheckCircle2 className="w-10 h-10 mx-auto text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No bad outcomes (without prediction error) recorded.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">{badOutcomes.map(renderDecisionRow)}</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Insight */}
          <Card className="border-muted">
            <CardContent className="p-5 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium mb-2">Why distinguish misses from bad outcomes?</p>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
                A bad business outcome with low predicted confidence is actually a <span className="text-foreground font-medium">calibration success</span> — 
                the system correctly identified uncertainty. A "True Miss" is where the prediction itself was wrong: 
                high confidence that didn't materialize, or predicted gains that turned into losses. 
                This distinction prevents gaming calibration scores and builds genuine trust.
              </p>
            </CardContent>
          </Card>
        </main>
        </SectionErrorBoundary>
    </>
    </DatasetRequired>
  );
};

export default MissesPage;
