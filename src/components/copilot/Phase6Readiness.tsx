/**
 * DeploymentReadiness — tracks deployment gate criteria via live telemetry.
 * Shows current vs target for each gate with live measurements.
 */

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Users, MessageSquareText, Shield, Target } from "lucide-react";
import { getCopilotQueryLog } from "@/hooks/useCopilotTelemetry";
import { useOrganization } from "@/hooks/useOrganization";

interface Phase6ReadinessProps {
  decisionsWithEvidence?: number;
  totalDecisions?: number;
  weeklyActiveUsers?: number;
  gate4Passed?: boolean;
}

export default function Phase6Readiness({
  decisionsWithEvidence = 0,
  totalDecisions = 0,
  weeklyActiveUsers = 0,
  gate4Passed = false,
}: Phase6ReadinessProps) {
  const { currentOrgId } = useOrganization();

  const gates = useMemo(() => {
    const queryLog = getCopilotQueryLog(currentOrgId ?? null);
    const totalQueries = queryLog.length;
    const knownQueries = queryLog.filter(q => q.detectedIntent !== "unknown").length;
    const routingAccuracy = totalQueries > 0 ? Math.round((knownQueries / totalQueries) * 100) : 0;
    const briefUniversality = totalDecisions > 0 ? Math.round((decisionsWithEvidence / totalDecisions) * 100) : 0;

    return [
      {
        label: "Gate 1 — Real Users",
        icon: Users,
        current: `${weeklyActiveUsers} WAU`,
        target: "10 WAU",
        progress: Math.min((weeklyActiveUsers / 10) * 100, 100),
        met: weeklyActiveUsers >= 10,
        note: weeklyActiveUsers === 0 ? "No weekly active users recorded yet." : undefined,
      },
      {
        label: "Gate 2 — Copilot Routing",
        icon: MessageSquareText,
        current: `${Math.round(routingAccuracy)}% (${totalQueries} queries)`,
        target: "≥ 80%, n ≥ 50",
        progress: routingAccuracy,
        met: routingAccuracy >= 80 && totalQueries >= 50,
        note: totalQueries < 50 ? `Need ${50 - totalQueries} more queries for valid sample.` : undefined,
      },
      {
        label: "Gate 3 — Brief Universality",
        icon: Target,
        current: `${briefUniversality}% (${decisionsWithEvidence}/${totalDecisions})`,
        target: "≥ 90%",
        progress: briefUniversality,
        met: briefUniversality >= 90 && totalDecisions >= 5,
        note: totalDecisions < 5 ? "Need at least 5 decisions." : undefined,
      },
      {
        label: "Gate 4 — Procurement Accessibility",
        icon: Shield,
        current: gate4Passed ? "Passed" : "Not tested",
        target: "Passed (n=5)",
        progress: gate4Passed ? 100 : 0,
        met: gate4Passed,
        note: "Manual user test with 5 procurement personas required.",
      },
    ];
  }, [decisionsWithEvidence, totalDecisions, weeklyActiveUsers, gate4Passed, currentOrgId]);

  const gatesMet = gates.filter(g => g.met).length;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Deployment Readiness
          </CardTitle>
          <Badge variant="outline" className={gatesMet === 4
            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
            : "bg-amber-500/10 text-amber-600 border-amber-500/30"
          }>
            {gatesMet}/4 gates met
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Deploy when all 4 gates are met. Each gate is computed from live telemetry.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {gates.map((gate, i) => {
          const Icon = gate.icon;
          return (
            <div key={i} className="p-3 rounded-lg border border-border/30 bg-muted/10 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                  <p className="text-xs font-semibold">{gate.label}</p>
                </div>
                {gate.met
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  : <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                }
              </div>
              <Progress value={gate.progress} className="h-1.5" />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Current: {gate.current}</span>
                <span>Target: {gate.target}</span>
              </div>
              {gate.note && <p className="text-[10px] text-muted-foreground/60 italic">{gate.note}</p>}
            </div>
          );
        })}
        {gatesMet === 4 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <p className="text-xs text-emerald-700 font-medium">All 4 gates met. Phase 6 is ready to implement.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
