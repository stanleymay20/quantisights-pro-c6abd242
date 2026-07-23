import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  Gauge,
  Globe,
  HandMetal,
  Layers,
  Link2,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { IngestionIntelligenceResult } from "@/lib/ingestion-intelligence";
import type { CrossSheetDiscoveryResult } from "@/lib/cross-sheet-discovery";
import { buildImportRemediationPlan, type RemediationIssue } from "@/lib/ingestion-remediation";

interface Props {
  intelligence: IngestionIntelligenceResult;
  relationships?: CrossSheetDiscoveryResult | null;
}

type PanelTone = "success" | "warning" | "destructive";

function toneClasses(tone: PanelTone) {
  if (tone === "success") {
    return {
      shell: "border-success/50 bg-gradient-to-br from-success/10 to-success/5",
      text: "text-success",
      badge: "bg-success text-success-foreground",
      soft: "border-success/30 bg-success/5",
      bar: "bg-success",
    };
  }
  if (tone === "warning") {
    return {
      shell: "border-warning/50 bg-gradient-to-br from-warning/10 to-warning/5",
      text: "text-warning",
      badge: "bg-warning text-warning-foreground",
      soft: "border-warning/30 bg-warning/5",
      bar: "bg-warning",
    };
  }
  return {
    shell: "border-destructive/50 bg-gradient-to-br from-destructive/10 to-destructive/5",
    text: "text-destructive",
    badge: "bg-destructive text-destructive-foreground",
    soft: "border-destructive/30 bg-destructive/5",
    bar: "bg-destructive",
  };
}

function trustToScore(signal: string): { score: number; label: string; tone: PanelTone } {
  const s = signal.toLowerCase();
  if (s.includes("strong") || s.includes("high")) return { score: 94, label: "High", tone: "success" };
  if (s.includes("moderate") || s.includes("medium")) return { score: 78, label: "Moderate", tone: "warning" };
  if (s.includes("weak") || s.includes("low")) return { score: 58, label: "Low", tone: "destructive" };
  return { score: 70, label: signal || "—", tone: "warning" };
}

