import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Calendar } from "lucide-react";

/**
 * Attested Evidence — verifiable architectural facts about the platform.
 * Each metric reflects a checkable property of the codebase or deployed system.
 * Reviewed monthly; last review date below.
 */

interface EvidenceMetric {
  label: string;
  value: string;
  basis: string;
}

const METRICS: EvidenceMetric[] = [
  {
    label: "Public-schema tables with RLS",
    value: "Implemented",
    basis: "RLS controls are implemented; current table-level evidence is available under NDA.",
  },
  {
    label: "Audit log mutability",
    value: "0%",
    basis: "Database-level DENY policies on UPDATE/DELETE for audit_log.",
  },
  {
    label: "Decisions with named human approver",
    value: "Control defined",
    basis: "decision_ledger NOT NULL constraint on approver_id at 'approved' state.",
  },
  {
    label: "Insights with evidence_sources",
    value: "Control defined",
    basis: "Required JSONB column; insights without provenance rejected at write time.",
  },
  {
    label: "Confidence capping by sample size",
    value: "Enforced",
    basis: "applyAdaptiveConfidence in ml-engine.ts: <12 pts → 60%, <30 → 75%, 30+ → 90%.",
  },
  {
    label: "Calibration cadence",
    value: "Every 12h",
    basis: "pg_cron job 'bayesian-calibration' with cron_run_log audit trail.",
  },
  {
    label: "Autonomous orchestration jobs",
    value: "6 monitored",
    basis: "The public status page reports successful-run evidence for six scheduled workflows.",
  },
  {
    label: "Edge functions with CORS + correlation_id",
    value: "Shared controls",
    basis: "Shared CORS and correlation helpers are implemented; coverage evidence is reviewed separately.",
  },
  {
    label: "PII redaction before LLM",
    value: "Default on",
    basis: "ai_raw_text_enabled flag; redaction layer applied unless explicitly disabled per org.",
  },
  {
    label: "EU data residency",
    value: "Primary stores",
    basis: "AWS EU-West-1 / Supabase EU (Frankfurt) for all primary data.",
  },
  {
    label: "Sub-processor agreements",
    value: "Available on request",
    basis: "Current DPA and transfer documentation is provided during enterprise diligence.",
  },
  {
    label: "Disclaimer coverage (advisory surfaces)",
    value: "Implemented",
    basis: "Disclaimer controls are implemented on designated advisory surfaces; current coverage can be reviewed.",
  },
];

const ATTESTED_DATE = "May 26, 2026";

const AttestedEvidence = () => {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Attested Evidence</h2>
          </div>
          <Badge variant="outline" className="text-[10px]">
            <Calendar className="w-3 h-3 mr-1" />
            Reviewed {ATTESTED_DATE}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Verifiable architectural facts about the platform. Each metric reflects a property
          enforced by code, schema constraints, or deployed configuration — not policy intent.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {METRICS.map((m) => (
            <div
              key={m.label}
              className="p-3 rounded-md border border-border/40 bg-background/40"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <span className="text-sm font-semibold text-primary tabular-nums">{m.value}</span>
              </div>
              <p className="text-[10px] text-muted-foreground/70 mt-1 leading-relaxed">
                {m.basis}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default AttestedEvidence;
