import { useState } from "react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { motion } from "framer-motion";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import {
  Shield, Database, Users, FileText, Brain, BarChart3,
  CheckCircle2, AlertTriangle, ArrowRight, Award,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";

interface Dimension {
  id: string;
  label: string;
  icon: typeof Shield;
  description: string;
  questions: { q: string; weight: number }[];
}

const DIMENSIONS: Dimension[] = [
  {
    id: "strategy",
    label: "Strategic Alignment",
    icon: BarChart3,
    description: "Data governance linked to business objectives",
    questions: [
      { q: "Data governance is formally linked to 2+ strategic business objectives", weight: 20 },
      { q: "Executive sponsor (CDO or equivalent) is appointed and active", weight: 15 },
      { q: "Governance program has a formal charter signed by leadership", weight: 15 },
    ],
  },
  {
    id: "organization",
    label: "Organizational Structure",
    icon: Users,
    description: "Roles, stewardship, and accountability frameworks",
    questions: [
      { q: "Data Owners are formally assigned for critical data domains", weight: 18 },
      { q: "Data Stewards are embedded in business units", weight: 14 },
      { q: "A Data Governance Office (DGO) or committee exists", weight: 18 },
    ],
  },
  {
    id: "policy",
    label: "Policy Architecture",
    icon: FileText,
    description: "Enforceable data policies and standards",
    questions: [
      { q: "Data access policies are documented and enforced", weight: 16 },
      { q: "Data retention policies are defined per data category", weight: 14 },
      { q: "Data classification scheme (public/internal/confidential) exists", weight: 12 },
    ],
  },
  {
    id: "quality",
    label: "Data Quality",
    icon: Shield,
    description: "Measurement, monitoring, and remediation",
    questions: [
      { q: "Data quality metrics (completeness, accuracy, consistency) are tracked", weight: 18 },
      { q: "Automated data quality checks run on critical data elements", weight: 16 },
      { q: "Mean Time To Resolution (MTTR) for data issues is tracked", weight: 10 },
    ],
  },
  {
    id: "technology",
    label: "Technology & Tools",
    icon: Database,
    description: "Data catalog, MDM, lineage, and automation",
    questions: [
      { q: "An enterprise data catalog is deployed and maintained", weight: 14 },
      { q: "Data lineage from source to decision is traceable", weight: 14 },
      { q: "Master Data Management (MDM) ensures a single source of truth", weight: 12 },
    ],
  },
  {
    id: "culture",
    label: "Culture & Literacy",
    icon: Brain,
    description: "Data literacy, adoption, and organizational mindset",
    questions: [
      { q: "Data literacy training programs exist for employees", weight: 12 },
      { q: "Data-driven decision-making is expected and rewarded", weight: 14 },
      { q: "Cross-functional collaboration on data issues is routine", weight: 10 },
    ],
  },
];

