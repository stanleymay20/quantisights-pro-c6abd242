import { useState, useEffect } from "react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, ArrowRight, ArrowLeft, Target, TrendingDown, TrendingUp, AlertTriangle, Zap, Share2, BookOpen, LogIn } from "lucide-react";
import ShareModal from "@/components/calibration/ShareModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Scenario bank ──────────────────────────────────────────────
interface Scenario {
  id: string;
  category: string;
  phase: "calibration" | "judgment";
  question: string;
  context: string;
  actualOutcome: boolean;
  actualProbability: number;
  revealText: string;
  source: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "s1",
    category: "Tech Adoption",
    phase: "calibration",
    question: "In 2007, what was the probability that smartphones would exceed 50% global mobile market share within 5 years?",
    context: "At the time, Nokia dominated with 49% market share. The iPhone had just launched. BlackBerry was the enterprise standard.",
    actualOutcome: true,
    actualProbability: 85,
    revealText: "Smartphones hit 50% global share by Q4 2012. Most industry analysts in 2007 predicted this would take 8–10 years. The actual adoption curve was 2× faster than consensus forecasts.",
    source: "IDC Mobile Tracker, 2012",
  },
  {
    id: "s2",
    category: "Market Crash",
    phase: "calibration",
    question: "In early 2008, what was the probability that US housing prices would decline more than 20% nationally within 18 months?",
    context: "The S&P/Case-Shiller Index had never recorded a national decline exceeding 5%. Subprime concerns were emerging but contained. Fed funds rate was being cut.",
    actualOutcome: true,
    actualProbability: 35,
    revealText: "The S&P/Case-Shiller Index fell 27% from peak by mid-2009. Only ~8% of professional forecasters predicted a decline exceeding 20%. This was a canonical fat-tail event that most probability models severely underestimated.",
    source: "S&P/Case-Shiller, Federal Reserve data",
  },
  {
    id: "s3",
    category: "Product Launch",
    phase: "calibration",
    question: "When Apple launched the iPad in 2010, what was the probability it would sell over 15 million units in its first year?",
    context: "Tablet PCs had failed repeatedly (Microsoft Tablet PC, HP TC1100). Steve Ballmer publicly mocked the iPad. Analyst consensus was 3–5 million units.",
    actualOutcome: true,
    actualProbability: 25,
    revealText: "Apple sold 14.8M iPads in the first 9 months, reaching ~19M in the first fiscal year. The market massively underestimated consumer demand. Only 3 of 42 tracked analysts predicted >10M units.",
    source: "Apple 10-K Filing, 2011",
  },
  {
    id: "s4",
    category: "Regulatory Shift",
    phase: "calibration",
    question: "In 2016, what was the probability the EU would enforce GDPR penalties exceeding €100M within the first 2 years of enforcement?",
    context: "GDPR was passed but not yet enforced. Previous EU data protection fines rarely exceeded €500K. Many companies viewed compliance as optional.",
    actualOutcome: true,
    actualProbability: 40,
    revealText: "Google was fined €50M by France's CNIL in Jan 2019, and British Airways faced a £183M fine in July 2019. Total fines exceeded €400M in the first 18 months.",
    source: "GDPR Enforcement Tracker, CMS Law",
  },
  {
    id: "s5",
    category: "Business Outcome",
    phase: "calibration",
    question: "In 2015, what was the probability that Netflix would surpass 200 million subscribers globally by 2021?",
    context: "Netflix had ~75M subscribers. Disney, Warner, and NBC had not yet launched competing streaming platforms. Content costs were accelerating.",
    actualOutcome: true,
    actualProbability: 30,
    revealText: "Netflix hit 203.7M subscribers in Q4 2020, aided by the COVID-19 pandemic. Most analysts in 2015 projected a ceiling of 120–150M.",
    source: "Netflix Earnings Reports, 2021",
  },
  {
    id: "s6",
    category: "Pricing Strategy",
    phase: "judgment",
    question: "A B2B SaaS company increases prices by 25% for existing customers. What is the probability that annualized net revenue retention drops below 95% within 3 quarters?",
    context: "The company has 85% gross retention, NPS of 42, and no direct competitor within 18 months of feature parity. Contracts are annual.",
    actualOutcome: false,
    actualProbability: 35,
    revealText: "Industry data shows that B2B SaaS companies with NPS >40 and no close competitor typically retain 92–97% NRR after 20–30% price increases.",
    source: "OpenView SaaS Benchmarks, 2023",
  },
  {
    id: "s7",
    category: "Market Entry",
    phase: "judgment",
    question: "A mid-market fintech company enters the SMB lending space. What is the probability they achieve $10M ARR within 24 months?",
    context: "They have an existing 50K-user payment processing base, $15M in funding, and 3 competitors already at scale. CAC in the segment is $2,400.",
    actualOutcome: false,
    actualProbability: 18,
    revealText: "Historical data from 200+ fintech market entries shows that only 12–22% achieve $10M ARR within 24 months, even with existing user bases.",
    source: "CB Insights Fintech Report, a16z Capital analysis",
  },
];

