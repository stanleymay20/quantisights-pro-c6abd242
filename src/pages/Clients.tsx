import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Users, AlertTriangle, TrendingUp, TrendingDown,
  ChevronRight, Loader2, Shield, Activity, BarChart3, Minus,
} from "lucide-react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface OrgSummary {
  id: string;
  name: string;
  role: string;
  memberCount: number;
  riskScore: number | null;
  convergenceScore: number | null;
  activeConflicts: number;
  tier: string | null;
}

const getRiskColor = (score: number | null) => {
  if (score === null) return "text-muted-foreground";
  if (score <= 25) return "text-success";
  if (score <= 50) return "text-primary";
  if (score <= 75) return "text-warning";
  return "text-destructive";
};

const getRiskBg = (score: number | null) => {
  if (score === null) return "bg-muted/30";
  if (score <= 25) return "bg-success/10";
  if (score <= 50) return "bg-primary/10";
  if (score <= 75) return "bg-warning/10";
  return "bg-destructive/10";
};

const Clients = () => {
  const { user } = useAuth();
  const { organizations, switchOrganization } = useOrganization();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [orgSummaries, setOrgSummaries] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummaries = async () => {
      if (!organizations.length) {
        setLoading(false);
        return;
      }

      const summaries: OrgSummary[] = [];

      for (const org of organizations) {
        const [membersRes, riskRes, convergenceRes, conflictsRes, subRes] = await Promise.all([
          supabase
            .from("organization_members")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", org.id),
          supabase
            .from("executive_risk_index")
            .select("score")
            .eq("organization_id", org.id)
            .order("last_updated", { ascending: false })
            .limit(1),
          supabase
            .from("executive_convergence_index")
            .select("score")
            .eq("organization_id", org.id)
            .order("created_at", { ascending: false })
            .limit(1),
          supabase
            .from("executive_conflicts")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", org.id)
            .is("resolved_at", null),
          supabase
            .from("subscriptions")
            .select("tier")
            .eq("organization_id", org.id)
            .eq("status", "active")
            .maybeSingle(),
        ]);

        summaries.push({
          id: org.id,
          name: org.name,
          role: org.role,
          memberCount: membersRes.count || 0,
          riskScore: riskRes.data?.[0]?.score ?? null,
          convergenceScore: convergenceRes.data?.[0]?.score ?? null,
          activeConflicts: conflictsRes.count || 0,
          tier: subRes.data?.tier ?? null,
        });
      }

      setOrgSummaries(summaries);
      setLoading(false);
    };

    fetchSummaries();
  }, [organizations]);

  const navigateToOrg = (orgId: string) => {
    switchOrganization(orgId);
    navigate("/dashboard");
  };

  const avgRisk = orgSummaries.filter((o) => o.riskScore !== null);
  const portfolioRisk = avgRisk.length
    ? Math.round(avgRisk.reduce((s, o) => s + (o.riskScore || 0), 0) / avgRisk.length)
    : null;
  const totalConflicts = orgSummaries.reduce((s, o) => s + o.activeConflicts, 0);
  const totalMembers = orgSummaries.reduce((s, o) => s + o.memberCount, 0);

  return (
    <SectionErrorBoundary sectionName="Clients">
    <>
        <header className="h-14 border-b border-border/30 flex items-center px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <h1 className="text-[18px] font-semibold tracking-tight">Client Portfolio</h1>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-auto">
          <div className="max-w-6xl mx-auto space-y-8">
            <p className="text-sm text-muted-foreground">Cross-organization governance overview</p>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Portfolio Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="border-primary/20">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <Building2 className="w-8 h-8 text-primary" />
                        <div>
                          <p className="text-2xl font-bold">{orgSummaries.length}</p>
                          <p className="text-xs text-muted-foreground">Organizations</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <Users className="w-8 h-8 text-primary" />
                        <div>
                          <p className="text-2xl font-bold">{totalMembers}</p>
                          <p className="text-xs text-muted-foreground">Total Members</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={portfolioRisk !== null ? getRiskBg(portfolioRisk) : ""}>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <Activity className={`w-8 h-8 ${getRiskColor(portfolioRisk)}`} />
                        <div>
                          <p className={`text-2xl font-bold ${getRiskColor(portfolioRisk)}`}>
                            {portfolioRisk !== null ? portfolioRisk : "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">Avg. Portfolio Risk</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={totalConflicts > 0 ? "bg-destructive/5" : ""}>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className={`w-8 h-8 ${totalConflicts > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                        <div>
                          <p className={`text-2xl font-bold ${totalConflicts > 0 ? "text-destructive" : ""}`}>
                            {totalConflicts}
                          </p>
                          <p className="text-xs text-muted-foreground">Active Conflicts</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Organization Cards */}
                <div className="space-y-4">
                  {orgSummaries.map((org) => (
                    <Card
                      key={org.id}
                      className="hover:border-primary/30 transition-colors cursor-pointer"
                      onClick={() => navigateToOrg(org.id)}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                              <Building2 className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                              <div className="flex items-center gap-3">
                                <h3 className="font-semibold text-lg">{org.name}</h3>
                                {org.tier && (
                                  <Badge variant="outline" className="capitalize text-xs">
                                    {org.tier}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs capitalize">
                                  {org.role}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 mt-1">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Users className="w-3 h-3" /> {org.memberCount} members
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-6">
                            <div className="text-center">
                              <p className={`text-xl font-bold ${getRiskColor(org.riskScore)}`}>
                                {org.riskScore !== null ? org.riskScore : "—"}
                              </p>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk</p>
                            </div>
                            <div className="text-center">
                              <p className={`text-xl font-bold ${
                                org.convergenceScore !== null
                                  ? org.convergenceScore >= 70
                                    ? "text-success"
                                    : org.convergenceScore >= 40
                                    ? "text-warning"
                                    : "text-destructive"
                                  : "text-muted-foreground"
                              }`}>
                                {org.convergenceScore !== null ? org.convergenceScore : "—"}
                              </p>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ECI</p>
                            </div>
                            <div className="text-center">
                              <p className={`text-xl font-bold ${org.activeConflicts > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                {org.activeConflicts}
                              </p>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Conflicts</p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {orgSummaries.length === 0 && (
                  <Card className="border-dashed border-2">
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                      <Building2 className="w-12 h-12 text-muted-foreground" />
                      <h2 className="text-[16px] font-semibold">No Organizations</h2>
                      <p className="text-muted-foreground text-center max-w-md">
                        You're not a member of any organizations yet. Create one or accept an invitation to get started.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </main>
    </>
    </SectionErrorBoundary>
  );
};

export default Clients;
