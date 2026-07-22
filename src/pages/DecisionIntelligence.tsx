import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { useMetrics } from "@/hooks/useMetrics";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import IntelligenceDisclaimer from "@/components/IntelligenceDisclaimer";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SensitivityAnalysis from "@/components/decision-intelligence/SensitivityAnalysis";
import BayesianPriorVisualization from "@/components/decision-intelligence/BayesianPriorVisualization";
import ValueOfInformation from "@/components/decision-intelligence/ValueOfInformation";
import DecisionTreePanel from "@/components/decision-intelligence/DecisionTreePanel";
import RegretMinimization from "@/components/decision-intelligence/RegretMinimization";
import DecisionVelocity from "@/components/decision-intelligence/DecisionVelocity";
import CorrelatedPortfolioRisk from "@/components/decision-intelligence/CorrelatedPortfolioRisk";
import CalibrationCurve from "@/components/decision-intelligence/CalibrationCurve";
import AdaptiveCalibrationEngine from "@/components/decision-intelligence/AdaptiveCalibrationEngine";
import ScenarioComparison from "@/components/decision-intelligence/ScenarioComparison";
import DecisionImpactAttribution from "@/components/decision-intelligence/DecisionImpactAttribution";
import DROICalculator from "@/components/decision-intelligence/DROICalculator";
import TCICalculator from "@/components/decision-intelligence/TCICalculator";
import DecisionVelocityCurve from "@/components/decision-intelligence/DecisionVelocityCurve";
import DecisionMaturityAssessment from "@/components/decision-intelligence/DecisionMaturityAssessment";
import { useDecisionPerformance } from "@/hooks/useDecisionPerformance";
import {
  Brain, TrendingUp, AlertTriangle, GitCompare, BarChart3,
  Layers, RefreshCw, Target, Gauge, CheckCircle2
} from "lucide-react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

