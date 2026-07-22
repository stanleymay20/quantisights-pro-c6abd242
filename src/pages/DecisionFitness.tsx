import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Target, Building2, Settings, Users, Brain, UserCheck, Crown,
  CheckCircle2, AlertTriangle, ArrowRight, Award, BarChart3,
  BookOpen, RefreshCw,
} from "lucide-react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

/**
 * Decision Fitness Framework — from "Decision Intelligence: The Operating System
 * for Billion-Dollar Decisions" by Stanley Osei-Wusu (Chapter 1).
 *
 * Adapted from the McKinsey 7S Model, reoriented to evaluate an organization's
 * capacity for high-quality strategic decision-making.
 */

interface Dimension {
  id: string;
  label: string;
  icon: typeof Target;
  description: string;
  questions: { q: string; weight: number }[];
}

const DIMENSIONS: Dimension[] = [
  {
    id: "strategic_clarity",
    label: "Strategic Clarity",
    icon: Target,
    description: "Clearly articulated goals and a well-defined strategic direction. Decisions evaluated against a robust, empirically validated strategic thesis.",
    questions: [
      { q: "Organization has clearly articulated, measurable strategic goals", weight: 20 },
      { q: "Strategic decisions are consistently evaluated against an empirically validated thesis", weight: 18 },
      { q: "Decision criteria are documented before deliberation begins", weight: 14 },
      { q: "Strategy is reviewed and updated based on outcome data, not just calendar cycles", weight: 12 },
    ],
  },
  {
    id: "structural_agility",
    label: "Structural Agility",
    icon: Building2,
    description: "Organizational design facilitates rapid information flow and decisive action. Decision rights are unambiguously assigned.",
    questions: [
      { q: "Decision rights are explicitly assigned — everyone knows who decides what", weight: 20 },
      { q: "Information flows rapidly from data sources to decision-makers without bureaucratic delay", weight: 16 },
      { q: "Cross-functional teams can be assembled quickly for time-sensitive decisions", weight: 14 },
      { q: "Decision velocity is measured — average time from signal to action is tracked", weight: 12 },
    ],
  },
  {
    id: "systems_tools",
    label: "Systems & Tools",
    icon: Settings,
    description: "Technological infrastructure optimized for data collection, analysis, and knowledge dissemination. Supports causal inference and scenario modeling.",
    questions: [
      { q: "Analytics infrastructure supports causal inference, not just correlations", weight: 20 },
      { q: "Scenario modeling and simulation tools are available to decision-makers", weight: 16 },
      { q: "Decision outcomes are systematically captured and stored for future learning", weight: 18 },
      { q: "Data is accessible across silos without manual consolidation", weight: 10 },
    ],
  },
  {
    id: "decision_culture",
    label: "Shared Decision Culture",
    icon: Users,
    description: "Norms and psychological safety around challenging assumptions, empirical validation, and learning from failure.",
    questions: [
      { q: "Team members feel safe challenging assumptions without career risk", weight: 22 },
      { q: "Decisions are evaluated on process quality, not just outcome luck", weight: 18 },
      { q: "'Data before opinion' is an explicit organizational norm", weight: 14 },
      { q: "Post-decision reviews (pre-mortems, red teaming) are standard practice", weight: 12 },
    ],
  },
  {
    id: "analytical_acumen",
    label: "Skills & Analytical Acumen",
    icon: Brain,
    description: "Workforce proficiency in translating complex data into actionable insights, identifying causal relationships, and interpreting probabilistic outcomes.",
    questions: [
      { q: "Leadership can interpret confidence intervals and probabilistic forecasts", weight: 20 },
      { q: "Team members can distinguish correlation from causation in data analysis", weight: 18 },
      { q: "Statistical literacy training is available and utilized by decision-makers", weight: 14 },
      { q: "The organization can articulate data narratives, not just present charts", weight: 12 },
    ],
  },
  {
    id: "staff_enablement",
    label: "Staff Capital Enablement",
    icon: UserCheck,
    description: "Sufficient resources to attract, develop, and retain individuals with domain expertise, critical thinking, and decision science proficiency.",
    questions: [
      { q: "Decision science roles (analysts, data scientists) are adequately staffed", weight: 18 },
      { q: "Domain experts are integrated into analytical processes, not siloed", weight: 16 },
      { q: "Diverse perspectives are actively sought for high-stakes decisions", weight: 14 },
      { q: "Continuous learning budgets exist for decision-making methodologies", weight: 14 },
    ],
  },
  {
    id: "leadership_style",
    label: "Leadership Style",
    icon: Crown,
    description: "Leaders foster a data-driven, evidence-based approach while actively mitigating biases. Avoid analysis paralysis or overconfidence.",
    questions: [
      { q: "Leaders actively seek disconfirming evidence before major decisions", weight: 22 },
      { q: "Leadership explicitly acknowledges uncertainty rather than projecting false confidence", weight: 18 },
      { q: "Decision-making speed is balanced — neither paralysis nor impulsiveness", weight: 14 },
      { q: "Leaders model learning from failure openly and without blame", weight: 12 },
    ],
  },
];

