import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Activity } from "lucide-react";

interface DiagnosticEmptyStateProps {
  variant: "loading" | "empty" | "ready";
  onRun?: () => void;
}

const DiagnosticEmptyState = ({ variant, onRun }: DiagnosticEmptyStateProps) => {
  if (variant === "loading") {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Running diagnostic analysis...</p>
          <p className="text-xs text-muted-foreground">This typically takes 10–20 seconds.</p>
        </CardContent>
      </Card>
    );
  }

  if (variant === "ready") {
    return (
      <Card className="border-dashed border-border/50">
        <CardContent className="py-20 flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Activity className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Run Diagnostic Analysis</h2>
          <p className="text-muted-foreground text-sm text-center max-w-sm leading-relaxed">
            Scan your dataset for anomalies, root causes, and causal patterns. Analysis takes 10–20 seconds.
          </p>
          {onRun && (
            <Button onClick={onRun} size="sm" className="mt-2 gap-2">
              <Activity className="w-4 h-4" /> Run Diagnostics
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed border-border/50">
      <CardContent className="py-20 flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Search className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">No Anomalies Detected</h2>
        <p className="text-muted-foreground text-sm text-center max-w-sm leading-relaxed">
          All metrics are within expected ranges. Re-analyze after new data arrives.
        </p>
      </CardContent>
    </Card>
  );
};

export default DiagnosticEmptyState;
