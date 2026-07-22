import { PortfolioCompany } from "@/hooks/usePortfolioCompanies";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowRight } from "lucide-react";

const n = (v: number | null | undefined): number => v ?? 0;
import { Badge } from "@/components/ui/badge";
import { fmtCurrency } from "@/lib/format-utils";
interface Props {
  companies: PortfolioCompany[];
  onSelect: (company: PortfolioCompany) => void;
  selectedId?: string;
}

const riskColor = (score: number) => {
  if (score <= 25) return "bg-[hsl(var(--severity-success))]/15 border-[hsl(var(--severity-success))]/30";
  if (score <= 50) return "bg-[hsl(var(--severity-info))]/10 border-[hsl(var(--severity-info))]/25";
  if (score <= 75) return "bg-[hsl(var(--severity-warning))]/15 border-[hsl(var(--severity-warning))]/30";
  return "bg-destructive/15 border-destructive/30";
};

const riskTextColor = (score: number) => {
  if (score <= 25) return "text-[hsl(var(--severity-success))]";
  if (score <= 50) return "text-[hsl(var(--severity-info))]";
  if (score <= 75) return "text-[hsl(var(--severity-warning))]";
  return "text-destructive";
};

const trendIcon = (trend: string) => {
  if (trend === "improving") return <TrendingDown className="w-3.5 h-3.5 text-[hsl(var(--severity-success))]" />;
  if (trend === "deteriorating") return <TrendingUp className="w-3.5 h-3.5 text-destructive" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
};

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    on_track: { label: "On Track", className: "bg-[hsl(var(--severity-success))]/10 text-[hsl(var(--severity-success))] border-none" },
    watch: { label: "Watch", className: "bg-[hsl(var(--severity-warning))]/10 text-[hsl(var(--severity-warning))] border-none" },
    at_risk: { label: "At Risk", className: "bg-destructive/10 text-destructive border-none" },
    outperforming: { label: "Outperforming", className: "bg-[hsl(var(--severity-success))]/15 text-[hsl(var(--severity-success))] border-none" },
  };
  const config = map[status] ?? map.on_track;
  return <Badge className={config.className}>{config.label}</Badge>;
};


const PortfolioRiskHeatmap = ({ companies, onSelect, selectedId }: Props) => {
  if (companies.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-border/40 p-12 text-center">
        <AlertTriangle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <h3 className="text-[14px] font-semibold mb-1">No Portfolio Companies</h3>
        <p className="text-sm text-muted-foreground">Add your first portfolio company to start monitoring risk across your fund.</p>
      </div>
    );
  }

  const sorted = [...companies].sort((a, b) => n(b.risk_score) - n(a.risk_score));

  return (
    <div className="space-y-2">
      {/* Desktop header - hidden on mobile */}
      <div className="hidden lg:grid grid-cols-12 gap-2 px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        <div className="col-span-3">Company</div>
        <div className="col-span-1 text-center">Risk</div>
        <div className="col-span-1 text-center">Trend</div>
        <div className="col-span-1 text-center">Status</div>
        <div className="col-span-2 text-right">Revenue LTM</div>
        <div className="col-span-2 text-right">EBITDA Margin</div>
        <div className="col-span-1 text-right">Growth</div>
        <div className="col-span-1"></div>
      </div>

      {sorted.map((company) => (
        <button
          key={company.id}
          onClick={() => onSelect(company)}
          aria-label={`View ${company.name} — Risk score ${n(company.risk_score)}, Status ${company.health_status ?? 'unknown'}`}
          className={`w-full rounded-xl border transition-all hover:shadow-md cursor-pointer text-left ${
            selectedId === company.id
              ? "border-primary/40 bg-primary/5 shadow-sm"
              : `${riskColor(n(company.risk_score))} hover:border-primary/20`
          }`}
        >
          {/* Mobile layout */}
          <div className="lg:hidden p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{company.name}</p>
                <p className="text-[11px] text-muted-foreground">{company.sector}{company.fund_name ? ` · ${company.fund_name}` : ""}</p>
              </div>
              <span className={`text-xl font-bold ml-3 ${riskTextColor(n(company.risk_score))}`}>{n(company.risk_score)}</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {statusBadge(company.health_status ?? 'on_track')}
              <span className="text-xs text-muted-foreground">{fmtCurrency(n(company.revenue_ltm))} rev</span>
              <span className="text-xs text-muted-foreground">{n(company.ebitda_margin_pct).toFixed(1)}% EBITDA</span>
              <span className={`text-xs ${n(company.revenue_growth_pct) > 0 ? "text-[hsl(var(--severity-success))]" : n(company.revenue_growth_pct) < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {n(company.revenue_growth_pct) > 0 ? "+" : ""}{n(company.revenue_growth_pct).toFixed(0)}% growth
              </span>
            </div>
          </div>

          {/* Desktop layout */}
          <div className="hidden lg:grid grid-cols-12 gap-2 items-center px-4 py-3">
            <div className="col-span-3">
              <p className="text-sm font-semibold truncate">{company.name}</p>
              <p className="text-[11px] text-muted-foreground">{company.sector}{company.fund_name ? ` · ${company.fund_name}` : ""}</p>
            </div>
            <div className="col-span-1 text-center">
              <span className={`text-lg font-bold ${riskTextColor(n(company.risk_score))}`}>{n(company.risk_score)}</span>
            </div>
            <div className="col-span-1 flex justify-center">
              {trendIcon(company.risk_trend ?? 'stable')}
            </div>
            <div className="col-span-1 flex justify-center">
              {statusBadge(company.health_status ?? 'on_track')}
            </div>
            <div className="col-span-2 text-right">
              <span className="text-sm font-medium">{fmtCurrency(n(company.revenue_ltm))}</span>
            </div>
            <div className="col-span-2 text-right">
              <span className={`text-sm font-medium ${n(company.ebitda_margin_pct) < 0 ? "text-destructive" : ""}`}>
                {n(company.ebitda_margin_pct).toFixed(1)}%
              </span>
            </div>
            <div className="col-span-1 text-right">
              <span className={`text-sm font-medium ${n(company.revenue_growth_pct) > 0 ? "text-[hsl(var(--severity-success))]" : n(company.revenue_growth_pct) < 0 ? "text-destructive" : ""}`}>
                {n(company.revenue_growth_pct) > 0 ? "+" : ""}{n(company.revenue_growth_pct).toFixed(0)}%
              </span>
            </div>
            <div className="col-span-1 flex justify-end">
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default PortfolioRiskHeatmap;
