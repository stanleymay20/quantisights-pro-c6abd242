/**
 * CopilotAnalytics — query telemetry and deployment readiness dashboard.
 * Tracks query telemetry, intent routing accuracy, and deployment gate criteria.
 * Route: /copilot/analytics  |  Access: owner/admin only.
 */

import { useMemo, useEffect, useState } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, MessageSquareText, TrendingUp, Target, RefreshCw, ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCopilotQueryLog, type CopilotQueryEvent } from "@/hooks/useCopilotTelemetry";
import Phase6Readiness from "@/components/copilot/Phase6Readiness";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { usePermissions } from "@/hooks/usePermissions";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

export default function CopilotAnalytics() {
  const { currentOrgId } = useOrganization();
  const { orgRole, isLoading: roleLoading } = usePermissions();
  const [queries, setQueries] = useState<CopilotQueryEvent[]>([]);
  const [decisionsWithEvidence, setDecisionsWithEvidence] = useState(0);
  const [totalDecisions, setTotalDecisions] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const canView = useMemo(
    () => orgRole === "owner" || orgRole === "admin",
    [orgRole]
  );

  useEffect(() => {
    if (!canView) return;
    setQueries(getCopilotQueryLog(currentOrgId ?? null));
  }, [refreshKey, canView]);

  useEffect(() => {
    if (!currentOrgId || !canView) return;
    (async () => {
      const { data } = await supabase
        .from("decision_ledger")
        .select("id, evidence_sources")
        .eq("organization_id", currentOrgId);
      if (data) {
        setTotalDecisions(data.length);
        setDecisionsWithEvidence(
          data.filter(d => {
            const s = d.evidence_sources;
            return s && (Array.isArray(s) ? s.length > 0 : Object.keys(s as object).length > 0);
          }).length
        );
      }
    })();
  }, [currentOrgId, refreshKey]);

  const stats = useMemo(() => {
    const total = queries.length;
    const known = queries.filter(q => q.detectedIntent !== "unknown").length;
    const accuracy = total > 0 ? Math.round((known / total) * 100) : 0;

    const intentCounts: Record<string, number> = {};
    for (const q of queries) {
      intentCounts[q.detectedIntent] = (intentCounts[q.detectedIntent] || 0) + 1;
    }
    const topIntents = Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const failedIntents = queries.filter(q => q.detectedIntent === "unknown");
    const recentQueries = queries.slice(0, 10);

    return { total, accuracy, topIntents, failedIntents: failedIntents.length, recentQueries };
  }, [queries]);

  if (roleLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-primary" />
              </div>
              <CardTitle>Owner/Admin Access Required</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Copilot Analytics shows query telemetry for everyone in your organization and is restricted to <strong>Owner</strong> and <strong>Admin</strong> roles. Contact your organization owner if you need access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <SectionErrorBoundary sectionName="Copilot Analytics">
      <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-6 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <BarChart3 className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Copilot Analytics</h1>
          </div>
          <Button size="sm" variant="outline" onClick={() => setRefreshKey(k => k + 1)} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-5xl mx-auto space-y-6">

            {/* Top stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total queries</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className={`text-2xl font-bold ${stats.accuracy >= 80 ? "text-emerald-600" : stats.accuracy >= 50 ? "text-amber-600" : "text-destructive"}`}>
                    {Math.round(stats.accuracy)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Routing accuracy</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-destructive">{stats.failedIntents}</p>
                  <p className="text-xs text-muted-foreground mt-1">Unmatched intents</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{decisionsWithEvidence}/{totalDecisions}</p>
                  <p className="text-xs text-muted-foreground mt-1">Briefs with evidence</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Deployment readiness gates */}
              <Phase6Readiness
                decisionsWithEvidence={decisionsWithEvidence}
                totalDecisions={totalDecisions}
                weeklyActiveUsers={0}
                gate4Passed={false}
              />

              {/* Top intents */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Top Detected Intents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.topIntents.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No queries yet. Use the Copilot to start building telemetry.</p>
                  ) : (
                    <div className="space-y-2">
                      {stats.topIntents.map(([intent, count]) => (
                        <div key={intent} className="flex items-center justify-between text-sm">
                          <span className="text-foreground capitalize">{intent.replace(/_/g, " ")}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${Math.round((count / stats.total) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent queries */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquareText className="w-4 h-4 text-primary" />
                  Recent Queries
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.recentQueries.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No queries logged yet. Every query sent via the Copilot page or Home input box is recorded here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {stats.recentQueries.map(q => (
                      <div key={q.id} className="flex items-start gap-3 p-2 rounded border border-border/30 text-xs">
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground truncate">{q.query}</p>
                          <p className="text-muted-foreground mt-0.5">
                            Intent: <span className="text-primary">{q.detectedIntent.replace(/_/g, " ")}</span>
                            {" · "}Route: <span className="font-mono">{q.routedDestination}</span>
                          </p>
                        </div>
                        <span className="text-muted-foreground/60 shrink-0">
                          {new Date(q.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </main>
      </>
    </SectionErrorBoundary>
  );
}
