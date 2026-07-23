/**
 * useDeliberation — loads real signals for a decision's deliberation view.
 * No LLM, no synthesis. Pure database reads scoped by useActiveDataContext.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { computePerspectives, summarize, type DeliberationInputs, type Perspective, type DeliberationSummary } from "@/lib/deliberation/perspectives";

export interface DeliberationDecisionRow {
  id: string;
  recommended_action: string;
  decision_type: string;
  decision_status: string;
  capped_confidence: number | null;
  raw_confidence: number | null;
  expected_value_at_decision: number | null;
  probability_of_success: number | null;
  predicted_net_impact: number | null;
  predicted_roi_probability: number | null;
  counterfactual_delta: number | null;
  causal_attribution_score: number | null;
  confidence_cap_reason: string | null;
  evidence_sources: unknown[];
  governance_context: Record<string, unknown>;
  required_approvals: number;
  created_at: string;
}

export interface DeliberationApprovalRow {
  id?: string | null;
  stage_name?: string | null;
  stage_order?: number | null;
  approver_role?: string | null;
  approver_email?: string | null;
  approver_id?: string | null;
  verdict: string | null;
  status: string;
  decided_at?: string | null;
  created_at?: string | null;
  due_at?: string | null;
  escalation_status?: string | null;
  notes?: string | null;
}

export interface DeliberationData {
  decision: DeliberationDecisionRow;
  approvals: DeliberationApprovalRow[];
  perspectives: Perspective[];
  summary: DeliberationSummary;
  inputs: DeliberationInputs;
}

export function usePendingDeliberations() {
  const { orgId } = useActiveDataContext();
  const [rows, setRows] = useState<DeliberationDecisionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) { setRows([]); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("decision_ledger")
        .select("id,recommended_action,decision_type,decision_status,capped_confidence,raw_confidence,expected_value_at_decision,probability_of_success,predicted_net_impact,predicted_roi_probability,counterfactual_delta,causal_attribution_score,confidence_cap_reason,evidence_sources,governance_context,required_approvals,created_at")
        .eq("organization_id", orgId)
        .eq("is_suppressed", false)
        .in("decision_status", ["pending", "in_review"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (!alive) return;
      setRows((data as unknown as DeliberationDecisionRow[]) ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [orgId]);

  return { rows, loading };
}

export function useDeliberation(decisionId: string | null): { data: DeliberationData | null; loading: boolean } {
  const { orgId } = useActiveDataContext();
  const [data, setData] = useState<DeliberationData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId || !decisionId) { setData(null); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      const [decRes, apprRes, thrRes, confRes] = await Promise.all([
        supabase.from("decision_ledger").select("*").eq("id", decisionId).eq("organization_id", orgId).maybeSingle(),
        supabase.from("decision_approvals").select("*").eq("decision_id", decisionId).eq("organization_id", orgId),
        supabase.from("governance_thresholds").select("threshold_key,threshold_value").eq("organization_id", orgId).is("effective_to", null),
        supabase.from("narrative_conflicts").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "open"),
      ]);
      if (!alive) return;
      if (!decRes.data) { setData(null); setLoading(false); return; }
      const decision = decRes.data as unknown as DeliberationDecisionRow;
      const approvals = ((apprRes.data as unknown as DeliberationApprovalRow[]) ?? [])
        .slice()
        .sort((a, b) => {
          const ao = Number(a.stage_order ?? Number.MAX_SAFE_INTEGER);
          const bo = Number(b.stage_order ?? Number.MAX_SAFE_INTEGER);
          if (ao !== bo) return ao - bo;
          return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
        });

      const inputs: DeliberationInputs = {
        decision: {
          id: decision.id,
          recommended_action: decision.recommended_action,
          decision_type: decision.decision_type,
          capped_confidence: decision.capped_confidence,
          raw_confidence: decision.raw_confidence,
          expected_value_at_decision: decision.expected_value_at_decision,
          probability_of_success: decision.probability_of_success,
          predicted_net_impact: decision.predicted_net_impact,
          predicted_roi_probability: decision.predicted_roi_probability,
          counterfactual_delta: decision.counterfactual_delta,
          causal_attribution_score: decision.causal_attribution_score,
          confidence_cap_reason: decision.confidence_cap_reason,
          evidence_sources: Array.isArray(decision.evidence_sources) ? decision.evidence_sources : [],
          governance_context: (decision.governance_context as Record<string, unknown>) ?? {},
          required_approvals: decision.required_approvals ?? 0,
        },
        thresholds: (thrRes.data as Array<{ threshold_key: string; threshold_value: number }>) ?? [],
        openConflicts: confRes.count ?? 0,
        approvals: approvals.map((a) => ({ verdict: a.verdict, status: a.status })),
      };
      const perspectives = computePerspectives(inputs);
      const summary = summarize(perspectives, inputs);
      setData({ decision, approvals, perspectives, summary, inputs });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [orgId, decisionId]);

  return { data, loading };
}
