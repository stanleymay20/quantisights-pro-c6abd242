import { useState, useEffect } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { embedInsightsBatch } from "@/lib/decision-lifecycle";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download, Loader2, Plus, BarChart3, Shield, TrendingUp, Crown } from "lucide-react";
import IntelligenceDisclaimer from "@/components/IntelligenceDisclaimer";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface Report {
  id: string;
  file_path: string;
  report_type: string;
  created_at: string;
}

const REPORT_TYPES = [
  {
    value: "executive",
    label: "Executive Summary",
    description: "High-level KPIs, risk posture, and strategic signals for C-suite review",
    icon: Crown,
  },
  {
    value: "diagnostic",
    label: "Diagnostic Report",
    description: "Root cause analysis, anomaly breakdown, and remediation recommendations",
    icon: BarChart3,
  },
  {
    value: "risk",
    label: "Risk & Compliance",
    description: "Risk heatmap, governance actions, and compliance posture summary",
    icon: Shield,
  },
  {
    value: "growth",
    label: "Growth Analysis",
    description: "Revenue trends, segment performance, and Monte Carlo outlook",
    icon: TrendingUp,
  },
];

const Reports = () => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { activeDatasetId } = useProject();
  const { toast } = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState("executive");

  const fetchReports = async () => {
    if (!currentOrgId || !activeDatasetId) {
      setReports([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("reports")
      .select("*")
      .eq("organization_id", currentOrgId)
      .eq("dataset_id", activeDatasetId)
      .order("created_at", { ascending: false });
    setReports(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, [currentOrgId, activeDatasetId]);

  const handleGenerate = async () => {
    if (!currentOrgId || !activeDatasetId) {
      toast({ title: "Select a dataset first", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      await invokeWithRetry("generate-insights", {
        body: { organization_id: currentOrgId, dataset_id: activeDatasetId },
      });
      // Embed new insights into institutional memory (non-blocking)
      embedInsightsBatch(currentOrgId);

      const { data, error } = await invokeWithRetry<any>("generate-report", {
        body: { organization_id: currentOrgId, dataset_id: activeDatasetId, report_type: selectedType },
      });

      if (error) throw error;

      if (data?.download_url) {
        window.open(String(data.download_url), "_blank");
      }

      toast({ title: "Report generated successfully!" });
      fetchReports();
    } catch (err: unknown) {
      toast({ title: "Failed to generate report", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (filePath: string) => {
    const { data } = await supabase.storage.from("reports").createSignedUrl(filePath, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const getTypeConfig = (type: string) => REPORT_TYPES.find(t => t.value === type) || REPORT_TYPES[0];

  return (
    <DatasetRequired moduleName="Reports" moduleDescription="Generate board-ready executive reports, KPI summaries, and governance packs from your live decision data.">
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight">Board-ready reports</h1>
              <p className="text-xs text-muted-foreground">
                Generate board-ready executive reports, KPI summaries, and governance packs.
              </p>
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating || !currentOrgId}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:brightness-110 transition-all disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {generating ? "Generating..." : "Generate Report"}
          </button>
        </header>
        <IntelligenceDisclaimer variant="banner" context="report" />
        <SectionErrorBoundary sectionName="Reports">
        <main className="flex-1 p-8 overflow-auto space-y-6">
          {/* Report Type Selector */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Report Type</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {REPORT_TYPES.map((rt) => {
                const Icon = rt.icon;
                const isSelected = selectedType === rt.value;
                return (
                  <button
                    key={rt.value}
                    onClick={() => setSelectedType(rt.value)}
                    className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                      isSelected
                        ? "border-primary bg-primary/[0.06] ring-1 ring-primary/30"
                        : "border-border/30 bg-card/40 hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? "bg-primary/15" : "bg-muted/50"}`}>
                        <Icon className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <span className="text-sm font-semibold">{rt.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{rt.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reports List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : reports.length === 0 ? (
            <div className="glass-card p-12 rounded-xl flex flex-col items-center justify-center min-h-[300px]">
              <FileText className="w-16 h-16 text-muted-foreground mb-4" />
              <h2 className="text-[16px] font-semibold tracking-tight mb-2">No Reports Yet</h2>
              <p className="text-muted-foreground text-sm mb-6">Select a report type and generate your first executive report</p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all"
              >
                Generate Report
              </button>
            </div>
          ) : (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Generated Reports</h2>
              <div className="space-y-3">
                {reports.map((report) => {
                  const config = getTypeConfig(report.report_type);
                  const TypeIcon = config.icon;
                  return (
                    <div key={report.id} className="glass-card p-5 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-sm font-medium">{config.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(report.created_at).toLocaleDateString("en", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(report.file_path)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
        </SectionErrorBoundary>
    </>
    </DatasetRequired>
  );
};

export default Reports;
