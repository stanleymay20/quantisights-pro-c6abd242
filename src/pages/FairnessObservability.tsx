import { useMemo } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { useFairnessAssessments, useModelDrift } from "@/hooks/useFairnessObservability";
import { useSubscriptionGate } from "@/hooks/useSubscriptionGate";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { Shield, Activity, AlertTriangle, CheckCircle, XCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statusIcon = (status: string) => {
  switch (status) {
    case "pass": return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "warning": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case "fail": return <XCircle className="w-4 h-4 text-destructive" />;
    default: return <Activity className="w-4 h-4 text-muted-foreground" />;
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case "pass": return "bg-green-500/10 text-green-700 border-green-500/20";
    case "warning": return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
    case "fail": return "bg-destructive/10 text-destructive border-destructive/20";
    default: return "bg-muted text-muted-foreground";
  }
};

const FairnessObservability = () => {
  const { currentOrgId } = useOrganization();
  const { canAccess } = useSubscriptionGate();
  const { data: assessments = [], isLoading: fairnessLoading } = useFairnessAssessments(currentOrgId);
  const { data: driftSnapshots = [], isLoading: driftLoading } = useModelDrift(currentOrgId);

  const fairnessSummary = useMemo(() => {
    const total = assessments.length;
    const passing = assessments.filter((a) => a.assessment_status === "pass").length;
    const warnings = assessments.filter((a) => a.assessment_status === "warning").length;
    const failures = assessments.filter((a) => a.assessment_status === "fail").length;
    return { total, passing, warnings, failures };
  }, [assessments]);

  const driftSummary = useMemo(() => {
    const total = driftSnapshots.length;
    const drifting = driftSnapshots.filter((d) => d.drift_detected).length;
    const avgScore = total > 0
      ? driftSnapshots.reduce((sum, d) => sum + (Number(d.drift_score) || 0), 0) / total
      : 0;
    return { total, drifting, avgScore };
  }, [driftSnapshots]);

  if (!canAccess("biasDetection")) {
    return (
      <div className="flex-1 p-6">
        <div className="max-w-lg mx-auto mt-16 text-center">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-[16px] font-semibold tracking-tight mb-2">Fairness & Observability</h1>
          <p className="text-muted-foreground text-sm">
            This feature requires an Enterprise plan. Upgrade to access fairness assessments and model drift monitoring.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-auto space-y-6">
      <div>
        <h1 className="text-[18px] font-semibold tracking-tight tracking-tight">Fairness & Model Observability</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor algorithmic fairness, disparate impact, and model drift across your decision intelligence system.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Fairness Checks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fairnessSummary.total}</p>
            <p className="text-xs text-muted-foreground">Total assessments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-green-600 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" /> Passing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{fairnessSummary.passing}</p>
            <p className="text-xs text-muted-foreground">No disparate impact detected</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-yellow-600 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{fairnessSummary.warnings}</p>
            <p className="text-xs text-muted-foreground">Potential bias signals</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Drift Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {driftSummary.total > 0 ? driftSummary.avgScore.toFixed(2) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {driftSummary.drifting} of {driftSummary.total} models drifting
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Fairness Assessments Table */}
      <SectionErrorBoundary sectionName="Fairness Assessments">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" /> Fairness Assessments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fairnessLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />)}
              </div>
            ) : assessments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No fairness assessments yet. They will be generated automatically when decisions are evaluated.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table">
                  <thead>
                    <tr className="border-b border-border/30 text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Attribute</th>
                      <th className="pb-2 font-medium text-muted-foreground">Metric</th>
                      <th className="pb-2 font-medium text-muted-foreground">Group A</th>
                      <th className="pb-2 font-medium text-muted-foreground">Group B</th>
                      <th className="pb-2 font-medium text-muted-foreground">DI Ratio</th>
                      <th className="pb-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assessments.slice(0, 20).map((a) => (
                      <tr key={a.id} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 font-medium">{a.protected_attribute}</td>
                        <td className="py-2.5 text-muted-foreground">{a.metric_name}</td>
                        <td className="py-2.5">
                          <span className="text-xs">{a.group_a_label}: </span>
                          <span className="font-mono">{Number(a.group_a_value)?.toFixed(3) ?? "—"}</span>
                        </td>
                        <td className="py-2.5">
                          <span className="text-xs">{a.group_b_label}: </span>
                          <span className="font-mono">{Number(a.group_b_value)?.toFixed(3) ?? "—"}</span>
                        </td>
                        <td className="py-2.5 font-mono">
                          {Number(a.disparate_impact_ratio)?.toFixed(3) ?? "—"}
                        </td>
                        <td className="py-2.5">
                          <Badge variant="outline" className={`gap-1 ${statusColor(a.assessment_status)}`}>
                            {statusIcon(a.assessment_status)}
                            {a.assessment_status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </SectionErrorBoundary>

      {/* Model Drift */}
      <SectionErrorBoundary sectionName="Model Drift">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" /> Model Drift Monitor
            </CardTitle>
          </CardHeader>
          <CardContent>
            {driftLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />)}
              </div>
            ) : driftSnapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No drift snapshots recorded yet. Model drift is monitored automatically as predictions are evaluated.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table">
                  <thead>
                    <tr className="border-b border-border/30 text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Model</th>
                      <th className="pb-2 font-medium text-muted-foreground">Date</th>
                      <th className="pb-2 font-medium text-muted-foreground">Drift Score</th>
                      <th className="pb-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driftSnapshots.slice(0, 20).map((d) => (
                      <tr key={d.id} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 font-medium">{d.model_name}</td>
                        <td className="py-2.5 text-muted-foreground">{d.snapshot_date}</td>
                        <td className="py-2.5 font-mono">{Number(d.drift_score)?.toFixed(3)}</td>
                        <td className="py-2.5">
                          <Badge variant="outline" className={d.drift_detected
                            ? "bg-destructive/10 text-destructive border-destructive/20"
                            : "bg-green-500/10 text-green-700 border-green-500/20"
                          }>
                            {d.drift_detected ? "Drift Detected" : "Stable"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </SectionErrorBoundary>
    </div>
  );
};

export default FairnessObservability;
