import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Database,
  FileQuestion,
  Gauge,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import DecisionEvidenceVisual from "@/components/decisions/DecisionEvidenceVisual";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import {
  buildDecisionRoomModel,
  type DecisionRoomDecision,
  type DecisionRoomStageStatus,
} from "@/lib/executive-decision-room";
import {
  selectDecisionVisualization,
  type DecisionOutcomeEvidence,
} from "@/lib/decision-visualization";

const statusIcon = (status: DecisionRoomStageStatus) => {
  if (status === "recorded") return <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />;
  if (status === "pending") return <CircleDashed className="h-4 w-4 text-amber-500" aria-hidden="true" />;
  return <XCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
};

const ExecutiveDecisionRoom = () => {
  const { id } = useParams<{ id: string }>();
  const { currentOrgId, loading: organizationLoading } = useOrganization();
  const [decision, setDecision] = useState<DecisionRoomDecision | null>(null);
  const [outcome, setOutcome] = useState<DecisionOutcomeEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setDecision(null);
      setOutcome(null);
      setError("No decision was specified for this Decision Room.");
      setLoading(false);
      return;
    }

    if (organizationLoading) {
      setLoading(true);
      return;
    }

    if (!currentOrgId) {
      setDecision(null);
      setOutcome(null);
      setError("Your organization context could not be resolved. Refresh the page or sign in again before opening this decision.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setOutcome(null);
      const { data, error: queryError } = await supabase
        .from("decision_ledger")
        .select("*")
        .eq("organization_id", currentOrgId)
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;
      if (queryError) {
        setError("The decision could not be loaded. Try again or return to the Decision Ledger.");
        setDecision(null);
        setLoading(false);
        return;
      }
      if (!data) {
        setError("This decision is not available in your organization.");
        setDecision(null);
        setLoading(false);
        return;
      }

      setDecision(data as unknown as DecisionRoomDecision);

      const { data: outcomeData } = await supabase
        .from("decision_outcomes")
        .select("expected_metric, expected_change, expected_direction, observed_metric, observed_value_before, observed_value_after, outcome_status")
        .eq("organization_id", currentOrgId)
        .eq("decision_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setOutcome((outcomeData as DecisionOutcomeEvidence | null) ?? null);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id, currentOrgId, organizationLoading]);

  const model = useMemo(() => (decision ? buildDecisionRoomModel(decision) : null), [decision]);
  const visualSelection = useMemo(
    () => (decision ? selectDecisionVisualization(decision, outcome) : null),
    [decision, outcome],
  );

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SidebarMobileToggle />
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-muted-foreground" asChild>
            <Link to="/decisions">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Decision Ledger
            </Link>
          </Button>
        </div>
        {id && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/evidence-pack/${id}`}>Evidence Pack</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/decisions/${id}/review`}>Review decision</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to={`/decisions/${id}/outcome`}>Outcome</Link>
            </Button>
          </div>
        )}
      </div>

      <header className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Executive Decision Room</h1>
          <Badge variant="outline">Governed evidence</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
          Inspect what the organization knew, how the recommendation was formed, what remains uncertain,
          and what happened next. AI-generated synthesis is not source evidence; use provenance to validate
          every material claim.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border/50 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Preparing the decision room…
        </div>
      ) : error || !decision || !model || !visualSelection ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <div className="flex items-start gap-3">
            <FileQuestion className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
            <div className="space-y-2">
              <h2 className="font-semibold">Decision Room unavailable</h2>
              <p className="text-sm text-muted-foreground">{error ?? "This decision could not be loaded."}</p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/decisions">Return to Decision Ledger</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <article className="rounded-xl border border-border/50 bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{model.status ?? "status unavailable"}</Badge>
                {model.confidence != null && <Badge variant="outline">{Math.round(model.confidence)}% recorded confidence</Badge>}
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Decision brief</p>
              <h2 className="mt-2 text-xl font-semibold leading-snug">
                {model.recommendation ?? "No recommendation is recorded for this decision."}
              </h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Metric label="Owner / approver" value={model.owner ?? "Not recorded"} />
                <Metric label="Expected outcome" value={model.expectedOutcome ?? "Not recorded"} />
                <Metric label="Actual outcome" value={model.actualOutcome ?? "Not measured"} />
              </div>
            </article>

            <article className="rounded-xl border border-border/50 bg-card p-5 shadow-sm" aria-labelledby="completeness-title">
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 id="completeness-title" className="font-semibold">Evidence completeness</h2>
              </div>
              <p className="mt-2 text-3xl font-semibold">
                {model.completeness.complete}/{model.completeness.total}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Transparent checklist count, not an AI quality score.
              </p>
              <ul className="mt-4 space-y-2">
                {model.completeness.checks.map((check) => (
                  <li key={check.key} className="flex items-start gap-2 text-sm">
                    {check.complete ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                    )}
                    <span>{check.label}</span>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <DecisionEvidenceVisual decisionId={id!} selection={visualSelection} />

          <section className="rounded-xl border border-border/50 bg-card p-5 shadow-sm" aria-labelledby="pipeline-title">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              <div>
                <h2 id="pipeline-title" className="font-semibold">Decision provenance pipeline</h2>
                <p className="text-xs text-muted-foreground">Only stages backed by stored records are marked recorded.</p>
              </div>
            </div>
            <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {model.pipeline.map((stage, index) => (
                <li key={stage.key} className="rounded-lg border border-border/40 p-3">
                  <div className="flex items-center gap-2">
                    {statusIcon(stage.status)}
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{index + 1}</span>
                    <span className="font-medium">{stage.label}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{stage.detail}</p>
                  <p className="mt-2 break-words font-mono text-[10px] text-muted-foreground/70">{stage.source}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-border/50 bg-card p-5 shadow-sm" aria-labelledby="evidence-title">
              <div className="mb-4 flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" aria-hidden="true" />
                <div>
                  <h2 id="evidence-title" className="font-semibold">Evidence & provenance</h2>
                  <p className="text-xs text-muted-foreground">Stored source context only. Missing excerpts are labelled unavailable.</p>
                </div>
              </div>
              {model.supportingEvidence.length > 0 ? (
                <div className="space-y-3">
                  {model.supportingEvidence.map((item) => (
                    <details key={item.id} className="group rounded-lg border border-border/40 p-3">
                      <summary className="cursor-pointer list-none font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <div className="flex items-center justify-between gap-3">
                          <span>{item.label}</span>
                          <Badge variant="outline" className="text-[10px]">{item.sourceType}</Badge>
                        </div>
                        <p className="mt-1 text-sm font-normal text-muted-foreground">{item.value}</p>
                      </summary>
                      <div className="mt-3 border-t border-border/40 pt-3 text-xs text-muted-foreground">
                        <p><span className="font-medium text-foreground">Source:</span> <span className="font-mono">{item.source}</span></p>
                        <p className="mt-1"><span className="font-medium text-foreground">Location:</span> {item.location ?? "Not stored"}</p>
                        <p className="mt-1"><span className="font-medium text-foreground">Original excerpt/value:</span> {item.excerpt ?? "Not stored — Quantivis will not reconstruct one."}</p>
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <EmptyCopy text="No source evidence metadata is stored on this decision." />
              )}
            </article>

            <div className="space-y-4">
              <ListCard
                title="Assumptions"
                icon={<AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />}
                items={model.assumptions}
                empty="No assumptions are recorded."
              />
              <ListCard
                title="Risks & limitations"
                icon={<AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />}
                items={[...model.deterministicRisks, ...model.limitations].filter((item, index, arr) => arr.indexOf(item) === index)}
                empty="No deterministic risks or limitations are recorded."
              />
              <ListCard
                title="Alternatives considered"
                icon={<CircleDashed className="h-5 w-5 text-primary" aria-hidden="true" />}
                items={model.alternatives}
                empty="No alternatives are stored on this decision. Quantivis will not invent them."
              />
            </div>
          </section>

          {model.completeness.missing.length > 0 && (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5" aria-labelledby="missing-title">
              <h2 id="missing-title" className="font-semibold">Missing information before stronger reliance</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These checklist items are absent from the stored decision record. They are not inferred by the AI layer.
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {model.completeness.missing.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-muted/40 p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 break-words text-sm font-medium">{value}</p>
  </div>
);

const EmptyCopy = ({ text }: { text: string }) => (
  <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">{text}</div>
);

const ListCard = ({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  empty: string;
}) => (
  <article className="rounded-xl border border-border/50 bg-card p-5 shadow-sm">
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h2 className="font-semibold">{title}</h2>
    </div>
    {items.length > 0 ? (
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    ) : (
      <EmptyCopy text={empty} />
    )}
  </article>
);

export default ExecutiveDecisionRoom;