/* ──────── Counterfactual Analysis ──────── */
const CounterfactualPanel = ({ decisions }: { decisions: Array<any> }) => {
  const resolved = decisions.filter(d => d.decision_status === "approved" && d.actual_value != null);

  if (resolved.length === 0) {
    return (
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <GitCompare className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Counterfactual Analysis</h3>
        </div>
        <p className="text-xs text-muted-foreground">Needs approved decisions with measured outcomes to generate counterfactual insights.</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center gap-2 mb-4">
        <GitCompare className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Counterfactual Analysis</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">"What would have happened if we hadn't acted?"</p>
      <div className="space-y-3">
        {resolved.slice(0, 5).map((d) => {
          const baseline = Number(d.baseline_value) || 0;
          const actual = Number(d.actual_value) || 0;
          const predicted = Number(d.predicted_net_impact) || 0;
          const counterfactual = baseline; // without action
          const actionImpact = actual - counterfactual;
          const accuracyRaw = predicted !== 0 ? (actionImpact / predicted) * 100 : NaN;
          const accuracyPct = Number.isFinite(accuracyRaw) ? accuracyRaw.toFixed(0) : "—";
          const accuracyIsGood = Number.isFinite(accuracyRaw) && accuracyRaw >= 80;

          return (
            <div key={d.id} className="border border-border/30 rounded-lg p-3">
              <p className="text-xs font-medium truncate mb-2">{d.recommended_action}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Without Action</p>
                  <p className="text-sm font-bold font-mono">€{counterfactual.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">With Action</p>
                  <p className="text-sm font-bold font-mono text-primary">€{actual.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Prediction Accuracy</p>
                  <p className={`text-sm font-bold font-mono ${accuracyIsGood ? "text-success" : "text-warning"}`}>
                    {accuracyPct === "—" ? accuracyPct : `${Math.round(accuracyPct)}%`}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ──────── Decision Fatigue Detector ──────── */
const DecisionFatiguePanel = ({ decisions }: { decisions: Array<any> }) => {
  const pending = decisions.filter(d => d.decision_status === "pending");
  const inProgress = decisions.filter(d => d.execution_status === "in_progress");
  const stale = pending.filter(d => {
    const created = new Date(d.created_at);
    const daysSince = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 7;
  });

  // Guard: don't show fatigue index on accounts with no meaningful history
  if (decisions.length < 3) {
    return (
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Gauge className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Decision Fatigue Index</h3>
        </div>
        <div className="text-center py-8 text-xs text-muted-foreground">
          Fatigue index activates after 3 decisions are logged.
        </div>
      </div>
    );
  }


  const fatigueScore = Math.min(100, pending.length * 15 + stale.length * 25 + inProgress.length * 10);
  const fatigueLevel = fatigueScore >= 70 ? "critical" : fatigueScore >= 40 ? "elevated" : "healthy";
  const fatigueColor = fatigueScore >= 70 ? "text-destructive" : fatigueScore >= 40 ? "text-warning" : "text-success";

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Decision Fatigue Index</h3>
      </div>
      <div className="text-center py-4">
        <p className={`text-4xl font-bold tracking-tight ${fatigueColor}`}>{fatigueScore}</p>
        <p className={`text-xs font-semibold uppercase tracking-wider mt-1 ${fatigueColor}`}>{fatigueLevel}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
        <div className="bg-muted/20 rounded-lg p-2">
          <p className="text-lg font-bold">{pending.length}</p>
          <p className="text-[10px] text-muted-foreground">Pending</p>
        </div>
        <div className="bg-muted/20 rounded-lg p-2">
          <p className="text-lg font-bold text-warning">{stale.length}</p>
          <p className="text-[10px] text-muted-foreground">Stale (&gt;7d)</p>
        </div>
        <div className="bg-muted/20 rounded-lg p-2">
          <p className="text-lg font-bold text-primary">{inProgress.length}</p>
          <p className="text-[10px] text-muted-foreground">Executing</p>
        </div>
      </div>
      {fatigueScore >= 40 && (
        <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20">
          <p className="text-xs text-warning font-medium">
            {fatigueScore >= 70
              ? "⚠ Decision backlog critical — prioritize or dismiss stale items"
              : "Decision queue building up — review pending items"}
          </p>
        </div>
      )}
    </div>
  );
};

/* ──────── Portfolio Simulation View ──────── */
const PortfolioSimulation = ({ simulations }: { simulations: Array<any> }) => {
  const portfolio = useMemo(() => {
    if (simulations.length === 0) return null;

    const totalExpected = simulations.reduce((s, sim) => s + (Number(sim.expected_net_impact) || 0), 0);
    const totalP10 = simulations.reduce((s, sim) => s + (Number(sim.p10_impact) || 0), 0);
    const totalP90 = simulations.reduce((s, sim) => s + (Number(sim.p90_impact) || 0), 0);
    const avgProbPositive = simulations.length > 0
      ? simulations.reduce((s, sim) => s + (Number(sim.probability_positive_roi) || 0), 0) / simulations.length
      : 0;
    const totalCost = simulations.reduce((s, sim) => s + (Number(sim.implementation_cost) || 0), 0);
    const portfolioROI = totalCost > 0 ? ((totalExpected / totalCost) * 100).toFixed(0) : "—";

    return { totalExpected, totalP10, totalP90, avgProbPositive, totalCost, portfolioROI, count: simulations.length };
  }, [simulations]);

  if (!portfolio || portfolio.count === 0) {
    return (
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Portfolio Simulation</h3>
        </div>
        <p className="text-xs text-muted-foreground">Run decision simulations to see portfolio-level impact analysis.</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Portfolio Simulation</h3>
        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-auto">{portfolio.count} decisions</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-muted/20 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Expected Net</p>
          <p className="text-xl font-bold tracking-tight text-primary">
            €{portfolio.totalExpected >= 1000 ? `${(portfolio.totalExpected / 1000).toFixed(0)}K` : portfolio.totalExpected.toLocaleString()}
          </p>
        </div>
        <div className="bg-muted/20 rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Portfolio ROI</p>
          <p className="text-xl font-bold tracking-tight">{portfolio.portfolioROI}%</p>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">P10 (Downside)</span>
          <span className={`font-mono font-semibold ${portfolio.totalP10 < 0 ? "text-destructive" : "text-success"}`}>
            €{portfolio.totalP10.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">P90 (Upside)</span>
          <span className="font-mono font-semibold text-success">€{portfolio.totalP90.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Avg. P(Positive ROI)</span>
          <span className="font-mono font-semibold">{portfolio.avgProbPositive.toFixed(0)}%</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Total Impl. Cost</span>
          <span className="font-mono font-semibold text-warning">€{portfolio.totalCost.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

/* ──────── Prediction Calibration ──────── */
const CalibrationPanel = ({ decisions }: { decisions: Array<any> }) => {
  const calibrated = decisions.filter(d => d.prediction_accuracy_score != null);

  if (calibrated.length === 0) {
    return (
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Model Calibration</h3>
        </div>
        <p className="text-xs text-muted-foreground">No completed decisions with outcome measurements yet.</p>
      </div>
    );
  }

  const avgAccuracy = calibrated.length > 0
    ? calibrated.reduce((s, d) => s + (Number(d.prediction_accuracy_score) || 0), 0) / calibrated.length
    : 0;
  const avgCalibrationError = calibrated.length > 0
    ? calibrated.reduce((s, d) => s + Math.abs(Number(d.calibration_error) || 0), 0) / calibrated.length
    : 0;

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Model Calibration</h3>
        <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full ml-auto">{calibrated.length} measured</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="text-center bg-muted/20 rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase">Avg Accuracy</p>
          <p className={`text-[18px] font-semibold tracking-tight ${avgAccuracy >= 70 ? "text-success" : "text-warning"}`}>
            {avgAccuracy.toFixed(0)}%
          </p>
        </div>
        <div className="text-center bg-muted/20 rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase">Calibration Error</p>
          <p className="text-[18px] font-semibold tracking-tight">{avgCalibrationError.toFixed(1)}%</p>
        </div>
      </div>
      <div className="space-y-2">
        {calibrated.slice(0, 4).map(d => (
          <div key={d.id} className="flex items-center gap-2 text-xs">
            <CheckCircle2 className={`w-3 h-3 shrink-0 ${Number(d.prediction_accuracy_score) >= 70 ? "text-success" : "text-warning"}`} />
            <span className="truncate flex-1 text-muted-foreground">{d.recommended_action}</span>
            <span className="font-mono font-semibold">{Number(d.prediction_accuracy_score).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ──────── Main Page ──────── */

const DecisionIntelligence = () => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { activeDatasetId } = useProject();
  const { toast } = useToast();
  const [decisions, setDecisions] = useState<any[]>([]);
  const [simulations, setSimulations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { performance: performanceData, loading: perfLoading } = useDecisionPerformance(currentOrgId);

  useEffect(() => {
    if (!currentOrgId) { setLoading(false); return; }
    const fetch = async () => {
      setLoading(true);
      const [decRes, simRes] = await Promise.all([
        supabase.from("decision_ledger").select("*").eq("organization_id", currentOrgId).order("created_at", { ascending: false }),
        supabase.from("decision_simulations").select("*").eq("organization_id", currentOrgId).order("created_at", { ascending: false }),
      ]);
      setDecisions(decRes.data || []);
      setSimulations(simRes.data || []);
      setLoading(false);
    };
    fetch();
  }, [currentOrgId]);

  return (
    <DatasetRequired moduleName="Decision Intelligence">
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <SidebarMobileToggle />
            <Brain className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Decision Intelligence</h1>
          </div>
        </header>

        <SectionErrorBoundary sectionName="Decision Intelligence">
        <main className="flex-1 p-8 overflow-auto">
          <IntelligenceDisclaimer variant="banner" context="advisory" />

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-6 max-w-[1400px]">
              {/* Adaptive Calibration Engine — the ADI layer */}
              <AdaptiveCalibrationEngine orgId={currentOrgId} decisions={decisions} />

              {/* Top row: Fatigue + Velocity + Calibration */}
              <div className="grid lg:grid-cols-3 gap-5">
                <DecisionFatiguePanel decisions={decisions} />
                <DecisionVelocity decisions={decisions} />
                <CalibrationPanel decisions={decisions} />
              </div>

              {/* Portfolio row: Naive + Correlated */}
              <div className="grid lg:grid-cols-2 gap-5">
                <PortfolioSimulation simulations={simulations} />
                <CorrelatedPortfolioRisk simulations={simulations} />
              </div>

              {/* Probabilistic Intelligence Row */}
              <div className="grid lg:grid-cols-2 gap-5">
                <SensitivityAnalysis simulations={simulations} />
                <BayesianPriorVisualization decisions={decisions} />
              </div>

              {/* Decision Framework Row */}
              <div className="grid lg:grid-cols-2 gap-5">
                <ValueOfInformation decisions={decisions} />
                <DecisionTreePanel decisions={decisions} simulations={simulations} />
              </div>

              {/* Regret + Counterfactual */}
              <div className="grid lg:grid-cols-2 gap-5">
                <RegretMinimization decisions={decisions} simulations={simulations} />
                <CounterfactualPanel decisions={decisions} />
              </div>

              {/* Calibration + Scenario Comparison + Impact Attribution */}
              <div className="grid lg:grid-cols-2 gap-5">
                <CalibrationCurve decisions={decisions} />
                <ScenarioComparison simulations={simulations} />
              </div>

              <DecisionImpactAttribution decisions={decisions} />

              {/* DROI + TCI — Decision Economics (Ch. 3) */}
              <div className="grid lg:grid-cols-2 gap-5">
                <DROICalculator performance={performanceData} loading={perfLoading} />
                <TCICalculator />
              </div>

              {/* Decision Velocity Curve (Ch. 1) */}
              <DecisionVelocityCurve decisions={decisions} />

              {/* Decision Maturity Assessment (Ch. 4) */}
              <DecisionMaturityAssessment />
            </div>
          )}
        </main>
        </SectionErrorBoundary>
    </>
    </DatasetRequired>
  );
};

export default DecisionIntelligence;
