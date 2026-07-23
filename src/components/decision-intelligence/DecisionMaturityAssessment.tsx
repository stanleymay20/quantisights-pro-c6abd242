import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Layers, CheckCircle2, ArrowRight, BookOpen,
  Database, Brain, BarChart3, Target, Settings, Users
} from "lucide-react";

/**
 * Decision Maturity Assessment
 * 
 * From "Decision Intelligence" by Stanley Osei-Wusu (Chapter 4).
 * 3-phase implementation roadmap: Foundation → Expansion → Strategic Embedding.
 * Maps organizations to a Decision Maturity Model from reactive to prescriptive.
 */

interface MaturityQuestion {
  q: string;
  phase: 1 | 2 | 3;
  category: string;
}

const QUESTIONS: MaturityQuestion[] = [
  // Phase 1: Foundation
  { q: "We have a formal data governance framework with defined data ownership", phase: 1, category: "Data Foundation" },
  { q: "Data quality checks are automated with measurable scores (>95% target)", phase: 1, category: "Data Foundation" },
  { q: "We have identified and mapped 5+ causal pathways in our business", phase: 1, category: "Causal Modeling" },
  { q: "We conduct counterfactual simulations before major decisions", phase: 1, category: "Causal Modeling" },
  { q: "A cross-functional DI task force exists with a defined charter", phase: 1, category: "Organization" },
  // Phase 2: Expansion
  { q: "Probabilistic forecasting models exist for critical metrics", phase: 2, category: "Predictive" },
  { q: "Forecast accuracy has improved >10% versus historical baseline", phase: 2, category: "Predictive" },
  { q: "3+ business units actively use DI outputs in their workflows", phase: 2, category: "Integration" },
  { q: "Leaders are trained in causal reasoning and cognitive bias mitigation", phase: 2, category: "Skills" },
  { q: "DI outputs are integrated into executive dashboards", phase: 2, category: "Integration" },
  // Phase 3: Strategic Embedding
  { q: "Multi-objective optimization models balance profit, risk, and satisfaction", phase: 3, category: "Optimization" },
  { q: "Decision-making cycle time has reduced >20% from baseline", phase: 3, category: "Velocity" },
  { q: "A DI Center of Excellence (CoE) governs decision quality enterprise-wide", phase: 3, category: "Organization" },
  { q: "DI is the default for all critical strategic decisions (board-level)", phase: 3, category: "Culture" },
  { q: "DROI/TCI analysis is mandatory for capital allocations >€5M", phase: 3, category: "Financial" },
];

const PHASE_LABELS = [
  { phase: 1, name: "Foundation & Pilot", months: "1–6", icon: Database },
  { phase: 2, name: "Expansion & Integration", months: "7–18", icon: Brain },
  { phase: 3, name: "Strategic Embedding", months: "19–36", icon: Target },
];

const MATURITY_LEVELS = [
  { min: 0, max: 20, label: "Reactive", desc: "Data-rich but decision-poor. Relying on intuition and retrospective BI.", color: "text-destructive" },
  { min: 21, max: 40, label: "Descriptive", desc: "Good at reporting what happened, but lacking causal and prescriptive capability.", color: "text-warning" },
  { min: 41, max: 60, label: "Predictive", desc: "Forecasting capabilities in place, but not yet translating predictions into optimal actions.", color: "text-primary" },
  { min: 61, max: 80, label: "Prescriptive", desc: "Actively recommending optimal actions with quantified trade-offs and confidence.", color: "text-emerald-400" },
  { min: 81, max: 100, label: "Autonomous DI", desc: "Decision Intelligence embedded as the organizational operating system. Continuous learning.", color: "text-success" },
];

