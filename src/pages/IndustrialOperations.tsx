import { useEffect, useMemo, useState } from "react";
import {
  Factory, ChevronRight, ChevronDown, AlertTriangle, RefreshCw,
  Gauge, Layers, Loader2, TrendingUp, TrendingDown, ShieldAlert,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { NarrativeHeader } from "@/components/narrative/NarrativeHeader";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { useIndustrialOperations } from "@/hooks/useIndustrialOperations";
import {
  HEADLINE_METRICS,
  METRIC_DEFINITIONS,
  NODE_TYPE_LABEL,
  checkOeeConsistency,
  formatMetricValue,
  isImprovement,
  nodeAncestry,
  rollupHeadline,
  type IndustrialNode,
  type NodeTreeItem,
  type TemplateFinding,
} from "@/lib/industrial/industrial-model";

const SEVERITY_STYLE: Record<TemplateFinding["severity"], string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-warning/10 text-warning border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
};

function HierarchyTree({
  items,
  selectedId,
  onSelect,
  depth = 0,
}: {
  items: NodeTreeItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const hasChildren = item.children.length > 0;
        const isCollapsed = collapsed[item.id] ?? depth >= 2;
        const isSelected = item.id === selectedId;

        return (
          <li key={item.id}>
            <div
              className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors ${
                isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/60"
              }`}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={isCollapsed ? `Expand ${item.name}` : `Collapse ${item.name}`}
                  onClick={() => setCollapsed((c) => ({ ...c, [item.id]: !isCollapsed }))}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <span className="w-[18px] shrink-0" />
              )}
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className="min-w-0 flex-1 truncate text-left"
              >
                <span className="truncate font-medium">{item.name}</span>
                <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {NODE_TYPE_LABEL[item.node_type]}
                </span>
              </button>
            </div>
            {hasChildren && !isCollapsed ? (
              <HierarchyTree
                items={item.children}
                selectedId={selectedId}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ScorecardTile({
  rollup,
}: {
  rollup: ReturnType<typeof rollupHeadline>[number];
}) {
  const def = METRIC_DEFINITIONS[rollup.key];
  const hasValue = rollup.value !== null;
  const delta = rollup.deltaPct;
  const good = delta !== null ? isImprovement(def, delta) : null;

  return (
    <Card className="p-4 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {def.label}
        </span>
        {rollup.sampleSize > 0 ? (
          <span className="text-[10px] text-muted-foreground">n={rollup.sampleSize}</span>
        ) : null}
      </div>
      <div className={`text-2xl font-semibold ${hasValue ? "text-foreground" : "text-muted-foreground"}`}>
        {hasValue ? formatMetricValue(rollup.value, def) : "Insufficient Data"}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {delta !== null ? (
          <span className={`inline-flex items-center gap-1 ${good ? "text-success" : "text-destructive"}`}>
            {good ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}% vs prior half
          </span>
        ) : (
          <span>Trend: not enough periods</span>
        )}
        {rollup.target !== null ? (
          <span>Target {formatMetricValue(rollup.target, def)}</span>
        ) : null}
      </div>
    </Card>
  );
}

function FindingCard({ finding }: { finding: TemplateFinding }) {
  const def = METRIC_DEFINITIONS[finding.metricKey];
  return (
    <Card className="p-4 space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${SEVERITY_STYLE[finding.severity]}`}>
              {finding.severity}
            </Badge>
            <span className="text-sm font-semibold">{finding.title}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {NODE_TYPE_LABEL[finding.nodeType]} · {finding.nodeName}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          Confidence {(finding.confidence * 100).toFixed(0)}%
        </Badge>
      </div>

      <p className="text-sm text-foreground/90">{finding.explanation}</p>

      <dl className="grid grid-cols-2 gap-2 rounded-lg border border-border/50 bg-muted/30 p-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Observed</dt>
          <dd className="font-medium">{formatMetricValue(finding.observed, def)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Threshold</dt>
          <dd className="font-medium">{formatMetricValue(finding.threshold, def)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Evidence</dt>
          <dd className="font-medium">{finding.sampleSize} periods</dd>
        </div>
      </dl>

      {finding.recommendedAction ? (
        <p className="text-sm">
          <span className="font-medium text-primary">Recommended action: </span>
          {finding.recommendedAction}
        </p>
      ) : null}
    </Card>
  );
}

export default function IndustrialOperations() {
  const { orgId, contextLoading } = useActiveDataContext();
  const {
    nodes, tree, metrics, findings, loading, error,
    windowDays, setWindowDays, refresh, subtreeIdsFor,
  } = useIndustrialOperations(orgId);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && tree.length) setSelectedId(tree[0].id);
    if (selectedId && nodes.length && !nodes.some((n) => n.id === selectedId)) {
      setSelectedId(tree.length ? tree[0].id : null);
    }
  }, [tree, nodes, selectedId]);

  const selectedNode: IndustrialNode | null = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const breadcrumb = useMemo(
    () => (selectedId ? nodeAncestry(nodes, selectedId) : []),
    [nodes, selectedId],
  );

  const scorecard = useMemo(() => {
    if (!selectedId) return [];
    return rollupHeadline(metrics, subtreeIdsFor(selectedId), HEADLINE_METRICS);
  }, [metrics, selectedId, subtreeIdsFor]);

  const oeeCheck = useMemo(() => checkOeeConsistency(scorecard), [scorecard]);

  const scopedFindings = useMemo(() => {
    if (!selectedId) return findings;
    const subtree = subtreeIdsFor(selectedId);
    return findings.filter((f) => subtree.has(f.nodeId));
  }, [findings, selectedId, subtreeIdsFor]);

  const takeaway = useMemo(() => {
    if (loading || contextLoading) return "Loading the industrial hierarchy and its metric history.";
    if (!nodes.length) {
      return "No industrial hierarchy is defined yet — load sites, plants and lines to turn factory data into executive decisions.";
    }
    if (!metrics.length) {
      return `${nodes.length} hierarchy nodes are defined, but no industrial metrics have landed in the last ${windowDays} days.`;
    }
    const high = scopedFindings.filter((f) => f.severity === "high").length;
    if (high > 0) {
      return `${high} high-severity operational condition${high === 1 ? "" : "s"} across ${scopedFindings.length} triggered template${scopedFindings.length === 1 ? "" : "s"} need a decision this week.`;
    }
    if (scopedFindings.length) {
      return `${scopedFindings.length} operational condition${scopedFindings.length === 1 ? "" : "s"} are above tolerance but none are high severity.`;
    }
    return `No industrial decision template is triggered across ${nodes.length} nodes over the last ${windowDays} days.`;
  }, [loading, contextLoading, nodes.length, metrics.length, scopedFindings, windowDays]);

  const busy = loading || contextLoading;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Factory className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Industrial Operations</h1>
              <p className="text-sm text-muted-foreground">
                Enterprise → region → site → plant → line → machine, with OEE and maintenance truth at every level.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5">
              {[30, 90, 180].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setWindowDays(d)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    windowDays === d ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>
        </div>

        <NarrativeHeader
          audience="For the COO and plant leadership"
          action="Act on the constrained assets"
          takeaway={takeaway}
        />
      </header>

      {error ? (
        <Card className="flex items-start gap-3 border-destructive/40 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Industrial data could not be loaded</p>
            <p className="text-muted-foreground">{error}</p>
          </div>
        </Card>
      ) : null}

      <SectionErrorBoundary sectionName="Industrial Operations">
        {busy ? (
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <Skeleton className="h-72 w-full" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
            </div>
          </div>
        ) : !nodes.length ? (
          <Card className="space-y-3 p-8 text-center">
            <Layers className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No industrial hierarchy defined</h2>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground">
              Quantivis sits above industrial systems: load your structure (company, region, site, plant, area, line,
              cell, machine) and your operational metrics through CSV, SQL, REST or an existing enterprise connector.
              Nothing here is simulated — the surface stays empty until real data arrives.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <Card className="h-fit p-3">
              <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Hierarchy
              </h2>
              <HierarchyTree items={tree} selectedId={selectedId} onSelect={setSelectedId} />
            </Card>

            <div className="space-y-4">
              {breadcrumb.length ? (
                <nav aria-label="Hierarchy path" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {breadcrumb.map((n, i) => (
                    <span key={n.id} className="inline-flex items-center gap-1">
                      {i > 0 ? <ChevronRight className="h-3 w-3 opacity-50" /> : null}
                      <button
                        type="button"
                        onClick={() => setSelectedId(n.id)}
                        className={i === breadcrumb.length - 1 ? "font-medium text-foreground" : "hover:text-foreground"}
                      >
                        {n.name}
                      </button>
                    </span>
                  ))}
                </nav>
              ) : null}

              <Tabs defaultValue="scorecard">
                <TabsList>
                  <TabsTrigger value="scorecard">
                    <Gauge className="mr-1.5 h-3.5 w-3.5" /> Scorecard
                  </TabsTrigger>
                  <TabsTrigger value="decisions">
                    <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Decisions ({scopedFindings.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="scorecard" className="space-y-4 pt-4">
                  {oeeCheck.consistent === false ? (
                    <Card className="flex items-start gap-3 border-warning/40 p-4">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <div className="text-sm">
                        <p className="font-medium">OEE components do not reconcile</p>
                        <p className="text-muted-foreground">
                          Reported OEE {(oeeCheck.reported! * 100).toFixed(1)}% vs Availability × Performance × Quality{" "}
                          {(oeeCheck.derived! * 100).toFixed(1)}%. Reconcile the source before using OEE in a decision.
                        </p>
                      </div>
                    </Card>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {scorecard.map((r) => <ScorecardTile key={r.key} rollup={r} />)}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Values roll up across {selectedNode ? NODE_TYPE_LABEL[selectedNode.node_type].toLowerCase() : "node"}{" "}
                    <span className="font-medium text-foreground">{selectedNode?.name}</span> and everything below it,
                    over the last {windowDays} days. Ratios are averaged, volumes are summed, stock levels take the
                    latest reading.
                  </p>
                </TabsContent>

                <TabsContent value="decisions" className="space-y-3 pt-4">
                  {scopedFindings.length === 0 ? (
                    <Card className="p-6 text-center text-sm text-muted-foreground">
                      No industrial decision template is triggered in this scope. Templates require at least three
                      observations before they fire.
                    </Card>
                  ) : (
                    scopedFindings.map((f) => (
                      <FindingCard key={`${f.templateKey}-${f.nodeId}`} finding={f} />
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </SectionErrorBoundary>
    </div>
  );
}