// ── Tier system ────────────────────────────────────────────────
interface CalibrationTier {
  label: string;
  range: [number, number];
  description: string;
  color: string;
  icon: typeof Brain;
}

const TIERS: CalibrationTier[] = [
  { label: "Volatile Intuition", range: [0, 0.3], description: "High conviction, low accuracy. Your confidence significantly diverges from reality — decisions carry hidden risk.", color: "text-destructive", icon: AlertTriangle },
  { label: "Tactical Optimist", range: [0.3, 0.5], description: "Systematic upside bias. You consistently overweight positive outcomes and underestimate tail risk.", color: "text-warning", icon: TrendingUp },
  { label: "Structured Realist", range: [0.5, 0.7], description: "Solid probabilistic judgment. Your estimates track reality with moderate accuracy — room for precision gains.", color: "text-primary", icon: Target },
  { label: "Strategic Bayesian", range: [0.7, 0.85], description: "Excellent calibration. You naturally update beliefs based on evidence and rarely exhibit strong directional bias.", color: "text-success", icon: Brain },
  { label: "Institutional-Grade", range: [0.85, 1], description: "Elite-level calibration. Your probability assignments are statistically indistinguishable from optimal Bayesian reasoning.", color: "text-success", icon: Zap },
];

function getTier(calibrationScore: number): CalibrationTier {
  return TIERS.find((t) => calibrationScore >= t.range[0] && calibrationScore < t.range[1]) || TIERS[0];
}

// ── Scoring engine ─────────────────────────────────────────────
interface Response {
  scenarioId: string;
  userProbability: number;
  actualProbability: number;
  delta: number;
  brierComponent: number;
}

function computeResults(responses: Response[]) {
  const n = responses.length;
  if (n === 0) return null;

  const brierScore = responses.reduce((sum, r) => sum + r.brierComponent, 0) / n;
  const calibrationScore = Math.max(0, 1 - brierScore);

  const overconfidentResponses = responses.filter((r) => r.userProbability > r.actualProbability);
  const overconfidenceScore = overconfidentResponses.length > 0
    ? overconfidentResponses.reduce((sum, r) => sum + (r.userProbability - r.actualProbability), 0) / overconfidentResponses.length
    : 0;

  const underconfidentResponses = responses.filter((r) => r.userProbability < r.actualProbability);
  const underconfidenceScore = underconfidentResponses.length > 0
    ? underconfidentResponses.reduce((sum, r) => sum + (r.actualProbability - r.userProbability), 0) / underconfidentResponses.length
    : 0;

  const userStd = stdDev(responses.map((r) => r.userProbability));
  const actualStd = stdDev(responses.map((r) => r.actualProbability));
  const rangeCompression = actualStd > 0 ? Math.max(0, 1 - userStd / actualStd) : 0;

  const tailEvents = responses.filter((r) => r.actualProbability < 25 || r.actualProbability > 75);
  const tailNeglect = tailEvents.length > 0
    ? tailEvents.reduce((sum, r) => sum + Math.abs(r.delta), 0) / tailEvents.length
    : 0;

  const biasMarkers: string[] = [];
  if (overconfidenceScore > 15) biasMarkers.push("Overconfidence Bias");
  if (underconfidenceScore > 15) biasMarkers.push("Underconfidence Bias");
  if (rangeCompression > 0.3) biasMarkers.push("Range Compression");
  if (tailNeglect > 20) biasMarkers.push("Tail Risk Neglect");
  if (overconfidentResponses.length >= n * 0.7) biasMarkers.push("Systematic Optimism");

  const avgAbsDelta = responses.reduce((s, r) => s + Math.abs(r.delta), 0) / n;
  const downsideReduction = Math.round(Math.min(avgAbsDelta * 1.2, 45));

  const tier = getTier(calibrationScore);

  return {
    brierScore: Math.round(brierScore * 1000) / 1000,
    calibrationScore: Math.round(calibrationScore * 100),
    overconfidenceScore: Math.round(overconfidenceScore),
    underconfidenceScore: Math.round(underconfidenceScore),
    rangeCompression: Math.round(rangeCompression * 100),
    tailNeglect: Math.round(tailNeglect),
    biasMarkers,
    tier,
    downsideReduction,
    responses,
  };
}

