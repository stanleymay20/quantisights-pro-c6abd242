import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ShieldAlert, RefreshCw, CheckCircle2, Search,
  ArrowRight, Scale, FileWarning, Loader2,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

import { NarrativeHeader } from "@/components/narrative/NarrativeHeader";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import {
  useExecutiveContradictions,
  type ExecutiveContradiction,
  type ContradictionSeverity,
} from "@/hooks/useExecutiveContradictions";

const SEVERITY_STYLE: Record<ContradictionSeverity, { badge: string; border: string; label: string }> = {
  critical: { badge: "bg-destructive/10 text-destructive border-destructive/30", border: "border-destructive/40", label: "Critical" },
  high: { badge: "bg-warning/10 text-warning border-warning/30", border: "border-warning/40", label: "High" },
  medium: { badge: "bg-primary/10 text-primary border-primary/30", border: "border-primary/30", label: "Medium" },
  low: { badge: "bg-muted text-muted-foreground border-border", border: "border-border", label: "Low" },
};

const fmt = (v: number | null) =>
  v === null || v === undefined ? "Not Available" : Math.abs(v) >= 1000
    ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : v.toLocaleString(undefined, { maximumFractionDigits: 2 });

function ContradictionCard({
  item,
  onStatus,
}: {
  item: ExecutiveContradiction;
  onStatus: (id: string, status: ExecutiveContradiction["status"], note?: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const style = SEVERITY_STYLE[item.severity];
  const closed = item.status === "resolved" || item.status === "accepted";

  const act = async (status: ExecutiveContradiction["status"]) => {
    setBusy(true);
    await onStatus(item.id, status, note.trim() || undefined);
    setBusy(false);
  };

  return (
    <Card className={`p-5 space-y-4 border ${closed ? "border-border opacity-80" : style.border}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${style.badge}`}>{style.label}</Badge>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{item.category}</Badge>
            {item.blocks_decision && !closed && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-destructive/10 text-destructive border-destructive/30">
                Blocks decisions
              </Badge>
            )}
            {closed && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-success/10 text-success border-success/30">
                {item.status === "resolved" ? "Resolved" : "Accepted"}
              </Badge>
            )}
          </div>
          <h3 className="text-base font-semibold leading-snug">{item.subject}</h3>
          <p className="text-xs text-muted-foreground">
            Scope: {item.scope || "Not Available"} · Period: {item.period_label || "Not Available"} · Confidence: {Number(item.confidence)}%
          </p>
        </div>
      </div>

      {/* The disagreement, side by side */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] items-stretch">
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.function_a}</p>
          <p className="text-xl font-semibold tabular-nums">{fmt(item.value_a === null ? null : Number(item.value_a))}</p>
          <p className="text-[11px] text-muted-foreground truncate">Source: {item.source_a}</p>
        </div>
        <div className="flex sm:flex-col items-center justify-center gap-1 px-2">
          <Scale className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-destructive tabular-nums">
            {item.gap_pct === null ? "—" : `${Number(item.gap_pct).toFixed(1)}%`}
          </span>
          <span className="text-[10px] text-muted-foreground">gap</span>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.function_b}</p>
          <p className="text-xl font-semibold tabular-nums">{fmt(item.value_b === null ? null : Number(item.value_b))}</p>
          <p className="text-[11px] text-muted-foreground truncate">Source: {item.source_b}</p>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground leading-relaxed">{item.explanation}</p>
        <p><span className="font-medium">Likely root cause:</span> <span className="text-muted-foreground">{item.root_cause || "Not Available"}</span></p>
        <p><span className="font-medium">Recommended action:</span> <span className="text-muted-foreground">{item.recommended_action || "Not Available"}</span></p>
        <p className="text-xs text-muted-foreground">
          Decisions at risk: {item.affected_decision_ids?.length || 0}
          {item.affected_decision_types?.length ? ` · Types: ${item.affected_decision_types.join(", ")}` : ""}
        </p>
        <p className="text-[11px] text-muted-foreground/70">
          Evidence basis: {String((item.evidence as Record<string, unknown>)?.confidence_basis ?? "Not Available")}
        </p>
      </div>

      {!closed ? (
        <div className="space-y-2 border-t border-border/50 pt-3">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Resolution note — which figure is authoritative and why (recorded in the audit trail)"
            className="min-h-[64px] text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => act("resolved")}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Mark reconciled
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act("investigating")}>
              <Search className="h-3.5 w-3.5" /> Investigating
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("accepted")}>
              Accept difference
            </Button>
          </div>
        </div>
      ) : item.resolution_note ? (
        <p className="border-t border-border/50 pt-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Resolution:</span> {item.resolution_note}
        </p>
      ) : null}
    </Card>
  );
}

