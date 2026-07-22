import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Circle,
  Download,
  FileCode,
  FileSearch,
  Gauge,
  Hash,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { evidencePackToHtml, evidencePackToJSON } from "@/lib/evidence-pack";
import type {
  EvidencePack,
  EvidencePackAuditEntry,
  EvidencePackGovernanceItem,
  EvidencePackSection,
  EvidencePackSectionStatus,
  EvidencePackTimelineStep,
} from "@/lib/evidence-pack-types";

export interface EvidencePackPreviewProps {
  pack: EvidencePack;
  className?: string;
}

const STATUS_BADGE: Record<EvidencePackSectionStatus, string> = {
  complete: "border-success/30 bg-success/10 text-success",
  partial: "border-warning/30 bg-warning/10 text-warning",
  unavailable: "border-destructive/30 bg-destructive/10 text-destructive",
  not_applicable: "border-border bg-muted text-muted-foreground",
};

function StatusBadge({ status }: { status: EvidencePackSectionStatus }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wide", STATUS_BADGE[status])}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function SectionCard({
  section,
  icon: Icon,
  children,
  testId,
}: {
  section: EvidencePackSection;
  icon: typeof Gauge;
  children?: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      className="rounded-xl border border-border/50 bg-background p-4"
      data-testid={testId}
      data-status={section.status}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          {section.title}
        </h3>
        <StatusBadge status={section.status} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{section.summary}</p>
      <p className="mt-2 text-[11px] text-muted-foreground/70">Source: {section.source}</p>
      {children}
    </div>
  );
}

function TimelineList({ steps }: { steps: EvidencePackTimelineStep[] }) {
  return (
    <ol className="mt-3 space-y-2">
      {steps.map((step) => (
        <li key={step.key} className="flex items-start gap-2 text-sm" data-testid={`timeline-step-${step.key}`}>
          {step.status === "recorded" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          ) : step.status === "pending" ? (
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          ) : (
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
          )}
          <span>
            <span className="font-medium">{step.label}</span>
            <span className="block text-xs text-muted-foreground">
              {step.detail}
              {step.timestamp ? ` (${new Date(step.timestamp).toLocaleString()})` : ""}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function GovernanceList({ items }: { items: EvidencePackGovernanceItem[] }) {
  return (
    <ul className="mt-3 space-y-1.5 text-xs">
      {items.map((item) => (
        <li key={item.key} className="flex items-start gap-2">
          {item.passed ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          )}
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{item.label}:</span> {item.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AuditList({ entries }: { entries: EvidencePackAuditEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5 text-xs">
      {entries.map((entry, index) => (
        <li key={`${entry.action_type}-${entry.occurred_at}-${index}`} className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{entry.action_type}</span> —{" "}
            {new Date(entry.occurred_at).toLocaleString()}
            {entry.actor_id ? ` by ${entry.actor_id}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * EP-1 Evidence Pack preview: a curated, human-readable read of the full
 * Evidence Pack data model, plus deterministic JSON / printable HTML export.
 */
export default function EvidencePackPreview({ pack, className }: EvidencePackPreviewProps) {
  const s = pack.sections;
  const governanceItems = (s.governance_checklist.data.items as unknown as EvidencePackGovernanceItem[]) ?? [];
  const timelineSteps = (s.decision_timeline.data.steps as unknown as EvidencePackTimelineStep[]) ?? [];
  const auditEntries = (s.audit_trail.data.entries as unknown as EvidencePackAuditEntry[]) ?? [];

  return (
    <div className={cn("space-y-4", className)} data-testid="evidence-pack-preview">
      {pack.is_simulation && (
        <div
          className="rounded-lg border border-warning/40 bg-warning/[0.06] p-3 text-sm text-warning"
          data-testid="evidence-pack-simulation-banner"
        >
          Simulation Evidence Pack — built from demo data. This is not an audit artifact.
        </div>
      )}

      <Card data-testid="evidence-pack-executive-summary">
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
              Executive Summary
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              Generated {new Date(pack.generated_at).toLocaleString()}
            </span>
          </div>
          <CardTitle className="text-xl leading-snug">
            {(s.decision_summary.data.recommended_action as string | null) || "Decision"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{s.decision_summary.summary}</p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              Impact
            </p>
            <p className="mt-1 text-sm font-semibold">{s.business_impact.summary}</p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Gauge className="h-3.5 w-3.5 text-primary" />
              Confidence
            </p>
            <p className="mt-1 text-sm font-semibold">{s.confidence.summary}</p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-primary" />
              Risk
            </p>
            <p className="mt-1 text-sm font-semibold">{(s.risk_assessment.data.risk_level as string) ?? "Unknown"}</p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <FileSearch className="h-3.5 w-3.5 text-primary" />
              Evidence quality
            </p>
            <p className="mt-1 text-sm font-semibold">
              {(s.evidence_summary.data.evidence_status as string) ?? "not available"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard section={s.evidence_summary} icon={FileSearch} testId="evidence-pack-evidence-quality">
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <StatusBadge status={s.verified_facts.status} />
            <span className="text-muted-foreground">Verified Facts</span>
            <StatusBadge status={s.supporting_signals.status} />
            <span className="text-muted-foreground">Supporting Signals</span>
            <StatusBadge status={s.contradictions.status} />
            <span className="text-muted-foreground">Contradictions</span>
          </div>
        </SectionCard>

        <SectionCard section={s.decision_recommendation} icon={FileCode} testId="evidence-pack-decision">
          <p className="mt-2 text-xs text-muted-foreground">{s.business_context.summary}</p>
        </SectionCard>
      </div>

      <SectionCard section={s.decision_timeline} icon={CalendarClock} testId="evidence-pack-timeline">
        <TimelineList steps={timelineSteps} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard section={s.business_impact} icon={TrendingUp} testId="evidence-pack-business-impact">
          <p className="mt-2 text-xs text-muted-foreground">{s.outcome_prediction.summary}</p>
        </SectionCard>

        <SectionCard section={s.approval_information} icon={ShieldCheck} testId="evidence-pack-approval">
          <GovernanceList items={governanceItems} />
        </SectionCard>
      </div>

      <SectionCard section={s.audit_trail} icon={ShieldCheck} testId="evidence-pack-audit">
        <AuditList entries={auditEntries} />
      </SectionCard>

      <Card data-testid="evidence-pack-hashes">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide gap-1.5">
              <Hash className="h-3 w-3" />
              Hashes
            </Badge>
          </div>
          <p className="break-all font-mono text-xs text-muted-foreground" data-testid="evidence-pack-hash-value">
            {pack.evidence_pack_hash}
          </p>
          <p className="text-xs text-muted-foreground">{s.digital_signature.summary}</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              downloadBlob(evidencePackToJSON(pack), `evidence-pack-${pack.decision_id}.json`, "application/json")
            }
            data-testid="export-json-button"
          >
            <Download className="h-3.5 w-3.5" />
            Download JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              downloadBlob(evidencePackToHtml(pack), `evidence-pack-${pack.decision_id}.html`, "text/html")
            }
            data-testid="export-html-button"
          >
            <Download className="h-3.5 w-3.5" />
            Download Printable HTML
          </Button>
        </CardContent>
      </Card>

      <Separator />
      <p className="text-xs text-muted-foreground">
        PDF export and cryptographic signing are not yet available — see the Digital Signature section above.
      </p>
    </div>
  );
}
