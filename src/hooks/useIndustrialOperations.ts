import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_TEMPLATES,
  buildNodeTree,
  collectSubtreeIds,
  evaluateTemplates,
  type IndustrialDecisionTemplate,
  type IndustrialMetricRow,
  type IndustrialNode,
  type TemplateFinding,
} from "@/lib/industrial/industrial-model";

interface UseIndustrialOperationsResult {
  nodes: IndustrialNode[];
  tree: ReturnType<typeof buildNodeTree>;
  metrics: IndustrialMetricRow[];
  templates: IndustrialDecisionTemplate[];
  findings: TemplateFinding[];
  loading: boolean;
  error: string | null;
  /** Window used for the metric query, in days. */
  windowDays: number;
  setWindowDays: (days: number) => void;
  refresh: () => Promise<void>;
  subtreeIdsFor: (nodeId: string) => Set<string>;
}

/**
 * Loads the industrial hierarchy, its metric facts for a rolling window, and
 * the org's decision templates. Never throws on a missing org — the surface
 * must degrade to an empty state instead of crashing.
 */
export function useIndustrialOperations(orgId: string | null): UseIndustrialOperationsResult {
  const [nodes, setNodes] = useState<IndustrialNode[]>([]);
  const [metrics, setMetrics] = useState<IndustrialMetricRow[]>([]);
  const [templates, setTemplates] = useState<IndustrialDecisionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(90);

  const load = useCallback(async () => {
    if (!orgId) {
      setNodes([]);
      setMetrics([]);
      setTemplates([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    try {
      const [nodeRes, metricRes, templateRes] = await Promise.all([
        supabase
          .from("industrial_nodes")
          .select("id, organization_id, parent_id, node_type, name, external_code, country_code, depth, is_active")
          .eq("organization_id", orgId)
          .order("depth", { ascending: true }),
        supabase
          .from("industrial_metrics")
          .select("id, node_id, metric_key, period_start, period_end, granularity, value, unit, target_value, data_quality_score, source")
          .eq("organization_id", orgId)
          .gte("period_start", since)
          .order("period_start", { ascending: true })
          .limit(20000),
        supabase
          .from("industrial_decision_templates")
          .select("id, template_key, title, description, trigger_metric, comparator, threshold, applies_to_node_type, recommended_action, is_active")
          .eq("organization_id", orgId),
      ]);

      if (nodeRes.error) throw nodeRes.error;
      if (metricRes.error) throw metricRes.error;
      if (templateRes.error) throw templateRes.error;

      setNodes((nodeRes.data ?? []) as IndustrialNode[]);
      setMetrics(
        ((metricRes.data ?? []) as unknown[]).map((r) => {
          const row = r as IndustrialMetricRow & { value: number | string; target_value: number | string | null };
          return {
            ...row,
            value: Number(row.value),
            target_value: row.target_value === null ? null : Number(row.target_value),
          } as IndustrialMetricRow;
        }),
      );

      const configured = (templateRes.data ?? []) as unknown as IndustrialDecisionTemplate[];
      // Fall back to the canonical library when the org has not customized it.
      setTemplates(
        configured.length
          ? configured.map((t) => ({ ...t, threshold: Number(t.threshold) }))
          : DEFAULT_TEMPLATES.map((t, i) => ({ ...t, id: `default-${i}` })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load industrial data");
      setNodes([]);
      setMetrics([]);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, windowDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const tree = useMemo(() => buildNodeTree(nodes), [nodes]);

  const findings = useMemo(
    () => (nodes.length && metrics.length ? evaluateTemplates(templates, nodes, metrics) : []),
    [templates, nodes, metrics],
  );

  const subtreeIdsFor = useCallback(
    (nodeId: string) => new Set(collectSubtreeIds(nodes, nodeId)),
    [nodes],
  );

  return {
    nodes,
    tree,
    metrics,
    templates,
    findings,
    loading,
    error,
    windowDays,
    setWindowDays,
    refresh: load,
    subtreeIdsFor,
  };
}
