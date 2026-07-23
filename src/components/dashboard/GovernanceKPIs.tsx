import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Shield, Database, Users, FileText, CheckCircle2,
  AlertTriangle, Clock, BarChart3, TrendingUp,
} from "lucide-react";
import HelpTooltip from "@/components/ui/help-tooltip";

interface GovKPI {
  label: string;
  icon: typeof Shield;
  value: string | number;
  target: string;
  progress: number;
  status: "healthy" | "warning" | "critical";
  help: { what: string; how: string; why: string };
}

const GovernanceKPIs = () => {
  const { currentOrgId } = useOrganization();

  const { data: stats } = useQuery({
    queryKey: ["governance-kpis", currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return null;

      const [datasets, quality, decisions, members, policies, retentionPolicies] = await Promise.all([
        // "completed" is what the standard CSV upload flow (DataUpload.tsx)
        // writes on success; "active" is only written by the demo seed and
        // API-ingest paths. Filtering on "active" alone made every
        // CSV-uploaded org's dataset count come back 0 here.
        supabase.from("datasets").select("id, uploaded_by, steward_user_id, workspace_id").eq("organization_id", currentOrgId).in("status", ["active", "completed"]),
        supabase.from("data_quality_checks").select("score, dataset_id").eq("organization_id", currentOrgId).order("created_at", { ascending: false }).limit(10),
        supabase.from("decision_ledger").select("id, outcome_measured_at", { count: "exact" }).eq("organization_id", currentOrgId),
        supabase.from("organization_members").select("role, user_id").eq("organization_id", currentOrgId),
        supabase.from("data_retention_policies").select("id", { count: "exact", head: true }).eq("organization_id", currentOrgId),
        supabase.from("data_retention_policies").select("data_category").eq("organization_id", currentOrgId),
      ]);

      const avgQuality = quality.data?.length
        ? Math.round(quality.data.reduce((s, d) => s + (d.score ?? 0), 0) / quality.data.length)
        : 0;

      const stewardUserIds = new Set(
        (members.data ?? []).filter((m: { role: string; user_id: string }) => m.role === "steward").map((m: { role: string; user_id: string }) => m.user_id)
      );
      const stewardCount = stewardUserIds.size;
      const totalMembers = members.data?.length ?? 1;
      const outcomeTracked = decisions.data?.filter((d: { outcome_measured_at?: string | null }) => d.outcome_measured_at).length ?? 0;
      const totalDecisions = decisions.count ?? 0;
      const outcomeRate = totalDecisions > 0 ? Math.round((outcomeTracked / totalDecisions) * 100) : 0;

      // Governed dataset = has quality check + has assigned steward + has retention policy for 'datasets'
      const qualityDatasetIds = new Set((quality.data ?? []).map((q: { dataset_id?: string | null }) => q.dataset_id).filter(Boolean));
      const hasDatasetRetention = (retentionPolicies.data ?? []).some((p: { data_category: string }) => p.data_category === "datasets");
      const allDatasets = datasets.data ?? [];
      const governedCount = allDatasets.filter((d) => {
        const ds = d as { id: string; uploaded_by?: string; steward_user_id?: string | null; workspace_id?: string };
        return qualityDatasetIds.has(ds.id) &&
        (ds.steward_user_id != null || stewardUserIds.has(ds.uploaded_by ?? "")) &&
        hasDatasetRetention;
      }).length;

      return {
        datasetCount: allDatasets.length,
        governedCount,
        avgQuality,
        stewardCount,
        stewardRatio: Math.round((stewardCount / totalMembers) * 100),
        outcomeRate,
        policyCount: policies.count ?? 0,
      };
    },
    enabled: !!currentOrgId,
  });

  const kpis: GovKPI[] = [
    {
      label: "Data Quality Score",
      icon: Shield,
      value: `${stats?.avgQuality ?? 0}%`,
      target: ">95%",
      progress: stats?.avgQuality ?? 0,
      status: (stats?.avgQuality ?? 0) >= 95 ? "healthy" : (stats?.avgQuality ?? 0) >= 70 ? "warning" : "critical",
      help: {
        what: "Average accuracy and completeness of your data across recent quality checks.",
        how: "Mean score of the 10 most recent data quality checks (completeness, accuracy, consistency).",
        why: "Low quality data produces unreliable insights and erodes executive trust in recommendations.",
      },
    },
    {
      label: "Outcome Tracking Rate",
      icon: TrendingUp,
      value: `${stats?.outcomeRate ?? 0}%`,
      target: ">80%",
      progress: stats?.outcomeRate ?? 0,
      status: (stats?.outcomeRate ?? 0) >= 80 ? "healthy" : (stats?.outcomeRate ?? 0) >= 50 ? "warning" : "critical",
      help: {
        what: "Percentage of strategic decisions where the real-world outcome was measured and recorded.",
        how: "Decisions with outcome_measured_at ÷ total decisions in the ledger.",
        why: "Without tracking outcomes, you can't learn from past decisions or improve future judgment.",
      },
    },
    {
      label: "Data Stewards Assigned",
      icon: Users,
      value: stats?.stewardCount ?? 0,
      target: ">1 per domain",
      progress: Math.min((stats?.stewardRatio ?? 0), 100),
      status: (stats?.stewardCount ?? 0) >= 2 ? "healthy" : (stats?.stewardCount ?? 0) >= 1 ? "warning" : "critical",
      help: {
        what: "Number of team members assigned the Data Steward role — accountable for data quality in their domain.",
        how: "Count of organization members with 'steward' role ÷ total members.",
        why: "Without clear ownership, data quality issues have no accountable resolver.",
      },
    },
    {
      label: "Governed Datasets",
      icon: Database,
      value: `${stats?.governedCount ?? 0}/${stats?.datasetCount ?? 0}`,
      target: "All active",
      progress: (stats?.datasetCount ?? 0) > 0 ? Math.round(((stats?.governedCount ?? 0) / (stats?.datasetCount ?? 1)) * 100) : 0,
      status: (stats?.datasetCount ?? 0) > 0 && (stats?.governedCount ?? 0) === (stats?.datasetCount ?? 0) ? "healthy" : (stats?.governedCount ?? 0) >= 1 ? "warning" : "critical",
      help: {
        what: "Datasets that meet all three governance criteria: quality-checked, steward-assigned, and covered by a retention policy.",
        how: "Count of active datasets where (1) at least one quality check exists, (2) a steward is explicitly assigned (steward_user_id) or uploader holds steward role, and (3) a 'datasets' retention policy is defined.",
        why: "Ungoverned datasets create blind spots — decisions built on unchecked data carry hidden risk.",
      },
    },
    {
      label: "Retention Policies Defined",
      icon: Clock,
      value: stats?.policyCount ?? 0,
      target: "6 categories",
      progress: Math.round(((stats?.policyCount ?? 0) / 6) * 100),
      status: (stats?.policyCount ?? 0) >= 6 ? "healthy" : (stats?.policyCount ?? 0) >= 3 ? "warning" : "critical",
      help: {
        what: "Number of data categories with a defined retention period (e.g., datasets, audit logs, sessions).",
        how: "Count of entries in data_retention_policies for this organization (target: 6 categories).",
        why: "Missing retention policies create compliance exposure and unlimited storage liability.",
      },
    },
  ];

  const statusColors = {
    healthy: { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
    warning: { badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", icon: AlertTriangle },
    critical: { badge: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Governance KPIs
          <Badge variant="outline" className="text-[10px] ml-2">From Data Governance Framework</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!(stats && (
          (stats.avgQuality > 0) ||
          (stats.outcomeRate > 0) ||
          (stats.stewardCount > 0) ||
          (stats.datasetCount > 0) ||
          (stats.policyCount > 0)
        )) ? (
          <div className="flex flex-col items-center text-center py-8 gap-3">
            <div>
              <p className="text-sm font-semibold">Governance setup not started</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Complete your first governance assessment to populate these KPIs.
              </p>
            </div>
            <Button asChild size="sm">
              <Link to="/governance-maturity">Start assessment</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {kpis.map((kpi, i) => {
              const StatusIcon = statusColors[kpi.status].icon;
              return (
                <motion.div
                  key={kpi.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-muted/20"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <kpi.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-foreground">{kpi.label}</p>
                        <HelpTooltip
                          content={`${kpi.help.what}\n\nCalculation: ${kpi.help.how}\n\nWhy it matters: ${kpi.help.why}`}
                          side="top"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{kpi.value}</span>
                        <Badge className={`${statusColors[kpi.status].badge} text-[9px] border`}>
                          <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                          {kpi.status}
                        </Badge>
                      </div>
                    </div>
                    <Progress value={kpi.progress} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Target: {kpi.target}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GovernanceKPIs;
