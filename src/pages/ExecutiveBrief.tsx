import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import {
  ExecutiveBriefEmptyState,
  ExecutiveBriefHero,
} from "@/components/decisions/ExecutiveBriefHero";
import type { ReviewableDecision } from "@/components/decisions/executive-review-flow";
import { NarrativeHeader } from "@/components/narrative/NarrativeHeader";

const confidenceOf = (decision: ReviewableDecision): number =>
  decision.capped_confidence ?? decision.confidence_at_decision ?? decision.raw_confidence ?? -1;

const createdAtOf = (decision: ReviewableDecision): number => {
  const value = decision.created_at ? new Date(decision.created_at).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
};

/**
 * UX-2 Executive Brief (/executive-brief): one pending decision selected by
 * decision-time confidence, newest on ties. Raw predicted_net_impact is not a
 * priority signal because legacy rows may contain heuristic monetary estimates.
 */
const ExecutiveBrief = () => {
  const { currentOrgId } = useOrganization();
  const [decision, setDecision] = useState<ReviewableDecision | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrgId) return;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("decision_ledger")
        .select("*")
        .eq("organization_id", currentOrgId)
        .eq("decision_status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!error && data) {
        const ranked = (data as unknown as ReviewableDecision[])
          .slice()
          .sort((a, b) => {
            const confidenceDelta = confidenceOf(b) - confidenceOf(a);
            return confidenceDelta !== 0 ? confidenceDelta : createdAtOf(b) - createdAtOf(a);
          });
        setDecision(ranked[0] ?? null);
        setPendingCount(ranked.length);
      }
      setLoading(false);
    };
    load();
  }, [currentOrgId]);

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 flex items-center gap-2">
        <SidebarMobileToggle />
        <h1 className="text-2xl font-semibold tracking-tight">Executive Brief</h1>
      </div>

      {/* Ch.1 "Context before chart": lead with audience → action → takeaway. */}
      <div className="mb-5">
        <NarrativeHeader
          audience="For the executive on call"
          action={
            pendingCount > 0
              ? `Approve, defer, or reject ${pendingCount} pending decision${pendingCount === 1 ? "" : "s"}`
              : "Nothing pending — review recent outcomes"
          }
          takeaway={
            decision
              ? `The pending decision with the highest available decision-time confidence${pendingCount > 1 ? `, out of ${pendingCount} pending` : ""}.`
              : "No decisions are waiting on you. Use this window to review measured outcomes and calibration."
          }
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing your brief…
        </div>
      ) : decision ? (
        <ExecutiveBriefHero decision={decision} />
      ) : (
        <ExecutiveBriefEmptyState />
      )}

      {!loading && pendingCount > 1 && (
        <p className="mt-4 text-xs text-muted-foreground">
          {pendingCount - 1} more decision{pendingCount === 2 ? "" : "s"} waiting in the{" "}
          <Link to="/decisions" className="font-medium text-primary underline-offset-2 hover:underline">
            Decision Ledger
          </Link>
          .
        </p>
      )}
    </div>
  );
};

export default ExecutiveBrief;