type Answers = Record<string, Record<number, boolean | null>>;

const getGrade = (score: number) => {
  if (score >= 85) return { label: "Excellent", color: "text-green-500", bg: "bg-green-500/10" };
  if (score >= 70) return { label: "Good", color: "text-blue-500", bg: "bg-blue-500/10" };
  if (score >= 50) return { label: "Developing", color: "text-yellow-500", bg: "bg-yellow-500/10" };
  if (score >= 30) return { label: "Emerging", color: "text-orange-500", bg: "bg-orange-500/10" };
  return { label: "Critical", color: "text-destructive", bg: "bg-destructive/10" };
};

const DecisionFitness = () => {
  const [answers, setAnswers] = useState<Answers>({});
  const [showResults, setShowResults] = useState(false);

  const setAnswer = (dimId: string, qIdx: number, val: boolean) => {
    setAnswers(prev => ({
      ...prev,
      [dimId]: { ...prev[dimId], [qIdx]: val },
    }));
  };

  const totalAnswered = useMemo(() => {
    let count = 0;
    for (const dim of DIMENSIONS) {
      for (let i = 0; i < dim.questions.length; i++) {
        if (answers[dim.id]?.[i] != null) count++;
      }
    }
    return count;
  }, [answers]);

  const totalQuestions = DIMENSIONS.reduce((s, d) => s + d.questions.length, 0);

  const dimensionScores = useMemo(() => {
    return DIMENSIONS.map(dim => {
      let totalWeight = 0;
      let earnedWeight = 0;
      dim.questions.forEach((q, i) => {
        totalWeight += q.weight;
        if (answers[dim.id]?.[i] === true) earnedWeight += q.weight;
      });
      return { id: dim.id, score: totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0 };
    });
  }, [answers]);

  const overallScore = useMemo(() => {
    const total = dimensionScores.reduce((s, d) => s + d.score, 0);
    return Math.round(total / DIMENSIONS.length);
  }, [dimensionScores]);

  const resetAssessment = () => {
    setAnswers({});
    setShowResults(false);
  };

  if (showResults) {
    const grade = getGrade(overallScore);
    const weakest = [...dimensionScores].sort((a, b) => a.score - b.score).slice(0, 3);
    return (
      <div className="min-h-dvh bg-background p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <SidebarMobileToggle />
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight tracking-tight">Decision Fitness Results</h1>
              <p className="text-sm text-muted-foreground">Based on the Decision Fitness Framework</p>
            </div>
          </div>

          {/* Overall Score */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="mb-6 border-primary/20">
              <CardContent className="p-8 text-center">
                <div className="text-6xl font-bold tracking-tight mb-2">{overallScore}</div>
                <Badge className={`${grade.bg} ${grade.color} border-0 text-sm px-3 py-1 mb-4`}>
                  {grade.label}
                </Badge>
                <p className="text-muted-foreground max-w-lg mx-auto text-sm">
                  {overallScore >= 70
                    ? "Your organization shows strong decision-making foundations. Focus on the gaps below to reach world-class decision governance."
                    : overallScore >= 40
                    ? "Your organization has emerging decision capabilities but significant gaps exist. Prioritize the weakest dimensions to reduce the Decision Quality Gap."
                    : "Critical gaps in decision infrastructure. The estimated value erosion from suboptimal decisions could be substantial. Immediate action recommended."}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Dimension breakdown */}
          <div className="grid gap-4 mb-6">
            {DIMENSIONS.map((dim, i) => {
              const ds = dimensionScores.find(d => d.id === dim.id)!;
              const g = getGrade(ds.score);
              return (
                <motion.div key={dim.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <dim.icon className="w-4.5 h-4.5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-sm">{dim.label}</h3>
                            <span className={`text-sm font-bold ${g.color}`}>{ds.score}%</span>
                          </div>
                        </div>
                      </div>
                      <Progress value={ds.score} className="h-2" />
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Priority actions */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                Priority Improvement Areas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {weakest.map(w => {
                const dim = DIMENSIONS.find(d => d.id === w.id)!;
                return (
                  <div key={w.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <ArrowRight className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{dim.label} ({w.score}%)</p>
                      <p className="text-xs text-muted-foreground">{dim.description}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Book reference */}
          <Card className="border-primary/10 bg-primary/[0.02]">
            <CardContent className="p-5 flex items-start gap-3">
              <BookOpen className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium mb-1">From the Book</p>
                <p className="text-xs text-muted-foreground">
                  This assessment is based on the Decision Fitness Framework from{" "}
                  <em>"Decision Intelligence: The Operating System for Billion-Dollar Decisions"</em> by Stanley Osei-Wusu. 
                  The framework adapts the McKinsey 7S Model to evaluate organizational capacity for high-quality strategic decision-making.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 flex gap-3">
            <Button variant="outline" onClick={resetAssessment} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Retake Assessment
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SectionErrorBoundary sectionName="Decision Fitness">
    <div className="min-h-dvh bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <SidebarMobileToggle />
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight tracking-tight">Decision Fitness Assessment</h1>
            <p className="text-sm text-muted-foreground">
              Diagnose your organization's strategic decision-making capacity across 7 dimensions
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-6 mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>{totalAnswered} of {totalQuestions} questions answered</span>
            <span>{Math.round((totalAnswered / totalQuestions) * 100)}%</span>
          </div>
          <Progress value={(totalAnswered / totalQuestions) * 100} className="h-2" />
        </div>

        {/* Dimensions */}
        <div className="space-y-6">
          {DIMENSIONS.map((dim, di) => (
            <motion.div
              key={dim.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: di * 0.05 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <dim.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{dim.label}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{dim.description}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dim.questions.map((q, qi) => {
                    const val = answers[dim.id]?.[qi];
                    return (
                      <div key={qi} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                        <p className="text-sm flex-1 pt-0.5">{q.q}</p>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => setAnswer(dim.id, qi, true)}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                              val === true
                                ? "bg-green-500/20 text-green-600 border border-green-500/30"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setAnswer(dim.id, qi, false)}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                              val === false
                                ? "bg-destructive/20 text-destructive border border-destructive/30"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            No
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Submit */}
        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            onClick={() => setShowResults(true)}
            disabled={totalAnswered < totalQuestions}
            className="gap-2"
          >
            <Award className="w-4 h-4" />
            View Decision Fitness Score
            {totalAnswered < totalQuestions && (
              <span className="text-xs opacity-70">({totalQuestions - totalAnswered} remaining)</span>
            )}
          </Button>
        </div>

        {/* Book reference */}
        <div className="mt-8 p-4 rounded-lg border border-primary/10 bg-primary/[0.02] flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Based on the Decision Fitness Framework from{" "}
            <em>"Decision Intelligence: The Operating System for Billion-Dollar Decisions"</em> by Stanley Osei-Wusu (Chapter 1). 
            Adapted from the McKinsey 7S Model to diagnose organizational impediments to effective strategic decision-making.
          </p>
        </div>
      </div>
    </div>
    </SectionErrorBoundary>
  );
};

export default DecisionFitness;
