import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, Download, MapPin, Database, Eye, Lock, Server,
  FileText, Clock, Loader2, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { CONTACT } from "@/lib/contact-config";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface DataSummary {
  datasets: number;
  decisions: number;
  advisories: number;
  reports: number;
  copilotMessages: number;
}

const PrivacyDashboard = () => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { toast } = useToast();
  const [summary, setSummary] = useState<DataSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!currentOrgId) return;
    const fetchSummary = async () => {
      setLoading(true);
      const [datasets, decisions, advisories, copilot] = await Promise.all([
        supabase.from("datasets").select("id", { count: "exact", head: true }).eq("organization_id", currentOrgId),
        supabase.from("decision_ledger").select("id", { count: "exact", head: true }).eq("organization_id", currentOrgId),
        supabase.from("advisory_instances").select("id", { count: "exact", head: true }).eq("organization_id", currentOrgId),
        supabase.from("copilot_messages").select("id", { count: "exact", head: true }).eq("organization_id", currentOrgId),
      ]);
      setSummary({
        datasets: datasets.count ?? 0,
        decisions: decisions.count ?? 0,
        advisories: advisories.count ?? 0,
        reports: 0,
        copilotMessages: copilot.count ?? 0,
      });
      setLoading(false);
    };
    fetchSummary();
  }, [currentOrgId]);

  const handleExport = async () => {
    if (!currentOrgId) return;
    setExporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: res, error: resErr } = await invokeWithRetry<any>("data-export", {
        body: { organization_id: currentOrgId, format: "csv" },
      });
      if (resErr) throw resErr;
      toast({ title: "Export initiated", description: "Your data export is being prepared. You'll receive it shortly." });
    } catch (e: unknown) {
      console.error("[PrivacyDashboard] Data export failed:", e instanceof Error ? e.message : e);
      toast({ title: "Export failed", description: "Please try again or contact support.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const dataCategories = [
    { label: "Datasets", count: summary?.datasets ?? 0, icon: Database, retention: "Account + 7 days" },
    { label: "Decisions", count: summary?.decisions ?? 0, icon: FileText, retention: "Account + 30 days" },
    { label: "Advisories", count: summary?.advisories ?? 0, icon: AlertTriangle, retention: "Account + 30 days" },
    { label: "Copilot Messages", count: summary?.copilotMessages ?? 0, icon: Eye, retention: "90 days (auto-cleaned)" },
  ];

  const privacyControls = [
    {
      icon: Lock,
      title: "AI Data Boundary",
      description: "PII is automatically stripped before AI processing. Raw text is disabled by default.",
      status: "active" as const,
    },
    {
      icon: Shield,
      title: "Row-Level Security",
      description: "All data is isolated at the organization and workspace level. No cross-tenant access is possible.",
      status: "active" as const,
    },
    {
      icon: Server,
      title: "Encryption",
      description: "AES-256 at rest, TLS 1.3 in transit. All credentials are SHA-256 hashed.",
      status: "active" as const,
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl pb-12">
      <SectionErrorBoundary sectionName="Privacy Dashboard">
      <div className="flex items-center gap-3">
        <SidebarMobileToggle />
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Privacy Dashboard</h1>
          <p className="text-sm text-muted-foreground">See what data we store, where it lives, and export or delete it.</p>
        </div>
      </div>

      {/* Data Residency */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Data Residency</h3>
                <p className="text-xs text-muted-foreground">
                  All primary data is stored in <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">EU-West-1 (Frankfurt)</Badge>.
                  Cross-border transfers are protected by EU Standard Contractual Clauses (SCCs).
                </p>
              </div>
              <Badge className="ml-auto shrink-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> GDPR Compliant
              </Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Your Data Summary */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                Your Stored Data
              </CardTitle>
              <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting} className="text-xs">
                {exporting ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />}
                Export All Data
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {dataCategories.map(({ label, count, icon: Icon, retention }) => (
                  <div key={label} className="p-3.5 rounded-xl border border-border/40 bg-muted/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">{label}</span>
                    </div>
                    <p className="text-xl font-bold tracking-tight text-foreground">{count.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {retention}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Active Privacy Controls */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Active Privacy Controls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {privacyControls.map(({ icon: Icon, title, description, status }) => (
                <div key={title} className="flex items-start gap-3 p-3.5 rounded-xl border border-border/40 bg-muted/20">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{title}</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{description}</p>
                  </div>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] shrink-0">
                    Active
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Account Info */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Your Rights</h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
                  Under GDPR & CCPA you can access, correct, export, or delete your data at any time.
                  Use the Export button above or go to{" "}
                  <span className="text-primary">Settings → Delete Account</span> to exercise deletion.
                  Contact <span className="text-primary">{CONTACT.email.privacy}</span> for any other requests.
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">GDPR Art. 15-20</Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>
      </SectionErrorBoundary>
    </div>
  );
};

export default PrivacyDashboard;
