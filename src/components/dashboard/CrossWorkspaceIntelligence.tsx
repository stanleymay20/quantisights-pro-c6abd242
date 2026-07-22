import { useState, useEffect, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Layers, Shield, Target, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Activity, BarChart3,
} from "lucide-react";

interface WorkspaceSummary {
  id: string;
  name: string;
  datasetCount: number;
  openAdvisories: number;
  riskScore: number | null;
  decisionsLogged: number;
  decisionsResolved: number;
  healthStatus: "healthy" | "at_risk" | "critical" | "no_data";
}

interface OrgTotals {
  totalWorkspaces: number;
  totalDecisions: number;
  totalOpenAdvisories: number;
  avgRiskScore: number | null;
  calibrationScore: number | null;
  workspacesAtRisk: number;
}

interface CrossWorkspaceIntelligenceProps {
  organizationId: string;
}

/**
 * Cross-Workspace Executive Intelligence Panel
 * Shows aggregated org-level view WITHOUT exposing raw workspace data.
 * Only accessible to org members — detailed data stays isolated.
 */
const CrossWorkspaceIntelligence = memo(({ organizationId }: CrossWorkspaceIntelligenceProps) => {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [totals, setTotals] = useState<OrgTotals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;

    const fetchCrossWorkspaceData = async () => {
      setLoading(true);

      // Fetch all workspaces in org
      const { data: wsData } = await supabase
        .from("workspaces")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });

      if (!wsData || wsData.length === 0) {
        setWorkspaces([]);
        setTotals(null);
        setLoading(false);
        return;
      }

      const wsIds = wsData.map(w => w.id);

      // Parallel org-level fetches (aggregated counts, no raw data exposed)
      const [datasetsRes, advisoriesRes, decisionsRes, riskRes, calRes] = await Promise.all([
        // Dataset counts per workspace. "completed" is what the standard
        // CSV upload flow writes on success; "active" is only written by
        // the demo seed and API-ingest paths. Both mean "usable dataset."
        supabase
          .from("datasets")
          .select("id, workspace_id")
          .eq("organization_id", organizationId)
          .in("status", ["active", "completed"])
          .in("workspace_id", wsIds),
        // Open advisory counts per workspace (via dataset → workspace)
        supabase
          .from("advisory_instances")
          .select("id, dataset_id")
          .eq("organization_id", organizationId)
          .in("status", ["open", "in_progress"]),
        // Decisions are org-scoped (institutional memory)
        supabase
          .from("decision_ledger")
          .select("id, decision_status, execution_status, created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(500),
        // Risk indices (org-scoped)
        supabase
          .from("executive_risk_index")
          .select("role_type, score")
          .eq("organization_id", organizationId),
        // Calibration (org-scoped)
        supabase
          .from("calibration_models")
          .select("overall_calibration_score")
          .eq("organization_id", organizationId)
          .order("computed_at", { ascending: false })
          .limit(1),
      ]);

      // Map datasets to workspaces
      const datasetsByWs = new Map<string, string[]>();
      const datasetToWs = new Map<string, string>();
      (datasetsRes.data || []).forEach(d => {
        if (!d.workspace_id) return;
        const list = datasetsByWs.get(d.workspace_id) || [];
        list.push(d.id);
        datasetsByWs.set(d.workspace_id, list);
        datasetToWs.set(d.id, d.workspace_id);
      });

      // Map advisories to workspaces via dataset
      const advisoryByWs = new Map<string, number>();
      (advisoriesRes.data || []).forEach(a => {
        if (!a.dataset_id) return;
        const wsId = datasetToWs.get(a.dataset_id);
        if (wsId) advisoryByWs.set(wsId, (advisoryByWs.get(wsId) || 0) + 1);
      });

      // Compute risk score (avg across roles)
      const riskScores = (riskRes.data || []).map(r => r.score);
      const avgRisk = riskScores.length > 0
        ? Math.round(riskScores.reduce((s, v) => s + v, 0) / riskScores.length)
        : null;

      // Build workspace summaries
      const totalDecisions = (decisionsRes.data || []).length;
      const resolvedDecisions = (decisionsRes.data || []).filter(
        d => d.execution_status === "completed" || d.decision_status === "completed"
      ).length;

      const summaries: WorkspaceSummary[] = wsData.map(ws => {
        const dsCount = datasetsByWs.get(ws.id)?.length || 0;
        const openAdv = advisoryByWs.get(ws.id) || 0;

        let health: WorkspaceSummary["healthStatus"] = "no_data";
        if (dsCount > 0) {
          if (openAdv >= 3) health = "critical";
          else if (openAdv >= 1) health = "at_risk";
          else health = "healthy";
        }

        return {
          id: ws.id,
          name: ws.name,
          datasetCount: dsCount,
          openAdvisories: openAdv,
          riskScore: avgRisk, // org-level risk applies to all
          decisionsLogged: totalDecisions,
          decisionsResolved: resolvedDecisions,
          healthStatus: health,
        };
      });

      const totalOpenAdv = Array.from(advisoryByWs.values()).reduce((s, v) => s + v, 0);

      setWorkspaces(summaries);
      setTotals({
        totalWorkspaces: wsData.length,
        totalDecisions,
        totalOpenAdvisories: totalOpenAdv,
        avgRiskScore: avgRisk,
        calibrationScore: calRes.data?.[0]?.overall_calibration_score ?? null,
        workspacesAtRisk: summaries.filter(w => w.healthStatus === "critical" || w.healthStatus === "at_risk").length,
      });
      setLoading(false);
    };

    fetchCrossWorkspaceData();
  }, [organizationId]);

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6">
          <div className="h-32 rounded bg-muted/30 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!totals || workspaces.length <= 1) {
    // Single workspace = no cross-workspace view needed
    return null;
  }

  const HEALTH_CONFIG: Record<string, { dot: string; label: string; icon: typeof CheckCircle2 }> = {
    healthy: { dot: "bg-success", label: "Healthy", icon: CheckCircle2 },
    at_risk: { dot: "bg-warning", label: "At Risk", icon: AlertTriangle },
    critical: { dot: "bg-destructive", label: "Critical", icon: AlertTriangle },
    no_data: { dot: "bg-muted-foreground/30", label: "No Data", icon: Activity },
  };

  const riskColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score <= 30) return "text-success";
    if (score <= 60) return "text-warning";
    return "text-destructive";
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> Cross-Workspace Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Org-Level KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border border-border/30 bg-card/50">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Workspaces</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Layers className="w-3.5 h-3.5 text-primary" />
              <span className="text-lg font-bold">{totals.totalWorkspaces}</span>
            </div>
            {totals.workspacesAtRisk > 0 && (
              <p className="text-[10px] text-warning mt-0.5">{totals.workspacesAtRisk} need attention</p>
            )}
          </div>

          <div className="p-3 rounded-lg border border-border/30 bg-card/50">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Org Risk</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Shield className={`w-3.5 h-3.5 ${riskColor(totals.avgRiskScore)}`} />
              <span className={`text-lg font-bold ${riskColor(totals.avgRiskScore)}`}>
                {totals.avgRiskScore ?? "—"}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg border border-border/30 bg-card/50">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Decisions</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Target className="w-3.5 h-3.5 text-primary" />
              <span className="text-lg font-bold">{totals.totalDecisions}</span>
            </div>
          </div>

          <div className="p-3 rounded-lg border border-border/30 bg-card/50">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Calibration</p>
            <div className="flex items-center gap-1.5 mt-1">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
              <span className="text-lg font-bold">
                {totals.calibrationScore != null ? `${totals.calibrationScore}%` : "—"}
              </span>
            </div>
            {totals.calibrationScore != null && totals.calibrationScore < 65 && (
              <p className="text-[10px] text-warning mt-0.5">Below 65% threshold</p>
            )}
          </div>
        </div>

        {/* Workspace Health Grid */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Workspace Health
          </p>
          {workspaces.map(ws => {
            const health = HEALTH_CONFIG[ws.healthStatus];
            const HealthIcon = health.icon;
            return (
              <div
                key={ws.id}
                className="flex items-center justify-between p-2.5 rounded-lg border border-border/30 bg-card/30"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-2 h-2 rounded-full ${health.dot} shrink-0`} />
                  <span className="text-xs font-semibold truncate">{ws.name}</span>
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    {ws.datasetCount} dataset{ws.datasetCount !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {ws.openAdvisories > 0 && (
                    <span className="text-[10px] text-warning flex items-center gap-0.5">
                      <AlertTriangle className="w-3 h-3" />
                      {ws.openAdvisories} open
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={`text-[9px] ${
                      ws.healthStatus === "critical"
                        ? "text-destructive border-destructive/30"
                        : ws.healthStatus === "at_risk"
                        ? "text-warning border-warning/30"
                        : ws.healthStatus === "healthy"
                        ? "text-success border-success/30"
                        : "text-muted-foreground"
                    }`}
                  >
                    <HealthIcon className="w-2.5 h-2.5 mr-0.5" />
                    {health.label}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>

        {/* Advisory Distribution */}
        {totals.totalOpenAdvisories > 0 && (
          <div className="p-3 rounded-lg border border-warning/20 bg-warning/[0.03]">
            <div className="flex items-center gap-2 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              <span className="font-medium">
                {totals.totalOpenAdvisories} open advisor{totals.totalOpenAdvisories !== 1 ? "ies" : "y"} across {totals.workspacesAtRisk} workspace{totals.workspacesAtRisk !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

CrossWorkspaceIntelligence.displayName = "CrossWorkspaceIntelligence";

export default CrossWorkspaceIntelligence;
