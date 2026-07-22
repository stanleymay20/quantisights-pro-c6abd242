import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Crown, DollarSign, Users, Settings2, Check,
  ChevronRight, ChevronLeft, Loader2, BarChart3, Upload,
  FileText, Sparkles, ArrowRight, Zap,
} from "lucide-react";
import logo from "@/assets/quantivis-logo.png";

interface KpiTemplate {
  id: string;
  name: string;
  industry: string;
  description: string;
  kpis: Array<any>;
}

const INDUSTRIES = [
  { value: "saas", label: "SaaS / Software" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "retail", label: "Retail / E-Commerce" },
  { value: "finance", label: "Financial Services" },
  { value: "healthcare", label: "Healthcare" },
  { value: "consulting", label: "Consulting / Professional Services" },
  { value: "other", label: "Other" },
];

const SIZE_BANDS = [
  { value: "1-10", label: "1–10 employees" },
  { value: "11-50", label: "11–50 employees" },
  { value: "51-200", label: "51–200 employees" },
  { value: "201-1000", label: "201–1,000 employees" },
  { value: "1000+", label: "1,000+ employees" },
];

const REVENUE_BANDS = [
  { value: "pre-revenue", label: "Pre-revenue" },
  { value: "0-1m", label: "< €1M" },
  { value: "1-10m", label: "€1M – €10M" },
  { value: "10-50m", label: "€10M – €50M" },
  { value: "50-100m", label: "€50M – €100M" },
  { value: "100m+", label: "€100M+" },
];

const EXEC_ROLES = [
  { key: "ceo", label: "CEO", icon: Crown, description: "Strategic growth & risk oversight" },
  { key: "cfo", label: "CFO", icon: DollarSign, description: "Financial health & capital allocation" },
  { key: "cmo", label: "CMO", icon: Users, description: "Customer acquisition & brand performance" },
  { key: "coo", label: "COO", icon: Settings2, description: "Operational efficiency & delivery" },
];

const DATA_OPTIONS = [
  { key: "stripe", icon: Zap, label: "Stripe", description: "Automatically sync revenue, customers, and MRR from Stripe" },
  { key: "csv", icon: Upload, label: "CSV Upload", description: "Upload a CSV file with your historical data" },
  { key: "webhook", icon: ArrowRight, label: "Webhook / API", description: "Push data via REST webhook from any system" },
  { key: "manual", icon: BarChart3, label: "Manual Entry", description: "Enter KPI values manually to get started quickly" },
  { key: "later", icon: FileText, label: "Connect Later", description: "Skip for now and add data sources later" },
];

