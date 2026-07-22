import { useNavigate } from "react-router-dom";
import { Zap, Upload, ArrowRight, Database } from "lucide-react";
import QuickConnectStripe from "@/components/dashboard/QuickConnectStripe";

export const DashboardEmptyState = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-lg mx-auto mt-12 px-4">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-xl border border-border/40 flex items-center justify-center mx-auto mb-4">
          <Database className="w-6 h-6 text-muted-foreground/60" />
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight mb-2">Connect your data</h1>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Your executive dashboard activates the moment your data arrives.
          Revenue, decisions, risks — all live.
        </p>
      </div>

      <div className="space-y-3">
        {/* Stripe quick-connect — fastest path to live data */}
        <QuickConnectStripe />

        {/* Other options */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/30" />
          </div>
          <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
            <span className="bg-background px-2">or</span>
          </div>
        </div>

        <div
          className="flex items-center gap-4 p-4 rounded-xl border border-border/30 bg-card/40 hover:bg-card/60 cursor-pointer transition-all"
          onClick={() => navigate("/data-connectors")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && navigate("/data-connectors")}
          aria-label="Connect Salesforce, SAP, HubSpot, or other systems"
        >
          <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Connect Salesforce, SAP, NetSuite…</p>
            <p className="text-xs text-muted-foreground">Full CRM, ERP, and SaaS connector library</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>

        <div
          className="flex items-center gap-4 p-4 rounded-xl border border-border/30 bg-card/40 hover:bg-card/60 cursor-pointer transition-all"
          onClick={() => navigate("/data-upload")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && navigate("/data-upload")}
          aria-label="Upload a CSV"
        >
          <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
            <Upload className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Upload a CSV</p>
            <p className="text-xs text-muted-foreground">Any structured data — financial, operational, or custom</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>

        <div
          className="flex items-center gap-4 p-4 rounded-xl border border-primary/20 bg-primary/[0.03] hover:bg-primary/[0.06] cursor-pointer transition-all"
          onClick={() => navigate("/demo")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && navigate("/demo")}
          aria-label="Try with sample data"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary">Explore with sample data</p>
            <p className="text-xs text-muted-foreground">See the full experience instantly — no connection needed</p>
          </div>
          <ArrowRight className="w-4 h-4 text-primary shrink-0" />
        </div>
      </div>
    </div>
  );
};
