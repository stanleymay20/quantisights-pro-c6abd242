import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Loader2, AlertTriangle, RefreshCw, Shield, Zap,
  Users, TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";

interface Conflict {
  rule_triggered: string;
  severity: string;
  role_1: string;
  role_2: string;
  description: string;
}

interface RoleRisk {
  role_type: string;
  score: number;
  components: { deviation: number; trend: number; volatility: number; forecast: number };
}

interface AINarrative {
  board_alignment_summary: string;
  root_cause_analysis: string;
  realignment_strategy: string[];
  governance_risk_if_ignored: string;
}

interface ConvergenceResult {
  convergence_score: number;
  alignment_status: string;
  dispersion: number;
  conflict_penalty: number;
  volatility_divergence: number;
  conflicts: Conflict[];
  role_risks: RoleRisk[];
  ai_narrative: AINarrative | null;
  computed_at: string;
  error?: string;
  message?: string;
}

interface Props {
  organizationId: string;
  tier: string | null;
}

/** Semantic alignment styles using design tokens */
const ALIGNMENT_STYLES: Record<string, { bg: string; text: string; label: string; icon: typeof Shield }> = {
  aligned: { bg: "bg-success/10", text: "text-success", label: "Aligned", icon: Shield },
  tension: { bg: "bg-primary/10", text: "text-primary", label: "Tension", icon: Activity },
  misalignment: { bg: "bg-warning/10", text: "text-warning", label: "Misalignment", icon: AlertTriangle },
  structural_conflict: { bg: "bg-destructive/10", text: "text-destructive", label: "Structural Conflict", icon: AlertTriangle },
};

/** Semantic severity styles using design tokens */
const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-primary/10 text-primary border-primary/30",
  medium: "bg-warning/10 text-warning border-warning/30",
  high: "bg-destructive/10 text-destructive border-destructive/30",
  critical: "bg-destructive/10 text-destructive border-destructive/30",
};

/** Data-driven score-to-color mapping */
function getScoreColor(score: number): { stroke: string; bg: string } {
  if (score >= 80) return { stroke: "stroke-success", bg: "bg-success" };
  if (score >= 60) return { stroke: "stroke-primary", bg: "bg-primary" };
  if (score >= 40) return { stroke: "stroke-warning", bg: "bg-warning" };
  return { stroke: "stroke-destructive", bg: "bg-destructive" };
}

const ConvergenceDial = ({ score }: { score: number }) => {
  const radius = 70;
  const circumference = Math.PI * radius;
  const progress = (score / 100) * circumference;
  const { stroke } = getScoreColor(score);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-52 h-28 overflow-hidden">
        <svg viewBox="0 0 160 85" className="w-full h-full">
          <path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" className="stroke-muted/30" strokeWidth="10" strokeLinecap="round" />
          <path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" className={stroke} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            style={{ transition: "stroke-dasharray 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className="text-4xl font-bold">{score}</span>
        </div>
      </div>
      <span className="text-sm font-medium text-muted-foreground mt-1">Executive Convergence Index</span>
    </div>
  );
};

