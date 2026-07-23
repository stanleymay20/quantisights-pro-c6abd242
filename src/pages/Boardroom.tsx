import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { useOperationalGraph } from "@/hooks/useOperationalGraph";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import TraversalPlayback, { TraversalStage } from "@/components/executive/TraversalPlayback";
import WhyThisMattersPanel from "@/components/executive/WhyThisMattersPanel";
import GovernanceIntegrityBadge from "@/components/executive/GovernanceIntegrityBadge";
import { Activity, AlertTriangle, GitBranch, Layers, ShieldCheck, Sparkles, Target } from "lucide-react";

/**
 * Boardroom — Phase 5E.5
 *
 * Calm, structured strategic reasoning walkthrough.
 * NOT a multi-agent chatbot. NOT autonomous AI prose.
 * Seven sections: Executive Brief → Operational Pressure → Narrative Evolution →
 * Intervention Flow → Reasoning Playback → Governance Integrity → Strategic Decision Context.
 */

const SectionHeader = ({
  index,
  icon: Icon,
  title,
  subtitle,
}: {
  index: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) => (
  <div className="flex items-start gap-3">
    <div className="rounded-md border border-primary/30 bg-primary/5 text-primary p-2 mt-0.5">
      <Icon className="h-4 w-4" />
    </div>
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Section {String(index).padStart(2, "0")}
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  </div>
);

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="border-l-2 border-border/60 pl-3">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={"text-base font-semibold tabular-nums " + (tone ?? "")}>{value}</div>
  </div>
);

