import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileSearch,
  Radio,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/trust/CapabilityMatrix";
import ScenarioReadinessPanel from "@/components/scenarios/ScenarioReadiness";
import { getScenarioDecisionFlow } from "@/lib/scenario-template";
import type { ScenarioTemplate } from "@/lib/scenario-template-types";

function Section({
  title,
  icon: Icon,
  children,
  testId,
}: {
  title: string;
  icon: typeof Radio;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section className="rounded-xl border border-border/50 bg-background p-4 sm:p-5" data-testid={testId}>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        {title}
      </h2>
      <div className="mt-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export interface ScenarioOverviewProps {
  template: ScenarioTemplate;
}

/**
 * ST-1 Scenario Detail: Business Context, Typical Signals, Evidence Flow,
 * Decision Flow, Executive Workflow, Expected Outcome, Capabilities Used,
 * Current Platform Support, Known Limitations — all sourced from the
 * template itself and the live Trust Center capability matrix.
 */
export default function ScenarioOverview({ template }: ScenarioOverviewProps) {
  const decisionFlow = getScenarioDecisionFlow();
  const limitations = template.implementation_status.filter((entry) => entry.status !== "Implemented");

  return (
    <div className="space-y-4">
      <Section title="Business Context" icon={Briefcase} testId="scenario-section-business-context">
        <p className="font-medium">{template.executive_summary}</p>
        <p className="mt-2 text-muted-foreground">{template.business_problem}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Category: {template.category}</Badge>
          <Badge variant="outline">Industry: {template.industry.join(", ")}</Badge>
          <Badge variant="outline">
            Illustrative business value: {template.business_impact.band}
          </Badge>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/70">{template.business_impact.rationale}</p>
      </Section>

      <Section title="Typical Signals" icon={Radio} testId="scenario-section-typical-signals">
        <ul className="space-y-1.5">
          {template.typical_signals.map((signal) => (
            <li key={signal} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{signal}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Evidence Flow" icon={FileSearch} testId="scenario-section-evidence-flow">
        <p className="text-muted-foreground">
          The kinds of verified facts this scenario typically relies on before a decision is escalated:
        </p>
        <ul className="mt-2 space-y-1.5">
          {template.verified_facts.map((fact) => (
            <li key={fact} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{fact}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Decision Flow" icon={ArrowRight} testId="scenario-section-decision-flow">
        <p className="text-muted-foreground">
          The same platform pipeline every scenario uses — statuses reflect the real, current implementation.
        </p>
        <ol className="mt-3 space-y-2">
          {decisionFlow.map((stage, index) => (
            <li key={stage.key} className="flex items-start gap-2" data-testid={`decision-flow-${stage.key}`}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                {index + 1}
              </span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{stage.label}</span>
                  <StatusBadge status={stage.status} />
                </div>
                <p className="text-xs text-muted-foreground">{stage.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Executive Workflow" icon={Users} testId="scenario-section-executive-workflow">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expected decisions</p>
        <ul className="mt-1.5 space-y-1.5">
          {template.expected_decisions.map((decision) => (
            <li key={decision} className="flex gap-2">
              <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{decision}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Governance requirements
        </p>
        <ul className="mt-1.5 space-y-1.5">
          {template.governance_requirements.map((req) => (
            <li key={req} className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{req}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            {template.estimated_time_to_decision}
          </Badge>
          {template.recommended_roles.map((role) => (
            <Badge key={role} variant="outline">
              {role}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Expected Outcome" icon={Target} testId="scenario-section-expected-outcome">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expected outcomes</p>
        <ul className="mt-1.5 space-y-1.5">
          {template.expected_outcomes.map((outcome) => (
            <li key={outcome} className="flex gap-2">
              <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{outcome}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Success metrics</p>
        <ul className="mt-1.5 space-y-1.5">
          {template.success_metrics.map((metric) => (
            <li key={metric} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{metric}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Typical risks</p>
        <ul className="mt-1.5 space-y-1.5">
          {template.typical_risks.map((risk) => (
            <li key={risk} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <span>{risk}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Capabilities Used" icon={ShieldCheck} testId="scenario-section-capabilities-used">
        <ul className="space-y-2">
          {template.implementation_status.map((entry) => (
            <li
              key={entry.capability_key}
              className="flex items-start justify-between gap-3 border-b border-border/30 pb-2 last:border-0 last:pb-0"
              data-testid={`capability-used-${entry.capability_key}`}
            >
              <div>
                <p className="text-sm font-medium">{entry.label}</p>
                <p className="text-xs text-muted-foreground">{entry.detail}</p>
              </div>
              <StatusBadge status={entry.status} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Current Platform Support" icon={CheckCircle2} testId="scenario-section-platform-support">
        <ScenarioReadinessPanel template={template} />
      </Section>

      <Section title="Known Limitations" icon={AlertTriangle} testId="scenario-section-known-limitations">
        {limitations.length === 0 ? (
          <p className="text-muted-foreground">
            No known limitations — every capability this scenario requires is fully implemented.
          </p>
        ) : (
          <ul className="space-y-2">
            {limitations.map((entry) => (
              <li key={entry.capability_key} className="flex items-start gap-2" data-testid={`limitation-${entry.capability_key}`}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{entry.label}</span> ({entry.status}): {entry.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
