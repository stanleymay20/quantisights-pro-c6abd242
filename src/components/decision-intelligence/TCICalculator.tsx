import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, DollarSign, Clock, TrendingDown, BookOpen } from "lucide-react";

/**
 * Total Cost of Inaction (TCI) Calculator
 * 
 * From "Decision Intelligence" by Stanley Osei-Wusu (Chapter 3).
 * TCI quantifies the foregone benefits or realized costs from delaying,
 * avoiding, or failing to execute a critical strategic decision.
 */

// Named, documented modeling assumptions for this what-if calculator —
// illustrative weights, not empirically fitted coefficients.
const COMPETITIVE_EROSION_MULTIPLIER = 1.5; // assumed cost multiplier when a competitor is actively moving
const ENTROPY_WEEKLY_DELAY_WEIGHT = 8; // entropy points per week of decision delay
const ENTROPY_COMPETITOR_MOVING_WEIGHT = 20; // entropy points added when a competitor is moving
const ENTROPY_IMPACT_PCT_WEIGHT = 2; // entropy points per percentage point of estimated impact
const SEVERITY_CRITICAL_REVENUE_FRACTION = 0.5; // TCI as a fraction of monthly revenue considered "critical"
const SEVERITY_HIGH_REVENUE_FRACTION = 0.1; // ...considered "high"
const SEVERITY_MODERATE_REVENUE_FRACTION = 0.02; // ...considered "moderate"

