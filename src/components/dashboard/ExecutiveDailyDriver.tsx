import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, MessageSquareText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useExecutiveIntelligence } from "@/hooks/useExecutiveIntelligence";
import type { MetricTypeSummary } from "@/hooks/useMetrics";
import type { Insight } from "@/hooks/useInsights";

interface PendingDecision {
  id: string;
  recommended_action: string;
  decision_type: string;
  capped_confidence: number | null;
  created_at: string;
}

interface DecisionValueAttribution {
  decision_id: string;
  currency: string;
  modeled_cost: number | null;
  modeled_roi: number | null;
  verified_value_at_risk: number | null;
  realized_net_value: number | null;
  attribution_status: "modeled" | "verified" | "measured";
}

interface Props {
  displayName: string;
  orgId: string | null;
  datasetId: string | null;
  insights: Insight[];
  topMetrics: MetricTypeSummary[];
  pendingDecisions: number;
}

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
};

const words = (text: string, max: number) => {
  const parts = text.trim().split(/\s+/);
  return parts.length <= max ? text : `${parts.slice(0, max).join(" ")}…`;
};

const ageLabel = (createdAt: string) => {
  const ageMs = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const hours = Math.floor(ageMs / 3_600_000);
  if (hours < 1) return "Created recently";
  if (hours < 24) return `Created ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Created ${days}d ago`;
};

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

function valueLabel(attribution?: DecisionValueAttribution) {
  if (!attribution) {
    return { label: "Value evidence", value: "Pending", note: "No monetary claim yet" };
  }
  if (attribution.attribution_status === "measured" && attribution.realized_net_value != null) {
    return {
      label: "Measured net value",
      value: money(attribution.realized_net_value, attribution.currency),
      note: "Observed after the decision",
    };
  }
  if (attribution.attribution_status === "verified" && attribution.verified_value_at_risk != null) {
    return {
      label: "Verified exposure",
      value: money(attribution.verified_value_at_risk, attribution.currency),
      note: "Evidence-backed exposure",
    };
  }
  if (attribution.modeled_roi != null) {
    return {
      label: "Modeled ROI",
      value: money(attribution.modeled_roi, attribution.currency),
      note: "Scenario estimate — not verified",
    };
  }
  if (attribution.modeled_cost != null) {
    return {
      label: "Modeled action cost",
      value: money(attribution.modeled_cost, attribution.currency),
      note: "Scenario estimate — not verified",
    };
  }
  return { label: "Value evidence", value: "Pending", note: "No monetary claim yet" };
}

