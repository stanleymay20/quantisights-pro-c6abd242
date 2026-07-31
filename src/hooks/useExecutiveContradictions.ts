import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createSafeChannel } from "@/lib/realtime-channel";
import { invokeWithRetry } from "@/lib/edge-function-retry";

export type ContradictionSeverity = "low" | "medium" | "high" | "critical";
export type ContradictionStatus = "open" | "investigating" | "resolved" | "accepted";

export interface ExecutiveContradiction {
  id: string;
  organization_id: string;
  dataset_id: string | null;
  contradiction_key: string;
  category: string;
  severity: ContradictionSeverity;
  confidence: number;
  subject: string;
  scope: string | null;
  period_label: string | null;
  function_a: string;
  function_b: string;
  source_a: string;
  source_b: string;
  value_a: number | null;
  value_b: number | null;
  gap_absolute: number | null;
  gap_pct: number | null;
  explanation: string;
  root_cause: string | null;
  recommended_action: string | null;
  blocks_decision: boolean;
  affected_decision_types: string[];
  affected_decision_ids: string[];
  evidence: Record<string, unknown>;
  lineage: Record<string, unknown>;
  owner_user_id: string | null;
  status: ContradictionStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  detected_at: string;
  last_seen_at: string;
}

const SEVERITY_RANK: Record<ContradictionSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function useExecutiveContradictions(orgId: string | null) {
  const [contradictions, setContradictions] = useState<ExecutiveContradiction[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!orgId) {
      setContradictions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: qErr } = await supabase
      .from("executive_contradictions")
      .select("*")
      .eq("organization_id", orgId)
      .order("last_seen_at", { ascending: false })
      .limit(300);

    if (qErr) setError(qErr.message);
    else {
      setError(null);
      setContradictions((data ?? []) as unknown as ExecutiveContradiction[]);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!orgId) return;
    return createSafeChannel("executive-contradictions", (channel) =>
      channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "executive_contradictions", filter: `organization_id=eq.${orgId}` },
          () => fetchAll(),
        )
        .subscribe(),
    );
  }, [orgId, fetchAll]);

  /** Run the deterministic detection pass against live warehouse evidence. */
  const runDetection = useCallback(async () => {
    if (!orgId) return null;
    setDetecting(true);
    try {
      const { data, error: fnErr } = await invokeWithRetry("detect-executive-contradictions", {
        body: { organization_id: orgId },
      });
      if (fnErr) throw fnErr;
      await fetchAll();
      return data as { status: string; detected: number; inserted: number; refreshed: number };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detection failed");
      return null;
    } finally {
      setDetecting(false);
    }
  }, [orgId, fetchAll]);

  const updateStatus = useCallback(
    async (id: string, status: ContradictionStatus, resolutionNote?: string) => {
      const { data: authData } = await supabase.auth.getUser();
      const patch: Record<string, unknown> = { status };
      if (resolutionNote !== undefined) patch.resolution_note = resolutionNote;
      if (status === "resolved" || status === "accepted") {
        patch.resolved_at = new Date().toISOString();
        patch.resolved_by = authData?.user?.id ?? null;
      } else {
        patch.resolved_at = null;
        patch.resolved_by = null;
      }
      const { error: upErr } = await supabase
        .from("executive_contradictions")
        .update(patch)
        .eq("id", id);
      if (upErr) {
        setError(upErr.message);
        return false;
      }
      await fetchAll();
      return true;
    },
    [fetchAll],
  );

  const summary = useMemo(() => {
    const open = contradictions.filter((c) => c.status === "open" || c.status === "investigating");
    const blocking = open.filter((c) => c.blocks_decision);
    const affectedDecisions = new Set<string>();
    for (const c of blocking) for (const id of c.affected_decision_ids || []) affectedDecisions.add(id);
    const worst = open.reduce<ExecutiveContradiction | null>(
      (acc, c) => (!acc || SEVERITY_RANK[c.severity] > SEVERITY_RANK[acc.severity] ? c : acc),
      null,
    );
    return {
      total: contradictions.length,
      open: open.length,
      blocking: blocking.length,
      resolved: contradictions.filter((c) => c.status === "resolved").length,
      accepted: contradictions.filter((c) => c.status === "accepted").length,
      affectedDecisionCount: affectedDecisions.size,
      worst,
    };
  }, [contradictions]);

  const sorted = useMemo(
    () =>
      [...contradictions].sort((a, b) => {
        const statusRank = (c: ExecutiveContradiction) => (c.status === "open" ? 0 : c.status === "investigating" ? 1 : 2);
        const sr = statusRank(a) - statusRank(b);
        if (sr !== 0) return sr;
        const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
        if (sev !== 0) return sev;
        return (b.gap_pct ?? 0) - (a.gap_pct ?? 0);
      }),
    [contradictions],
  );

  return { contradictions: sorted, loading, detecting, error, summary, refresh: fetchAll, runDetection, updateStatus };
}
