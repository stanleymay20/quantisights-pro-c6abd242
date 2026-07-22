import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import ExecutiveCopilot from "@/components/dashboard/ExecutiveCopilot";
import StrategicSimulation from "@/components/dashboard/StrategicSimulation";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import ExecutiveConvergence from "@/components/dashboard/ExecutiveConvergence";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Crown, TrendingUp, TrendingDown, Shield, Target, AlertTriangle,
  Zap, Clock, ChevronRight, Loader2, Lock, BarChart3, DollarSign, Users, Settings2,
  Activity, History, RefreshCw, CheckCircle2, Bell, Mail, MessageSquare, Save, Brain, FileText,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import IntelligenceDisclaimer from "@/components/IntelligenceDisclaimer";
import DatasetRequired from "@/components/layout/DatasetRequired";

type RoleType = "ceo" | "cfo" | "cmo" | "coo";

interface Alert {
  title: string;
  severity: "critical" | "warning" | "info";
  description: string;
}
interface Snapshot {
  kpi_name: string;
  status: "on_track" | "at_risk" | "critical" | "exceeding";
  value: string;
  trend: string;
  insight: string;
}
interface Action {
  action: string;
  impact: "high" | "medium" | "low";
  timeframe: string;
}
interface Brief {
  executive_summary: string;
  critical_alerts: Alert[];
  performance_snapshot: Snapshot[];
  strategic_focus: string[];
  recommended_actions: Action[];
  urgency_level: "stable" | "monitor" | "action_required" | "critical";
  role_type: string;
  generated_at: string;
  risk_score?: number;
  risk_components?: { deviation: number; trend: number; volatility: number; forecast: number };
  active_alerts_db?: DbAlert[];
  cached?: boolean;
}

interface DbAlert {
  id: string;
  title: string;
  severity: string;
  trigger_value: number;
  threshold_value: number;
  created_at: string;
}

interface RiskIndex {
  score: number;
  components: { deviation: number; trend: number; volatility: number; forecast: number };
  last_updated: string;
  escalation_required?: boolean;
  escalation_reason?: string;
}

interface NotifPrefs {
  email_enabled: boolean;
  email_recipients: string[];
  slack_webhook_url: string;
  slack_enabled: boolean;
  alert_threshold: number;
  weekly_brief_enabled: boolean;
  escalation_threshold: number;
}

interface HistoricalBrief {
  id: string;
  role_type: string;
  risk_score: number;
  generated_by: string;
  generated_at: string;
}

const ROLES: { key: RoleType; label: string; icon: typeof Crown; description: string }[] = [
  { key: "ceo", label: "CEO", icon: Crown, description: "Strategic growth & risk" },
  { key: "cfo", label: "CFO", icon: DollarSign, description: "Margins & cash flow" },
  { key: "cmo", label: "CMO", icon: Users, description: "Acquisition & LTV" },
  { key: "coo", label: "COO", icon: Settings2, description: "Operational efficiency" },
];

const URGENCY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  stable: { bg: "bg-success/10", text: "text-success", label: "Stable" },
  monitor: { bg: "bg-primary/10", text: "text-primary", label: "Monitor" },
  action_required: { bg: "bg-warning/10", text: "text-warning", label: "Action Required" },
  critical: { bg: "bg-destructive/10", text: "text-destructive", label: "Critical" },
};

const STATUS_STYLES: Record<string, { dot: string; label: string }> = {
  on_track: { dot: "bg-success", label: "On Track" },
  at_risk: { dot: "bg-warning", label: "At Risk" },
  critical: { dot: "bg-destructive", label: "Critical" },
  exceeding: { dot: "bg-primary", label: "Exceeding" },
};

const IMPACT_STYLES: Record<string, string> = {
  high: "border-success/30 bg-success/5",
  medium: "border-warning/30 bg-warning/5",
  low: "border-muted-foreground/20 bg-muted/5",
};

const SEVERITY_STYLES: Record<string, { icon: typeof AlertTriangle; color: string }> = {
  critical: { icon: AlertTriangle, color: "text-destructive" },
  warning: { icon: AlertTriangle, color: "text-warning" },
  info: { icon: Shield, color: "text-primary" },
};

