import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileWarning, Loader2 } from "lucide-react";

import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Button } from "@/components/ui/button";
import EvidencePackPreview from "@/components/decisions/EvidencePackPreview";
import { buildEvidencePack } from "@/lib/evidence-pack";
import type { EvidencePack as EvidencePackModel, EvidencePackAuditEntry } from "@/lib/evidence-pack-types";
import {
  DEMO_DECISION,
  isDemoDecisionId,
  type ReviewableDecision,
} from "@/components/decisions/executive-review-flow";

export const EVIDENCE_PACK_UNAVAILABLE_MESSAGE = "Evidence Pack unavailable";

/**
 * EP-1 Evidence Pack page (/evidence-pack/:decisionId).
 *
 * Loads the decision (and, best-effort, its audit log entries) that already
 * exist in Quantivis and packages them into one deterministic Evidence Pack.
 * If the decision cannot be found, this shows a clearly-labelled unavailable
 * state — it never fabricates a pack from missing data.
 */
const EvidencePackPage = () => {
  const { decisionId } = useParams<{ decisionId: string }>();
  const { currentOrgId } = useOrganization();

  const isDemo = isDemoDecisionId(decisionId);
  const [decision, setDecision] = useState<ReviewableDecision | null>(isDemo ? DEMO_DECISION : null);
  const [auditEntries, setAuditEntries] = useState<EvidencePackAuditEntry[]>([]);
  const [loading, setLoading] = useState(!isDemo);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (isDemo || !decisionId || !currentOrgId) return;
    const load = async () => {
      setLoading(true);
      setNotFound(false);

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
      setLoading(false);
    };
    load();
  }, [decisionId, currentOrgId, isDemo]);

  const pack: EvidencePackModel | null = decision
    ? buildEvidencePack(decision, { auditEntries, isSimulation: isDemo || undefined })
    : null;

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 space-y-1">
        <div className="flex items-center gap-2">
          <SidebarMobileToggle />
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-muted-foreground" asChild>
            <Link to="/decisions">
              <ArrowLeft className="h-3.5 w-3.5" />
              Decision Ledger
            </Link>
          </Button>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Enterprise Decision Evidence Pack</h1>
        <p className="text-sm text-muted-foreground">
          The complete, deterministic record of why this decision was recommended and approved.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building Evidence Pack…
        </div>
      ) : pack ? (
        <EvidencePackPreview pack={pack} />
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