const ExecutiveContradictions = () => {
  const { orgId: organizationId } = useActiveDataContext();
  const { toast } = useToast();
  const {
    contradictions, loading, detecting, error, summary, runDetection, updateStatus,
  } = useExecutiveContradictions(organizationId ?? null);

  const openItems = useMemo(
    () => contradictions.filter((c) => c.status === "open" || c.status === "investigating"),
    [contradictions],
  );
  const closedItems = useMemo(
    () => contradictions.filter((c) => c.status === "resolved" || c.status === "accepted"),
    [contradictions],
  );

  const takeaway = summary.open === 0
    ? "No unresolved disagreements between functions on the same number — reported figures currently reconcile."
    : `${summary.open} unresolved disagreement${summary.open === 1 ? "" : "s"} between functions on the same number${summary.blocking > 0 ? `, ${summary.blocking} of which should block decisions until reconciled` : ""}.`;

  const onDetect = async () => {
    const result = await runDetection();
    if (result) {
      toast({
        title: "Detection complete",
        description: `${result.detected} contradiction${result.detected === 1 ? "" : "s"} in current evidence (${result.inserted} new).`,
      });
    } else {
      toast({ title: "Detection failed", description: error || "Unable to run detection.", variant: "destructive" });
    }
  };

  return (
    <main id="main-content" className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 md:p-8">
        <NarrativeHeader
          audience="For the executive committee"
          action="Reconcile before you decide"
          takeaway={takeaway}
          status={
            <Button size="sm" variant="outline" onClick={onDetect} disabled={detecting || !organizationId}>
              {detecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Re-run detection
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Open contradictions", value: summary.open, icon: AlertTriangle },
            { label: "Blocking decisions", value: summary.blocking, icon: ShieldAlert },
            { label: "Decisions at risk", value: summary.affectedDecisionCount, icon: FileWarning },
            { label: "Reconciled", value: summary.resolved + summary.accepted, icon: CheckCircle2 },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            </Card>
          ))}
        </div>

        <SectionErrorBoundary sectionName="Contradiction Register">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
            </div>
          ) : contradictions.length === 0 ? (
            <Card className="p-8 text-center space-y-3">
              <p className="text-sm font-medium">No contradictions on record.</p>
              <p className="text-sm text-muted-foreground">
                Detection compares the same measure, period and scope across every connected source.
                Run it to check the current evidence — if fewer than two sources report a measure, no
                contradiction can be established and nothing is invented.
              </p>
              <Button size="sm" onClick={onDetect} disabled={detecting || !organizationId}>
                {detecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Run detection
              </Button>
            </Card>
          ) : (
            <Tabs defaultValue="open">
              <TabsList>
                <TabsTrigger value="open">Open ({openItems.length})</TabsTrigger>
                <TabsTrigger value="closed">Reconciled ({closedItems.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="open" className="space-y-4 pt-4">
                {openItems.length === 0 ? (
                  <Card className="p-6 text-sm text-muted-foreground">
                    Every detected contradiction has been reconciled or accepted.
                  </Card>
                ) : (
                  openItems.map((item) => (
                    <ContradictionCard key={item.id} item={item} onStatus={updateStatus} />
                  ))
                )}
              </TabsContent>
              <TabsContent value="closed" className="space-y-4 pt-4">
                {closedItems.length === 0 ? (
                  <Card className="p-6 text-sm text-muted-foreground">Nothing reconciled yet.</Card>
                ) : (
                  closedItems.map((item) => (
                    <ContradictionCard key={item.id} item={item} onStatus={updateStatus} />
                  ))
                )}
              </TabsContent>
            </Tabs>
          )}
        </SectionErrorBoundary>

        <Card className="p-4 text-xs text-muted-foreground">
          Detection is deterministic: it compares the same measure, period and scope across sources and
          reports the measured gap. Confidence reflects data quality, sample size and load freshness and is
          capped at 85. No figure on this page is generated by a language model.{" "}
          <Link to="/decisions" className="inline-flex items-center gap-1 text-primary hover:underline">
            Review the decision ledger <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>
    </main>
  );
};

export default ExecutiveContradictions;