// Risk Dial Component
const RiskDial = ({ score, lastUpdated }: { score: number; lastUpdated?: string }) => {
  const radius = 70;
  const circumference = Math.PI * radius;
  const progress = (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s <= 25) return "stroke-success";
    if (s <= 50) return "stroke-primary";
    if (s <= 75) return "stroke-warning";
    return "stroke-destructive";
  };

  const getLabel = (s: number) => {
    if (s <= 25) return "Low Risk";
    if (s <= 50) return "Moderate";
    if (s <= 75) return "Elevated";
    return "High Risk";
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-44 h-24 overflow-hidden">
        <svg viewBox="0 0 160 85" className="w-full h-full">
          {/* Background arc */}
          <path
            d="M 10 80 A 70 70 0 0 1 150 80"
            fill="none"
            className="stroke-muted/30"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Score arc */}
          <path
            d="M 10 80 A 70 70 0 0 1 150 80"
            fill="none"
            className={getColor(score)}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            style={{ transition: "stroke-dasharray 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className="text-3xl font-bold">{score}</span>
        </div>
      </div>
      <span className="text-sm font-medium text-muted-foreground mt-1">{getLabel(score)}</span>
      {lastUpdated && (
        <span className="text-xs text-muted-foreground mt-0.5">
          Updated {new Date(lastUpdated).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
};

const Executive = () => {
  const { user } = useAuth();
  const { orgId: currentOrgId, datasetId: activeDatasetId, datasetName: activeDatasetName } = useActiveDataContext();
  const { tier } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeRole, setActiveRole] = useState<RoleType>("ceo");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [riskIndex, setRiskIndex] = useState<RiskIndex | null>(null);
  const [dbAlerts, setDbAlerts] = useState<DbAlert[]>([]);
  const [briefHistory, setBriefHistory] = useState<HistoricalBrief[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    email_enabled: true,
    email_recipients: [],
    slack_webhook_url: "",
    slack_enabled: false,
    alert_threshold: 50,
    weekly_brief_enabled: false,
    escalation_threshold: 85,
  });
  const [emailInput, setEmailInput] = useState("");
  const [savingPrefs, setSavingPrefs] = useState(false);

  const isDemoUser = Boolean(user?.user_metadata?.is_demo);
  const isGated = !isDemoUser && (!tier || tier === "starter");

  // Fetch persistent data
  const fetchSignalData = useCallback(async () => {
    if (!currentOrgId || isGated) return;

    // Fetch risk index
    const { data: risk } = await supabase
      .from("executive_risk_index")
      .select("score, components, last_updated, escalation_required, escalation_reason")
      .eq("organization_id", currentOrgId)
      .eq("role_type", activeRole)
      .maybeSingle();

    if (risk) {
      setRiskIndex({
        score: risk.score,
        components: risk.components as RiskIndex["components"],
        last_updated: risk.last_updated,
        escalation_required: risk.escalation_required,
        escalation_reason: risk.escalation_reason ?? undefined,
      });
    } else {
      setRiskIndex(null);
    }

    // Fetch notification preferences
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("organization_id", currentOrgId)
      .eq("role_type", activeRole)
      .maybeSingle();

    if (prefs) {
      setNotifPrefs({
        email_enabled: prefs.email_enabled,
        email_recipients: ((prefs as Record<string, unknown>).email_recipients as string[]) || [],
        slack_webhook_url: ((prefs as Record<string, unknown>).slack_webhook_url as string) || "",
        slack_enabled: prefs.slack_enabled,
        alert_threshold: prefs.alert_threshold,
        weekly_brief_enabled: prefs.weekly_brief_enabled,
        escalation_threshold: prefs.escalation_threshold,
      });
    }

    // Fetch active alerts
    const { data: alerts } = await supabase
      .from("executive_alerts")
      .select("id, title, severity, trigger_value, threshold_value, created_at")
      .eq("organization_id", currentOrgId)
      .eq("role_type", activeRole)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    setDbAlerts((alerts as DbAlert[]) || []);

    // Fetch brief history
    const { data: history } = await supabase
      .from("executive_briefs")
      .select("id, role_type, risk_score, generated_by, generated_at")
      .eq("organization_id", currentOrgId)
      .eq("role_type", activeRole)
      .order("generated_at", { ascending: false })
      .limit(10);

    setBriefHistory((history as Array<{ id: string; role_type: string; risk_score: number; generated_by: string; generated_at: string }>) || []);
  }, [currentOrgId, activeRole, isGated]);

  // Reset state when dataset changes
  useEffect(() => {
    setBrief(null);
    setRiskIndex(null);
    setDbAlerts([]);
    setBriefHistory([]);
  }, [activeDatasetId]);

  useEffect(() => {
    fetchSignalData();
  }, [fetchSignalData]);

  const computeSignals = async () => {
    if (!currentOrgId) return;
    setSignalsLoading(true);
    try {
      const { data, error } = await invokeWithRetry<Record<string, unknown>>("compute-executive-signals", {
        body: { role_type: activeRole, organization_id: currentOrgId, dataset_id: activeDatasetId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      setRiskIndex({
        score: data?.overall_score as number,
        components: data?.components as RiskIndex["components"],
        last_updated: data?.computed_at as string,
      });
      setDbAlerts((data?.triggered_alerts as DbAlert[]) || []);
      toast({ title: "Signals computed", description: `Risk score: ${data?.overall_score}/100` });
      fetchSignalData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSignalsLoading(false);
    }
  };

  const saveNotifPrefs = async () => {
    if (!currentOrgId) return;
    setSavingPrefs(true);
    try {
      const payload = {
        organization_id: currentOrgId,
        role_type: activeRole,
        ...notifPrefs,
      };
      const { error } = await supabase
        .from("notification_preferences")
        .upsert(payload, { onConflict: "organization_id,role_type" });
      if (error) throw error;
      toast({ title: "Saved", description: "Notification preferences updated" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSavingPrefs(false);
    }
  };

  const addEmailRecipient = () => {
    if (emailInput && emailInput.includes("@")) {
      setNotifPrefs((p) => ({ ...p, email_recipients: [...p.email_recipients, emailInput] }));
      setEmailInput("");
    }
  };

  const removeEmailRecipient = (email: string) => {
    setNotifPrefs((p) => ({ ...p, email_recipients: p.email_recipients.filter((e) => e !== email) }));
  };

  const generateBrief = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    setBrief(null);
    try {
      const { data, error } = await invokeWithRetry<Brief>("executive-brief", {
        body: { role_type: activeRole, organization_id: currentOrgId, dataset_id: activeDatasetId },
      });
      if (error) throw error;
      const rawData = data as unknown as Record<string, unknown> | null;
      if (rawData?.error) throw new Error(String(rawData.error));
      if (data) setBrief(data);
      if (rawData?.cached) {
        toast({ title: "Cached brief loaded", description: "Recent brief returned (< 6 hours old)" });
      }
      fetchSignalData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Error", description: msg || "Failed to generate brief", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const urgency = brief ? URGENCY_STYLES[brief.urgency_level] || URGENCY_STYLES.monitor : null;

  return (
    <DatasetRequired moduleName="Executive Command">
    <main className="flex-1 p-8 overflow-auto">
        <IntelligenceDisclaimer variant="banner" context="executive" />
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SidebarMobileToggle />
              <h1 className="text-[18px] font-bold tracking-tight">Executive Command</h1>
              <p className="text-muted-foreground mt-1">Strategic Health Monitoring</p>
            </div>
            <div className="flex items-center gap-3">
              {riskIndex?.escalation_required && (
                <Badge className="bg-destructive/10 text-destructive border-destructive/30 px-4 py-2 text-sm font-semibold animate-pulse">
                  ⚠ Board Escalation
                </Badge>
              )}
              {brief && urgency && (
                <Badge className={`${urgency.bg} ${urgency.text} border-none px-4 py-2 text-sm font-semibold`}>
                  {urgency.label}
                </Badge>
              )}
              {brief?.cached && (
                <Badge variant="outline" className="text-xs">Cached</Badge>
              )}
              <Button variant="outline" size="sm" onClick={() => navigate("/board-report")}>
                <FileText className="w-4 h-4 mr-1" />
                Board Report
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
                <Bell className="w-4 h-4 mr-1" />
                Alerts
              </Button>
            </div>
          </div>

          {/* Role Toggle */}
          <div className="grid grid-cols-4 gap-3">
            {ROLES.map((role) => {
              const Icon = role.icon;
              const isActive = activeRole === role.key;
              return (
                <button
                  key={role.key}
                  onClick={() => { setActiveRole(role.key); setBrief(null); }}
                  disabled={isGated}
                  className={`relative flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all duration-200 ${
                    isActive
                      ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                      : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                  } ${isGated ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <Icon className={`w-7 h-7 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`font-bold text-lg ${isActive ? "text-primary" : "text-foreground"}`}>
                    {role.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{role.description}</span>
                </button>
              );
            })}
          </div>

          {/* Gated State */}
          {isGated ? (
            <Card className="border-dashed border-2 border-muted-foreground/20">
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <Lock className="w-12 h-12 text-muted-foreground" />
                <h2 className="text-[16px] font-semibold">Upgrade to Growth or Enterprise</h2>
                <p className="text-muted-foreground text-center max-w-md">
                  AI-powered strategic intelligence tailored to each C-suite role.
                </p>
                <Button onClick={() => window.location.href = "/pricing"}>View Plans</Button>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="command" className="space-y-6">
              <TabsList className="grid w-full max-w-2xl grid-cols-4">
                <TabsTrigger value="command" className="gap-2">
                  <Activity className="w-4 h-4" />
                  Command Center
                </TabsTrigger>
                <TabsTrigger value="copilot" className="gap-2">
                  <Brain className="w-4 h-4" />
                  AI Copilot
                </TabsTrigger>
                <TabsTrigger value="simulation" className="gap-2">
                  <Target className="w-4 h-4" />
                  Simulation
                </TabsTrigger>
                <TabsTrigger value="convergence" className="gap-2">
                  <Users className="w-4 h-4" />
                  Convergence
                </TabsTrigger>
              </TabsList>

              <TabsContent value="command" className="space-y-6">
              {/* Risk Index + Signals + Actions Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Risk Dial */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="w-4 h-4 text-primary" />
                      Strategic Risk Index
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center pt-2">
                    {riskIndex ? (
                      <>
                        <RiskDial score={riskIndex.score} lastUpdated={riskIndex.last_updated} />
                        <div className="grid grid-cols-3 gap-3 w-full mt-4 text-center">
                          <div>
                            <p className="text-xs text-muted-foreground">Deviation</p>
                            <p className="font-semibold text-sm">{riskIndex.components.deviation}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Trend</p>
                            <p className="font-semibold text-sm">{riskIndex.components.trend}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Volatility</p>
                            <p className="font-semibold text-sm">{riskIndex.components.volatility}</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-sm text-muted-foreground mb-2">No signals computed yet</p>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={computeSignals}
                      disabled={signalsLoading}
                      className="mt-4 w-full"
                    >
                      {signalsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                      Compute Signals
                    </Button>
                  </CardContent>
                </Card>

                {/* Persistent Alerts */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="w-4 h-4 text-warning" />
                      Active Alerts ({dbAlerts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dbAlerts.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {dbAlerts.map((alert) => {
                          const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
                          const Icon = style.icon;
                          return (
                            <div key={alert.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30">
                              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.color}`} />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{alert.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {Number(alert.trigger_value).toFixed(1)} vs {Number(alert.threshold_value).toFixed(1)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-8 gap-2">
                        <CheckCircle2 className="w-8 h-8 text-success" />
                        <p className="text-sm text-muted-foreground">All systems nominal</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Brief History */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <History className="w-4 h-4 text-primary" />
                      Brief Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {briefHistory.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {briefHistory.map((b) => (
                          <div key={b.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                            <div>
                              <p className="text-xs font-semibold">
                                {b.generated_by === "Ai" || b.generated_by === "ai" ? "AI Brief" :
                                 b.generated_by === "manual" ? "Manual" :
                                 b.generated_by ? b.generated_by.charAt(0).toUpperCase() + b.generated_by.slice(1) : "Brief"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(b.generated_at).toLocaleDateString()} {new Date(b.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              Risk: {b.risk_score}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-8 gap-2">
                        <History className="w-8 h-8 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">No briefs generated yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Generate Button */}
              {!brief && !loading && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="flex items-center justify-between py-6">
                    <div>
                      <h3 className="font-semibold text-lg">
                        Generate {ROLES.find((r) => r.key === activeRole)?.label} Brief
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        AI interprets deterministic signals for role-specific insights
                      </p>
                    </div>
                    <Button size="lg" onClick={generateBrief}>
                      <Zap className="w-5 h-5 mr-2" />
                      Generate Intelligence
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Loading */}
              {loading && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-muted-foreground font-medium">Generating strategic intelligence…</p>
                  </CardContent>
                </Card>
              )}

              {/* Brief Display */}
              {brief && (
                <div className="space-y-6">
                  {/* Executive Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-primary" />
                        Executive Summary
                      </CardTitle>
                      <CardDescription>
                        Generated {new Date(brief.generated_at).toLocaleString()}
                        {brief.risk_score !== undefined && ` · Risk Score: ${brief.risk_score}/100`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-foreground leading-relaxed text-base">{brief.executive_summary}</p>
                    </CardContent>
                  </Card>

                  {/* Critical Alerts from AI */}
                  {brief.critical_alerts.length > 0 && (
                    <Card className="border-destructive/20">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-destructive">
                          <AlertTriangle className="w-5 h-5" />
                          Critical Alerts ({brief.critical_alerts.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {brief.critical_alerts.map((alert, i) => {
                          const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
                          const AlertIcon = style.icon;
                          return (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                              <AlertIcon className={`w-5 h-5 mt-0.5 shrink-0 ${style.color}`} />
                              <div>
                                <p className="font-semibold text-sm">{alert.title}</p>
                                <p className="text-sm text-muted-foreground">{alert.description}</p>
                              </div>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  )}

                  {/* Performance Snapshot */}
                  {brief.performance_snapshot.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Target className="w-5 h-5 text-primary" />
                          KPI Performance
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {brief.performance_snapshot.map((snap, i) => {
                            const status = STATUS_STYLES[snap.status] || STATUS_STYLES.on_track;
                            const trendUp = snap.trend.includes("+") || snap.trend.toLowerCase().includes("up");
                            return (
                              <div key={i} className="p-4 rounded-xl border bg-card">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-semibold text-sm">{snap.kpi_name}</span>
                                  <div className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${status.dot}`} />
                                    <span className="text-xs text-muted-foreground">{status.label}</span>
                                  </div>
                                </div>
                                <p className="text-[18px] font-semibold tracking-tight">{snap.value}</p>
                                <div className="flex items-center gap-1 mt-1">
                                  {trendUp ? (
                                    <TrendingUp className="w-4 h-4 text-success" />
                                  ) : (
                                    <TrendingDown className="w-4 h-4 text-destructive" />
                                  )}
                                  <span className="text-sm text-muted-foreground">{snap.trend}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">{snap.insight}</p>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Strategic Focus */}
                    {brief.strategic_focus.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-primary" />
                            Strategic Focus
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {brief.strategic_focus.map((focus, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                              <ChevronRight className="w-4 h-4 text-primary shrink-0" />
                              <span className="text-sm">{focus}</span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}

                    {/* Recommended Actions */}
                    {brief.recommended_actions.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Zap className="w-5 h-5 text-primary" />
                            Recommended Actions
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {brief.recommended_actions.map((action, i) => (
                            <div
                              key={i}
                              className={`p-3 rounded-lg border ${IMPACT_STYLES[action.impact] || IMPACT_STYLES.low}`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-semibold">{action.action}</span>
                                <Badge variant="outline" className="text-xs capitalize">
                                  {action.impact}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {action.timeframe}
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Regenerate */}
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={generateBrief}>
                      <Zap className="w-4 h-4 mr-2" />
                      Regenerate Brief
                    </Button>
                  </div>
                </div>
              )}

              {/* Escalation Banner */}
              {riskIndex?.escalation_required && (
                <Card className="border-destructive bg-destructive/5">
                  <CardContent className="flex items-center gap-4 py-4">
                    <AlertTriangle className="w-8 h-8 text-destructive shrink-0" />
                    <div>
                      <p className="font-bold text-destructive">Board Escalation Required</p>
                      <p className="text-sm text-muted-foreground">
                        {riskIndex.escalation_reason || "Multiple critical signals detected — executive attention needed"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Notification Settings Panel */}
              {showSettings && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-primary" />
                      Alert Distribution Settings
                    </CardTitle>
                    <CardDescription>Configure how {ROLES.find((r) => r.key === activeRole)?.label} alerts are delivered</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Email Settings */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          Email Notifications
                        </Label>
                        <Switch
                          checked={notifPrefs.email_enabled}
                          onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, email_enabled: v }))}
                        />
                      </div>
                      {notifPrefs.email_enabled && (
                        <div className="pl-6 space-y-2">
                          <div className="flex gap-2">
                            <Input
                              placeholder="Add recipient email"
                              value={emailInput}
                              onChange={(e) => setEmailInput(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && addEmailRecipient()}
                              className="flex-1"
                            />
                            <Button size="sm" variant="outline" onClick={addEmailRecipient}>Add</Button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {notifPrefs.email_recipients.map((email) => (
                              <Badge key={email} variant="secondary" className="cursor-pointer" onClick={() => removeEmailRecipient(email)}>
                                {email} ✕
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Slack Webhook */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4" />
                          Slack Webhook
                        </Label>
                        <Switch
                          checked={notifPrefs.slack_enabled}
                          onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, slack_enabled: v }))}
                        />
                      </div>
                      {notifPrefs.slack_enabled && (
                        <div className="pl-6">
                          <Input
                            placeholder="https://hooks.slack.com/services/..."
                            value={notifPrefs.slack_webhook_url}
                            onChange={(e) => setNotifPrefs((p) => ({ ...p, slack_webhook_url: e.target.value }))}
                          />
                        </div>
                      )}
                    </div>

                    {/* Thresholds */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Alert Threshold (risk score)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={notifPrefs.alert_threshold}
                          onChange={(e) => setNotifPrefs((p) => ({ ...p, alert_threshold: Number(e.target.value) }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Escalation Threshold</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={notifPrefs.escalation_threshold}
                          onChange={(e) => setNotifPrefs((p) => ({ ...p, escalation_threshold: Number(e.target.value) }))}
                        />
                      </div>
                    </div>

                    {/* Weekly Brief */}
                    <div className="flex items-center justify-between">
                      <Label>Weekly Executive Brief (Enterprise)</Label>
                      <Switch
                        checked={notifPrefs.weekly_brief_enabled}
                        onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, weekly_brief_enabled: v }))}
                        disabled={tier !== "enterprise"}
                      />
                    </div>

                    <Button onClick={saveNotifPrefs} disabled={savingPrefs} className="w-full">
                      {savingPrefs ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                      Save Preferences
                    </Button>
                  </CardContent>
                </Card>
              )}
              </TabsContent>

              <TabsContent value="copilot">
                <SectionErrorBoundary sectionName="Executive Copilot">
                <ExecutiveCopilot
                  organizationId={currentOrgId!}
                  roleType={activeRole}
                  riskScore={riskIndex?.score}
                  tier={tier}
                  datasetId={activeDatasetId ?? undefined}
                  datasetName={activeDatasetName}
                />
                </SectionErrorBoundary>
              </TabsContent>

              <TabsContent value="simulation">
                <SectionErrorBoundary sectionName="Strategic Simulation">
                <StrategicSimulation
                  organizationId={currentOrgId!}
                  datasetId={activeDatasetId!}
                  roleType={activeRole}
                  tier={tier}
                />
                </SectionErrorBoundary>
              </TabsContent>

              <TabsContent value="convergence">
                <SectionErrorBoundary sectionName="Executive Convergence">
                <ExecutiveConvergence
                  organizationId={currentOrgId!}
                  tier={tier}
                />
                </SectionErrorBoundary>
              </TabsContent>
            </Tabs>
          )}
        </div>
    </main>
    </DatasetRequired>
  );
};

export default Executive;