function stdDev(arr: number[]): number {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

// ── Component ──────────────────────────────────────────────────
const CalibrationAssessment = () => {
  const { user } = useAuth();
  const { currentOrgId: organizationId } = useOrganization();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<"intro" | "scenario" | "reveal" | "results">("intro");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userProbability, setUserProbability] = useState(50);
  const [responses, setResponses] = useState<Response[]>([]);
  const [results, setResults] = useState<ReturnType<typeof computeResults>>(null);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Decode shared results from URL
  useEffect(() => {
    const encoded = searchParams.get("r");
    if (encoded) {
      try {
        const compact = JSON.parse(atob(encoded));
        const tier = TIERS.find((t) => t.label === compact.t) || TIERS[0];
        setResults({
          brierScore: compact.b,
          calibrationScore: compact.c,
          overconfidenceScore: compact.o,
          underconfidenceScore: compact.u,
          rangeCompression: compact.r,
          tailNeglect: compact.n,
          biasMarkers: compact.m || [],
          tier,
          downsideReduction: compact.d,
          responses: [],
        });
        setStep("results");
      } catch (e: unknown) {
        // Invalid encoded data from shared URL — non-critical, log and ignore
        console.error("[CalibrationAssessment] Failed to decode shared results:", e instanceof Error ? e.message : e);
      }
    }
  }, [searchParams]);

  const scenario = SCENARIOS[currentIndex];
  const progress = ((currentIndex) / SCENARIOS.length) * 100;
  const isAuthenticated = !!user;

  const handleSubmitProbability = () => {
    setStep("reveal");
  };

  const handleNextScenario = () => {
    const actual = scenario.actualProbability;
    const delta = userProbability - actual;
    const outcomeOccurred = scenario.actualOutcome ? 1 : 0;
    const userProb = userProbability / 100;
    const brierComponent = (userProb - outcomeOccurred) ** 2;

    const newResponse: Response = {
      scenarioId: scenario.id,
      userProbability,
      actualProbability: actual,
      delta,
      brierComponent,
    };

    const updatedResponses = [...responses, newResponse];
    setResponses(updatedResponses);

    if (currentIndex < SCENARIOS.length - 1) {
      setCurrentIndex((i) => i + 1);
      setUserProbability(50);
      setStep("scenario");
    } else {
      const computed = computeResults(updatedResponses);
      setResults(computed);
      setStep("results");
      // Only save if authenticated
      if (isAuthenticated) {
        saveResults(updatedResponses, computed);
      }
    }
  };

  const saveResults = async (resp: Response[], computed: ReturnType<typeof computeResults>) => {
    if (!user || !organizationId || !computed) return;
    setSaving(true);
    try {
      await supabase.from("calibration_assessments").insert({
        user_id: user.id,
        organization_id: organizationId,
        // Schema-gap cast: responses is Json type, TS generated type doesn't accept Response[] directly
        responses: resp as unknown as import("@/integrations/supabase/types").Json,
        overconfidence_score: computed.overconfidenceScore,
        underconfidence_score: computed.underconfidenceScore,
        brier_score: computed.brierScore,
        calibration_profile: computed.tier.label,
        // Schema-gap cast: bias_markers is Json type, TS generated type doesn't accept string[] directly
        bias_markers: computed.biasMarkers as unknown as import("@/integrations/supabase/types").Json,
        completed_at: new Date().toISOString(),

      });
    } catch (e: unknown) {
      console.error("[CalibrationAssessment] Failed to save assessment:", e instanceof Error ? e.message : e);
      toast.error("Failed to save assessment");
    } finally {
      setSaving(false);
    }
  };

  const getProbabilityColor = (prob: number) => {
    if (prob <= 20) return "text-destructive";
    if (prob <= 40) return "text-warning";
    if (prob <= 60) return "text-muted-foreground";
    if (prob <= 80) return "text-primary";
    return "text-success";
  };

  const getDeltaLabel = (delta: number) => {
    const abs = Math.abs(delta);
    if (abs <= 10) return { text: "Close", color: "text-success" };
    if (abs <= 20) return { text: "Moderate gap", color: "text-warning" };
    return { text: "Significant gap", color: "text-destructive" };
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <SectionErrorBoundary sectionName="Calibration Assessment">
        <main className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-8 max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6 lg:mb-8">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">Calibration Assessment</h1>
                <p className="text-sm text-muted-foreground mt-1">Discover your probabilistic reasoning profile</p>
              </div>
            </div>
            {!isAuthenticated && step === "intro" && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/login")}>
                <LogIn className="w-4 h-4" /> Sign In
              </Button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {/* ── INTRO ────────────────────────────── */}
            {step === "intro" && (
              <motion.div
                key="intro"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardContent className="p-8 lg:p-12 text-center space-y-6">
                    <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                      <Brain className="w-10 h-10 text-primary" />
                    </div>
                    <div className="space-y-3 max-w-2xl mx-auto">
                      <h2 className="text-2xl lg:text-3xl font-bold text-foreground">
                        How accurate is your judgment?
                      </h2>
                      <p className="text-muted-foreground text-base lg:text-lg leading-relaxed">
                        This 5-minute assessment measures your probabilistic calibration — how closely your
                        confidence levels match reality. You'll evaluate 7 real-world scenarios, assign
                        probabilities, and receive an instant diagnostic of your reasoning patterns.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        No account required. Sign in to save your results and track improvement over time.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto text-left">
                      {[
                        { icon: Target, label: "7 scenarios", sub: "Historical + strategic" },
                        { icon: Brain, label: "Instant profile", sub: "Bias markers & tier" },
                        { icon: Zap, label: "5 minutes", sub: "Sharp, not superficial" },
                      ].map((item) => (
                        <div key={item.label} className="flex items-start gap-3 p-3 rounded-lg bg-card border">
                          <item.icon className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-foreground">{item.label}</p>
                            <p className="text-xs text-muted-foreground">{item.sub}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button size="lg" className="mt-4 gap-2" onClick={() => setStep("scenario")}>
                      Begin Assessment <ArrowRight className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ── SCENARIO ─────────────────────────── */}
            {step === "scenario" && scenario && (
              <motion.div
                key={`scenario-${currentIndex}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs font-medium">
                    {scenario.phase === "calibration" ? "Historical Calibration" : "Executive Judgment"} · {scenario.category}
                  </Badge>
                  <span className="text-sm text-muted-foreground font-medium">
                    {currentIndex + 1} / {SCENARIOS.length}
                  </span>
                </div>
                <Progress value={progress} className="h-1.5" />

                <Card>
                  <CardContent className="p-6 lg:p-8 space-y-8">
                    <div className="space-y-4">
                      <h2 className="text-lg lg:text-[16px] font-semibold tracking-tight text-foreground leading-snug">
                        {scenario.question}
                      </h2>
                      <p className="text-sm text-muted-foreground leading-relaxed bg-muted/50 p-4 rounded-lg border">
                        {scenario.context}
                      </p>
                    </div>

                    <div className="space-y-6">
                      <div className="text-center">
                        <span className={`text-5xl font-bold tabular-nums ${getProbabilityColor(userProbability)}`}>
                          {Math.round(userProbability)}%
                        </span>
                        <p className="text-sm text-muted-foreground mt-2">Your probability estimate</p>
                      </div>

                      <div className="px-2">
                        <Slider
                          value={[userProbability]}
                          onValueChange={([v]) => setUserProbability(v)}
                          min={1}
                          max={99}
                          step={1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-2">
                          <span>Very unlikely</span>
                          <span>Coin flip</span>
                          <span>Very likely</span>
                        </div>
                      </div>

                      <Button className="w-full gap-2" size="lg" onClick={handleSubmitProbability}>
                        Lock In Estimate <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ── REVEAL ───────────────────────────── */}
            {step === "reveal" && scenario && (
              <motion.div
                key={`reveal-${currentIndex}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4 }}
                className="space-y-6"
              >
                <Progress value={progress} className="h-1.5" />

                <Card className="border-primary/20">
                  <CardContent className="p-6 lg:p-8 space-y-6">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <Badge variant="secondary">{scenario.category}</Badge>
                      <span className="text-sm text-muted-foreground">{currentIndex + 1} / {SCENARIOS.length}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-5 rounded-xl bg-muted/50 border text-center">
                        <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Your Estimate</p>
                        <p className={`text-4xl font-bold tabular-nums ${getProbabilityColor(userProbability)}`}>
                          {Math.round(userProbability)}%
                        </p>
                      </div>
                      <div className="p-5 rounded-xl bg-primary/5 border border-primary/20 text-center">
                        <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Actual</p>
                        <p className="text-4xl font-bold tabular-nums text-primary">
                          {Math.round(scenario.actualProbability)}%
                        </p>
                      </div>
                    </div>

                    {(() => {
                      const delta = userProbability - scenario.actualProbability;
                      const info = getDeltaLabel(delta);
                      return (
                        <div className="flex items-center justify-center gap-3 py-3">
                          {delta > 0 ? (
                            <TrendingUp className={`w-5 h-5 ${info.color}`} />
                          ) : delta < 0 ? (
                            <TrendingDown className={`w-5 h-5 ${info.color}`} />
                          ) : (
                            <Target className="w-5 h-5 text-success" />
                          )}
                          <span className={`text-sm font-semibold ${info.color}`}>
                            {delta > 0 ? `+${delta}pp overconfident` : delta < 0 ? `${delta}pp underconfident` : "Perfect calibration"}
                            {" · "}{info.text}
                          </span>
                        </div>
                      );
                    })()}

                    <div className="bg-card border rounded-lg p-5 space-y-2">
                      <p className="text-sm text-foreground leading-relaxed">{scenario.revealText}</p>
                      <p className="text-xs text-muted-foreground italic">Source: {scenario.source}</p>
                    </div>

                    <Button className="w-full gap-2" size="lg" onClick={handleNextScenario}>
                      {currentIndex < SCENARIOS.length - 1 ? (
                        <>Next Scenario <ArrowRight className="w-4 h-4" /></>
                      ) : (
                        <>View Your Profile <Brain className="w-4 h-4" /></>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ── RESULTS ──────────────────────────── */}
            {step === "results" && results && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-6"
              >
                {/* Sign-in prompt for anonymous users */}
                {!isAuthenticated && (
                  <Card className="border-warning/30 bg-warning/5">
                    <CardContent className="p-5 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Track your improvement over time</p>
                        <p className="text-xs text-muted-foreground">Create a free account to save results, compare with your team, and improve your calibration.</p>
                      </div>
                      <Button size="sm" className="gap-2 shrink-0" onClick={() => navigate("/register")}>
                        <LogIn className="w-4 h-4" /> Create Account
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Tier card */}
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 overflow-hidden">
                  <CardContent className="p-8 lg:p-12 text-center space-y-4 relative">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_70%)]" />
                    <div className="relative z-10 space-y-4">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                        <results.tier.icon className={`w-8 h-8 ${results.tier.color}`} />
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">Your Calibration Tier</p>
                        <h2 className={`text-3xl lg:text-4xl font-bold ${results.tier.color}`}>
                          {results.tier.label}
                        </h2>
                      </div>
                      <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
                        {results.tier.description}
                      </p>
                      <div className="flex items-center justify-center gap-2 pt-2">
                        <Badge variant="outline" className="text-xs">
                          Calibration: {results.calibrationScore}%
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Brier: {results.brierScore}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Overconfidence", value: `+${results.overconfidenceScore}pp`, color: results.overconfidenceScore > 15 ? "text-destructive" : "text-success" },
                    { label: "Underconfidence", value: `-${results.underconfidenceScore}pp`, color: results.underconfidenceScore > 15 ? "text-warning" : "text-success" },
                    { label: "Range Compression", value: `${results.rangeCompression}%`, color: results.rangeCompression > 30 ? "text-warning" : "text-success" },
                    { label: "Tail Neglect", value: `${results.tailNeglect}pp`, color: results.tailNeglect > 20 ? "text-destructive" : "text-success" },
                  ].map((m) => (
                    <Card key={m.label}>
                      <CardContent className="p-4 text-center">
                        <p className="text-xs text-muted-foreground font-medium">{m.label}</p>
                        <p className={`text-2xl font-bold mt-1 tabular-nums ${m.color}`}>{m.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Bias markers */}
                {results.biasMarkers.length > 0 && (
                  <Card>
                    <CardContent className="p-5 space-y-3">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-warning" /> Detected Bias Patterns
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {results.biasMarkers.map((b) => (
                          <Badge key={b} variant="destructive" className="text-xs">{b}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Downside reduction simulation */}
                <Card className="border-success/20 bg-success/5">
                  <CardContent className="p-6 text-center space-y-2">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Calibration Impact Simulation</p>
                    <p className="text-lg text-foreground leading-relaxed">
                      If you had used calibrated probabilities in your last 10 decisions, your estimated
                      downside exposure would have reduced by
                    </p>
                    <p className="text-4xl font-bold text-success">~{results.downsideReduction}%</p>
                  </CardContent>
                </Card>

                {/* Per-scenario breakdown */}
                <Card>
                  <CardContent className="p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">Scenario Breakdown</h3>
                    <div className="space-y-2">
                      {results.responses.map((r) => {
                        const sc = SCENARIOS.find((s) => s.id === r.scenarioId)!;
                        const info = getDeltaLabel(r.delta);
                        return (
                          <div key={r.scenarioId} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 border text-sm">
                            <span className="text-muted-foreground truncate flex-1 mr-3">{sc.category}</span>
                            <div className="flex items-center gap-4 shrink-0">
                              <span className="tabular-nums text-foreground">{Math.round(r.userProbability)}%</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="tabular-nums text-primary">{Math.round(r.actualProbability)}%</span>
                              <span className={`text-xs font-medium w-20 text-right ${info.color}`}>{r.delta > 0 ? "+" : ""}{r.delta}pp</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* CTAs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setStep("intro");
                      setCurrentIndex(0);
                      setUserProbability(50);
                      setResponses([]);
                      setResults(null);
                    }}
                  >
                    <ArrowLeft className="w-4 h-4" /> Retake Assessment
                  </Button>
                  {isAuthenticated ? (
                    <Button variant="outline" className="gap-2" onClick={() => navigate("/decisions")}>
                      <BookOpen className="w-4 h-4" /> Log Your Next Decision
                    </Button>
                  ) : (
                    <Button variant="outline" className="gap-2" onClick={() => navigate("/register")}>
                      <LogIn className="w-4 h-4" /> Save & Track Improvement
                    </Button>
                  )}
                  <Button className="gap-2" onClick={() => setShareOpen(true)}>
                    <Share2 className="w-4 h-4" /> Share Scorecard
                  </Button>
                </div>

                {/* Share modal */}
                <ShareModal
                  open={shareOpen}
                  onOpenChange={setShareOpen}
                  results={{
                    tierLabel: results.tier.label,
                    tierColor: results.tier.color,
                    calibrationScore: results.calibrationScore,
                    brierScore: results.brierScore,
                    overconfidenceScore: results.overconfidenceScore,
                    underconfidenceScore: results.underconfidenceScore,
                    rangeCompression: results.rangeCompression,
                    tailNeglect: results.tailNeglect,
                    biasMarkers: results.biasMarkers,
                    downsideReduction: results.downsideReduction,
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
        </SectionErrorBoundary>
    </div>
  );
};

export default CalibrationAssessment;
