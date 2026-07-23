import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Languages } from "lucide-react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { LOCALIZATION_AUDIT, summarizeAudit, type LocalizationStatus } from "@/lib/i18n-audit-manifest";

const statusBadge: Record<LocalizationStatus, string> = {
  localized: "border-green-500/30 text-green-500",
  english_only: "border-yellow-500/30 text-yellow-500",
  admin_only: "border-muted-foreground/30 text-muted-foreground",
  n_a: "border-muted-foreground/30 text-muted-foreground",
};

const LocalizationAudit = () => {
  const summary = useMemo(summarizeAudit, []);
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      LOCALIZATION_AUDIT.filter(
        (e) =>
          !q.trim() ||
          e.route.toLowerCase().includes(q.toLowerCase()) ||
          e.label.toLowerCase().includes(q.toLowerCase()),
      ),
    [q],
  );

  const exportCSV = () => {
    const header = "route,label,status,de_route,hardcoded_strings\n";
    const body = LOCALIZATION_AUDIT.map(
      (e) => `${e.route},"${e.label}",${e.status},${e.deRoute ?? ""},${e.hardcodedStrings}`,
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `localization-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SectionErrorBoundary sectionName="Localization Audit">
      <div className="space-y-6 max-w-5xl">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Languages className="w-6 h-6 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Localization Readiness Audit</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Procurement-grade snapshot of what is localized for the German market and what remains English-only.
            Coverage excludes admin-only in-app surfaces (out of scope for procurement i18n).
          </p>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total pages", value: summary.total },
            { label: "Localized (DE)", value: summary.localized },
            { label: "English-only", value: summary.englishOnly },
            { label: "Admin-only", value: summary.adminOnly },
            { label: "Coverage", value: `${summary.coveragePct}%` },
          ].map((t) => (
            <Card key={t.label} className="border-border/50">
              <CardContent className="pt-4 pb-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.label}</p>
                <p className="text-2xl font-bold mt-1">{t.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border/50">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <Input
                placeholder="Filter by route or label…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-sm"
              />
              <Button size="sm" variant="outline" onClick={exportCSV}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
              </Button>
            </div>

            <div className="rounded-md border border-border/40 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr className="border-b border-border/30">
                    <th className="text-left py-2 px-3 font-semibold">Route</th>
                    <th className="text-left py-2 px-3 font-semibold">Label</th>
                    <th className="text-left py-2 px-3 font-semibold">Status</th>
                    <th className="text-left py-2 px-3 font-semibold">DE Route</th>
                    <th className="text-right py-2 px-3 font-semibold">Hardcoded strings (est.)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.route} className="border-b border-border/20">
                      <td className="py-2 px-3 font-mono text-[11px]">{e.route}</td>
                      <td className="py-2 px-3">{e.label}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className={`text-[10px] ${statusBadge[e.status]}`}>
                          {e.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-muted-foreground">{e.deRoute ?? "—"}</td>
                      <td className="py-2 px-3 text-right text-muted-foreground">{e.hardcodedStrings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground mt-2">
              Total hardcoded strings (estimate): <strong>{summary.hardcodedTotal}</strong>. Full i18n extraction
              deferred until after Phase 5F procurement-readiness ships.
            </p>
          </CardContent>
        </Card>
      </div>
    </SectionErrorBoundary>
  );
};

export default LocalizationAudit;
