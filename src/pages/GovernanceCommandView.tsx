import { motion } from "framer-motion";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import GovernanceKPIs from "@/components/dashboard/GovernanceKPIs";
import StewardDrillDown from "@/components/governance/StewardDrillDown";
import { GovernanceExportButton } from "@/components/governance/GovernanceExport";
import { evaluateGovernanceRisks, type RiskContext } from "@/lib/governance-rules";
import {
  Shield, Award, Clock, Users, AlertTriangle, CheckCircle2,
  ArrowRight, TrendingUp, TrendingDown, Minus, BarChart3,
} from "lucide-react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

const MATURITY_LEVELS = [
  { min: 0, max: 20, label: "Initial", color: "text-destructive", bg: "bg-destructive/10" },
  { min: 21, max: 40, label: "Developing", color: "text-orange-400", bg: "bg-orange-500/10" },
  { min: 41, max: 60, label: "Defined", color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { min: 61, max: 80, label: "Managed", color: "text-blue-400", bg: "bg-blue-500/10" },
  { min: 81, max: 100, label: "Optimized", color: "text-emerald-400", bg: "bg-emerald-500/10" },
];

const getLevel = (score: number) =>
  MATURITY_LEVELS.find((l) => score >= l.min && score <= l.max) ?? MATURITY_LEVELS[0];

const GovernanceCommandView = () => {
  const { currentOrgId, currentOrg } = useOrganization();

  const { data: assessments } = useQuery({
    queryKey: ["governance-maturity-trend", currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return [];
      const { data } = await supabase
        .from("governance_maturity_assessments")
        .select("overall_score, dimensions, recommendations, created_at")
        .eq("organization_id", currentOrgId)
        .order("created_at", { ascending: false })
        .limit(2);
      return data ?? [];
    },
    enabled: !!currentOrgId,
  });

  const { data: retentionData } = useQuery({
    queryKey: ["retention-policy-detail", currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return [];
      const { data } = await supabase
        .from("data_retention_policies")
        .select("id, data_category, enforcement_status, last_cleanup_at")
        .eq("organization_id", currentOrgId);
      return data ?? [];
    },
    enabled: !!currentOrgId,
  });

  const { data: stewardCount } = useQuery({
    queryKey: ["steward-count", currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return 0;
      const { data } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", currentOrgId)
        .eq("role", "steward");
      return data?.length ?? 0;
    },
    enabled: !!currentOrgId,
  });

  const latest = assessments?.[0];
  const previous = assessments?.[1];
  const latestScore = latest ? Number(latest.overall_score) : null;
  const previousScore = previous ? Number(previous.overall_score) : null;
  const delta = latestScore !== null && previousScore !== null ? latestScore - previousScore : null;
  const latestLevel = getLevel(latestScore ?? 0);
  const dims = (latest?.dimensions ?? {}) as Record<string, number>;
  const dimEntries = Object.entries(dims).sort((a, b) => b[1] - a[1]);
  const strongest = dimEntries[0] ?? null;
  const weakest = dimEntries[dimEntries.length - 1] ?? null;
  const recommendations = (latest?.recommendations ?? []) as { dimension: string; score: number; action: string }[];
  const retentionCount = retentionData?.length ?? 0;
  const retentionCoverage = Math.round((retentionCount / 6) * 100);

  // Enforcement breakdown
  const enforcementCounts = {
    configured: (retentionData ?? []).filter((p: { enforcement_status?: string | null; data_category?: string }) => (p.enforcement_status ?? "configured") === "configured").length,
    scheduled: (retentionData ?? []).filter((p: { enforcement_status?: string | null; data_category?: string }) => p.enforcement_status === "scheduled").length,
    enforced: (retentionData ?? []).filter((p: { enforcement_status?: string | null; data_category?: string }) => p.enforcement_status === "enforced").length,
  };

  // Risk detection using centralized rules
  const riskCtx: RiskContext = {
    stewardCount: stewardCount ?? 0,
    retentionCount,
    maturityScore: latestScore,
    weakestScore: weakest ? weakest[1] : null,
    weakestName: weakest ? weakest[0] : null,
  };

  const risks = evaluateGovernanceRisks(riskCtx);

  // Recommended next actions
  const actions: { label: string; link: string }[] = [];
  if (!latest) actions.push({ label: "Complete your first governance maturity assessment", link: "/governance-maturity" });
  if ((stewardCount ?? 0) === 0) actions.push({ label: "Assign at least one Data Steward in Team settings", link: "/team" });
  if (retentionCount < 6) actions.push({ label: "Define retention policies for all 6 data categories", link: "/settings" });
  if (recommendations.length > 0) actions.push({ label: recommendations[0].action, link: "/governance-maturity" });
  if (actions.length === 0) actions.push({ label: "Reassess governance maturity to track progress", link: "/governance-maturity" });

  const riskColors = {
    high: "bg-destructive/10 text-destructive border-destructive/20",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  };

  const exportData = {
    maturityScore: latestScore,
    maturityLevel: latestLevel.label,
    delta,
    strongest: strongest as [string, number] | null,
    weakest: weakest as [string, number] | null,
    stewardCount: stewardCount ?? 0,
    retentionCount,
    risks: risks.map((r) => ({ label: r.label, severity: r.severity })),
    actions: actions.map((a) => ({ label: a.label })),
    orgName: currentOrg?.name ?? "Organization",
  };

  return (
    <SectionErrorBoundary sectionName="Governance Command">
    <div className="space-y-8 max-w-6xl pb-12">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <SidebarMobileToggle />
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">Governance Command View</h1>
            <p className="text-sm text-muted-foreground">
              Unified executive view — are we governed, where are we weak, and what to do next.
            </p>
          </div>
        </div>
        <GovernanceExportButton data={exportData} />
      </div>

      {/* Top row: Maturity Score + Steward + Retention + Strongest/Weakest */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="h-full">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground">Maturity Score</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight">{latestScore !== null ? latestScore : "—"}</span>
                <span className="text-sm text-muted-foreground">/100</span>
                {latestScore !== null && (
                  <Badge className={`${latestLevel.bg} ${latestLevel.color} border-0 text-[10px] ml-1`}>
                    {latestLevel.label}
                  </Badge>
                )}
              </div>
              {delta !== null && (
                <div className="flex items-center gap-1 mt-2 text-xs">
                  {delta > 0 ? <TrendingUp className="w-3 h-3 text-emerald-400" /> :
                   delta < 0 ? <TrendingDown className="w-3 h-3 text-destructive" /> :
                   <Minus className="w-3 h-3 text-muted-foreground" />}
                  <span className={delta > 0 ? "text-emerald-400" : delta < 0 ? "text-destructive" : "text-muted-foreground"}>
                    {delta > 0 ? "+" : ""}{delta} from previous
                  </span>
                </div>
              )}
              {latestScore === null && (
                <p className="text-[10px] text-muted-foreground/60 mt-2">
                  No assessment yet — this tracks governance process maturity (stewardship, retention, data quality discipline), separate from the always-on technical Security Posture score under Settings.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="h-full">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground">Data Stewards</span>
              </div>
              <span className="text-3xl font-bold tracking-tight">{stewardCount ?? 0}</span>
              <p className="text-[10px] text-muted-foreground/60 mt-2">
                {(stewardCount ?? 0) >= 2 ? "Good coverage" : (stewardCount ?? 0) >= 1 ? "Minimum viable" : "None assigned — high risk"}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="h-full">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground">Retention Coverage</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight">{retentionCount}</span>
                <span className="text-sm text-muted-foreground">/6 categories</span>
              </div>
              <Progress value={retentionCoverage} className="h-1.5 mt-2" />
              {retentionCount > 0 && (
                <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground/60">
                  {enforcementCounts.enforced > 0 && <span className="text-emerald-400">{enforcementCounts.enforced} enforced</span>}
                  {enforcementCounts.scheduled > 0 && <span className="text-blue-400">{enforcementCounts.scheduled} scheduled</span>}
                  {enforcementCounts.configured > 0 && <span>{enforcementCounts.configured} configured</span>}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="h-full">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground">Strongest / Weakest</span>
              </div>
              {strongest ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span className="capitalize">{strongest[0]}</span>
                    <span className="ml-auto font-bold text-emerald-400">{strongest[1]}%</span>
                  </div>
                  {weakest && (
                    <div className="flex items-center gap-2 text-xs">
                      <AlertTriangle className="w-3 h-3 text-destructive" />
                      <span className="capitalize">{weakest[0]}</span>
                      <span className="ml-auto font-bold text-destructive">{weakest[1]}%</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground/60">Complete an assessment to see dimensions</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Middle row: KPIs + Steward drill-down */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GovernanceKPIs />
        <StewardDrillDown />
      </div>

      {/* Bottom row: Risks + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Governance Risks with rule explanations */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Top Governance Risks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {risks.map((risk, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-muted/20"
                >
                  <Badge className={`${riskColors[risk.severity]} text-[9px] border shrink-0 mt-0.5`}>
                    {risk.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-foreground">{risk.label}</span>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5 italic">{risk.rule}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recommended Next Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-primary" />
              Recommended Next Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {actions.slice(0, 4).map((action, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link to={action.link}>
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
                      <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                      </div>
                      <span className="text-xs text-foreground">{action.label}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground ml-auto shrink-0" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </SectionErrorBoundary>
  );
};

export default GovernanceCommandView;
