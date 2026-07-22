import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info, Activity } from "lucide-react";
import LastVerifiedBadge from "./LastVerifiedBadge";

interface Snapshot {
  id: string;
  snapshot_date: string;
  rls_coverage_pct: number | null;
  audit_coverage_pct: number | null;
  explainability_coverage_pct: number | null;
  intervention_traceability_pct: number | null;
  failed_auth_24h: number | null;
  retention_compliance_pct: number | null;
  unresolved_critical_incidents: number | null;
  connector_health_pct: number | null;
  dq_confidence_avg: number | null;
  drift_monitor_coverage_pct: number | null;
  provenance: Record<string, any>;
  evidence_hash: string;
  evidence_generated_at: string;
  evidence_version: string;
}

const METRICS: Array<{ key: keyof Snapshot; label: string; suffix?: string; inverse?: boolean }> = [
  { key: "rls_coverage_pct", label: "RLS coverage", suffix: "%" },
  { key: "audit_coverage_pct", label: "Audit coverage", suffix: "%" },
  { key: "explainability_coverage_pct", label: "Explainability coverage", suffix: "%" },
  { key: "intervention_traceability_pct", label: "Intervention traceability", suffix: "%" },
  { key: "retention_compliance_pct", label: "Retention compliance", suffix: "%" },
  { key: "connector_health_pct", label: "Connector health", suffix: "%" },
  { key: "dq_confidence_avg", label: "Data quality score" },
  { key: "drift_monitor_coverage_pct", label: "Drift monitor coverage", suffix: "%" },
  { key: "failed_auth_24h", label: "Failed auth (24h)", inverse: true },
  { key: "unresolved_critical_incidents", label: "Unresolved critical", inverse: true },
];

const LiveTrustMetrics = () => {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_latest_trust_metrics");
      setSnap((data as any) ?? null);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="pt-6 text-center text-xs text-muted-foreground">
          Loading live trust metrics…
        </CardContent>
      </Card>
    );
  }

  if (!snap) {
    return (
      <Card className="border-border/50">
        <CardContent className="pt-6 text-center text-xs text-muted-foreground">
          No trust snapshot yet. Daily evidence scan will run shortly.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Live Trust Metrics</h2>
            <Badge variant="outline" className="text-[10px]">Snapshot {snap.snapshot_date}</Badge>
          </div>
          <LastVerifiedBadge
            verifiedAt={snap.evidence_generated_at}
            evidenceVersion={snap.evidence_version}
            evidenceHash={snap.evidence_hash}
          />
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Daily snapshot from production. Every metric is anchored to its source tables and a sha256 evidence hash —
          click any tile to inspect provenance.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {METRICS.map((m) => {
            const value = (snap as any)[m.key];
            const prov = snap.provenance?.[m.key as string];
            const display =
              value === null || value === undefined
                ? "—"
                : typeof value === "number" ? `${value}${m.suffix ?? ""}` : String(value);
            return (
              <Popover key={m.key as string}>
                <PopoverTrigger asChild>
                  <button className="text-left p-3 rounded-md border border-border/40 bg-background/40 hover:border-primary/40 transition-colors">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{m.label}</span>
                      <Info className="w-3 h-3 text-muted-foreground/50" />
                    </div>
                    <div className="text-base font-semibold text-primary tabular-nums mt-1">{display}</div>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 text-xs">
                  <div className="font-semibold mb-1">{m.label}</div>
                  {prov ? (
                    <div className="space-y-1.5 text-muted-foreground">
                      <div><span className="text-foreground">Method:</span> {prov.method}</div>
                      <div><span className="text-foreground">Source tables:</span> {(prov.source_tables ?? []).join(", ")}</div>
                      <div><span className="text-foreground">Sample size:</span> {prov.sample_size}</div>
                      <div><span className="text-foreground">Confidence:</span> {prov.confidence}</div>
                      <div><span className="text-foreground">Scanned at:</span> {new Date(prov.scanned_at).toLocaleString()}</div>
                      {prov.notes && <div className="italic">{prov.notes}</div>}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">No provenance recorded for this metric.</div>
                  )}
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveTrustMetrics;