const Onboarding = () => {
  const { user } = useAuth();
  const { currentOrgId, currentOrg, loading: orgLoading } = useOrganization();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Step 1 - Org profile
  const [orgName, setOrgName] = useState("");
  const [industry, setIndustry] = useState("");
  const [sizeBand, setSizeBand] = useState("");
  const [revenueBand, setRevenueBand] = useState("");

  // Step 2 - Executive roles
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["ceo", "cfo", "cmo", "coo"]);

  // Step 3 - KPI templates
  const [templates, setTemplates] = useState<KpiTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Step 4 - Data input
  const [dataOption, setDataOption] = useState("later");

  useEffect(() => {
    if (currentOrg) setOrgName(currentOrg.name);
  }, [currentOrg]);

  // Guard: if this org has already completed onboarding, don't show the wizard again.
  // Without this, navigating to /onboarding directly (bookmark, back button, stale link)
  // would always restart from Step 1 even for fully set-up organizations.
  useEffect(() => {
    if (!currentOrgId) {
      if (!orgLoading) setCheckingStatus(false);
      return;
    }
    let active = true;
    supabase
      .from("organizations")
      .select("onboarding_completed")
      .eq("id", currentOrgId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        if (data?.onboarding_completed) {
          sessionStorage.setItem(`onboarding_checked_${currentOrgId}`, "done");
          navigate("/executive", { replace: true });
        } else {
          setCheckingStatus(false);
        }
      });
    return () => { active = false; };
  }, [currentOrgId, orgLoading, navigate]);

  useEffect(() => {
    supabase
      .from("kpi_templates")
      .select("*")
      .then(({ data }) => {
        if (data) setTemplates(data as unknown as KpiTemplate[]);
      });
  }, []);

  const toggleRole = (key: string) => {
    setSelectedRoles((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]
    );
  };

  const saveOrgProfile = async () => {
    if (!currentOrgId || !user) return;
    const sanitizedName = orgName.trim().slice(0, 200);
    if (!sanitizedName) return;

    // Verify user has admin/owner role before mutating org
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", currentOrgId)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      toast({ title: "Permission denied", description: "Only admins can update organization settings.", variant: "destructive" });
      return;
    }

    await supabase
      .from("organizations")
      .update({
        name: sanitizedName || currentOrg?.name,
        industry,
        size_band: sizeBand,
        revenue_band: revenueBand,
      })
      .eq("id", currentOrgId);
  };

  const completeOnboarding = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try {
      await saveOrgProfile();

      const { data, error } = await invokeWithRetry<any>("complete-onboarding", {
        body: {
          organization_id: currentOrgId,
          roles: selectedRoles,
          kpi_template_id: selectedTemplate,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      toast({
        title: "Onboarding complete!",
        description: `${data.risk_indices} risk indices generated (industry-weighted). ECI: ${data.convergence_score}/100. ${data.kpis_created} KPIs deployed.`,
      });

      if (dataOption === "csv") {
        navigate("/data-upload");
      } else if (dataOption === "stripe" || dataOption === "webhook") {
        navigate("/data-sources");
      } else {
        navigate("/executive");
      }
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return industry && sizeBand;
      case 2: return selectedRoles.length > 0;
      case 3: return true;
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  const totalSteps = 5;

  if (checkingStatus) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <div className="border-b border-border/30 px-6 py-4 flex items-center justify-between bg-background/60 backdrop-blur-sm">
        <div className="flex-1 flex items-center">
          <button
            onClick={() => navigate("/executive")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Exit setup
          </button>
        </div>
        <img src={logo} alt="Quantivis" className="h-8" />
        <div className="flex-1 flex items-center justify-end gap-4">
          <div className="flex items-center gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i + 1 <= step ? "w-8 bg-primary" : "w-2 bg-muted"
                }`}
              />
            ))}
          </div>
          <span className="text-sm text-muted-foreground whitespace-nowrap">Step {step} of {totalSteps}</span>
        </div>
      </div>

      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          {/* Step 1 — Organization Profile */}
          {step === 1 && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <Building2 className="w-12 h-12 text-primary mx-auto" />
                <h1 className="text-3xl font-bold tracking-tight">Set Up Your Organization</h1>
                <p className="text-muted-foreground">Tell us about your business to customize risk scoring</p>
              </div>

              <Card>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-2">
                    <Label>Organization Name</Label>
                    <Input
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value.slice(0, 200))}
                      placeholder="Acme Corp"
                      maxLength={200}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Industry *</Label>
                    <Select value={industry} onValueChange={setIndustry}>
                      <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                      <SelectContent>
                        {INDUSTRIES.map((i) => (
                          <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Industry selection influences baseline risk weighting</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Company Size *</Label>
                      <Select value={sizeBand} onValueChange={setSizeBand}>
                        <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                        <SelectContent>
                          {SIZE_BANDS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Revenue Band</Label>
                      <Select value={revenueBand} onValueChange={setRevenueBand}>
                        <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                        <SelectContent>
                          {REVENUE_BANDS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 2 — Executive Roles */}
          {step === 2 && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <Crown className="w-12 h-12 text-primary mx-auto" />
                <h1 className="text-3xl font-bold tracking-tight">Activate Executive Roles</h1>
                <p className="text-muted-foreground">Select which C-suite perspectives to monitor</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {EXEC_ROLES.map((role) => {
                  const Icon = role.icon;
                  const selected = selectedRoles.includes(role.key);
                  return (
                    <button
                      key={role.key}
                      onClick={() => toggleRole(role.key)}
                      className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all ${
                        selected
                          ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                        selected ? "bg-primary/10" : "bg-secondary"
                      }`}>
                        <Icon className={`w-7 h-7 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <span className="font-bold text-lg">{role.label}</span>
                      <span className="text-xs text-muted-foreground text-center">{role.description}</span>
                      {selected && (
                        <Badge className="bg-primary/10 text-primary border-none">
                          <Check className="w-3 h-3 mr-1" /> Active
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3 — KPI Templates */}
          {step === 3 && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <BarChart3 className="w-12 h-12 text-primary mx-auto" />
                <h1 className="text-3xl font-bold tracking-tight">Choose KPI Template</h1>
                <p className="text-muted-foreground">Start with industry-standard metrics or build custom</p>
              </div>

              <div className="space-y-4">
                {templates.map((t) => {
                  const selected = selectedTemplate === t.id;
                  const kpiCount = Array.isArray(t.kpis) ? t.kpis.length : 0;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(selected ? null : t.id)}
                      className={`w-full flex items-center gap-4 p-5 rounded-xl border-2 transition-all text-left ${
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
                        selected ? "bg-primary/10" : "bg-secondary"
                      }`}>
                        <Sparkles className={`w-6 h-6 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{t.name}</span>
                          <Badge variant="outline" className="text-xs capitalize">{t.industry}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">{kpiCount} KPIs included</p>
                      </div>
                      {selected && <Check className="w-5 h-5 text-primary shrink-0" />}
                    </button>
                  );
                })}

                <button
                  onClick={() => setSelectedTemplate(null)}
                  className={`w-full flex items-center gap-4 p-5 rounded-xl border-2 transition-all text-left ${
                    selectedTemplate === null
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 bg-secondary">
                    <Zap className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <span className="font-semibold">Custom Setup</span>
                    <p className="text-sm text-muted-foreground mt-1">Configure your own KPIs manually in the KPI Builder</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — Data Input */}
          {step === 4 && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <Upload className="w-12 h-12 text-primary mx-auto" />
                <h1 className="text-3xl font-bold tracking-tight">Connect Your Data</h1>
                <p className="text-muted-foreground">Choose your primary data source — you can add more later</p>
              </div>

              <div className="space-y-4">
                {DATA_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = dataOption === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setDataOption(opt.key)}
                      className={`w-full flex items-center gap-4 p-5 rounded-xl border-2 transition-all text-left ${
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
                        selected ? "bg-primary/10" : "bg-secondary"
                      }`}>
                        <Icon className={`w-6 h-6 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1">
                        <span className="font-semibold">{opt.label}</span>
                        <p className="text-sm text-muted-foreground mt-1">{opt.description}</p>
                      </div>
                      {selected && <Check className="w-5 h-5 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 5 — Confirmation */}
          {step === 5 && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <Sparkles className="w-12 h-12 text-primary mx-auto" />
                <h1 className="text-3xl font-bold tracking-tight">Ready to Launch</h1>
                <p className="text-muted-foreground">Review your setup and activate your intelligence engine</p>
              </div>

              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Organization</span>
                    <span className="font-medium">{orgName || currentOrg?.name || "Your organization"}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Industry</span>
                    <span className="font-medium capitalize">{INDUSTRIES.find(i => i.value === industry)?.label || "Not specified"}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Company Size</span>
                    <span className="font-medium">{SIZE_BANDS.find(s => s.value === sizeBand)?.label || "Not specified"}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Revenue Band</span>
                    <span className="font-medium">{REVENUE_BANDS.find(r => r.value === revenueBand)?.label || "Not specified"}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Executive Roles</span>
                    <div className="flex gap-1">
                      {selectedRoles.map((r) => (
                        <Badge key={r} variant="outline" className="uppercase text-xs">{r}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">KPI Template</span>
                    <span className="font-medium">
                      {templates.find((t) => t.id === selectedTemplate)?.name || "Custom"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-muted-foreground">Data Source</span>
                    <span className="font-medium">{DATA_OPTIONS.find(o => o.key === dataOption)?.label || "Connect Later"}</span>
                  </div>
                </CardContent>
              </Card>

              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  This will generate <strong>industry-weighted risk indices</strong> for your {industry} business,
                  compute initial <strong>convergence scores</strong>, and
                  {selectedTemplate ? " deploy your selected KPIs" : " prepare your custom KPI workspace"}.
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 1}
              className="gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>

            {step < totalSteps ? (
              <Button
                onClick={() => {
                  if (step === 1) saveOrgProfile();
                  setStep((s) => s + 1);
                }}
                disabled={!canProceed()}
                className="gap-2"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={completeOnboarding}
                disabled={loading}
                className="gap-2 px-8"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                {loading ? "Setting up..." : "Complete Setup"}
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Onboarding;
