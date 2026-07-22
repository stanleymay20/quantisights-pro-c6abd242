// Post-upload summary surfaced on the "done" step. Aggregates the data the
// ingestion pipeline already produced: industry classification, dataset health,
// PII risk, schema drift versus prior version, and Phase 8 semantic intelligence
// (trust grade, executive routing, entities, anomalies, copilot brief).

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  ShieldCheck,
  Database,
  AlertTriangle,
  Sparkles,
  GitBranch,
  Award,
  Users,
  Network,
  Brain,
} from "lucide-react";
import type { DatasetClassification, DatasetDiagnostics } from "@/lib/data-upload-utils";
import { inferSchema } from "@/lib/data-upload-utils";
import type { DriftReport } from "@/lib/schema-evolution";
import { summarizeDrift } from "@/lib/schema-evolution";
import { buildCopilotBrief } from "@/lib/semantic/data-copilot";
import type { TrustGrade } from "@/lib/semantic/trust-score";
import { buildIngestionIntelligence } from "@/lib/ingestion-intelligence";
import IngestionIntelligenceCard from "@/components/upload/IngestionIntelligenceCard";

interface Props {
  rowsImported: number;
  healthScore: number;
  classification: DatasetClassification | null;
  diagnostics: DatasetDiagnostics | null;
  drift: DriftReport | null;
  headers?: string[];
  sampleRows?: Array<Record<string, unknown> | unknown[]>;
  hasLineage?: boolean;
}

function healthTone(score: number): { color: string; label: string } {
  if (score >= 85) return { color: "text-success", label: "Excellent" };
  if (score >= 70) return { color: "text-success", label: "Good" };
  if (score >= 50) return { color: "text-warning", label: "Fair" };
  return { color: "text-destructive", label: "Needs Attention" };
}

type PiiLevel = DatasetDiagnostics["piiRisk"]["level"];

function recommendedAction(
  health: number,
  drift: DriftReport | null,
  piiLevel: PiiLevel | undefined,
): { label: string; tone: "success" | "warning" | "destructive" } {
  if (piiLevel === "high") {
    return { label: "Review PII before publishing", tone: "destructive" };
  }
  if (drift && !drift.backwardCompatible) {
    return { label: "Resolve breaking schema changes", tone: "warning" };
  }
  if (health < 50) {
    return { label: "Clean data before executive use", tone: "warning" };
  }
  return { label: "Ready for Executive Analysis", tone: "success" };
}

const TRUST_TONE: Record<TrustGrade, string> = {
  "A+": "bg-success/15 text-success border-success/30",
  A: "bg-success/10 text-success border-success/20",
  B: "bg-primary/10 text-primary border-primary/20",
  C: "bg-warning/10 text-warning border-warning/20",
  D: "bg-destructive/10 text-destructive border-destructive/20",
};

function normalizeSampleRows(
  input: Array<Record<string, unknown> | unknown[]> | undefined,
  headers: string[] | undefined,
): string[][] {
  if (!input || !headers || headers.length === 0) return [];

  return input.map((row) => {
    if (Array.isArray(row)) {
      return row.map((value) => String(value ?? ""));
    }

    return headers.map((header) => String(row?.[header] ?? ""));
  });
}

