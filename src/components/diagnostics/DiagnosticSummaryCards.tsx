import { Card, CardContent } from "@/components/ui/card";
import { Search, AlertTriangle, BarChart3, Layers } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DiagnosticSummaryCardsProps {
  analyzedCount: number;
  criticalCount: number;
  warningCount: number;
  totalDiagnosed: number;
  metricTypesAnalyzed?: number;
  skippedMetrics?: string[];
  loading?: boolean;
}

const DiagnosticSummaryCards = ({ analyzedCount, criticalCount, warningCount, totalDiagnosed, metricTypesAnalyzed, skippedMetrics, loading }: DiagnosticSummaryCardsProps) => (
  <div className="space-y-3">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div>
            {loading ? (
              <Skeleton className="h-7 w-12 mb-1" />
            ) : (
              <p className="text-2xl font-bold">{analyzedCount.toLocaleString()}</p>
            )}
            <p className="text-xs text-muted-foreground">Data Points Analyzed</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            {loading ? (
              <Skeleton className="h-7 w-8 mb-1" />
            ) : (
              <p className="text-2xl font-bold">{criticalCount}</p>
            )}
            <p className="text-xs text-muted-foreground">Critical Issues</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-warning" />
          </div>
          <div>
            {loading ? (
              <Skeleton className="h-7 w-8 mb-1" />
            ) : (
              <p className="text-2xl font-bold">{warningCount}</p>
            )}
            <p className="text-xs text-muted-foreground">Warnings</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-success" />
          </div>
          <div>
            {loading ? (
              <Skeleton className="h-7 w-8 mb-1" />
            ) : (
              <p className="text-2xl font-bold">{totalDiagnosed}</p>
            )}
            <p className="text-xs text-muted-foreground">Metrics Diagnosed</p>
          </div>
        </CardContent>
      </Card>
    </div>

    {/* Skipped metrics notice */}
    {!loading && skippedMetrics && skippedMetrics.length > 0 && (
      <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg bg-muted/50 border border-border/40">
        <Layers className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium">{skippedMetrics.length} metric{skippedMetrics.length > 1 ? "s" : ""} excluded</span> (insufficient data points):
          {" "}{skippedMetrics.map(m => m.replace(/_/g, " ")).join(", ")}.
          Upload more historical data to enable diagnosis.
        </p>
      </div>
    )}
  </div>
);

export default DiagnosticSummaryCards;