const DecisionMaturityAssessment = () => {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);

  const score = Object.values(answers).reduce((s, v) => s + v, 0) / (QUESTIONS.length * 4) * 100;
  const maturityLevel = MATURITY_LEVELS.find(l => score >= l.min && score <= l.max) || MATURITY_LEVELS[0];

  const phaseScores = PHASE_LABELS.map(p => {
    const phaseQs = QUESTIONS.filter(q => q.phase === p.phase);
    const phaseAnswered = phaseQs.filter((_, i) => answers[QUESTIONS.indexOf(phaseQs[0]) !== undefined ? QUESTIONS.findIndex(q => q === phaseQs[0]) + phaseQs.indexOf(_) : -1] !== undefined);
    const phaseTotal = phaseQs.reduce((s, q) => {
      const idx = QUESTIONS.indexOf(q);
      return s + (answers[idx] || 0);
    }, 0);
    const maxScore = phaseQs.length * 4;
    return {
      ...p,
      score: maxScore > 0 ? Math.round((phaseTotal / maxScore) * 100) : 0,
      answered: Object.keys(answers).filter(k => {
        const idx = Number(k);
        return QUESTIONS[idx]?.phase === p.phase;
      }).length,
      total: phaseQs.length,
    };
  });

  const allAnswered = Object.keys(answers).length === QUESTIONS.length;

  if (showResults && allAnswered) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Decision Maturity Assessment — Results
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Overall score */}
          <div className="text-center py-4">
            <div className={`text-5xl font-bold tracking-tight ${maturityLevel.color}`}>
              {Math.round(score)}
            </div>
            <Badge className="mt-2" variant="outline">{maturityLevel.label}</Badge>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              {maturityLevel.desc}
            </p>
          </div>

          {/* Phase breakdown */}
          <div className="space-y-3">
            {phaseScores.map((p) => (
              <div key={p.phase} className="p-3 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p.icon className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Phase {p.phase}: {p.name}</span>
                    <span className="text-[10px] text-muted-foreground">({p.months} months)</span>
                  </div>
                  <span className="text-sm font-bold font-mono">{p.score}%</span>
                </div>
                <Progress value={p.score} className="h-2" />
              </div>
            ))}
          </div>

          {/* Recommendations */}
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-primary" />
              Next Steps
            </h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {phaseScores[0].score < 60 && (
                <li>• <strong>Priority:</strong> Establish data governance framework and conduct a Decision Fitness Audit within 90 days.</li>
              )}
              {phaseScores[0].score >= 60 && phaseScores[1].score < 60 && (
                <li>• <strong>Priority:</strong> Implement probabilistic forecasting and train leaders in causal reasoning methodologies.</li>
              )}
              {phaseScores[1].score >= 60 && phaseScores[2].score < 60 && (
                <li>• <strong>Priority:</strong> Establish a DI Center of Excellence and mandate DROI/TCI for capital allocations.</li>
              )}
              {phaseScores[2].score >= 60 && (
                <li>• <strong>Maintain:</strong> Continue refining your DI operating system. Focus on reducing decision cycle time by 20%+.</li>
              )}
              <li>• Conduct a cross-functional Decision Intelligence Task Force review every quarter.</li>
            </ul>
          </div>

          <Button variant="outline" size="sm" onClick={() => { setAnswers({}); setShowResults(false); }}>
            Retake Assessment
          </Button>

          <div className="flex items-start gap-2 pt-2 border-t border-border/50">
            <BookOpen className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
            <p className="text-[10px] text-muted-foreground/60">
              Decision Maturity Model from <em>"Decision Intelligence"</em> Ch. 4 — 3-phase roadmap from Foundation to Strategic Embedding.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          Decision Maturity Assessment
          <Badge variant="outline" className="ml-auto text-[10px]">
            {Object.keys(answers).length}/{QUESTIONS.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Rate your organization on each capability (0 = Not at all → 4 = Fully implemented).
        </p>

        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
          {QUESTIONS.map((q, i) => {
            const prevPhase = i > 0 ? QUESTIONS[i - 1].phase : 0;
            const showHeader = q.phase !== prevPhase;

            return (
              <div key={i}>
                {showHeader && (
                  <div className="flex items-center gap-2 pt-2 pb-1 mb-2 border-b border-border/30">
                    {PHASE_LABELS[q.phase - 1] && (
                      <>
                        {(() => { const Icon = PHASE_LABELS[q.phase - 1].icon; return <Icon className="w-3.5 h-3.5 text-primary" />; })()}
                        <span className="text-xs font-semibold text-primary">
                          Phase {q.phase}: {PHASE_LABELS[q.phase - 1].name}
                        </span>
                      </>
                    )}
                  </div>
                )}
                <div className="p-2.5 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                  <p className="text-xs mb-2">{q.q}</p>
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4].map((v) => (
                      <button
                        key={v}
                        onClick={() => setAnswers(p => ({ ...p, [i]: v }))}
                        className={`w-8 h-7 rounded text-[10px] font-semibold transition-all ${
                          answers[i] === v
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/50 hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {allAnswered && (
          <Button onClick={() => setShowResults(true)} className="w-full gap-2">
            <CheckCircle2 className="w-4 h-4" /> View Maturity Results
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default DecisionMaturityAssessment;
