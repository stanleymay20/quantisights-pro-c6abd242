import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileWarning, Loader2 } from "lucide-react";

import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Button } from "@/components/ui/button";
import EvidencePackPreview from "@/components/decisions/EvidencePackPreview";
import ExecutionEvidenceCard from "@/components/decisions/ExecutionEvidenceCard";
import { buildEvidencePack } from "@/lib/evidence-pack";
import {
  attachExecutionEvidence,
  type EvidencePackExecutionReceiptInput,
} from "@/lib/evidence-pack-execution";
import type {
  EvidencePack as EvidencePackModel,
  EvidencePackAuditEntry,
  EvidencePackOutcomeInput,
} from "@/lib/evidence-pack-types";
import {
  DEMO_DECISION,
  isDemoDecisionId,
  type ReviewableDecision,
} from "@/components/decisions/executive-review-flow";

export const EVIDENCE_PACK_UNAVAILABLE_MESSAGE = "Evidence Pack unavailable";

/**
 * EP-1 Evidence Pack page (/evidence-pack/:decisionId).
 *
 * Loads the decision and its deterministic evidence inputs. Governed outbound
 * execution receipts remain service-role-only at the table layer and are read
 * only through the existing tenant-checking list_execution_action_receipts RPC.
 * Missing or failed reads are reported as unknown; the page never fabricates
 * execution evidence from an empty or failed response.
 */
const EvidencePackPage = () => {
  const { decisionId } = useParams<{ decisionId: string }>();
  const { currentOrgId } = useOrganization();

  const isDemo = isDemoDecisionId(decisionId);
  const [decision, setDecision] = useState<ReviewableDecision | null>(isDemo ? DEMO_DECISION : null);
  const [auditEntries, setAuditEntries] = useState<EvidencePackAuditEntry[]>([]);
  const [outcomes, setOutcomes] = useState<EvidencePackOutcomeInput[]>([]);
  const [outcomesReadFailed, setOutcomesReadFailed] = useState(false);
  const [executionReceipts, setExecutionReceipts] = useState<EvidencePackExecutionReceiptInput[]>([]);
  const [executionReceiptsReadFailed, setExecutionReceiptsReadFailed] = useState(false);
  const [loading, setLoading] = useState(!isDemo);
  const [notFound, setNotFound] = useState(false);
  const [pack, setPack] = useState<EvidencePackModel | null>(null);
  const [packBuilding, setPackBuilding] = useState(false);

  useEffect(() => {
    if (isDemo || !decisionId || !currentOrgId) return;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      setExecutionReceipts([]);
      setExecutionReceiptsReadFailed(false);

      const { data: decisionRow, error: decisionError } = await supabase
        .from("decision_ledger")
        .select("*")
        .eq("organization_id", currentOrgId)
        .eq("id", decisionId)
        .maybeSingle();

      if (decisionError || !decisionRow) {
        setDecision(null);
        setNotFound(true);
        setLoading(false);
        return;
      }
      setDecision(decisionRow as unknown as ReviewableDecision);

      // Best-effort: audit_log read is restricted to org admins/owners by RLS.
      // A denied or empty read simply yields an "unavailable" audit section —
      // it never blocks the rest of the pack.
      const { data: auditRows } = await supabase
        .from("audit_log")
        .select("action_type, actor_id, created_at, payload")
        .eq("organization_id", currentOrgId)
        .eq("resource_type", "decision")
        .eq("resource_id", decisionId)
        .order("created_at", { ascending: true });

      setAuditEntries(
        (auditRows ?? []).map((row) => ({
          action_type: row.action_type as string,
          actor_id: (row.actor_id as string | null) ?? null,
          occurred_at: row.created_at as string,
          payload: (row.payload as Record<string, unknown> | null) ?? null,
        })),
      );

      // Measured outcomes and governed execution receipts are independent
      // evidence projections. A failed read must stay distinguishable from a
      // valid empty result so "unknown" never becomes "nothing happened".
      const [outcomeResult, receiptResult] = await Promise.all([
        supabase
          .from("decision_outcomes")
          .select(
            "id, expected_metric, expected_direction, expected_change, evaluation_window_days, outcome_status, observed_value_before, observed_value_after, accuracy_score, evaluation_date, evidence_regime, calibration_eligible, eligibility_reason, notes, created_at",
          )
          .eq("organization_id", currentOrgId)
          .eq("decision_id", decisionId),
        (supabase as any).rpc("list_execution_action_receipts", {
          p_organization_id: currentOrgId,
          p_decision_id: decisionId,
        }),
      ]);

      setOutcomes((outcomeResult.data ?? []) as EvidencePackOutcomeInput[]);
      setOutcomesReadFailed(Boolean(outcomeResult.error));

      const receiptPayloadIsValid = Array.isArray(receiptResult.data);
      setExecutionReceipts(
        receiptPayloadIsValid ? (receiptResult.data as EvidencePackExecutionReceiptInput[]) : [],
      );
      setExecutionReceiptsReadFailed(Boolean(receiptResult.error) || !receiptPayloadIsValid);
      setLoading(false);
    };
    void load();
  }, [decisionId, currentOrgId, isDemo]);

  useEffect(() => {
    if (!decision) {
      setPack(null);
      return;
    }
    let cancelled = false;
    setPackBuilding(true);

    const build = async () => {
      const basePack = await buildEvidencePack(decision, {
        auditEntries,
        outcomes,
        outcomesReadFailed,
        isSimulation: isDemo || undefined,
      });
      return attachExecutionEvidence(basePack, {
        receipts: executionReceipts,
        readFailed: executionReceiptsReadFailed,
      });
    };

    void build()
      .then((built) => {
        if (!cancelled) setPack(built);
      })
      .finally(() => {
        if (!cancelled) setPackBuilding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    decision,
    auditEntries,
    outcomes,
    outcomesReadFailed,
    executionReceipts,
    executionReceiptsReadFailed,
    isDemo,
  ]);

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SidebarMobileToggle />
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-muted-foreground" asChild>
              <Link to="/decisions">
                <ArrowLeft className="h-3.5 w-3.5" />
                Decision Ledger
              </Link>
            </Button>
          </div>
          {!isDemo && decisionId && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/decisions/${decisionId}/room`}>Open Decision Room</Link>
            </Button>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Enterprise Decision Evidence Pack</h1>
        <p className="text-sm text-muted-foreground">
          The complete, deterministic record of why this decision was recommended, approved, executed and measured.
        </p>
      </div>

      {loading || packBuilding ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building Evidence Pack…
        </div>
      ) : pack ? (
        <div className="space-y-4">
          <ExecutionEvidenceCard pack={pack} />
          <EvidencePackPreview pack={pack} />
        </div>
      ) : (
        <div
          className="flex flex-col items-center gap-3 rounded-xl border border-border/50 p-10 text-center"
          data-testid="evidence-pack-unavailable"
        >
          <FileWarning className="h-8 w-8 text-muted-foreground" />
          <p className="text-base font-semibold">{EVIDENCE_PACK_UNAVAILABLE_MESSAGE}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {notFound
              ? "This decision could not be found in your organization, so no Evidence Pack can be built. Quantivis never generates a pack from data that doesn't exist."
              : "This decision could not be loaded."}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/decisions">Open the Decision Ledger</Link>
          </Button>
        </div>
      )}
    </div>
  );
};

export default EvidencePackPage;
