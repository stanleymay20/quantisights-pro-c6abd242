/**
 * Deliberation — Enterprise deterministic boardroom layer for pending decisions.
 *
 * Locked constraints preserved:
 *   - No LLM personas, no synthesized prose, no fabricated consensus score.
 *   - Perspectives are computed deterministically from real signals
 *     (decision_ledger, governance_thresholds, narrative_conflicts, decision_approvals).
 *   - Human votes only — surfaced from decision_approvals; not auto-generated.
 *   - Explanations use label/value surfaces anchored to source statistics.
 */
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { usePendingDeliberations, useDeliberation, type DeliberationApprovalRow } from "@/hooks/useDeliberation";
import type { PerspectiveStance } from "@/lib/deliberation/perspectives";
import TrustStrip from "@/components/trust/TrustStrip";
import { trustFromBoardroomItem } from "@/components/trust/trust-adapter";
import { useOrganization } from "@/hooks/useOrganization";
import {
  Scale,
  Users,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  HelpCircle,
  XCircle,
  ArrowLeft,
  ArrowRight,
  GitBranch,
  Clock,
  Euro,
  FileSearch,
  ShieldCheck,
  Activity,
  ClipboardCheck,
} from "lucide-react";

const stanceMeta: Record<PerspectiveStance, { label: string; icon: typeof CheckCircle2; className: string }> = {
  supports: { label: "Supports", icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400 border-emerald-600/30 bg-emerald-500/5" },
  conditional: { label: "Conditional", icon: MinusCircle, className: "text-amber-600 dark:text-amber-400 border-amber-600/30 bg-amber-500/5" },
  concerns: { label: "Concerns", icon: AlertTriangle, className: "text-amber-700 dark:text-amber-300 border-amber-700/40 bg-amber-500/10" },
  opposes: { label: "Opposes", icon: XCircle, className: "text-destructive border-destructive/30 bg-destructive/5" },
  insufficient_evidence: { label: "Insufficient Evidence", icon: HelpCircle, className: "text-muted-foreground border-border bg-muted/30" },
};

const toneClass = (tone?: string) => {
  switch (tone) {
    case "positive": return "text-emerald-600 dark:text-emerald-400";
    case "warning": return "text-amber-600 dark:text-amber-400";
    case "negative": return "text-destructive";
    default: return "";
  }
};

const fmtPct = (n: unknown, digits = 0) => {
  const value = Number(n);
  if (!Number.isFinite(value)) return "—";
  const normalized = value > 1 ? value / 100 : value;
  return `${(normalized * 100).toFixed(digits)}%`;
};

const fmtMoney = (n: unknown) => {
  const value = Number(n);
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
};

const fmtDate = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function impactValue(decision: Record<string, unknown>) {
  return Number(decision.predicted_net_impact ?? decision.expected_value_at_decision ?? getPath(decision.explanation_metadata, "expected_impact.parsed_value") ?? 0);
}

function costOfDelay(decision: Record<string, unknown>) {
  const impact = Math.abs(impactValue(decision));
  if (!impact) return 0;
  const confidence = Number(decision.capped_confidence ?? decision.raw_confidence ?? 0.5);
  return Math.round((impact * Math.min(confidence || 0.5, 0.85)) / 30);
}

function evidenceRows(decision: Record<string, unknown>) {
  const meta = asRecord(decision.explanation_metadata);
  const sourceData = asRecord(meta.source_data);
  const source = asRecord(meta.source);
  const triggeringInsight = asRecord(meta.triggering_insight);
  const confidence = asRecord(meta.confidence_explanation);

  return [
    { label: "Source kind", value: String(source.kind ?? decision.decision_origin ?? "decision_ledger") },
    { label: "Source id", value: String(source.id ?? decision.advisory_instance_id ?? decision.id ?? "—") },
    { label: "Dataset", value: String(sourceData.dataset_name ?? "Unknown dataset") },
    { label: "Rows analysed", value: String(sourceData.rows_analyzed ?? "—") },
    { label: "Metric", value: String(triggeringInsight.metric_name ?? decision.decision_type ?? "—") },
    { label: "Confidence basis", value: String(confidence.score != null ? fmtPct(confidence.score, 1) : fmtPct(decision.capped_confidence, 1)) },
  ];
}

function approvalReadiness(summaryStatus: string) {
  if (summaryStatus === "approved") return { label: "Approved", tone: "positive", detail: "Human approval chain is complete." };
  if (summaryStatus === "awaiting_approvals") return { label: "Awaiting approvals", tone: "warning", detail: "Human approval chain is active but incomplete." };
  if (summaryStatus === "blocked") return { label: "Blocked", tone: "negative", detail: "Governance, rejection, or opposing perspective blocks action." };
  if (summaryStatus === "insufficient_evidence") return { label: "Needs investigation", tone: "warning", detail: "Evidence floor is not satisfied." };
  return { label: "Ready for approval", tone: "positive", detail: "No deterministic blocker detected. Human vote still required." };
}

function approvalTone(approval: DeliberationApprovalRow) {
  const verdict = String(approval.verdict ?? "").toLowerCase();
  const status = String(approval.status ?? "").toLowerCase();
  if (verdict === "reject" || verdict === "rejected" || status === "rejected") return "negative";
  if (verdict === "approve" || verdict === "approved" || status === "approved") return "positive";
  if (status === "pending" || status === "requested") return "warning";
  return "neutral";
}

function approvalLabel(approval: DeliberationApprovalRow) {
  return approval.stage_name || approval.approver_role || "Approval stage";
}

function approverLabel(approval: DeliberationApprovalRow) {
  return approval.approver_email || approval.approver_role || approval.approver_id || "Unassigned approver";
}

function DeliberationDetail({ decisionId, onBack }: { decisionId: string; onBack: () => void }) {
  const { data, loading } = useDeliberation(decisionId);
  const navigate = useNavigate();
  const { currentOrgId } = useOrganization();

  const derived = useMemo(() => {
    const decision = (data?.decision ?? {}) as unknown as Record<string, unknown>;
    const impact = impactValue(decision);
    const delay = costOfDelay(decision);
    const readiness = data ? approvalReadiness(data.summary.status) : approvalReadiness("insufficient_evidence");
    const expected = Number(decision.expected_value_at_decision ?? decision.predicted_net_impact ?? 0);
    const actual = Number(decision.actual_outcome ?? decision.actual_value ?? decision.outcome_value ?? NaN);
    const accuracy = Number.isFinite(expected) && expected !== 0 && Number.isFinite(actual)
      ? Math.min(100, Math.max(0, Math.abs(actual / expected) * 100))
      : null;

    return {
      decision,
      impact,
      delay,
      readiness,
      evidence: evidenceRows(decision),
      outcome: {
        expected,
        actual: Number.isFinite(actual) ? actual : null,
        accuracy,
      },
      timeline: [
        { label: "Insight captured", value: fmtDate(getPath(decision.explanation_metadata, "source.created_at") ?? decision.created_at), state: "complete" },
        { label: "Decision created", value: fmtDate(decision.created_at), state: "complete" },
        { label: "Deliberation", value: data?.summary.status.replace(/_/g, " ") ?? "—", state: "active" },
        { label: "Approval", value: `${data?.summary.human_approvals_received ?? 0}/${data?.summary.human_approvals_required ?? 0}`, state: data?.summary.status === "approved" ? "complete" : "pending" },
        { label: "Execution", value: String(decision.execution_status ?? "not_started"), state: decision.execution_status === "completed" ? "complete" : "pending" },
        { label: "Outcome", value: Number.isFinite(actual) ? "measured" : "pending", state: Number.isFinite(actual) ? "complete" : "pending" },
      ],
    };
  }, [data]);

  if (loading) return <div className="text-xs text-muted-foreground p-6">Loading deliberation…</div>;
  if (!data) return (
    <Card className="p-6">
      <div className="text-sm text-muted-foreground">Decision not found or no longer in scope.</div>
      <Button variant="outline" size="sm" className="mt-3" onClick={onBack}><ArrowLeft className="h-3 w-3 mr-1" /> Back</Button>
    </Card>
  );

  const { decision, approvals, perspectives, summary } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-3 w-3 mr-1" /> Back to queue</Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/decisions")}>Open Decision Ledger <ArrowRight className="h-3 w-3 ml-1" /></Button>
      </div>

      <Card className="p-5 border-primary/20 bg-primary/[0.03]">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Enterprise deterministic boardroom</div>
            <h2 className="text-[16px] font-semibold mt-1 leading-snug">{decision.recommended_action}</h2>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="outline" className="text-[10px]">{decision.decision_type}</Badge>
              <Badge variant="outline" className="text-[10px]">Status: {decision.decision_status}</Badge>
              <Badge variant="outline" className="text-[10px] tabular-nums">Confidence: {decision.capped_confidence != null ? fmtPct(decision.capped_confidence, 1) : "—"}</Badge>
              <Badge variant="outline" className={`text-[10px] ${toneClass(derived.readiness.tone)}`}>Readiness: {derived.readiness.label}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 min-w-[280px]">
            <MiniMetric icon={Euro} label="Expected impact" value={fmtMoney(derived.impact)} />
            <MiniMetric icon={Clock} label="Cost/day delay" value={fmtMoney(derived.delay)} />
            <MiniMetric icon={ShieldCheck} label="Approval" value={`${summary.human_approvals_received}/${summary.human_approvals_required}`} />
          </div>
        </div>
      </Card>

      <TrustStrip
        record={trustFromBoardroomItem(decision, currentOrgId)}
        variant="compact"
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5">
          <SectionTitle icon={FileSearch} title="Evidence chain" subtitle="Source-backed trace from signal to decision" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
            {derived.evidence.map((row) => <Stat key={row.label} label={row.label} value={row.value} />)}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={AlertTriangle} title="Cost of inaction" subtitle="Deterministic delay estimate from expected impact and capped confidence" />
          <div className="grid grid-cols-3 gap-3 mt-4">
            <Stat label="Act now" value={fmtMoney(derived.impact)} tone={derived.impact >= 0 ? "positive" : "negative"} />
            <Stat label="Delay 30 days" value={fmtMoney(derived.delay * 30)} tone="warning" />
            <Stat label="Delay 90 days" value={fmtMoney(derived.delay * 90)} tone="negative" />
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle icon={Scale} title="Deliberation summary" subtitle="Real counts only; no synthesized consensus" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <Stat label="Supports" value={summary.perspectives_supports.toString()} tone="positive" />
          <Stat label="Conditional" value={summary.perspectives_conditional.toString()} tone="warning" />
          <Stat label="Concerns" value={summary.perspectives_concerns.toString()} tone="warning" />
          <Stat label="Opposes" value={summary.perspectives_opposes.toString()} tone="negative" />
          <Stat label="Insufficient" value={summary.perspectives_insufficient.toString()} />
        </div>
        <Separator className="my-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Human approvals received" value={`${summary.human_approvals_received}/${summary.human_approvals_required}`} />
          <Stat label="Human rejections" value={summary.human_rejections.toString()} tone={summary.human_rejections > 0 ? "negative" : undefined} />
          <Stat label="Gate status" value={summary.status.replace(/_/g, " ")} tone={derived.readiness.tone} />
          <Stat label="Readiness detail" value={derived.readiness.detail} />
        </div>
        <div className="mt-3 text-[11px] text-muted-foreground flex items-start gap-2">
          <Scale className="h-3 w-3 mt-0.5 shrink-0" />
          <span>No consensus score is synthesized. Perspective stances are deterministic functions of governance thresholds and decision evidence. Final approval requires real human votes via the Decision Ledger.</span>
        </div>
      </Card>

      <ApprovalChainPanel approvals={approvals} requiredApprovals={summary.human_approvals_required} />

      <SectionErrorBoundary sectionName="Deliberation — Perspectives">
        <div className="grid gap-4 md:grid-cols-2">
          {perspectives.map((p) => {
            const meta = stanceMeta[p.stance];
            const Icon = meta.icon;
            return (
              <Card key={p.id} className={`p-5 border ${meta.className}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{p.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{p.question}</div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${meta.className}`}><Icon className="h-3 w-3 mr-1" /> {meta.label}</Badge>
                </div>
                <div className="text-sm mt-3 leading-relaxed">{p.rationale}</div>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 gap-2">
                  {p.facts.map((f, i) => (
                    <div key={i} className="border-l-2 border-border/60 pl-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.label}</div>
                      <div className={`text-sm font-medium tabular-nums ${toneClass(f.tone)}`}>{f.value}</div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </SectionErrorBoundary>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle icon={ClipboardCheck} title="Outcome tracking" subtitle="Expected vs actual; learning remains pending until measured" />
          <div className="grid grid-cols-3 gap-3 mt-4">
            <Stat label="Expected" value={fmtMoney(derived.outcome.expected)} />
            <Stat label="Actual" value={derived.outcome.actual == null ? "pending" : fmtMoney(derived.outcome.actual)} />
            <Stat label="Accuracy" value={derived.outcome.accuracy == null ? "pending" : `${derived.outcome.accuracy.toFixed(1)}%`} />
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={GitBranch} title="Boardroom timeline" subtitle="Traceable lifecycle from insight to outcome" />
          <div className="mt-4 space-y-2">
            {derived.timeline.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 border-l-2 border-border/60 pl-3 py-1">
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-[11px] text-muted-foreground">{item.value}</div>
                </div>
                <Badge variant="outline" className={`text-[10px] ${item.state === "complete" ? "text-emerald-600 border-emerald-600/30" : item.state === "active" ? "text-primary border-primary/30" : "text-muted-foreground"}`}>{item.state}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4 text-xs text-muted-foreground flex items-start gap-2">
        <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>To approve or reject, use the human approval workflow in the Decision Ledger. Approval verdicts recorded there flow back into this deterministic boardroom automatically.</span>
      </Card>
    </div>
  );
}

function ApprovalChainPanel({ approvals, requiredApprovals }: { approvals: DeliberationApprovalRow[]; requiredApprovals: number }) {
  const received = approvals.filter((a) => ["approve", "approved"].includes(String(a.verdict ?? a.status).toLowerCase())).length;
  const rejected = approvals.filter((a) => ["reject", "rejected"].includes(String(a.verdict ?? a.status).toLowerCase())).length;
  const pending = Math.max(0, requiredApprovals - received - rejected);

  return (
    <Card className="p-5">
      <SectionTitle icon={Users} title="Approval chain" subtitle="Human-governed approval stages from decision_approvals" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <Stat label="Required" value={String(requiredApprovals)} />
        <Stat label="Received" value={String(received)} tone={received >= requiredApprovals && requiredApprovals > 0 ? "positive" : undefined} />
        <Stat label="Pending" value={String(pending)} tone={pending > 0 ? "warning" : undefined} />
        <Stat label="Rejected" value={String(rejected)} tone={rejected > 0 ? "negative" : undefined} />
      </div>
      <Separator className="my-4" />
      {approvals.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Approval chain has not been materialized yet. Decision remains human-governed; configure approval stages in Decision Ledger or governance settings.
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((approval, index) => {
            const tone = approvalTone(approval);
            return (
              <div key={approval.id ?? `${approvalLabel(approval)}-${index}`} className="rounded-lg border p-3">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">Stage {approval.stage_order ?? index + 1}</Badge>
                      <div className="font-medium text-sm">{approvalLabel(approval)}</div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Approver: {approverLabel(approval)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={`text-[10px] ${toneClass(tone)}`}>Status: {approval.status ?? "unknown"}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${toneClass(tone)}`}>Verdict: {approval.verdict ?? "pending"}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  <Stat label="Due" value={fmtDate(approval.due_at)} />
                  <Stat label="Decided" value={fmtDate(approval.decided_at)} />
                  <Stat label="Escalation" value={approval.escalation_status ?? "none"} tone={approval.escalation_status ? "warning" : undefined} />
                  <Stat label="Notes" value={approval.notes ?? "—"} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: typeof Scale; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
        <div className="text-sm text-muted-foreground mt-0.5">{subtitle}</div>
      </div>
    </div>
  );
}

function MiniMetric({ icon: Icon, label, value }: { icon: typeof Scale; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/70 p-3">
      <Icon className="h-3.5 w-3.5 text-primary mb-1" />
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums truncate">{value}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border-l-2 border-border/60 pl-3 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums break-words ${toneClass(tone)}`}>{value}</div>
    </div>
  );
}

type DeliberationVariant = "deliberation" | "boardroom";

const variantCopy: Record<DeliberationVariant, { eyebrow: string; title: string; description: string }> = {
  deliberation: {
    eyebrow: "Decisions",
    title: "Deliberation",
    description: "Enterprise-grade deliberation for pending decisions. It computes Financial, Risk, Execution, Outcome, and Contrarian perspectives from real evidence — never from LLM personas, synthetic votes, or fabricated consensus scores.",
  },
  boardroom: {
    eyebrow: "Decisions · AI Boardroom",
    title: "AI Boardroom",
    description: "Executive deliberation chamber. Select a pending decision to review evidence, perspective stances, cost of inaction, and human approval status — all computed deterministically from your governed signals.",
  },
};

export default function Deliberation({ variant = "deliberation" }: { variant?: DeliberationVariant } = {}) {
  const { rows, loading } = usePendingDeliberations();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedId = searchParams.get("decision");
  const setSelectedId = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("decision", id); else next.delete("decision");
    setSearchParams(next, { replace: false });
  };
  const copy = variantCopy[variant];

  if (selectedId) return (
    <div className="container max-w-7xl mx-auto py-8 px-6">
      <DeliberationDetail decisionId={selectedId} onBack={() => setSelectedId(null)} />
    </div>
  );

  return (
    <div className="container max-w-6xl mx-auto py-8 px-6 space-y-6">
      <header>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{copy.eyebrow}</div>
        <h1 className="text-[18px] font-semibold tracking-tight tracking-tight">{copy.title}</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{copy.description}</p>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><MiniMetric icon={Activity} label="Pending decisions" value={String(rows.length)} /></Card>
        <Card className="p-4"><MiniMetric icon={Scale} label="Voting authority" value="Human only" /></Card>
        <Card className="p-4"><MiniMetric icon={FileSearch} label="Evidence mode" value="Source backed" /></Card>
        <Card className="p-4"><MiniMetric icon={ShieldCheck} label="Consensus" value="Not synthesized" /></Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b text-[10px] uppercase tracking-wide text-muted-foreground">Pending decisions ({rows.length})</div>
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading queue…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Scale className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">No decisions pending deliberation</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Log a decision in the Decision Ledger to trigger the deliberation pipeline —
                evidence stances, cost of inaction, and approval chain are computed automatically.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/decisions")}>
              <ArrowRight className="w-3.5 h-3.5 mr-1.5" /> Go to Decision Ledger
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => setSelectedId(d.id)} className="w-full text-left px-4 py-3 hover:bg-muted/40 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{d.recommended_action}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{d.decision_type} · created {new Date(d.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] tabular-nums">impact {fmtMoney(d.predicted_net_impact ?? d.expected_value_at_decision)}</Badge>
                    <Badge variant="outline" className="text-[10px] tabular-nums">conf {d.capped_confidence != null ? fmtPct(d.capped_confidence) : "—"}</Badge>
                    <Badge variant="outline" className="text-[10px]">{d.decision_status}</Badge>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
