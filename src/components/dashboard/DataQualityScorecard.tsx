import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ShieldCheck, AlertTriangle, Database, Clock, Activity, CheckCircle2 } from "lucide-react";

const DataQualityScorecard = () => {
  const { currentOrgId: organizationId } = useOrganization();

  const { data: checks } = useQuery({
    queryKey: ["data-quality-scorecard", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data } = await supabase
        .from("data_quality_checks")
        .select("check_type, status, score, records_checked, records_failed, created_at, details")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!organizationId,
  });

  const { data: datasets } = useQuery({
    queryKey: ["dataset-freshness", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      // "completed" is what the standard CSV upload flow writes on
      // success; "active" is only written by the demo seed and API-ingest
      // paths. Both mean "usable dataset."
      const { data } = await supabase
        .from("datasets")
        .select("id, name, status, is_stale, row_count, last_refreshed_at, freshness_policy_hours")
        .eq("organization_id", organizationId)
        .in("status", ["active", "completed"]);
      return data || [];
    },
    enabled: !!organizationId,
  });

  const { data: syncJobs } = useQuery({
    queryKey: ["sync-health", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("data_sync_jobs")
        .select("id, status, records_synced, error_message, completed_at")
        .eq("organization_id", organizationId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!organizationId,
  });

  // Compute aggregate scores
  const latestChecks = checks || [];
  const qualityScores = latestChecks.filter(c => c.score != null).map(c => c.score!);
  const avgQuality = qualityScores.length > 0 ? Math.round(qualityScores.reduce((s, v) => s + v, 0) / qualityScores.length) : null;

  const activeDatasets = datasets || [];
  const staleCount = activeDatasets.filter(d => d.is_stale).length;
  const freshnessScore = activeDatasets.length > 0
    ? Math.round(((activeDatasets.length - staleCount) / activeDatasets.length) * 100)
    : null;

  const jobs = syncJobs || [];
  const failedJobs = jobs.filter(j => j.status === "failed").length;
  const pipelineScore = jobs.length > 0
    ? Math.round(((jobs.length - failedJobs) / jobs.length) * 100)
    : null;

  const overallScore = [avgQuality, freshnessScore, pipelineScore].filter(s => s != null);
  const compositeScore = overallScore.length > 0
    ? Math.round(overallScore.reduce((s, v) => s + v!, 0) / overallScore.length)
    : null;

  const getScoreColor = (score: number | null) => {
    if (score == null) return "text-muted-foreground";
    if (score >= 90) return "text-primary";
    if (score >= 70) return "text-accent-foreground";
    return "text-destructive";
  };

  const getScoreBg = (score: number | null) => {
    if (score == null) return "bg-muted";
    if (score >= 90) return "bg-primary/10";
    if (score >= 70) return "bg-accent/10";
    return "bg-destructive/10";
  };

  // dbt checks
  const dbtChecks = latestChecks.filter(c => c.check_type?.startsWith("dbt_"));
  const latestDbt = dbtChecks[0];

  return (
    <div className="space-y-4">
      {/* Composite Score */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <ShieldCheck className="w-4 h-4" />
            Data Quality Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className={`text-4xl font-bold tracking-tight ${getScoreColor(compositeScore)}`}>
              {compositeScore != null ? compositeScore : "—"}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Validation Score</span>
                <span className={`font-medium ${getScoreColor(avgQuality)}`}>{avgQuality ?? "—"}%</span>
              </div>
              <Progress value={avgQuality ?? 0} className="h-1.5" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Freshness Score</span>
                <span className={`font-medium ${getScoreColor(freshnessScore)}`}>{freshnessScore ?? "—"}%</span>
              </div>
              <Progress value={freshnessScore ?? 0} className="h-1.5" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Pipeline Health</span>
                <span className={`font-medium ${getScoreColor(pipelineScore)}`}>{pipelineScore ?? "—"}%</span>
              </div>
              <Progress value={pipelineScore ?? 0} className="h-1.5" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className={`border-border ${getScoreBg(freshnessScore)}`}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Freshness</span>
            </div>
            <div className="text-lg font-bold">{activeDatasets.length - staleCount}/{activeDatasets.length}</div>
            <p className="text-[10px] text-muted-foreground">datasets fresh</p>
          </CardContent>
        </Card>

        <Card className={`border-border ${getScoreBg(pipelineScore)}`}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Pipelines</span>
            </div>
            <div className="text-lg font-bold">{jobs.length - failedJobs}/{jobs.length}</div>
            <p className="text-[10px] text-muted-foreground">syncs succeeded (24h)</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Records</span>
            </div>
            <div className="text-lg font-bold">
              {activeDatasets.reduce((s, d) => s + (d.row_count || 0), 0).toLocaleString()}
            </div>
            <p className="text-[10px] text-muted-foreground">total rows tracked</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Quality Checks</span>
            </div>
            <div className="text-lg font-bold">{latestChecks.length}</div>
            <p className="text-[10px] text-muted-foreground">validations run</p>
          </CardContent>
        </Card>
      </div>

      {/* dbt Integration Status */}
      {latestDbt && (
        <Card className="border-border">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">🔧</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">dbt Integration</span>
              </div>
              <Badge variant={latestDbt.status === "completed" ? "default" : "destructive"} className="text-[10px]">
                {latestDbt.status}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Type: {latestDbt.check_type?.replace("dbt_", "")}</span>
              <span>Score: {latestDbt.score}%</span>
              {latestDbt.records_failed ? (
                <span className="text-destructive">{latestDbt.records_failed} failures</span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stale Dataset Alerts */}
      {staleCount > 0 && (
        <Card className="border-border border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm font-semibold text-destructive">Stale Data Warning</span>
            </div>
            <div className="space-y-1">
              {activeDatasets.filter(d => d.is_stale).map(d => (
                <div key={d.id} className="flex items-center justify-between text-xs">
                  <span className="text-foreground/80">{d.name}</span>
                  <span className="text-muted-foreground">
                    Last refresh: {d.last_refreshed_at ? new Date(d.last_refreshed_at).toLocaleDateString() : "Never"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DataQualityScorecard;