export default function MappingIntelligencePanel({ intelligence, relationships }: Props) {
  const dict = intelligence.dictionary;
  const repair = intelligence.repairReport;
  const remediation = useMemo(
    () => buildImportRemediationPlan({
      schema: dict.fields.map((field) => ({
        column: field.name,
        colIdx: field.index,
        inferredType: field.inferredType,
        confidence: Math.round(field.confidence * 100),
        reason: field.description,
        sampleValues: field.sampleValues,
        rulesApplied: field.governanceFlags,
      })),
      diagnostics: repair.diagnostics,
      intelligence,
    }),
    [dict.fields, intelligence, repair.diagnostics],
  );

  const tone: PanelTone = remediation.recommendation === "proceed"
    ? "success"
    : remediation.recommendation === "review"
      ? "warning"
      : "destructive";
  const toneClass = toneClasses(tone);
  const readinessTone: PanelTone = remediation.readiness.total >= 85
    ? "success"
    : remediation.readiness.total >= 65
      ? "warning"
      : "destructive";
  const readinessClass = toneClasses(readinessTone);
  const trust = trustToScore(repair.summary.trustSignal);
  const trustClass = toneClasses(trust.tone);
  const riskLabel = tone === "success" ? "Low" : tone === "warning" ? "Medium" : "High";
  const governanceLabel = dict.summary.piiCount === 0 && dict.summary.reviewRequiredCount === 0
    ? "Compliant"
    : dict.summary.piiCount > 0
      ? "PII Detected"
      : "Review Needed";
  const governanceTone: PanelTone = governanceLabel === "Compliant" ? "success" : "warning";
  const govClass = toneClasses(governanceTone);

  const blockingIssues = remediation.issues.filter((issue) => issue.severity === "critical");
  const warningIssues = remediation.issues.filter((issue) => issue.severity === "warning");
  const topIssues = remediation.issues.filter((issue) => issue.severity !== "info").slice(0, 3);

  // Expected readiness uplift per recommended action
  const uplifts = useMemo(() => {
    const items: { id: string; title: string; uplift: number; reason: string }[] = [];
    if (dict.summary.reviewRequiredCount > 0) {
      items.push({
        id: "review-fields",
        title: `Review ${dict.summary.reviewRequiredCount} flagged field${dict.summary.reviewRequiredCount === 1 ? "" : "s"}`,
        uplift: Math.min(8, dict.summary.reviewRequiredCount * 2),
        reason: "Clearing review flags improves Governance score",
      });
    }
    if (intelligence.columnSimilarity.groups.length > 0) {
      items.push({
        id: "dedupe-columns",
        title: `Resolve ${intelligence.columnSimilarity.groups.length} duplicate column group${intelligence.columnSimilarity.groups.length === 1 ? "" : "s"}`,
        uplift: Math.min(6, intelligence.columnSimilarity.groups.length * 2),
        reason: "Reduces ambiguity in downstream KPIs",
      });
    }
    if (repair.summary.warnings.length > 0) {
      items.push({
        id: "apply-repairs",
        title: `Confirm ${repair.summary.warnings.length} repair warning${repair.summary.warnings.length === 1 ? "" : "s"}`,
        uplift: Math.min(9, repair.summary.warnings.length * 3),
        reason: "Stabilises Repair Stability score",
      });
    }
    if (dict.summary.piiCount > 0) {
      items.push({
        id: "mask-pii",
        title: `Mask or exclude ${dict.summary.piiCount} PII field${dict.summary.piiCount === 1 ? "" : "s"}`,
        uplift: Math.min(8, dict.summary.piiCount * 4),
        reason: "Removes PII exposure penalty",
      });
    }
    return items.slice(0, 4);
  }, [dict.summary, intelligence.columnSimilarity.groups.length, repair.summary.warnings.length]);

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* Executive Command Center */}
        <div className={`rounded-xl border-2 p-5 ${toneClass.shell}`}>
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-2xl bg-background border-2 flex items-center justify-center shrink-0 ${toneClass.text}`}>
              {tone === "success" ? <Rocket className="w-7 h-7" /> : tone === "warning" ? <Eye className="w-7 h-7" /> : <HandMetal className="w-7 h-7" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-bold">
                  Executive Recommendation
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider ${toneClass.badge}`}>
                  {remediation.recommendation === "proceed" ? "READY" : remediation.recommendation === "review" ? "REVIEW" : "BLOCKED"}
                </span>
              </div>
              <p className={`text-xl font-bold mt-0.5 leading-tight ${toneClass.text}`}>{remediation.recommendationLabel}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{remediation.recommendationReason}</p>
            </div>
          </div>

          {/* Command KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 pt-3 border-t border-border/40">
            <CommandKpi
              label="Readiness"
              value={`${remediation.readiness.total}`}
              suffix="/100"
              tone={readinessClass.text}
              bar={remediation.readiness.total}
              barTone={readinessClass.bar}
            />
            <CommandKpi
              label="Trust"
              value={`${trust.score}`}
              suffix={`% · ${trust.label}`}
              tone={trustClass.text}
              bar={trust.score}
              barTone={trustClass.bar}
            />
            <CommandKpi
              label="Risk"
              value={riskLabel}
              tone={toneClass.text}
              icon={<Sparkles className="w-3.5 h-3.5" />}
            />
            <CommandKpi
              label="Governance"
              value={governanceLabel}
              tone={govClass.text}
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
            />
          </div>
        </div>

        {/* Tabbed body */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="quality">
              Quality
              {(blockingIssues.length + warningIssues.length) > 0 && (
                <Badge variant="outline" className="ml-2 text-[10px] h-4 px-1">{blockingIssues.length + warningIssues.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="governance">
              Governance
              {dict.summary.piiCount > 0 && (
                <Badge variant="outline" className="ml-2 text-[10px] h-4 px-1 text-warning">{dict.summary.piiCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-3 mt-3">
            <ExecutiveSummary
              remediation={remediation}
              repair={repair}
              dict={dict}
              relationships={relationships ?? null}
              trust={trust}
              riskLabel={riskLabel}
              governanceLabel={governanceLabel}
            />
            {topIssues.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                  <span className="text-xs font-semibold">Top Issues to Resolve</span>
                </div>
                <div className="space-y-1.5">
                  {topIssues.map((issue) => <IssueRow key={issue.id} issue={issue} />)}
                </div>
              </div>
            )}
            {uplifts.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold">Recommended Actions & Expected Uplift</span>
                </div>
                <div className="space-y-1.5">
                  {uplifts.map((item) => (
                    <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground">{item.reason}</p>
                      </div>
                      <Badge className="bg-success text-success-foreground text-[10px]">+{item.uplift} Readiness</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* QUALITY */}
          <TabsContent value="quality" className="space-y-3 mt-3">
            <ReadinessBreakdown remediation={remediation} />
            <Section
              title="Critical Issues & Suggested Fixes"
              icon={<AlertTriangle className={`w-3.5 h-3.5 ${blockingIssues.length ? "text-destructive" : "text-success"}`} />}
              badge={<Badge variant="outline" className="text-[10px]">{blockingIssues.length} critical · {warningIssues.length} warnings</Badge>}
              defaultOpen
            >
              <div className="space-y-2">
                {remediation.issues.map((issue) => <IssueCard key={issue.id} issue={issue} />)}
              </div>
            </Section>
            <Section
              title="Auto Repairs Applied"
              icon={<Wand2 className="w-3.5 h-3.5 text-primary" />}
              badge={<Badge variant="outline" className="text-[10px]">{repair.summary.repairsApplied}</Badge>}
            >
              <ul className="space-y-1">
                <RepairLine label="Duplicate headers fixed" value={repair.headerRecovery.recoveredCount} />
                <RepairLine label="Mixed-type columns repaired" value={repair.mixedTypes.repairedColumnCount} />
                <RepairLine label="Mixed-type columns needing review" value={repair.mixedTypes.reviewColumnCount} warning />
                <RepairLine label="Column similarity groups" value={intelligence.columnSimilarity.groups.length} />
              </ul>
              {repair.summary.warnings.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
                  {repair.summary.warnings.map((warning) => (
                    <p key={warning} className="text-[11px] text-warning flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      {warning}
                    </p>
                  ))}
                </div>
              )}
            </Section>
            <Section
              title="Locale Detection"
              icon={<Globe className="w-3.5 h-3.5 text-primary" />}
              badge={<Badge variant="outline" className="text-[10px]">{intelligence.locale.locale}</Badge>}
            >
              <p>Confidence: <strong>{Math.round(intelligence.locale.confidence * 100)}%</strong></p>
              <p>Decimal separator: <code className="bg-muted/50 px-1 rounded">{intelligence.locale.decimalSeparator ?? "—"}</code> · Thousands: <code className="bg-muted/50 px-1 rounded">{intelligence.locale.thousandsSeparator ?? "—"}</code></p>
              <p className="text-muted-foreground">{intelligence.locale.reason}</p>
              {intelligence.locale.ambiguous && <p className="text-warning">Locale detection was ambiguous — verify currency/date parsing.</p>}
            </Section>
          </TabsContent>

          {/* GOVERNANCE */}
          <TabsContent value="governance" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <MiniStat label="Metrics" value={dict.summary.metricCount} tone="text-success" />
              <MiniStat label="Dimensions" value={dict.summary.dimensionCount} tone="text-primary" />
              <MiniStat label="Identifiers" value={dict.summary.identifierCount} tone="text-primary" />
              <MiniStat label="PII" value={dict.summary.piiCount} tone={dict.summary.piiCount > 0 ? "text-warning" : "text-muted-foreground"} />
              <MiniStat label="Review" value={dict.summary.reviewRequiredCount} tone={dict.summary.reviewRequiredCount > 0 ? "text-warning" : "text-muted-foreground"} />
            </div>
            <Section
              title="Review Queue"
              icon={<Eye className="w-3.5 h-3.5 text-primary" />}
              badge={<Badge variant="outline" className="text-[10px]">{remediation.reviewQueue.length}</Badge>}
              defaultOpen={remediation.reviewQueue.length > 0}
            >
              {remediation.reviewQueue.length === 0 ? (
                <p className="text-muted-foreground">No fields require manual review.</p>
              ) : (
                <div className="space-y-1.5">
                  {remediation.reviewQueue.map((item) => (
                    <div key={item.column} className="rounded-md border border-border/60 bg-muted/20 p-2 grid grid-cols-[1fr_auto] gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-primary truncate">{item.column}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-1">{item.reason}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.badges.length === 0 ? <span className="text-[10px] text-muted-foreground">No semantic badges</span> : item.badges.map((badge) => (
                            <Badge key={badge} variant="outline" className="text-[10px]">{badge}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{Math.round(item.confidence)}%</p>
                        <p className="text-[10px] text-muted-foreground">→ {item.suggestedTarget ?? "review"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </TabsContent>

          {/* DETAILS */}
          <TabsContent value="details" className="space-y-3 mt-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <RelationshipSection relationships={relationships} />
              <SimilaritySection intelligence={intelligence} />
            </div>
            <Section
              title="Data Dictionary"
              icon={<BookOpen className="w-3.5 h-3.5 text-primary" />}
              badge={<Badge variant="outline" className="text-[10px]">{dict.fieldCount} fields</Badge>}
              defaultOpen
            >
              <DictionaryDrillDown intelligence={intelligence} />
            </Section>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function CommandKpi({
  label,
  value,
  suffix,
  tone,
  bar,
  barTone,
  icon,
}: {
  label: string;
  value: ReactNode;
  suffix?: ReactNode;
  tone: string;
  bar?: number;
  barTone?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/70 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-bold leading-tight ${tone}`}>
        {value}
        {suffix && <span className="text-[11px] text-muted-foreground font-normal ml-1">{suffix}</span>}
      </div>
      {typeof bar === "number" && (
        <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${barTone ?? "bg-primary"} transition-all`} style={{ width: `${Math.max(2, Math.min(100, bar))}%` }} />
        </div>
      )}
    </div>
  );
}

function ExecutiveSummary({
  remediation,
  repair,
  dict,
  relationships,
  trust,
  riskLabel,
  governanceLabel,
}: {
  remediation: ReturnType<typeof buildImportRemediationPlan>;
  repair: IngestionIntelligenceResult["repairReport"];
  dict: IngestionIntelligenceResult["dictionary"];
  relationships: CrossSheetDiscoveryResult | null;
  trust: { score: number; label: string; tone: PanelTone };
  riskLabel: string;
  governanceLabel: string;
}) {
  const qualityLabel = remediation.readiness.total >= 85 ? "Good" : remediation.readiness.total >= 70 ? "Acceptable" : "Needs work";
  const reviewCount = remediation.issues.filter((i) => i.severity !== "info").length;
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <ScrollIcon />
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">Executive Summary</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
        <SummaryStat label="Quality" value={qualityLabel} />
        <SummaryStat label="Readiness" value={`${remediation.readiness.total}/100`} />
        <SummaryStat label="Trust" value={trust.label} />
        <SummaryStat label="Risk" value={riskLabel} />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Dataset contains <strong className="text-foreground">{dict.fieldCount} fields</strong>
        {dict.summary.piiCount > 0 && <> with <strong className="text-warning">{dict.summary.piiCount} PII field{dict.summary.piiCount === 1 ? "" : "s"}</strong></>}.
        Governance status: <strong className="text-foreground">{governanceLabel}</strong>.
        {reviewCount > 0
          ? <> <strong className="text-foreground">{reviewCount}</strong> issue{reviewCount === 1 ? "" : "s"} require review.</>
          : <> No outstanding issues.</>}
        {" "}<strong className="text-foreground">{repair.summary.repairsApplied}</strong> auto-repair{repair.summary.repairsApplied === 1 ? "" : "s"} applied
        {relationships && relationships.relationships.length > 0 && <>, <strong className="text-foreground">{relationships.relationships.length}</strong> cross-sheet relationship{relationships.relationships.length === 1 ? "" : "s"} discovered</>}.
        {" "}Recommendation: <strong className={remediation.recommendation === "proceed" ? "text-success" : "text-warning"}>{remediation.recommendationLabel}</strong>.
      </p>
    </div>
  );
}

function ScrollIcon() {
  return <BookOpen className="w-3.5 h-3.5 text-primary" />;
}

function SummaryStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-background/60 border border-border/40 p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function ReadinessBreakdown({ remediation }: { remediation: ReturnType<typeof buildImportRemediationPlan> }) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Import Readiness Breakdown</span>
        </div>
        <Badge variant="outline" className="text-[10px]">{remediation.readiness.total}/100</Badge>
      </div>
      <div className="space-y-1.5">
        {remediation.readiness.components.map((component) => {
          const width = component.max > 0 ? Math.round((component.score / component.max) * 100) : 0;
          return (
            <div key={component.label} className="grid grid-cols-[140px_1fr_60px] items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{component.label}</span>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-success transition-all" style={{ width: `${Math.max(4, Math.min(100, width))}%` }} />
              </div>
              <span className="text-[11px] font-mono text-right">+{component.score}/{component.max}</span>
            </div>
          );
        })}
        {remediation.readiness.penalties.length > 0 && (
          <div className="pt-2 mt-1 border-t border-border/40 space-y-1">
            {remediation.readiness.penalties.map((penalty) => (
              <div key={penalty.label} className="grid grid-cols-[140px_1fr_60px] items-center gap-2">
                <span className="text-[11px] text-destructive">{penalty.label}</span>
                <span className="text-[10px] text-muted-foreground">{penalty.reason}</span>
                <span className="text-[11px] font-mono text-right text-destructive">−{penalty.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IssueRow({ issue }: { issue: RemediationIssue }) {
  const severity = issue.severity === "critical" ? toneClasses("destructive") : toneClasses("warning");
  return (
    <div className={`flex items-start gap-2 rounded-md border p-2 ${severity.soft}`}>
      <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${severity.text}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{issue.title}{issue.column && <span className="font-mono text-[11px] text-primary ml-1.5">{issue.column}</span>}</p>
        <p className="text-[11px] text-muted-foreground line-clamp-1">{issue.suggestedFix}</p>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 text-left transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        <span className="text-sm font-medium flex-1 flex items-center gap-2">
          {icon}
          {title}
        </span>
        {badge}
      </button>
      {open && <div className="px-4 py-3 text-xs space-y-3">{children}</div>}
    </div>
  );
}

function IssueCard({ issue }: { issue: RemediationIssue }) {
  const severity = issue.severity === "critical" ? toneClasses("destructive") : issue.severity === "warning" ? toneClasses("warning") : toneClasses("success");
  return (
    <div className={`rounded-md border p-3 ${severity.soft}`}>
      <div className="flex items-start gap-2">
        {issue.severity === "info" ? <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${severity.text}`} /> : <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${severity.text}`} />}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] uppercase ${severity.text}`}>{issue.severity}</Badge>
            <p className="text-sm font-semibold">{issue.title}</p>
            {issue.column && <span className="font-mono text-[11px] text-primary">{issue.column}</span>}
          </div>
          <p className="text-xs"><strong>Problem:</strong> <span className="text-muted-foreground">{issue.problem}</span></p>
          <p className="text-xs"><strong>Impact:</strong> <span className="text-muted-foreground">{issue.impact}</span></p>
          <p className="text-xs"><strong>Suggested fix:</strong> <span className="text-muted-foreground">{issue.suggestedFix}</span></p>
          <div className="flex flex-wrap gap-1 pt-1">
            {issue.actions.map((action) => (
              <button
                key={action}
                type="button"
                className="text-[10px] px-2 py-1 rounded border border-border bg-background hover:bg-muted transition-colors"
              >
                {action === "auto_fix" ? "Auto Fix" : action === "review" ? "Review" : "Ignore"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RepairLine({ label, value, warning = false }: { label: string; value: ReactNode; warning?: boolean }) {
  const numeric = typeof value === "number" ? value : undefined;
  const active = typeof numeric === "number" ? numeric > 0 : true;
  return (
    <li className="flex items-center gap-2">
      {warning && active ? <AlertTriangle className="w-3.5 h-3.5 text-warning" /> : <CheckCircle2 className="w-3.5 h-3.5 text-success" />}
      <span className="text-muted-foreground flex-1">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </li>
  );
}

function RelationshipSection({ relationships }: { relationships?: CrossSheetDiscoveryResult | null }) {
  return (
    <Section
      title="Cross-Sheet Relationships"
      icon={<Link2 className="w-3.5 h-3.5 text-primary" />}
      badge={<Badge variant="outline" className="text-[10px]">{relationships?.relationships.length ?? 0}</Badge>}
      defaultOpen
    >
      {!relationships || relationships.relationships.length === 0 ? (
        <div className="space-y-1">
          <p>No relationships discovered.</p>
          <p className="text-muted-foreground">Upload multi-sheet workbooks or linked datasets to enable relationship detection.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {relationships.relationships.map((relationship, index) => (
            <li key={index} className="rounded-md border border-border/60 bg-muted/20 p-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-primary">{relationship.fromSheet}.{relationship.fromColumn}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-mono text-primary">{relationship.toSheet}.{relationship.toColumn}</span>
                <Badge variant="outline" className="text-[10px] ml-auto">{Math.round(relationship.confidence * 100)}%</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{relationship.kind} · {relationship.basis.join(", ")}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function SimilaritySection({ intelligence }: { intelligence: IngestionIntelligenceResult }) {
  const groups = intelligence.columnSimilarity.groups;
  return (
    <Section
      title="Column Similarity Groups"
      icon={<Layers className="w-3.5 h-3.5 text-primary" />}
      badge={<Badge variant="outline" className="text-[10px]">{groups.length}</Badge>}
      defaultOpen
    >
      {groups.length === 0 ? (
        <div className="space-y-1">
          <p>No duplicate or semantically similar columns detected.</p>
          <p className="text-muted-foreground">Column names appear distinct and unambiguous.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {groups.map((group, index) => (
            <li key={group.canonicalName} className="rounded-md border border-border/60 bg-muted/20 p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[11px] text-primary">Group #{index + 1} · {group.canonicalName}</span>
                <Badge variant="outline" className="text-[10px]">{Math.round(group.confidence * 100)}%</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {group.columns.map((column) => (
                  <span key={column} className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border">{column}</span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2 text-center">
      <div className={`text-lg font-bold ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function DictionaryDrillDown({ intelligence }: { intelligence: IngestionIntelligenceResult }) {
  const groups = useMemo(() => {
    const byCategory: Record<string, { name: string; description: string }[]> = {
      Metrics: [],
      Dimensions: [],
      Identifiers: [],
      PII: [],
      Review: [],
    };
    intelligence.dictionary.fields.forEach((field) => {
      if (field.inferredType === "value") byCategory.Metrics.push({ name: field.name, description: field.description });
      if (["segment", "region", "region_code", "date"].includes(field.inferredType)) byCategory.Dimensions.push({ name: field.name, description: field.description });
      if (field.semanticType === "identifier" || field.businessRole === "entity_key") byCategory.Identifiers.push({ name: field.name, description: field.description });
      if (field.semanticType === "pii" || field.governanceFlags.includes("pii")) byCategory.PII.push({ name: field.name, description: field.description });
      if (field.governanceFlags.includes("review_required") || field.confidence < 0.75) byCategory.Review.push({ name: field.name, description: field.description });
    });
    return byCategory;
  }, [intelligence.dictionary.fields]);

  return (
    <div className="space-y-1.5">
      {(Object.keys(groups) as Array<keyof typeof groups>).map((category) => {
        const items = groups[category];
        if (items.length === 0) return null;
        return <DictionaryGroup key={category} title={category} items={items} />;
      })}
    </div>
  );
}

function DictionaryGroup({ title, items }: { title: string; items: { name: string; description: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border/60 bg-background/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/30 transition-colors text-left"
      >
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        <span className="text-xs font-medium flex-1">{title}</span>
        <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
      </button>
      {open && (
        <ul className="px-3 py-2 space-y-1 border-t border-border/40">
          {items.map((item) => (
            <li key={item.name} className="flex items-start gap-2 text-[11px]">
              <span className="font-mono text-primary shrink-0">{item.name}</span>
              <span className="text-muted-foreground line-clamp-1">— {item.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
