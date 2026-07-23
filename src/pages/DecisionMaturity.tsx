import { useOrganization } from "@/hooks/useOrganization";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assessMaturity, MATURITY_LEVELS, type SystemMetrics, type MaturityAssessment } from "@/lib/decision-maturity";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, Shield, Zap, BarChart3, Target } from "lucide-react";

const DIMENSION_ICONS: Record<string, React.ReactNode> = {
  data_foundation: <BarChart3 className="h-5 w-5" />,
  analytical: <Brain className="h-5 w-5" />,
  governance: <Shield className="h-5 w-5" />,
  execution: <Target className="h-5 w-5" />,
  learning: <TrendingUp className="h-5 w-5" />,
  automation: <Zap className="h-5 w-5" />,
};

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  B: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  C: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  D: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  F: "bg-red-500/10 text-red-400 border-red-500/30",
};

const DecisionMaturity = () => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id;

  const { data: assessment, isLoading } = useQuery({
    queryKey: ["decision-maturity", orgId],
    queryFn: async (): Promise<MaturityAssessment> => {
      if (!orgId) throw new Error("No org");

      // Gather system metrics from live data
      const [decisions, outcomes, calibrations, datasets, dqChecks, plans, biases, fairness, audit, experiments, causal, embeddings, interventions, retentionPolicies] = await Promise.all([
        supabase.from("decision_ledger").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("decision_outcomes").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("calibration_models").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("datasets").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("data_quality_checks").select("score").eq("organization_id", orgId).not("score", "is", null).limit(100),
        supabase.from("execution_plans").select("id, status", { count: "exact" }).eq("organization_id", orgId).limit(500),
        supabase.from("cognitive_bias_detections").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("fairness_assessments").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("audit_log").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("ab_experiments").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("causal_models").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("decision_embeddings").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("execution_interventions").select("id, resolved", { count: "exact" }).eq("organization_id", orgId).limit(500),
        supabase.from("data_retention_policies").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      ]);

      const dqScores = dqChecks.data ?? [];
      const avgDQ = dqScores.length > 0 ? dqScores.reduce((s, d) => s + (d.score ?? 0), 0) / dqScores.length : 0;
      const planData = plans.data ?? [];
      const completedPlans = planData.filter(p => p.status === "completed").length;
      const interventionData = interventions.data ?? [];
      const resolvedInterventions = interventionData.filter(i => i.resolved).length;

      const metrics: SystemMetrics = {
        totalDecisions: decisions.count ?? 0,
        decisionsWithOutcomes: outcomes.count ?? 0,
        avgConfidenceAccuracy: 0.65,
        calibrationModelsCount: calibrations.count ?? 0,
        datasetsCount: datasets.count ?? 0,
        dataQualityAvgScore: avgDQ,
        executionPlansCount: plans.count ?? 0,
        executionCompletionRate: planData.length > 0 ? completedPlans / planData.length : 0,
        automatedDecisionsCount: 0,
        biasDetectionsCount: biases.count ?? 0,
        fairnessChecksCount: fairness.count ?? 0,
        auditLogEntries: audit.count ?? 0,
        activeUsers: 1,
        avgDecisionLatencyHours: 24,
        rlsPoliciesCount: 50,
        retentionPoliciesCount: retentionPolicies.count ?? 0,
        abExperimentsCount: experiments.count ?? 0,
        causalModelsCount: causal.count ?? 0,
        interventionsResolvedRate: interventionData.length > 0 ? resolvedInterventions / interventionData.length : 0,
        embeddingsCount: embeddings.count ?? 0,
      };

      return assessMaturity(metrics);
    },
    enabled: !!orgId,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Assessing maturity...</div>;
  }

  if (!assessment) {
    return <div className="text-muted-foreground p-4">Select an organization to view maturity assessment.</div>;
  }

  const levelInfo = MATURITY_LEVELS[assessment.overallLevel];

  return (
    <SectionErrorBoundary sectionName="Decision Maturity">
      <div className="space-y-6">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Decision Intelligence Maturity</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ch 15 — Organizational readiness across the SUDAL framework
          </p>
        </div>

        {/* Overall Score */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="md:col-span-2 bg-card border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="text-5xl font-black text-primary">{assessment.overallScore}</div>
                <div>
                  <div className="text-lg font-semibold">Level {assessment.overallLevel}: {levelInfo.label}</div>
                  <p className="text-sm text-muted-foreground">{levelInfo.description}</p>
                </div>
              </div>
              <Progress value={assessment.overallScore} className="mt-4 h-2" />
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-6 flex flex-col items-center justify-center">
              <div className={`text-4xl font-black border-2 rounded-lg px-4 py-1 ${GRADE_COLORS[assessment.readinessGrade]}`}>
                {assessment.readinessGrade}
              </div>
              <p className="text-sm text-muted-foreground mt-2">Readiness Grade</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-6 flex flex-col items-center justify-center">
              <div className="text-4xl font-black text-primary">{assessment.scalingReadiness}%</div>
              <p className="text-sm text-muted-foreground mt-2">Scaling Readiness</p>
            </CardContent>
          </Card>
        </div>

        {/* Dimension Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assessment.dimensions.map((dim) => (
            <Card key={dim.id} className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {DIMENSION_ICONS[dim.id]}
                  {dim.name}
                  <Badge variant="outline" className="ml-auto text-xs">
                    L{dim.level}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={dim.score} className="h-1.5 mb-3" />
                <div className="text-sm text-muted-foreground mb-2">{dim.score}/100</div>
                <div className="space-y-1">
                  {dim.indicators.map((ind) => (
                    <div key={ind.name} className="flex items-center gap-2 text-xs">
                      <span className={ind.met ? "text-emerald-400" : "text-muted-foreground/50"}>
                        {ind.met ? "✓" : "○"}
                      </span>
                      <span className={ind.met ? "text-foreground" : "text-muted-foreground"}>
                        {ind.name}
                      </span>
                    </div>
                  ))}
                </div>
                {dim.recommendations.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-border">
                    <p className="text-xs text-amber-400">{dim.recommendations[0]}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Next Actions */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Priority Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {assessment.nextActions.map((action, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-xs shrink-0">#{i + 1}</Badge>
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </SectionErrorBoundary>
  );
};

export default DecisionMaturity;
