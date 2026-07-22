// Phase 4 wiring — progress card surfaced during chunked CSV ingestion.
// Drives the UI from useChunkedIngestion state. Cancel + Retry are first-class.

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, RotateCcw, Cpu, Database, Clock } from "lucide-react";
import { formatEta, type IngestionProgress } from "@/lib/chunked-processor";

interface Props {
  fileName: string;
  status: "idle" | "running" | "done" | "cancelled" | "error";
  progress: IngestionProgress;
  error: string | null;
  healthScore?: number;
  onCancel: () => void;
  onRetry: () => void;
}

export default function IngestionProgressCard({
  fileName,
  status,
  progress,
  error,
  healthScore,
  onCancel,
  onRetry,
}: Props) {
  const pctLabel = `${Math.round(progress.percent)}%`;
  const isRunning = status === "running";
  const isError = status === "error" || status === "cancelled";

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {isRunning ? (
              <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
            ) : isError ? (
              <X className="w-5 h-5 text-destructive shrink-0" />
            ) : (
              <Cpu className="w-5 h-5 text-success shrink-0" />
            )}
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{fileName}</h3>
              <p className="text-xs text-muted-foreground">
                {isRunning
                  ? "Processing off the main thread"
                  : status === "done"
                    ? "Ingestion complete"
                    : status === "cancelled"
                      ? "Cancelled"
                      : "Ingestion failed"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isRunning && (
              <Button size="sm" variant="outline" onClick={onCancel} className="gap-1">
                <X className="w-3.5 h-3.5" /> Cancel
              </Button>
            )}
            {isError && (
              <Button size="sm" variant="outline" onClick={onRetry} className="gap-1">
                <RotateCcw className="w-3.5 h-3.5" /> Retry
              </Button>
            )}
          </div>
        </div>

        {!isError && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {progress.rowsProcessed.toLocaleString()} rows processed
                {progress.totalRowsEstimate
                  ? ` of ~${progress.totalRowsEstimate.toLocaleString()}`
                  : ""}
              </span>
              <span className="font-mono font-semibold text-foreground">{pctLabel}</span>
            </div>
            <Progress value={progress.percent} className="h-2" />
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={<Database className="w-3.5 h-3.5" />} label="Chunks" value={String(progress.chunksProcessed)} />
          <Stat icon={<Clock className="w-3.5 h-3.5" />} label="ETA" value={isRunning ? formatEta(progress.etaMs) : "—"} />
          <Stat icon={<Cpu className="w-3.5 h-3.5" />} label="Memory" value={`${progress.memoryEstimateMb.toFixed(1)} MB`} />
          <Stat
            icon={<Database className="w-3.5 h-3.5" />}
            label="Health"
            value={typeof healthScore === "number" ? `${healthScore}` : "—"}
            badge={typeof healthScore === "number"}
          />
        </div>

        {error && (
          <div className="text-xs text-destructive border border-destructive/20 bg-destructive/5 rounded-md p-3">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badge?: boolean;
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      {badge ? (
        <Badge variant="outline" className="text-xs font-mono">{value}</Badge>
      ) : (
        <p className="text-sm font-semibold font-mono">{value}</p>
      )}
    </div>
  );
}