const MATURITY_LEVELS = [
  { min: 0, max: 20, label: "Initial", color: "text-destructive", bg: "bg-destructive/10" },
  { min: 21, max: 40, label: "Developing", color: "text-orange-400", bg: "bg-orange-500/10" },
  { min: 41, max: 60, label: "Defined", color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { min: 61, max: 80, label: "Managed", color: "text-blue-400", bg: "bg-blue-500/10" },
  { min: 81, max: 100, label: "Optimized", color: "text-emerald-400", bg: "bg-emerald-500/10" },
];

const getLevel = (score: number) =>
  MATURITY_LEVELS.find((l) => score >= l.min && score <= l.max) ?? MATURITY_LEVELS[0];

const GovernanceMaturity = () => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<string, Record<number, number>>>({});
  const [submitted, setSubmitted] = useState(false);

  const { data: assessmentHistory } = useQuery({
    queryKey: ["governance-maturity-history", currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return [];
      const { data } = await supabase
        .from("governance_maturity_assessments")
        .select("overall_score, dimensions, recommendations, created_at")
        .eq("organization_id", currentOrgId)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!currentOrgId,
  });

  const lastAssessment = assessmentHistory?.[0] ?? null;
  const previousAssessment = assessmentHistory?.[1] ?? null;

  const setAnswer = (dimId: string, qIdx: number, value: number) => {
    setAnswers((prev) => ({
      ...prev,
      [dimId]: { ...prev[dimId], [qIdx]: value },
    }));
  };

  const computeScores = () => {
    const dimScores: Record<string, number> = {};
    let totalWeighted = 0;
    let totalWeight = 0;

    for (const dim of DIMENSIONS) {
      let dimTotal = 0;
      let dimWeight = 0;
      dim.questions.forEach((q, i) => {
        const val = answers[dim.id]?.[i] ?? 0;
        dimTotal += (val / 4) * q.weight;
        dimWeight += q.weight;
      });
      const pct = dimWeight > 0 ? (dimTotal / dimWeight) * 100 : 0;
      dimScores[dim.id] = Math.round(pct);
      totalWeighted += dimTotal;
      totalWeight += dimWeight;
    }

    const overall = totalWeight > 0 ? Math.round((totalWeighted / totalWeight) * 100) : 0;
    return { overall, dimScores };
  };

  const handleSubmit = async () => {
    if (!currentOrgId || !user?.id) return;
    const { overall, dimScores } = computeScores();

    const recommendations = DIMENSIONS.filter((d) => dimScores[d.id] < 50).map((d) => ({
      dimension: d.label,
      score: dimScores[d.id],
      action: `Strengthen ${d.label.toLowerCase()} — currently below governance threshold.`,
    }));

    const { error } = await supabase.from("governance_maturity_assessments").insert({
      organization_id: currentOrgId,
      assessed_by: user.id,
      overall_score: overall,
      dimensions: dimScores as unknown as import("@/integrations/supabase/types").Json,
      recommendations: recommendations as unknown as import("@/integrations/supabase/types").Json,
    });

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Assessment saved", description: `Governance maturity: ${overall}/100` });
      setSubmitted(true);
    }
  };

  const { overall, dimScores } = computeScores();
  const level = getLevel(overall);
  const answeredCount = Object.values(answers).reduce(
    (sum, dim) => sum + Object.keys(dim).length, 0
  );
  const totalQuestions = DIMENSIONS.reduce((s, d) => s + d.questions.length, 0);

  return (
    <div className="space-y-8 max-w-5xl pb-12">
      <div className="flex items-center gap-3">
        <SidebarMobileToggle />
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Governance Maturity Assessment</h1>
          <p className="text-sm text-muted-foreground">
            Evaluate your organization across 6 dimensions from the Data Governance framework.
          </p>
        </div>
      </div>

      {/* Overall Score Card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Award className="w-10 h-10 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-4xl font-bold tracking-tight">{overall}</span>
                  <span className="text-muted-foreground text-sm">/100</span>
                  <Badge className={`${level.bg} ${level.color} border-0 text-xs`}>
                    {level.label}
                  </Badge>
                </div>
                <Progress value={overall} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  {answeredCount}/{totalQuestions} questions answered
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Dimension Cards */}
      <div className="space-y-4">
        {DIMENSIONS.map((dim, di) => {
          const dimScore = dimScores[dim.id] ?? 0;
          const dimLevel = getLevel(dimScore);
          return (
            <motion.div
              key={dim.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: di * 0.05 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <dim.icon className="w-4 h-4 text-primary" />
                      {dim.label}
                      <span className="text-xs text-muted-foreground font-normal">
                        — {dim.description}
                      </span>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${dimLevel.color}`}>{dimScore}%</span>
                      <Badge variant="outline" className="text-[10px]">{dimLevel.label}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {dim.questions.map((q, qi) => {
                      const val = answers[dim.id]?.[qi];
                      return (
                        <div key={qi} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/20">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground">{q.q}</p>
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Weight: {q.weight}%</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {[0, 1, 2, 3, 4].map((v) => (
                              <button
                                key={v}
                                onClick={() => setAnswer(dim.id, qi, v)}
                                className={`w-7 h-7 rounded text-[10px] font-bold transition-colors ${
                                  val === v
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                }`}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={answeredCount < totalQuestions || submitted}
          className="gap-2"
        >
          {submitted ? (
            <><CheckCircle2 className="w-4 h-4" /> Saved</>
          ) : (
            <><ArrowRight className="w-4 h-4" /> Save Assessment</>
          )}
        </Button>
      </div>

      {/* Executive Summary + Trend */}
      {lastAssessment && (
        <SectionErrorBoundary sectionName="Governance Executive Summary">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Executive Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Score + Trend */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{Number(lastAssessment.overall_score)}/100</span>
                  <Badge className={`${getLevel(Number(lastAssessment.overall_score)).bg} ${getLevel(Number(lastAssessment.overall_score)).color} border-0`}>
                    {getLevel(Number(lastAssessment.overall_score)).label}
                  </Badge>
                </div>
                {previousAssessment && (() => {
                  const delta = Number(lastAssessment.overall_score) - Number(previousAssessment.overall_score);
                  return (
                    <div className="flex items-center gap-1 text-xs">
                      {delta > 0 ? <TrendingUp className="w-3 h-3 text-emerald-400" /> :
                       delta < 0 ? <TrendingDown className="w-3 h-3 text-destructive" /> :
                       <Minus className="w-3 h-3 text-muted-foreground" />}
                      <span className={delta > 0 ? "text-emerald-400" : delta < 0 ? "text-destructive" : "text-muted-foreground"}>
                        {delta > 0 ? "+" : ""}{delta} from previous ({new Date(previousAssessment.created_at).toLocaleDateString()})
                      </span>
                    </div>
                  );
                })()}
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(lastAssessment.created_at).toLocaleDateString()}
                </span>
              </div>

              {/* Strongest / Weakest / Next Step */}
              {(() => {
                const dims = (lastAssessment.dimensions ?? {}) as Record<string, number>;
                const entries = Object.entries(dims).sort((a, b) => b[1] - a[1]);
                const strongest = entries[0];
                const weakest = entries[entries.length - 1];
                const recs = (lastAssessment.recommendations ?? []) as { dimension: string; action: string }[];
                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {strongest && (
                      <div className="p-3 rounded-xl border border-border/40 bg-emerald-500/5">
                        <p className="text-[10px] text-muted-foreground font-semibold mb-1">STRONGEST</p>
                        <p className="text-xs font-bold capitalize">{strongest[0]}</p>
                        <p className="text-lg font-bold text-emerald-400">{strongest[1]}%</p>
                      </div>
                    )}
                    {weakest && (
                      <div className="p-3 rounded-xl border border-border/40 bg-destructive/5">
                        <p className="text-[10px] text-muted-foreground font-semibold mb-1">WEAKEST</p>
                        <p className="text-xs font-bold capitalize">{weakest[0]}</p>
                        <p className="text-lg font-bold text-destructive">{weakest[1]}%</p>
                      </div>
                    )}
                    {recs.length > 0 && (
                      <div className="p-3 rounded-xl border border-border/40 bg-primary/5">
                        <p className="text-[10px] text-muted-foreground font-semibold mb-1">RECOMMENDED NEXT STEP</p>
                        <p className="text-xs text-foreground">{recs[0].action}</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Assessment History */}
              {assessmentHistory && assessmentHistory.length > 1 && (
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold mb-2">ASSESSMENT HISTORY</p>
                  <div className="flex items-end gap-2">
                    {[...assessmentHistory].reverse().map((a: any, i: number) => {
                      const score = Number(a.overall_score);
                      const lvl = getLevel(score);
                      return (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-bold ${lvl.color}`}>{score}</span>
                          <div
                            className={`w-8 rounded-t ${lvl.bg}`}
                            style={{ height: `${Math.max(score * 0.6, 8)}px` }}
                          />
                          <span className="text-[8px] text-muted-foreground/60">
                            {new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </SectionErrorBoundary>
      )}
    </div>
  );
};

export default GovernanceMaturity;