const TCICalculator = () => {
  const [inputs, setInputs] = useState({
    monthlyRevenue: 500000,
    decisionDelayWeeks: 4,
    estimatedImpactPct: 5,
    competitorMoving: true,
    marketGrowthRate: 8,
  });

  const analysis = useMemo(() => {
    const { monthlyRevenue, decisionDelayWeeks, estimatedImpactPct, competitorMoving, marketGrowthRate } = inputs;

    // Direct revenue impact from delay
    const weeklyRevenue = monthlyRevenue / 4.33;
    const directLoss = weeklyRevenue * decisionDelayWeeks * (estimatedImpactPct / 100);

    // Compounding opportunity cost (market moves while you wait)
    const weeklyGrowthRate = Math.pow(1 + marketGrowthRate / 100, 1 / 52) - 1;
    const compoundedOpportunityCost = weeklyRevenue * estimatedImpactPct / 100 *
      ((Math.pow(1 + weeklyGrowthRate, decisionDelayWeeks) - 1) / weeklyGrowthRate - decisionDelayWeeks);

    // Competitive erosion multiplier
    const competitiveMultiplier = competitorMoving ? COMPETITIVE_EROSION_MULTIPLIER : 1.0;

    // Total Cost of Inaction
    const totalTCI = (directLoss + compoundedOpportunityCost) * competitiveMultiplier;

    // Annualized projection
    const annualizedTCI = totalTCI * (52 / Math.max(1, decisionDelayWeeks));

    // Decision Entropy score (0-100, higher = more entropy/disorder)
    const entropyScore = Math.min(100, Math.round(
      decisionDelayWeeks * ENTROPY_WEEKLY_DELAY_WEIGHT +
      (competitorMoving ? ENTROPY_COMPETITOR_MOVING_WEIGHT : 0) +
      estimatedImpactPct * ENTROPY_IMPACT_PCT_WEIGHT
    ));

    const severity = totalTCI > monthlyRevenue * SEVERITY_CRITICAL_REVENUE_FRACTION ? "critical"
      : totalTCI > monthlyRevenue * SEVERITY_HIGH_REVENUE_FRACTION ? "high"
      : totalTCI > monthlyRevenue * SEVERITY_MODERATE_REVENUE_FRACTION ? "moderate"
      : "low";

    return {
      directLoss: Math.round(directLoss),
      compoundedCost: Math.round(compoundedOpportunityCost),
      competitiveMultiplier,
      totalTCI: Math.round(totalTCI),
      annualizedTCI: Math.round(annualizedTCI),
      entropyScore,
      severity,
      weeklyBurn: Math.round(totalTCI / Math.max(1, decisionDelayWeeks)),
    };
  }, [inputs]);

  const severityColor = {
    critical: "text-destructive",
    high: "text-warning",
    moderate: "text-primary",
    low: "text-success",
  }[analysis.severity];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          Total Cost of Inaction (TCI)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Input grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Monthly Revenue (€)</Label>
            <Input
              type="number"
              value={inputs.monthlyRevenue}
              onChange={(e) => setInputs(p => ({ ...p, monthlyRevenue: Number(e.target.value) || 0 }))}
              className="mt-1 h-8 text-sm font-mono"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Delay (Weeks)</Label>
            <Input
              type="number"
              value={inputs.decisionDelayWeeks}
              onChange={(e) => setInputs(p => ({ ...p, decisionDelayWeeks: Number(e.target.value) || 0 }))}
              className="mt-1 h-8 text-sm font-mono"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Est. Impact (%)</Label>
            <Input
              type="number"
              value={inputs.estimatedImpactPct}
              onChange={(e) => setInputs(p => ({ ...p, estimatedImpactPct: Number(e.target.value) || 0 }))}
              className="mt-1 h-8 text-sm font-mono"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Market Growth (%/yr)</Label>
            <Input
              type="number"
              value={inputs.marketGrowthRate}
              onChange={(e) => setInputs(p => ({ ...p, marketGrowthRate: Number(e.target.value) || 0 }))}
              className="mt-1 h-8 text-sm font-mono"
            />
          </div>
          <div className="col-span-2 sm:col-span-1 flex items-end">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={inputs.competitorMoving}
                onChange={(e) => setInputs(p => ({ ...p, competitorMoving: e.target.checked }))}
                className="rounded"
              />
              Competitor is acting
            </label>
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 text-center">
            <div className={`text-xl font-bold ${severityColor}`}>
              €{analysis.totalTCI.toLocaleString()}
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total TCI</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-xl font-bold">
              €{analysis.weeklyBurn.toLocaleString()}
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Per Week</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-xl font-bold text-warning">
              €{(analysis.annualizedTCI / 1000).toFixed(0)}K
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Annualized</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-xl font-bold">{analysis.entropyScore}</div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Entropy Score</p>
          </div>
        </div>

        {/* Breakdown */}
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center p-2 rounded bg-muted/30">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="w-3 h-3" /> Direct Revenue Loss
            </span>
            <span className="font-mono font-semibold">€{analysis.directLoss.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center p-2 rounded bg-muted/30">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <TrendingDown className="w-3 h-3" /> Compounded Opportunity Cost
            </span>
            <span className="font-mono font-semibold">€{analysis.compoundedCost.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center p-2 rounded bg-muted/30">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Competitive Multiplier
            </span>
            <span className="font-mono font-semibold">{analysis.competitiveMultiplier}×</span>
          </div>
        </div>

        {/* Severity alert */}
        {(analysis.severity === "critical" || analysis.severity === "high") && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-destructive/5 border border-destructive/10"
          >
            <p className="text-xs font-medium text-destructive">
              ⚠ {analysis.severity === "critical" 
                ? "Critical inaction cost — every week of delay erodes more value than the cost of a wrong decision."
                : "High inaction cost — the market is moving. Calculated inaction is more damaging than an imperfect decision."}
            </p>
          </motion.div>
        )}

        <div className="flex items-start gap-2 pt-2 border-t border-border/50">
          <BookOpen className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
          <p className="text-[10px] text-muted-foreground/60">
            TCI framework from <em>"Decision Intelligence"</em> by Stanley Osei-Wusu (Ch. 3).
            "Calculated inaction can prove significantly more damaging than a well-intentioned, albeit imperfect, decision."
            {" "}This is an illustrative what-if model driven entirely by the inputs above — the weights are
            assumptions, not empirically fitted, so treat outputs as directional scenarios, not forecasts.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default TCICalculator;