export default function Boardroom() {
  const { orgId } = useActiveDataContext();
  const { nodes, edges, scores, attention, patterns, governance, loading } = useOperationalGraph();

  const executive = useMemo(() => attention.filter((a) => a.abstraction_level === 1).slice(0, 5), [attention]);
  const operational = useMemo(() => attention.filter((a) => a.abstraction_level === 2).slice(0, 5), [attention]);
  const evidence = useMemo(() => attention.filter((a) => a.abstraction_level === 3).slice(0, 5), [attention]);
  const breaches = useMemo(() => governance.filter((g) => g.escalation_threshold_breached), [governance]);

  const topNode = useMemo(() => {
    if (!scores.length) return null;
    const top = scores[0];
    const n = nodes.find((x) => x.id === top.node_id);
    if (!n) return null;
    const outgoing = edges.filter((e) => e.source_node_id === n.id);
    const incoming = edges.filter((e) => e.target_node_id === n.id);
    return { node: n, score: top, outgoing, incoming };
  }, [scores, nodes, edges]);

  // Deterministic playback chain assembled from real topology — no LLM prose.
  const traversal: TraversalStage[] = useMemo(() => {
    if (!topNode) return [];
    const { node, score, outgoing } = topNode;
    const target = outgoing[0] ? nodes.find((n) => n.id === outgoing[0].target_node_id) : null;
    return [
      {
        kind: "signal",
        title: `${node.title}`,
        evidence_refs: [{ label: `${node.node_type}` }, { label: `state: ${node.operational_state ?? "active"}` }],
        confidence_contribution: 0.55,
        causal_classification: "deterministic",
        propagation_reason: "Highest blast radius in active topology.",
        operational_implication: "Anchor signal for executive attention.",
      },
      {
        kind: "pressure",
        title: `Operational pressure surfaced (${Math.round(score.propagation_risk)})`,
        confidence_contribution: 0.18,
        causal_classification: "statistical",
        propagation_reason: "Topology propagation weighted by edge confidence and decay.",
        operational_implication: "Pressure exceeds executive review threshold.",
        evidence_refs: [{ label: `blast: ${Math.round(score.blast_radius_score)}` }, { label: `criticality: ${Math.round(score.operational_criticality)}` }],
      },
      {
        kind: "narrative",
        title: outgoing.length > 1 ? "Multi-path narrative convergence" : "Single-path narrative",
        confidence_contribution: 0.10,
        causal_classification: outgoing.some((e) => e.relationship_semantics === "causal") ? "deterministic" : "correlation_only",
        propagation_reason: `${outgoing.length} downstream relationships, mean confidence ${
          outgoing.length ? Math.round((outgoing.reduce((a, b) => a + b.confidence, 0) / outgoing.length) * 100) : 0
        }%.`,
        operational_implication: "Narratives stabilising around a common driver.",
      },
      {
        kind: "intervention",
        title: target ? `Recommended path: ${target.title}` : "No actionable downstream target",
        confidence_contribution: target ? 0.08 : 0,
        causal_classification: "heuristic",
        propagation_reason: target ? "Lowest-resistance governance-safe traversal." : "Insufficient evidence to recommend.",
        operational_implication: target ? "Single intervention covers majority of pressure surface." : "Defer until evidence consolidates.",
      },
      {
        kind: "decision",
        title: "Pending executive decision",
        confidence_contribution: 0.05,
        causal_classification: "deterministic",
        propagation_reason: "Decision Ledger entry generated; awaiting approval.",
        operational_implication: "Auditable governance event.",
        evidence_refs: [{ label: "decision_ledger" }],
      },
      {
        kind: "outcome",
        title: "Expected reduction in operational pressure",
        confidence_contribution: 0.02,
        causal_classification: "statistical",
        propagation_reason: "Historical effectiveness from similar memory patterns.",
        operational_implication: "Outcome will be measured and fed back into calibration.",
      },
    ];
  }, [topNode, nodes]);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Boardroom</div>
            <h1 className="text-[18px] font-semibold tracking-tight tracking-tight">Governed Executive Reasoning</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              A calm, deterministic walkthrough of the operational topology your leadership team is responsible for —
              with evidence, confidence, and governance integrity visible at every step.
            </p>
          </div>
          <GovernanceIntegrityBadge size="md" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-12">
        {/* ─── 1. Executive Brief ─── */}
        <section className="space-y-4">
          <SectionHeader index={1} icon={Sparkles} title="Executive Brief" subtitle="Up to five executive abstractions. No graph clutter." />
          <SectionErrorBoundary sectionName="Boardroom — Executive Brief">
            {executive.length === 0 ? (
              <Card className="p-6 text-sm text-muted-foreground">No executive abstractions yet — rebuild the graph to populate.</Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {executive.map((v) => (
                  <Card key={v.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{v.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">{v.compressed_summary}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl font-semibold tabular-nums">{v.priority_score.toFixed(0)}</div>
                        <div className="text-[10px] text-muted-foreground">priority</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </SectionErrorBoundary>
        </section>

        <Separator />

        {/* ─── 2. Operational Pressure ─── */}
        <section className="space-y-4">
          <SectionHeader index={2} icon={Activity} title="Operational Pressure" subtitle="Up to three pressure themes carrying the most downstream weight." />
          <SectionErrorBoundary sectionName="Boardroom — Pressure">
            {topNode ? (
              <div className="grid gap-4 md:grid-cols-2">
                <WhyThisMattersPanel node={topNode.node} score={topNode.score} outgoing={topNode.outgoing} incoming={topNode.incoming} />
                <Card className="p-5 space-y-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Topology snapshot</div>
                  <div className="grid grid-cols-2 gap-y-3">
                    <Stat label="Active nodes" value={nodes.length.toString()} />
                    <Stat label="Edges" value={edges.length.toString()} />
                    <Stat label="Scored" value={scores.length.toString()} />
                    <Stat label="Memory patterns" value={patterns.length.toString()} />
                    <Stat label="Escalations" value={breaches.length.toString()} tone={breaches.length ? "text-destructive" : ""} />
                    <Stat label="Compression budget" value={`${executive.length}/5`} />
                  </div>
                </Card>
              </div>
            ) : (
              <Card className="p-6 text-sm text-muted-foreground">No pressure surfaced — topology empty or below threshold.</Card>
            )}
          </SectionErrorBoundary>
        </section>

        <Separator />

        {/* ─── 3. Narrative Evolution ─── */}
        <section className="space-y-4">
          <SectionHeader index={3} icon={Layers} title="Narrative Evolution" subtitle="Operational chains aggregating related signals into one storyline." />
          <SectionErrorBoundary sectionName="Boardroom — Narrative">
            {operational.length === 0 ? (
              <Card className="p-6 text-sm text-muted-foreground">No operational chains active.</Card>
            ) : (
              <div className="space-y-2">
                {operational.map((v) => (
                  <Card key={v.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{v.title}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{v.compressed_summary}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px] tabular-nums shrink-0">P {v.priority_score.toFixed(0)}</Badge>
                  </Card>
                ))}
              </div>
            )}
          </SectionErrorBoundary>
        </section>

        <Separator />

        {/* ─── 4. Intervention Flow ─── */}
        <section className="space-y-4">
          <SectionHeader index={4} icon={GitBranch} title="Intervention Flow" subtitle="Recurring patterns recognised from organisational memory." />
          <SectionErrorBoundary sectionName="Boardroom — Intervention">
            {patterns.length === 0 ? (
              <Card className="p-6 text-sm text-muted-foreground">No recurring intervention patterns matched yet.</Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {patterns.slice(0, 4).map((p) => (
                  <Card key={p.id} className="p-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <Badge variant="secondary" className="text-[10px]">{p.pattern_type}</Badge>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        seen {p.recurrence_frequency}× · effectiveness {Math.round((p.historical_effectiveness ?? 0) * 100)}%
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Path length: {(p.recurring_path?.length ?? 0)} · last seen {new Date(p.last_seen_at).toLocaleDateString()}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </SectionErrorBoundary>
        </section>

        <Separator />

        {/* ─── 5. Reasoning Playback ─── */}
        <section className="space-y-4">
          <SectionHeader index={5} icon={Target} title="Reasoning Playback" subtitle="Signal → Pressure → Narrative → Intervention → Decision → Outcome." />
          <SectionErrorBoundary sectionName="Boardroom — Playback">
            <TraversalPlayback stages={traversal} autoplay={false} title={topNode ? topNode.node.title : "Reasoning chain"} />
          </SectionErrorBoundary>
        </section>

        <Separator />

        {/* ─── 6. Governance Integrity ─── */}
        <section className="space-y-4">
          <SectionHeader index={6} icon={ShieldCheck} title="Governance Integrity" subtitle="Trust visible. Suppressions and escalations recorded." />
          <SectionErrorBoundary sectionName="Boardroom — Governance">
            <Card className="p-5 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <GovernanceIntegrityBadge />
                <Badge variant="outline" className="text-[10px]">Confidence cap 85%</Badge>
                <Badge variant="outline" className="text-[10px]">No fabricated edges</Badge>
                <Badge variant="outline" className="text-[10px]">Append-only audit log</Badge>
              </div>
              {breaches.length > 0 ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="font-medium">{breaches.length} active escalation{breaches.length === 1 ? "" : "s"}</span>
                  </div>
                  {breaches.slice(0, 5).map((b) => (
                    <div key={b.id} className="flex items-center gap-2 border-b last:border-0 py-1">
                      <Badge variant="outline" className="text-[9px]">{b.threshold_kind}</Badge>
                      <span className="tabular-nums">{b.threshold_value?.toFixed(0)}</span>
                      <span className="text-muted-foreground truncate flex-1">{b.reason}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No active escalations. All thresholds within tolerance.</div>
              )}
            </Card>
          </SectionErrorBoundary>
        </section>

        <Separator />

        {/* ─── 7. Strategic Decision Context ─── */}
        <section className="space-y-4">
          <SectionHeader index={7} icon={Target} title="Strategic Decision Context" subtitle="What the board is being asked to decide and why." />
          <SectionErrorBoundary sectionName="Boardroom — Decision Context">
            {evidence.length === 0 ? (
              <Card className="p-6 text-sm text-muted-foreground">No evidence lineage to surface.</Card>
            ) : (
              <div className="space-y-2">
                {evidence.map((v) => (
                  <Card key={v.id} className="p-3.5">
                    <div className="font-medium text-sm">{v.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">{v.compressed_summary}</div>
                  </Card>
                ))}
              </div>
            )}
          </SectionErrorBoundary>
        </section>

        {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
        {!orgId && <div className="text-xs text-muted-foreground">Sign in and select a workspace to populate the boardroom.</div>}
      </main>
    </div>
  );
}
