import { useState, useEffect, Fragment } from "react";
import { motion } from "framer-motion";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSubscription } from "@/hooks/useSubscription";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";
import { TIERS, TierKey, FEATURE_MATRIX } from "@/lib/stripe-tiers";
import {
  CreditCard, Crown, Users, BarChart3, ArrowUpRight,
  Loader2, Check, Zap, Lock, ExternalLink, Calendar,
  TrendingUp, Shield,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { CONTACT } from "@/lib/contact-config";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface UsageData {
  simulations: number;
  convergence: number;
  copilot: number;
  members: number;
}

const TIER_LIMITS: Record<string, { simulations: number; convergence: number; copilot: number; seats: number }> = {
  starter:    { simulations: 5,  convergence: 3,  copilot: 20,  seats: 5  },
  growth:     { simulations: 50, convergence: 30, copilot: -1,  seats: 15 },  // -1 = unlimited
  enterprise: { simulations: -1, convergence: -1, copilot: -1,  seats: -1 },
};

const Billing = () => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { subscribed, tier, subscriptionEnd, loading: subLoading } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [usage, setUsage] = useState<UsageData>({ simulations: 0, convergence: 0, copilot: 0, members: 0 });
  const [portalLoading, setPortalLoading] = useState(false);

  const activeTier = tier || "starter";
  const tierConfig = TIERS[activeTier as TierKey] || TIERS.starter;
  const limits = TIER_LIMITS[activeTier] || TIER_LIMITS.starter;

  useEffect(() => {
    if (!currentOrgId) return;
    const fetchUsage = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [simRes, convRes, copRes, memRes] = await Promise.all([
        supabase.from("simulation_usage").select("call_count").eq("organization_id", currentOrgId).eq("date", today).maybeSingle(),
        supabase.from("convergence_usage").select("call_count").eq("organization_id", currentOrgId).eq("date", today).maybeSingle(),
        supabase.from("copilot_usage").select("call_count").eq("organization_id", currentOrgId).eq("date", today).maybeSingle(),
        supabase.from("organization_members").select("id").eq("organization_id", currentOrgId),
      ]);
      setUsage({
        simulations: simRes.data?.call_count || 0,
        convergence: convRes.data?.call_count || 0,
        copilot: copRes.data?.call_count || 0,
        members: memRes.data?.length || 0,
      });
    };
    fetchUsage();
  }, [currentOrgId]);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await invokeWithRetry<{ url?: string }>("customer-portal");
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err: unknown) {
      toast({ title: "Could not open billing portal", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  const UsageBar = ({ label, current, max, icon: Icon }: { label: string; current: number; max: number; icon: React.ElementType }) => {
    const isUnlimited = max === -1;
    const pct = isUnlimited ? 10 : max > 0 ? Math.min((current / max) * 100, 100) : 0;
    const atLimit = !isUnlimited && current >= max;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{label}</span>
          </div>
          <span className={`text-sm font-mono ${atLimit ? "text-destructive" : "text-muted-foreground"}`}>
            {current}/{isUnlimited ? "∞" : max}
          </span>
        </div>
        <Progress value={pct} className={`h-2 ${atLimit ? "[&>div]:bg-destructive" : ""}`} />
        {atLimit && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <Lock className="w-3 h-3" /> Daily limit reached —
            <button onClick={() => navigate("/pricing")} className="underline hover:text-destructive/80">upgrade to unlock</button>
          </p>
        )}
      </div>
    );
  };

  return (
    <>
        <header className="h-14 border-b border-border/30 flex items-center px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <h1 className="text-[18px] font-semibold tracking-tight">Billing & Subscription</h1>
          </div>
        </header>

        <SectionErrorBoundary sectionName="Billing">
        <main className="flex-1 p-8 overflow-auto space-y-8">
          {/* Current Plan */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-primary/20">
              <CardContent className="p-8">
                <div className="flex items-start justify-between flex-wrap gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Crown className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-[18px] font-semibold tracking-tight">{tierConfig.name}</h2>
                          <Badge className="bg-primary/10 text-primary border-none">
                            {subscribed ? "Active" : "Trial"}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {tierConfig.price !== null
                            ? subscribed
                              ? `${tierConfig.currency}${tierConfig.price}/${tierConfig.interval}`
                              : `${tierConfig.currency}${tierConfig.price}/${tierConfig.interval} after trial`
                            : "Custom pricing"}
                        </p>
                      </div>
                    </div>

                    {subscriptionEnd && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        Next billing: {new Date(subscriptionEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {tierConfig.features.map((f) => (
                        <div key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Check className="w-3 h-3 text-primary" />
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {subscribed ? (
                      <Button onClick={openPortal} disabled={portalLoading} variant="outline" className="gap-2">
                        {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                        Manage Subscription
                      </Button>
                    ) : (
                      <Button onClick={() => navigate("/pricing")} className="gap-2">
                        <Zap className="w-4 h-4" /> Upgrade Now
                      </Button>
                    )}
                    {subscribed && activeTier !== "enterprise" && (
                      <Button onClick={() => navigate("/pricing")} variant="ghost" size="sm" className="gap-1 text-primary">
                        <ArrowUpRight className="w-3 h-3" /> Upgrade Plan
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Usage */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    Today's Usage
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <UsageBar label="Simulations" current={usage.simulations} max={limits.simulations} icon={TrendingUp} />
                  <UsageBar label="Convergence Calls" current={usage.convergence} max={limits.convergence} icon={Shield} />
                  <UsageBar label="Copilot Queries" current={usage.copilot} max={limits.copilot} icon={Zap} />
                </CardContent>
              </Card>
            </motion.div>

            {/* Seats */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="w-5 h-5 text-primary" />
                    Team Seats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <UsageBar label="Active Members" current={usage.members} max={limits.seats} icon={Users} />
                  <div className="pt-4 border-t border-border space-y-3">
                    <h4 className="text-sm font-medium">Seat Allocation</h4>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex justify-between">
                        <span>Included seats</span>
                        <span className="font-mono">{limits.seats === -1 ? "Unlimited" : limits.seats}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Used</span>
                        <span className="font-mono">{usage.members}</span>
                      </div>
                      {limits.seats > 0 && usage.members > limits.seats && (
                        <div className="flex justify-between text-destructive">
                          <span>Over limit</span>
                          <span className="font-mono">+{usage.members - limits.seats}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Upgrade Nudge */}
          {activeTier !== "enterprise" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
                <CardContent className="p-8 flex items-center justify-between flex-wrap gap-6">
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold tracking-tight">
                      {activeTier === "starter" ? "Unlock AI Decision Intelligence" : "Go Enterprise"}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      {activeTier === "starter"
                        ? "Upgrade to Governance for AI Prescriptive Advisory, Causal Inference, Predictive Forecasting, Monte Carlo Simulations, Board Governance Reports, AICIS geopolitical signals, and unlimited Copilot."
                        : "Upgrade to Enterprise for Cognitive Bias Detection, Counterfactual Explanations, Executive Convergence Index, unlimited simulations, multi-org management, and dedicated support."}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(activeTier === "starter" ? TIERS.growth : TIERS.enterprise).features.slice(0, 3).map((f) => (
                        <Badge key={f} variant="outline" className="text-xs border-primary/30 text-primary">
                          <Lock className="w-3 h-3 mr-1" /> {f}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {activeTier === "starter" ? (
                    <Button onClick={() => navigate("/pricing")} size="lg" className="gap-2 shadow-lg shadow-primary/20">
                      <Zap className="w-4 h-4" />
                      Upgrade to Governance — €{TIERS.growth.price}/mo
                    </Button>
                  ) : (
                    <Button asChild size="lg" className="gap-2 shadow-lg shadow-primary/20">
                      <a href={`mailto:${CONTACT.email.general}`}>
                        <Zap className="w-4 h-4" />
                        Contact Sales for Enterprise
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Strategic Services & Pilot */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
            <Card className="border-warning/20">
              <CardContent className="p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                    <CreditCard className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold tracking-tight">Implementation & Strategic Services</h3>
                    <p className="text-sm text-muted-foreground">Premium services layered on top of your subscription for enterprise-grade outcomes.</p>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { title: "Paid Pilot (4–8 weeks)", desc: "Outcome-driven proof of value with one team and dataset", price: "€5K–€15K" },
                    { title: "Onboarding & Setup", desc: "Data integration, KPI design, executive reporting config", price: "From €2.5K" },
                    { title: "Decision Governance", desc: "Framework setup, team training, board reporting standards", price: "Custom" },
                    { title: "Custom Scenario Models", desc: "Sector-specific templates and simulation configurations", price: "From €5K" },
                    { title: "Executive Workshops", desc: "Calibration training, bias awareness, decision quality sessions", price: "From €3K" },
                    { title: "Portfolio Deployment", desc: "Multi-company rollout for PE/VC portfolio operations", price: "Custom" },
                  ].map((svc) => (
                    <div key={svc.title} className="p-4 rounded-lg border border-border/50 bg-card/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold">{svc.title}</h4>
                        <Badge variant="outline" className="text-xs">{svc.price}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{svc.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <Button asChild variant="outline" className="gap-2">
                    <a href={`mailto:${CONTACT.email.general}`}>
                      <ExternalLink className="w-4 h-4" /> Request Pilot or Services
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-1 text-primary" onClick={() => navigate("/business-model")}>
                    View Business Model Canvas <ArrowUpRight className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Plan Comparison */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Plan Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 pr-4 text-muted-foreground font-medium">Feature</th>
                        {(Object.entries(TIERS) as [TierKey, (typeof TIERS)[TierKey]][]).map(([key, t]) => (
                          <th key={key} className={`text-center py-3 px-4 font-medium ${key === activeTier ? "text-primary" : "text-muted-foreground"}`}>
                            {t.name}
                            {key === activeTier && <Badge className="ml-2 bg-primary/10 text-primary border-none text-[10px]">Current</Badge>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {FEATURE_MATRIX.map((group) => (
                        <Fragment key={group.category}>
                          <tr>
                            <td colSpan={4} className="py-2.5 pr-4 text-xs uppercase tracking-widest text-primary font-semibold bg-primary/[0.03] border-b border-border/50">
                              {group.category}
                            </td>
                          </tr>
                          {group.features.map((row) => (
                            <tr key={row.label} className="border-b border-border/30">
                              <td className="py-2.5 pr-4 font-medium">{row.label}</td>
                              {(["starter", "growth", "enterprise"] as const).map((tier) => {
                                const val = row[tier];
                                return (
                                  <td key={tier} className={`text-center py-2.5 px-4 ${tier === activeTier ? "text-foreground" : "text-muted-foreground"}`}>
                                    {val === true ? "✓" : val === false ? "—" : val}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </main>
        </SectionErrorBoundary>
    </>
  );
};

export default Billing;
