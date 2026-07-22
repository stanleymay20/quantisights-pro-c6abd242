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

/**
 * UX-2 Executive Brief (/executive-brief): the single strongest pending
 * decision, readable in 30 seconds, with one CTA into the review flow.
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
        .order("predicted_net_impact", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(20);
      if (!error && data) {
        setDecision((data[0] as unknown as ReviewableDecision) ?? null);
        setPendingCount(data.length);
      }
      setLoading(false);
    };
    load();
  }, [currentOrgId]);

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <SidebarMobileToggle />
            <h1 className="text-2xl font-semibold tracking-tight">Executive Brief</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The one decision that most needs your judgment right now
            {pendingCount > 1 ? `, out of ${pendingCount} pending` : ""}.
          </p>
        </div>
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