export default function PostUploadSummary({
  rowsImported,
  healthScore,
  classification,
  diagnostics,
  drift,
  headers,
  sampleRows,
  hasLineage,
}: Props) {
  const tone = healthTone(healthScore);
  const piiLevel = diagnostics?.piiRisk?.level;
  const action = recommendedAction(healthScore, drift, piiLevel);
  const piiLabel = piiLevel
    ? piiLevel.charAt(0).toUpperCase() + piiLevel.slice(1)
    : "Unknown";

  // Phase 8 — Semantic Business Intelligence brief. Memoized so it only
  // recomputes when the underlying ingestion artifacts change.
  const brief = useMemo(() => {
    if (!headers || headers.length === 0) return null;
    return buildCopilotBrief({
      headers,
      sampleRows: sampleRows ?? [],
      diagnostics,
      drift,
      hasLineage: !!hasLineage,
    });
  }, [headers, sampleRows, diagnostics, drift, hasLineage]);

  // Ingestion repair intelligence — uses the same post-upload artifacts already
  // available to this component, so it does not disturb the upload/import flow.
  const ingestionIntelligence = useMemo(() => {
    const rows = normalizeSampleRows(sampleRows, headers);
    if (!headers || headers.length === 0 || rows.length === 0) return null;

    const schema = inferSchema(headers, rows);
    return buildIngestionIntelligence({
      headers,
      rows,
      schema,
      diagnostics,
    });
  }, [headers, sampleRows, diagnostics]);

  return (
    <Card className="overflow-hidden border-primary/20">
      <div className="bg-gradient-to-r from-primary/5 to-primary/0 p-5 border-b border-border/30 flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-primary" />
        <div className="flex-1">
          <h3 className="font-semibold tracking-tight">Post-Upload Summary</h3>
          <p className="text-xs text-muted-foreground">
            Snapshot recorded in dataset registry, schema log, lineage, and audit trail.
          </p>
        </div>
        {brief && (
          <Badge variant="outline" className={`${TRUST_TONE[brief.trust.grade]} font-mono px-3 py-1`}>
            <Award className="w-3.5 h-3.5 mr-1" />
            Trust {brief.trust.grade} · {brief.trust.score}
          </Badge>
        )}
      </div>
      <CardContent className="p-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Tile
            icon={<Activity className="w-3.5 h-3.5" />}
            label="Dataset Health"
            value={`${healthScore}%`}
            valueClass={tone.color}
            sub={tone.label}
          />
          <Tile
            icon={<Database className="w-3.5 h-3.5" />}
            label="Industry"
            value={brief?.detectedIndustry?.label ?? classification?.type ?? "—"}
            sub={
              brief?.detectedIndustry
                ? `${Math.round(brief.detectedIndustry.confidence * 100)}% confidence`
                : classification && classification.confidence > 0
                  ? `${Math.round(classification.confidence)}% confidence`
                  : undefined
            }
          />
          <Tile
            icon={<Database className="w-3.5 h-3.5" />}
            label="Rows"
            value={rowsImported.toLocaleString()}
          />
          <Tile
            icon={<GitBranch className="w-3.5 h-3.5" />}
            label="Schema Drift"
            value={drift ? `${drift.totalChanges}` : "0"}
            sub={drift ? summarizeDrift(drift) : "No prior version"}
          />
          <Tile
            icon={
              piiLevel === "high" ? (
                <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )
            }
            label="PII Risk"
            value={piiLabel}
            valueClass={
              piiLevel === "high"
                ? "text-destructive"
                : piiLevel === "low"
                  ? "text-warning"
                  : "text-success"
            }
          />
        </div>

        {ingestionIntelligence && (
          <IngestionIntelligenceCard intelligence={ingestionIntelligence} />
        )}

        {brief && (
          <>
            {/* Recommended dashboards + KPI category counts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  <Brain className="w-3.5 h-3.5" />
                  Recommended Dashboards
                </div>
                {brief.routing.recommendedDashboards.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No canonical executive KPIs detected.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {brief.routing.recommendedDashboards.map((d) => (
                      <Badge
                        key={d.role}
                        variant="outline"
                        className="bg-primary/5 border-primary/20 text-primary text-[11px]"
                        title={d.reason}
                      >
                        {d.role} · {Math.round(d.confidence * 100)}%
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  KPI Categories Detected
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  {Object.entries(brief.kpiCounts).map(([cat, count]) => (
                    <div
                      key={cat}
                      className="flex items-center justify-between rounded bg-background/60 px-2 py-1"
                    >
                      <span className="capitalize text-muted-foreground">{cat}</span>
                      <span className="font-mono font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Entities + Anomalies */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  <Users className="w-3.5 h-3.5" />
                  Detected Entities
                  <Network className="w-3 h-3 ml-1 text-muted-foreground" />
                </div>
                {brief.entities.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No canonical entities resolved.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {brief.entities.slice(0, 8).map((e) => (
                        <Badge
                          key={e.entity}
                          variant="outline"
                          className="text-[11px]"
                          title={e.evidence}
                        >
                          {e.entity}
                        </Badge>
                      ))}
                    </div>
                    {brief.relationships.lineage.length > 0 && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        Lineage: {brief.relationships.lineage.slice(0, 3).join(" · ")}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Anomaly Summary
                </div>
                {brief.anomalies.anomalies.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No anomalies detected in sample.
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">
                      {brief.anomalies.summary}
                    </p>
                    {brief.anomalies.anomalies.slice(0, 3).map((a, i) => (
                      <p key={i} className="text-[11px]">
                        <span className="font-mono">{a.column}</span>:{" "}
                        <span className="text-muted-foreground">{a.explanation}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Copilot recommendations */}
            {brief.recommendedAnalyses.length > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-primary mb-2">
                  <Brain className="w-3.5 h-3.5" />
                  Data Copilot — Recommended Analyses
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {brief.recommendedAnalyses.map((a) => (
                    <Badge key={a} variant="outline" className="text-[11px] bg-background/60">
                      {a}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="p-3 rounded-lg border bg-muted/20 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Recommended Action
            </p>
            <p className="text-sm font-semibold text-foreground">{action.label}</p>
          </div>
          <Badge
            variant="outline"
            className={
              action.tone === "success"
                ? "bg-success/10 text-success border-success/20"
                : action.tone === "warning"
                  ? "bg-warning/10 text-warning border-warning/20"
                  : "bg-destructive/10 text-destructive border-destructive/20"
            }
          >
            {action.tone === "success" ? "Approved" : "Action Needed"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({
  icon,
  label,
  value,
  valueClass = "text-foreground",
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <p className={`text-base font-semibold font-mono ${valueClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  );
}
