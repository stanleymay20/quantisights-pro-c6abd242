import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

export interface DecisionContext {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  industry: string | null;
  decision_type: string;
  objective: string | null;
  target_metrics: Json | null;
  datasets: Json | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDecisionContextInput {
  name: string;
  description?: string;
  industry?: string;
  decision_type: string;
  objective?: string;
  target_metrics?: string[];
  datasets?: string[];
}

export const DECISION_TYPES = [
  { value: "growth_strategy", label: "Growth Strategy" },
  { value: "operational_efficiency", label: "Operational Efficiency" },
  { value: "risk_management", label: "Risk Management" },
  { value: "pricing_strategy", label: "Pricing Strategy" },
  { value: "policy_analysis", label: "Policy Analysis" },
  { value: "market_expansion", label: "Market Expansion" },
  { value: "investment_decision", label: "Investment Decision" },
  { value: "retention_strategy", label: "Retention Strategy" },
  { value: "cost_optimization", label: "Cost Optimization" },
  { value: "general", label: "General" },
] as const;

/**
 * Hook to manage Decision Contexts — scoping all analysis to a strategic decision.
 * Decision Contexts are org-scoped (institutional memory).
 */
export const useDecisionContexts = (organizationId: string | null) => {
  const [contexts, setContexts] = useState<DecisionContext[]>([]);
  const [activeContext, setActiveContext] = useState<DecisionContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContexts = useCallback(async () => {
    if (!organizationId) {
      setContexts([]);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("decision_contexts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    if (fetchError) {
      console.error("Decision contexts fetch error:", fetchError);
      setError(fetchError.message);
      setContexts([]);
    } else {
      setContexts((data ?? []) as DecisionContext[]);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetchContexts();
  }, [fetchContexts]);

  const createContext = useCallback(async (input: CreateDecisionContextInput): Promise<DecisionContext | null> => {
    if (!organizationId) throw new Error("Organization context required");
    const { data: userData } = await supabase.auth.getUser();

    const { data, error: insertError } = await supabase
      .from("decision_contexts")
      .insert({
        organization_id: organizationId,
        name: input.name,
        description: input.description || null,
        industry: input.industry || null,
        decision_type: input.decision_type,
        objective: input.objective || null,
        target_metrics: (input.target_metrics || []) as unknown as Json,
        datasets: (input.datasets || []) as unknown as Json,
        created_by: userData?.user?.id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Create context error:", insertError);
      throw new Error(insertError.message);
    }

    const ctx = data as DecisionContext;
    setContexts(prev => [ctx, ...prev]);
    return ctx;
  }, [organizationId]);

  const updateContext = useCallback(async (id: string, updates: Partial<CreateDecisionContextInput>) => {
    if (!organizationId) throw new Error("Organization context required");

    const dbUpdates: Database["public"]["Tables"]["decision_contexts"]["Update"] = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description || null;
    if (updates.industry !== undefined) dbUpdates.industry = updates.industry || null;
    if (updates.decision_type !== undefined) dbUpdates.decision_type = updates.decision_type;
    if (updates.objective !== undefined) dbUpdates.objective = updates.objective || null;
    if (updates.target_metrics !== undefined) dbUpdates.target_metrics = updates.target_metrics as unknown as Json;
    if (updates.datasets !== undefined) dbUpdates.datasets = updates.datasets as unknown as Json;

    const { error: updateError } = await supabase
      .from("decision_contexts")
      .update(dbUpdates)
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (updateError) {
      console.error("Update context error:", updateError);
      throw new Error(updateError.message);
    }

    await fetchContexts();
  }, [organizationId, fetchContexts]);

  const archiveContext = useCallback(async (id: string) => {
    if (!organizationId) throw new Error("Organization context required");

    const { error: archiveError } = await supabase
      .from("decision_contexts")
      .update({ status: "archived" })
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (archiveError) {
      console.error("Archive context error:", archiveError);
      throw new Error(archiveError.message);
    }

    if (activeContext?.id === id) setActiveContext(null);
    await fetchContexts();
  }, [organizationId, activeContext, fetchContexts]);

  return {
    contexts,
    activeContext,
    setActiveContext,
    loading,
    error,
    createContext,
    updateContext,
    archiveContext,
    refreshContexts: fetchContexts,
  };
};