export default function ExecutiveDailyDriver({
  displayName,
  orgId,
  datasetId,
  insights,
  topMetrics,
  pendingDecisions,
}: Props) {
  const navigate = useNavigate();
  const {
    brief,
    interventions,
    degradedSurfaces,
  } = useExecutiveIntelligence();
  const [decisions, setDecisions] = useState<PendingDecision[]>([]);
  const [attributions, setAttributions] = useState<Record<string, DecisionValueAttribution>>({});
  const [decisionLoadError, setDecisionLoadError] = useState<string | null>(null);
  const [valueLoadError, setValueLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !datasetId) {
      setDecisions([]);
      setAttributions({});
      setDecisionLoadError(null);
      setValueLoadError(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setDecisionLoadError(null);
      setValueLoadError(null);

      const { data, error } = await (supabase as any)
        .from("decision_ledger")
        .select("id,recommended_action,decision_type,capped_confidence,created_at")
        .eq("organization_id", orgId)
        .eq("dataset_id", datasetId)
        .eq("is_suppressed", false)
        .in("decision_status", ["pending", "active"])
        .order("created_at", { ascending: false })
        .limit(3);

      if (cancelled) return;
      if (error) {
        console.error("[ExecutiveDailyDriver] decision load failed", error);
        setDecisions([]);
        setAttributions({});
        setDecisionLoadError(error.message ?? "Priority decisions could not be verified.");
        return;
      }

      const rows = (data ?? []) as PendingDecision[];
      setDecisions(rows);
      setDecisionLoadError(null);
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) {
        setAttributions({});
        setValueLoadError(null);
        return;
      }

      const { data: values, error: valueError } = await (supabase as any)
        .from("decision_value_attributions")
        .select("decision_id,currency,modeled_cost,modeled_roi,verified_value_at_risk,realized_net_value,attribution_status")
        .eq("organization_id", orgId)
        .in("decision_id", ids);

      if (cancelled) return;
      if (valueError) {
        console.warn("[ExecutiveDailyDriver] decision value unavailable", valueError);
        setAttributions({});
        setValueLoadError(valueError.message ?? "Decision value evidence could not be verified.");
        return;
      }

      setValueLoadError(null);
      setAttributions(
        Object.fromEntries(
          ((values ?? []) as DecisionValueAttribution[]).map((row) => [row.decision_id, row]),
        ),
      );
    };

    void load();
    return () => { cancelled = true; };
  }, [datasetId, orgId]);

  const criticalInterventions = useMemo(
    () => interventions.filter((item) => !item.resolved_at && item.escalation_tier === "critical"),
    [interventions],
  );

  const highInterventions = useMemo(
    () => interventions.filter((item) => !item.resolved_at && item.escalation_tier === "high"),
    [interventions],
  );

  const valueSummary = useMemo(() => {
    if (valueLoadError) {
      return { label: "Decision value", value: "Unavailable", note: "Could not verify value evidence" };
    }
    const rows = Object.values(attributions);
    const currencies = new Set(rows.map((row) => row.currency));
    if (rows.length === 0) return { label: "Decision value", value: "Evidence pending", note: "No monetary claim yet" };
    if (currencies.size !== 1) return { label: "Decision value", value: "Multiple currencies", note: "Open decisions for detail" };
    const currency = rows[0].currency;
    const measured = rows.filter((row) => row.attribution_status === "measured" && row.realized_net_value != null);
    if (measured.length > 0) {
      return {
        label: "Measured decision value",
        value: money(measured.reduce((sum, row) => sum + Number(row.realized_net_value ?? 0), 0), currency),
        note: `${measured.length} measured decision${measured.length === 1 ? "" : "s"}`,
      };
    }
    const verified = rows.filter((row) => row.attribution_status === "verified" && row.verified_value_at_risk != null);
    if (verified.length > 0) {
      return {
        label: "Verified exposure",
        value: money(verified.reduce((sum, row) => sum + Number(row.verified_value_at_risk ?? 0), 0), currency),
        note: "Evidence-backed",
      };
    }
    const modeled = rows.filter((row) => row.modeled_roi != null);
    if (modeled.length > 0) {
      return {
        label: "Modeled ROI",
        value: money(modeled.reduce((sum, row) => sum + Number(row.modeled_roi ?? 0), 0), currency),
        note: "Scenario only — not verified",
      };
    }
    return { label: "Decision value", value: "Evidence pending", note: "No monetary claim yet" };
  }, [attributions, valueLoadError]);

  const firstDecision = decisions[0];
  const date = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const degraded = degradedSurfaces.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-3 py-4 sm:px-6 sm:py-6">
      <section className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-5 sm:p-7" aria-labelledby="executive-focus-heading">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="outline" className="mb-3 text-[10px] uppercase tracking-wider">Executive focus</Badge>
            <h1 id="executive-focus-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Good {greeting()}, {displayName}.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{date}</p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              {decisionLoadError
                ? "Priority decisions could not be verified. Quantivis is withholding the executive all-clear until the decision ledger is available."
                : firstDecision
                  ? `${decisions.length} priority decision${decisions.length === 1 ? "" : "s"} are ready for executive review. Start with the highest-ranked item below.`
                  : "No priority decision is waiting right now. Review the executive brief for emerging risks, opportunities and measured outcomes."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(firstDecision ? "/decisions?review=top" : "/executive-brief")}>
              {firstDecision ? "Review top decision" : "Open executive brief"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => navigate("/app/copilot")}>
              <MessageSquareText className="mr-2 h-4 w-4" />
              Ask Quantivis
            </Button>
          </div>
        </div>
      </section>

      {(degraded || decisionLoadError || valueLoadError) && (
        <section className="rounded-xl border border-destructive/30 bg-destructive/[0.04] p-4" aria-live="polite">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <p className="text-sm font-semibold">Executive evidence coverage is degraded</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {decisionLoadError
                  ? "Priority decision evidence is unavailable, so Quantivis is not presenting a no-action-required state."
                  : valueLoadError
                    ? "Decision value evidence is unavailable. Decision workflow remains visible, but monetary evidence is explicitly unverified."
                    : `${degradedSurfaces.length} source surface${degradedSurfaces.length === 1 ? " is" : "s are"} unhealthy. Decisions remain available, but the brief may be incomplete rather than a genuine all-clear.`}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Executive status">
        <Card><CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Awaiting review</p>
          <p className="mt-1 text-2xl font-semibold">{pendingDecisions}</p>
          <p className="mt-1 text-xs text-muted-foreground">Governed decisions</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Critical interventions</p>
          <p className="mt-1 text-2xl font-semibold">{criticalInterventions.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{highInterventions.length} additional high-priority</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{valueSummary.label}</p>
          <p className="mt-1 truncate text-xl font-semibold">{valueSummary.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{valueSummary.note}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Evidence in view</p>
          <p className="mt-1 text-2xl font-semibold">{insights.length + topMetrics.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Insights + active metrics</p>
        </CardContent></Card>
      </section>

      <section className="rounded-2xl border border-border/50 bg-background p-5 sm:p-6" aria-labelledby="priority-decisions-heading">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">What needs attention</p>
            <h2 id="priority-decisions-heading" className="mt-1 text-xl font-semibold">Priority decisions</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/decisions")}>View all</Button>
        </div>

        <div className="mt-4 space-y-3">
          {decisionLoadError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/[0.03] p-8 text-center" role="alert">
              <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
              <p className="mt-3 text-sm font-semibold">Priority decisions are currently unverified</p>
              <p className="mt-1 text-xs text-muted-foreground">The decision-ledger query failed. This is an unknown state, not a verified zero.</p>
            </div>
          ) : decisions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <CheckCircle2 className="mx-auto h-6 w-6 text-success" />
              <p className="mt-3 text-sm font-semibold">No priority decisions waiting</p>
              <p className="mt-1 text-xs text-muted-foreground">Quantivis will surface the next governed decision here when evidence crosses your thresholds.</p>
            </div>
          ) : decisions.map((decision, index) => {
            const value = valueLoadError ? { label: "Value evidence", value: "Unavailable", note: "Could not verify monetary evidence" } : valueLabel(attributions[decision.id]);
            return (
              <div key={decision.id} className={`rounded-xl border p-4 ${index === 0 ? "border-primary/30 bg-primary/[0.02]" : "border-border/50"}`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={index === 0 ? "default" : "outline"}>Decision {index + 1}</Badge>
                      <Badge variant="outline" className="capitalize">{decision.decision_type.replace(/_/g, " ")}</Badge>
                      {decision.capped_confidence != null && (
                        <span className="text-xs text-muted-foreground">{Math.round(decision.capped_confidence)}% decision-time confidence</span>
                      )}
                    </div>
                    <p className="mt-3 text-sm font-semibold leading-6">{words(decision.recommended_action, 22)}</p>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{ageLabel(decision.created_at)}</span>
                      <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Governed review required</span>
                    </div>
                  </div>
                  <div className="min-w-[180px] rounded-lg border border-border/40 bg-muted/20 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{value.label}</p>
                    <p className="mt-1 text-base font-semibold">{value.value}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{value.note}</p>
                  </div>
                  <Button variant={index === 0 ? "default" : "outline"} onClick={() => navigate(index === 0 ? "/decisions?review=top" : "/decisions")}>
                    Review
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Card><CardContent className="p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Why it matters</p>
          <p className="mt-2 text-sm font-medium leading-6">
            {brief?.summary_json?.why_it_matters || "Executive intelligence is being assembled from your organisation's current evidence."}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {brief?.summary_json?.likely_business_impact || "No business-impact claim is made until supporting evidence is available."}
          </p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Next step</p>
          <p className="mt-2 text-sm font-medium leading-6">
            {decisionLoadError
              ? "Restore decision-ledger availability before treating the executive queue as clear."
              : firstDecision
                ? words(firstDecision.recommended_action, 24)
                : "Review emerging intelligence and recent measured outcomes."}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => navigate("/executive-brief")}>Open full executive brief</Button>
        </CardContent></Card>
      </section>
    </div>
  );
}
