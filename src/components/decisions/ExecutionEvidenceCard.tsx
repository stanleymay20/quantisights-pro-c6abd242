import { AlertTriangle, CheckCircle2, CircleHelp, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvidencePack } from "@/lib/evidence-pack-types";

type Verification = "verified" | "mismatch" | "not_recorded";

interface ExecutionReceiptEvidenceView {
  receipt_id: string;
  action_type: string;
  current_status: string;
  created_at: string;
  provider_observation: {
    observed_status: string | null;
    response_status: number | null;
    stored_digest: string | null;
    recomputed_digest: string | null;
    verification: Verification;
    external_reference: string | null;
  };
  reconciliation: null | {
    reconciled_at: string;
    reconciled_by: string | null;
    resolution: string;
    note: string | null;
    external_reference: string | null;
    source_evidence: {
      version: string | null;
      stored_digest: string | null;
      recomputed_digest: string | null;
      verification: Verification;
    };
    derived_evidence_hash: string;
  };
}

function VerificationBadge({ verification, label }: { verification: Verification; label?: string }) {
  if (verification === "verified") {
    return (
      <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success">
        <CheckCircle2 className="h-3 w-3" /> {label ?? "Verified"}
      </Badge>
    );
  }
  if (verification === "mismatch") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive">
        <AlertTriangle className="h-3 w-3" /> {label ?? "Digest mismatch"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <CircleHelp className="h-3 w-3" /> {label ?? "Not recorded"}
    </Badge>
  );
}

export default function ExecutionEvidenceCard({ pack }: { pack: EvidencePack }) {
  const section = pack.sections.runtime_metadata;
  const receipts = Array.isArray(section.data.receipts)
    ? (section.data.receipts as unknown as ExecutionReceiptEvidenceView[])
    : [];
  const readFailed = section.data.execution_receipts_read_failed === true;

  return (
    <Card data-testid="evidence-pack-execution-evidence">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline" className="w-fit gap-1.5 text-[10px] uppercase tracking-wide">
            <ShieldCheck className="h-3 w-3" /> Execution integrity
          </Badge>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {section.status.replace(/_/g, " ")}
          </Badge>
        </div>
        <CardTitle className="text-base">{section.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{section.summary}</p>
        <p className="text-[11px] text-muted-foreground/70">Source: {section.source}</p>
      </CardHeader>

      <CardContent className="space-y-3">
        {readFailed ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/[0.04] p-3 text-sm text-destructive">
            Execution evidence could not be verified for this pack. Regenerate it after receipt access is restored.
          </div>
        ) : receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No governed outbound execution receipt is linked to this decision.</p>
        ) : (
          receipts.map((receipt) => (
            <div key={receipt.receipt_id} className="rounded-lg border border-border/50 p-3" data-testid={`execution-receipt-${receipt.receipt_id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{receipt.action_type}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{receipt.receipt_id}</p>
                </div>
                <VerificationBadge verification={receipt.provider_observation.verification} label="Provider evidence" />
              </div>

              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <p className="text-muted-foreground">
                  Provider observation: <span className="font-medium text-foreground">{receipt.provider_observation.observed_status ?? "not recorded"}</span>
                </p>
                <p className="text-muted-foreground">
                  Current receipt status: <span className="font-medium text-foreground">{receipt.current_status}</span>
                </p>
                <p className="text-muted-foreground">
                  HTTP/provider status: <span className="font-medium text-foreground">{receipt.provider_observation.response_status ?? "n/a"}</span>
                </p>
                <p className="text-muted-foreground">
                  Created: <span className="font-medium text-foreground">{new Date(receipt.created_at).toLocaleString()}</span>
                </p>
              </div>

              {receipt.provider_observation.stored_digest && (
                <div className="mt-3 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Provider evidence digest</p>
                  <p className="break-all font-mono text-[11px] text-muted-foreground">{receipt.provider_observation.stored_digest}</p>
                </div>
              )}

              {receipt.reconciliation && (
                <div className="mt-3 rounded-md border border-border/50 bg-muted/20 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold">Governed reconciliation: {receipt.reconciliation.resolution}</p>
                    <VerificationBadge
                      verification={receipt.reconciliation.source_evidence.verification}
                      label={receipt.reconciliation.source_evidence.verification === "not_recorded" ? "Legacy source evidence" : "Reconciliation evidence"}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {receipt.reconciliation.note || "No reconciliation note recorded."}
                  </p>
                  {receipt.reconciliation.source_evidence.stored_digest && (
                    <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                      Source reconciliation digest: {receipt.reconciliation.source_evidence.stored_digest}
                    </p>
                  )}
                  <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                    Evidence Pack fingerprint: {receipt.reconciliation.derived_evidence_hash}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