const ExecutiveConvergence = ({ organizationId, tier }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConvergenceResult | null>(null);

  const isDisabled = !tier || tier === "starter";

  const runConvergence = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeWithRetry<ConvergenceResult & { error?: string; message?: string }>("executive-convergence", {
        body: { organization_id: organizationId, trigger: "manual" },
      });
      if (error) throw error;
      if (data?.error === "insufficient_data") {
        toast({ title: "Insufficient Data", description: data.message, variant: "destructive" });
        return;
      }
      if (data?.error) throw new Error(data.error);
      setResult(data);
      toast({ title: "Convergence computed", description: `ECI: ${data.convergence_score}/100 — ${data.alignment_status}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (isDisabled) {
    return (
      <Card className="border-dashed border-2 border-muted-foreground/20">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <Users className="w-12 h-12 text-muted-foreground" />
          <h2 className="text-[16px] font-semibold">Growth or Enterprise Plan Required</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Multi-Role Convergence Analysis detects structural alignment gaps across your C-suite.
          </p>
          <Button onClick={() => window.location.href = "/pricing"}>View Plans</Button>
        </CardContent>
      </Card>
    );
  }

  const alignment = result ? ALIGNMENT_STYLES[result.alignment_status] || ALIGNMENT_STYLES.aligned : null;

  return (
    <div className="space-y-6">
      {/* Empty state */}
      {!result && !loading && (
        <Card className="border-dashed border-2 border-muted-foreground/20">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Users className="w-12 h-12 text-muted-foreground/50" />
            <h3 className="text-[14px] font-semibold">Executive Convergence Engine</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Analyze structural alignment across CEO, CFO, CMO, and COO risk signals. Detects conflicts, measures dispersion, and generates governance intelligence.
            </p>
            <Button onClick={runConvergence} disabled={loading}>
              <Zap className="w-4 h-4 mr-2" />
              Compute Convergence
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-muted-foreground font-medium">Computing executive convergence…</p>
            <p className="text-xs text-muted-foreground">Deterministic conflict detection + dispersion analysis</p>
          </CardContent>
        </Card>
      )}

      {result && !loading && (
        <>
          {/* Top row: Dial + Alignment + Recalculate */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardContent className="flex flex-col items-center pt-6">
                <ConvergenceDial score={result.convergence_score} />
                {alignment && (
                  <Badge className={`mt-4 ${alignment.bg} ${alignment.text} border-none px-4 py-2 text-sm font-semibold`}>
                    {alignment.label}
                  </Badge>
                )}
                <Button variant="outline" size="sm" className="mt-4" onClick={runConvergence} disabled={loading}>
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Recalculate
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Computed {new Date(result.computed_at).toLocaleString()}
                </p>
              </CardContent>
            </Card>

            {/* Role Risk Spread */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Role Risk Spread
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {result.role_risks.map((role) => {
                    const { bg: barColor } = getScoreColor(100 - role.score); // invert: high score = high risk = red
                    return (
                      <div key={role.role_type} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold uppercase">{role.role_type}</span>
                          <span className="text-sm font-mono">{role.score}/100</span>
                        </div>
                        <div className="h-3 rounded-full bg-muted/30 overflow-hidden">
                          <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${role.score}%` }} />
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>Dev: {role.components.deviation}</span>
                          <span>Trend: {role.components.trend}</span>
                          <span>Vol: {role.components.volatility}</span>
                          <span>Forecast: {role.components.forecast}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Score breakdown */}
                <div className="grid grid-cols-3 gap-3 mt-6">
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">Dispersion</p>
                    <p className="text-lg font-bold">{result.dispersion}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">Conflict Penalty</p>
                    <p className="text-lg font-bold text-destructive">{result.conflict_penalty}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">Vol. Divergence</p>
                    <p className="text-lg font-bold">{result.volatility_divergence}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Active Conflicts */}
          {result.conflicts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  Active Conflicts ({result.conflicts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.conflicts.map((c, i) => (
                  <div key={i} className={`p-4 rounded-lg border ${SEVERITY_COLORS[c.severity] || SEVERITY_COLORS.low}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold">
                        {c.role_1.toUpperCase()} ↔ {c.role_2.toUpperCase()}
                      </span>
                      <Badge variant="outline" className="text-xs capitalize">{c.severity}</Badge>
                    </div>
                    <p className="text-sm">{c.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">Rule: {c.rule_triggered}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {result.conflicts.length === 0 && (
            <Card>
              <CardContent className="flex items-center gap-3 py-6">
                <Shield className="w-6 h-6 text-success" />
                <div>
                  <p className="font-semibold text-success">No Active Conflicts</p>
                  <p className="text-sm text-muted-foreground">All executive risk perspectives are within acceptable alignment thresholds.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Narrative (Enterprise) */}
          {result.ai_narrative && (
            <Card className="border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Board Governance Assessment
                  <Badge variant="outline" className="text-xs ml-2">Enterprise AI</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Alignment Summary</p>
                  <p className="text-sm leading-relaxed">{result.ai_narrative.board_alignment_summary}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Root Cause</p>
                  <p className="text-sm">{result.ai_narrative.root_cause_analysis}</p>
                </div>
                {result.ai_narrative.realignment_strategy.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Realignment Strategy</p>
                    <div className="space-y-2">
                      {result.ai_narrative.realignment_strategy.map((s, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                          <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">{i + 1}</span>
                          <span className="text-sm">{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                  <p className="text-xs font-semibold text-destructive uppercase mb-1">Risk If Ignored</p>
                  <p className="text-sm">{result.ai_narrative.governance_risk_if_ignored}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default ExecutiveConvergence;
