import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useInterventions, InterventionRow } from "@/hooks/useInterventions";
import { AlertOctagon, CheckCircle2, Clock, ShieldAlert, TrendingUp, Activity, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const TIER_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  informational: "outline", elevated: "secondary", high: "default", critical: "destructive",
};
const TIER_ICON: Record<string, JSX.Element> = {
  critical: <AlertOctagon className="h-4 w-4" />,
  high: <ShieldAlert className="h-4 w-4" />,
  elevated: <TrendingUp className="h-4 w-4" />,
  informational: <Info className="h-4 w-4" />,
};

function InterventionCard({ iv, onOpen }: { iv: InterventionRow; onOpen: (i: InterventionRow) => void }) {
  const overdue = iv.sla_due_at && new Date(iv.sla_due_at) < new Date() && !iv.resolved_at;
  return (
    <button
      type="button"
      onClick={() => onOpen(iv)}
      className="text-left w-full border rounded-lg p-3 hover:bg-accent/50 transition-colors space-y-2"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={TIER_VARIANT[iv.escalation_tier]} className="gap-1">
            {TIER_ICON[iv.escalation_tier]} {iv.escalation_tier} · {iv.intervention_priority_score}
          </Badge>
          <Badge variant="outline">{iv.intervention_type}</Badge>
          <Badge variant="secondary">{iv.status}</Badge>
          {overdue && <Badge variant="destructive">SLA breached</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">{new Date(iv.created_at).toLocaleDateString()}</span>
      </div>
      <p className="font-medium text-sm">{iv.title}</p>
      {iv.recommended_action && <p className="text-xs text-muted-foreground line-clamp-2">{iv.recommended_action}</p>}
    </button>
  );
}

function InterventionDrawer({ iv, onClose, ops }: {
  iv: InterventionRow | null;
  onClose: () => void;
  ops: ReturnType<typeof useInterventions>;
}) {
  const [escalateReason, setEscalateReason] = useState("");
  const [resolveNotes, setResolveNotes] = useState("");
  if (!iv) return null;
  const breakdown = iv.scoring_breakdown || {};
  const ivEscalations = ops.escalations.filter((e) => e.intervention_id === iv.id);
  const ivLearning = ops.learning.find((l) => l.intervention_id === iv.id);
  const slaState = iv.sla_due_at
    ? (new Date(iv.sla_due_at) < new Date() && !iv.resolved_at ? "breached" : "on-track")
    : "—";

  return (
    <Sheet open={!!iv} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <Badge variant={TIER_VARIANT[iv.escalation_tier]}>{iv.escalation_tier} · {iv.intervention_priority_score}</Badge>
            <Badge variant="outline">{iv.intervention_type}</Badge>
          </SheetTitle>
          <SheetDescription className="text-base text-foreground font-medium">{iv.title}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          {iv.summary && <p className="text-sm text-muted-foreground">{iv.summary}</p>}
          {iv.recommended_action && (
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Recommended Action</h4>
              <p className="text-sm">{iv.recommended_action}</p>
            </div>
          )}
          {iv.rationale && (
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Rationale</h4>
              <p className="text-sm text-muted-foreground">{iv.rationale}</p>
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Scoring Breakdown</h4>
            <ul className="text-xs space-y-1">
              {Object.entries(breakdown).map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
                  <span className="font-mono">{typeof v === "number" ? v.toFixed(2) : String(v)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="border rounded p-2">
              <div className="text-muted-foreground">Owner</div>
              <div className="font-mono truncate">{iv.owner_id ? iv.owner_id.slice(0, 8) : "Unassigned"}</div>
            </div>
            <div className="border rounded p-2">
              <div className="text-muted-foreground">SLA</div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <Badge variant={slaState === "breached" ? "destructive" : "outline"} className="text-[10px]">
                  {slaState}
                </Badge>
              </div>
              {iv.sla_due_at && (
                <div className="text-muted-foreground mt-1">{new Date(iv.sla_due_at).toLocaleString()}</div>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Supporting Intelligence</h4>
            {Array.isArray(iv.contributing_signals) && iv.contributing_signals.length > 0 ? (
              <ul className="text-xs space-y-1">
                {(iv.contributing_signals as Array<Record<string, unknown>>).slice(0, 5).map((s, idx) => (
                  <li key={idx} className="border-l-2 border-muted pl-2">
                    {String(s.title ?? s.label ?? s.source ?? JSON.stringify(s)).slice(0, 140)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Source: <span className="font-mono">{iv.source_type}{iv.source_id ? ` · ${iv.source_id.slice(0, 8)}` : ""}</span>
              </p>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
              Escalation History {ivEscalations.length > 0 && <span className="text-foreground">({ivEscalations.length})</span>}
            </h4>
            {ivEscalations.length === 0 ? (
              <p className="text-xs text-muted-foreground">No escalations.</p>
            ) : (
              <ol className="space-y-1.5">
                {ivEscalations.map((e) => (
                  <li key={e.id} className="text-xs border-l-2 border-primary pl-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">L{e.escalation_level}</Badge>
                      <Badge variant="outline" className="text-[10px]">{e.triggered_by}</Badge>
                      <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                    </div>
                    <p>{e.escalation_reason}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {(iv.resolution_notes || ivLearning) && (
            <div className="border rounded p-2 bg-muted/30">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Outcome & Learning</h4>
              {iv.resolution_notes && <p className="text-xs mb-1">{iv.resolution_notes}</p>}
              {ivLearning && (
                <div className="text-xs grid grid-cols-2 gap-1">
                  <div><span className="text-muted-foreground">Outcome:</span> {ivLearning.outcome ?? "—"}</div>
                  <div><span className="text-muted-foreground">Effectiveness:</span> {ivLearning.effectiveness_score ?? "—"}/100</div>
                  <div><span className="text-muted-foreground">Time to resolve:</span> {ivLearning.time_to_resolution_hours ?? "—"} h</div>
                  <div><span className="text-muted-foreground">Recurrence:</span> {ivLearning.recurrence_count}</div>
                  {ivLearning.false_positive && <div className="col-span-2"><Badge variant="destructive" className="text-[10px]">False positive</Badge></div>}
                  <div className="col-span-2 text-muted-foreground">Confidence adj: {(ivLearning.recommendation_confidence_adjustment * 100).toFixed(1)}pp</div>
                </div>
              )}
            </div>
          )}

          {!iv.resolved_at && (
            <>
              <div className="flex gap-2 flex-wrap pt-2 border-t">
                {iv.status === "proposed" && (
                  <Button size="sm" variant="outline" onClick={() => ops.updateStatus(iv.id, "acknowledged", { acknowledged_at: new Date().toISOString() })}>
                    Acknowledge
                  </Button>
                )}
                {iv.status !== "in_progress" && (
                  <Button size="sm" variant="outline" onClick={() => ops.updateStatus(iv.id, "in_progress")}>
                    Mark in progress
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => ops.updateStatus(iv.id, "deferred")}>
                  Defer
                </Button>
                <Button size="sm" variant="outline" onClick={() => ops.updateStatus(iv.id, "dismissed")}>
                  Dismiss
                </Button>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Escalate</h4>
                <Textarea placeholder="Reason for escalation…" value={escalateReason} onChange={(e) => setEscalateReason(e.target.value)} rows={2} />
                <Button size="sm" disabled={!escalateReason.trim()} onClick={async () => {
                  await ops.escalate(iv.id, escalateReason.trim());
                  setEscalateReason("");
                }}>Escalate now</Button>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Resolve</h4>
                <Textarea placeholder="Resolution notes…" value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)} rows={2} />
                <Button size="sm" variant="default" disabled={!resolveNotes.trim()} onClick={async () => {
                  await ops.resolve(iv.id, resolveNotes.trim());
                  setResolveNotes("");
                  onClose();
                }}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Mark resolved
                </Button>
              </div>
            </>
          )}

          <p className="text-[10px] text-muted-foreground pt-4 border-t">
            AI-assisted intervention. Human judgement required before acting. Provenance: {iv.source_type}{iv.source_id ? ` · ${iv.source_id.slice(0, 8)}` : ""}.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function Interventions() {
  const ops = useInterventions();
  const [selected, setSelected] = useState<InterventionRow | null>(null);

  const obs = ops.observability;
  const counts = ops.buckets;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-7 w-7" /> Intervention Intelligence
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Prioritized organizational interventions. Sorted by priority score. Status changes auto-touch timestamps; escalations are auditable.
        </p>
      </header>

      {(() => {
        const resolutionRate = obs && obs.creation_count > 0
          ? Math.round((obs.resolution_count / obs.creation_count) * 100) : null;
        const escalationRate = obs && obs.creation_count > 0
          ? Math.round((obs.escalation_count / obs.creation_count) * 100) : null;
        const conversionRate = obs ? Math.round((obs.conversion_to_decision_rate ?? 0) * 100) : null;
        return (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-3">
                <div className="text-2xl font-bold text-destructive">{counts.critical.length}</div>
                <div className="text-xs text-muted-foreground">Unresolved critical</div>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="text-2xl font-bold">{obs?.fatigue_score ?? 0}<span className="text-sm text-muted-foreground">/100</span></div>
                <div className="text-xs text-muted-foreground">Fatigue score (today)</div>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="text-2xl font-bold">{escalationRate != null ? `${escalationRate}%` : "—"}</div>
                <div className="text-xs text-muted-foreground">Escalation rate</div>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="text-2xl font-bold">
                  {obs?.avg_response_latency_minutes != null ? `${Math.round(obs.avg_response_latency_minutes)}m` : "—"}
                </div>
                <div className="text-xs text-muted-foreground">Avg response latency</div>
              </CardContent></Card>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-3">
                <div className="text-2xl font-bold">{resolutionRate != null ? `${resolutionRate}%` : "—"}</div>
                <div className="text-xs text-muted-foreground">Resolution rate</div>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="text-2xl font-bold">{conversionRate != null ? `${conversionRate}%` : "—"}</div>
                <div className="text-xs text-muted-foreground">→ Decision conversion</div>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="text-2xl font-bold">{counts.high.length}<span className="text-sm text-muted-foreground"> / {counts.elevated.length}</span></div>
                <div className="text-xs text-muted-foreground">High / Elevated open</div>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="text-2xl font-bold">{obs?.effectiveness_avg != null ? Math.round(obs.effectiveness_avg) : "—"}<span className="text-sm text-muted-foreground">/100</span></div>
                <div className="text-xs text-muted-foreground">Avg effectiveness</div>
              </CardContent></Card>
            </div>
          </>
        );
      })()}

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open queue</TabsTrigger>
          <TabsTrigger value="critical">Critical</TabsTrigger>
          <TabsTrigger value="escalations">Escalations</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="space-y-2 mt-3">
          {ops.loading && <Skeleton className="h-24 w-full" />}
          {!ops.loading && ops.items.filter((i) => !i.resolved_at).length === 0 && (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
              No active interventions. The system is in steady-state.
            </CardContent></Card>
          )}
          {ops.items.filter((i) => !i.resolved_at).map((iv) => (
            <InterventionCard key={iv.id} iv={iv} onOpen={setSelected} />
          ))}
        </TabsContent>

        <TabsContent value="critical" className="space-y-2 mt-3">
          {counts.critical.length === 0 && (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No critical interventions.</CardContent></Card>
          )}
          {counts.critical.map((iv) => <InterventionCard key={iv.id} iv={iv} onOpen={setSelected} />)}
        </TabsContent>

        <TabsContent value="escalations" className="space-y-2 mt-3">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Recent escalations</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {ops.escalations.length === 0 && <p className="text-sm text-muted-foreground">No escalations recorded.</p>}
              {ops.escalations.map((e) => (
                <div key={e.id} className="border-l-2 border-primary pl-3 py-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">L{e.escalation_level}</Badge>
                    <Badge variant="outline">{e.triggered_by}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm mt-1">{e.escalation_reason}</p>
                  {e.escalation_summary && <p className="text-xs text-muted-foreground">{e.escalation_summary}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resolved" className="space-y-2 mt-3">
          {counts.resolved.length === 0 && (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No resolved interventions yet.</CardContent></Card>
          )}
          {counts.resolved.slice(0, 50).map((iv) => <InterventionCard key={iv.id} iv={iv} onOpen={setSelected} />)}
        </TabsContent>
      </Tabs>

      <InterventionDrawer iv={selected} onClose={() => setSelected(null)} ops={ops} />
    </div>
  );
}
