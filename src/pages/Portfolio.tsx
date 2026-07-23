import { useState } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { usePortfolioCompanies, PortfolioCompany } from "@/hooks/usePortfolioCompanies";
import PortfolioKPIBar from "@/components/portfolio/PortfolioKPIBar";
import PortfolioRiskHeatmap from "@/components/portfolio/PortfolioRiskHeatmap";
import PortfolioCompanyDetail from "@/components/portfolio/PortfolioCompanyDetail";
import AddPortfolioCompanyDialog from "@/components/portfolio/AddPortfolioCompanyDialog";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { Briefcase, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const Portfolio = () => {
  const { orgId, datasetId } = useActiveDataContext();
  const { companies, loading, error, refresh, totalAUM, totalRevenue, avgRisk, atRiskCount, avgEbitdaMargin, addCompany, updateCompany, deleteCompany } = usePortfolioCompanies(orgId, datasetId);
  const [selected, setSelected] = useState<PortfolioCompany | null>(null);

  return (
    <DatasetRequired moduleName="Portfolio">
      <SectionErrorBoundary sectionName="Portfolio">
        <main className="flex-1 flex flex-col overflow-auto">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SidebarMobileToggle />
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-[16px] font-semibold tracking-tight">Portfolio Overview</h1>
                  <p className="text-xs text-muted-foreground">Multi-company risk monitoring & performance tracking</p>
                </div>
              </div>
              {orgId && (
                <AddPortfolioCompanyDialog organizationId={orgId} onAdd={(c) => addCompany({ ...c, dataset_id: datasetId })} />
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">Failed to load portfolio data</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
                </div>
                <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5 shrink-0">
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </Button>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : !error && (
              <>
                <PortfolioKPIBar
                  companyCount={companies.length}
                  totalAUM={totalAUM}
                  totalRevenue={totalRevenue}
                  avgRisk={avgRisk}
                  atRiskCount={atRiskCount}
                  avgEbitdaMargin={avgEbitdaMargin}
                />
                {selected && (
                  <PortfolioCompanyDetail
                    company={selected}
                    onClose={() => setSelected(null)}
                    onUpdate={async (updates) => {
                      await updateCompany(selected.id, updates);
                      const updated = { ...selected, ...updates };
                      setSelected(updated);
                    }}
                    onDelete={async () => {
                      await deleteCompany(selected.id);
                      setSelected(null);
                    }}
                  />
                )}
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Portfolio Companies</h2>
                  <PortfolioRiskHeatmap
                    companies={companies}
                    onSelect={setSelected}
                    selectedId={selected?.id}
                  />
                </div>
              </>
            )}
          </div>
        </main>
      </SectionErrorBoundary>
    </DatasetRequired>
  );
};

export default Portfolio;
