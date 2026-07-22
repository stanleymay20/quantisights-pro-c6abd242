import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import {
  CheckCircle2, XCircle, TrendingUp, TrendingDown,
  Target, BarChart3, Minus, Loader2, ArrowRight,
} from "lucide-react";

interface OutcomeRecord {
  id: string;
  recommended_action: string;
  confidence_at_decision: number | null;
  outcome_delta: number | null;
  prediction_accuracy_score: number | null;
  outcome_measured_at: string | null;
  decided_at: string | null;
  created_at: string;
  decision_type: string;
}

const Outcomes = () => {
  const { currentOrgId } = useOrganization();
  const navigate = useNavigate();
  const [records, setRecords] = useState<OutcomeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrgId) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("decision_ledger")
        .select("id, recommended_action, confidence_at_decision, outcome_delta, prediction_accuracy_score, outcome_measured_at, decided_at, created_at, decision_type")
        .eq("organization_id", currentOrgId)
        .eq("decision_status", "approved")
        .order("created_at", { ascending: false })
        .limit(200);
      setRecords(data ?? []);
      setLoading(false);
    };
    load();
  }, [currentOrgId]);

  const evaluated = useMemo(() => records.filter(r => r.outcome_measured_at && r.outcome_delta != null), [records]);
  const pending = useMemo(() => records.filter(r => !r.outcome_measured_at), [records]);

  const avgAccuracy = useMemo(() => {
    const scored = evaluated.filter(r => r.prediction_accuracy_score != null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((s, r) => s + (r.prediction_accuracy_score ?? 0), 0) / scored.length);
  }, [evaluated]);

  const positiveOutcomes = evaluated.filter(r => (r.outcome_delta ?? 0) > 0).length;
  const negativeOutcomes = evaluated.filter(r => (r.outcome_delta ?? 0) < 0).length;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-auto">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-2">
          <SidebarMobileToggle />
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight tracking-tight">Track Outcomes</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              See how your decisions performed against predictions.
            </p>
          </div>
        </div>

        {/* Summary cards */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          <Card>
            <CardContent className="p-4 text-center">
              <Target className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-[18px] font-semibold tracking-tight">{evaluated.length}</p>
              <p className="text-xs text-muted-foreground">Measured</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <BarChart3 className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
              <p
                className="text-[18px] font-semibold tracking-tight"
                title={avgAccuracy == null ? "No outcomes measured yet. Record an outcome on a decision to activate accuracy tracking." : undefined}
              >
                {avgAccuracy != null ? `${Math.round(avgAccuracy)}%` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {avgAccuracy == null ? "No data yet" : "Accuracy"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-5 h-5 text-success mx-auto mb-1" />
              <p className="text-[18px] font-semibold tracking-tight text-success">{positiveOutcomes}</p>
              <p className="text-xs text-muted-foreground">Worked</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingDown className="w-5 h-5 text-destructive mx-auto mb-1" />
              <p className="text-[18px] font-semibold tracking-tight text-destructive">{negativeOutcomes}</p>
              <p className="text-xs text-muted-foreground">Missed</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Accuracy bar */}
        {avgAccuracy != null && (
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Overall Decision Accuracy</p>
                <span className="text-xl font-bold">{Math.round(avgAccuracy)}%</span>
              </div>
              <Progress value={avgAccuracy} className="h-2.5" />
              <p className="text-xs text-muted-foreground mt-2">
                How closely your decisions matched predicted outcomes.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Evaluated outcomes */}
        {evaluated.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Completed Decisions
            </h2>
            {evaluated.map((r) => {
              const delta = r.outcome_delta ?? 0;
              const isPositive = delta >= 0;
              const accuracy = r.prediction_accuracy_score;
              return (
                <Card
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/decisions/${r.id}/outcome`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/decisions/${r.id}/outcome`);
                    }
                  }}
                  className="cursor-pointer hover:border-primary/40 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 ${isPositive ? "text-success" : "text-destructive"}`}>
                        {isPositive ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug">{r.recommended_action}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge variant={isPositive ? "default" : "destructive"} className="text-xs">
                            {isPositive ? "+" : ""}{delta.toFixed(1)}% impact
                          </Badge>
                          {accuracy != null && (
                            <Badge variant="secondary" className="text-xs">
                              {accuracy.toFixed(0)}% accuracy
                            </Badge>
                          )}
                          <span className="text-[11px] text-muted-foreground">
                            Predicted: {r.confidence_at_decision != null ? Number(r.confidence_at_decision).toFixed(1) : "—"}% confidence
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pending measurement */}
        {pending.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Awaiting Outcome
              </h2>
              <span className="text-xs text-muted-foreground">Record outcomes to calibrate future predictions</span>
            </div>
            {pending.slice(0, 10).map((r) => (
              <Card
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/decisions/${r.id}/outcome`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/decisions/${r.id}/outcome`);
                  }
                }}
                className="opacity-80 hover:opacity-100 transition-opacity cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Minus className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.recommended_action}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Logged with {r.confidence_at_decision != null ? Number(r.confidence_at_decision).toFixed(1) : "—"}% confidence · Outcome not yet recorded
                    </p>
                  </div>
                  <span className="text-xs text-primary font-medium shrink-0 hover:underline">
                    Record outcome →
                  </span>
                </CardContent>
              </Card>
            ))}
            <p className="text-xs text-muted-foreground px-1">
              💡 Recording outcomes improves your team's prediction accuracy over time via Bayesian recalibration.
            </p>
          </div>
        )}

        {/* Empty state */}
        {records.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-1">No outcomes tracked yet</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-5">
              Quantivis tracks how each decision performed versus its prediction — building a
              calibration record that improves future recommendations over time.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button size="sm" onClick={() => navigate("/decisions")}>
                Go to Decision Ledger <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/deliberation")}>
                Review Pending
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default Outcomes;
