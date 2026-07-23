import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIntelligenceInbox } from "@/hooks/useIntelligenceInbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import IntelligenceDisclaimer from "@/components/IntelligenceDisclaimer";
import TrustStrip from "@/components/trust/TrustStrip";
import { trustFromExecutiveBrief } from "@/components/trust/trust-adapter";
import { AlertTriangle, Globe, ShieldAlert, Inbox, ArrowRight, ThumbsUp, ThumbsDown, RefreshCw, Loader2, Database } from "lucide-react";

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  new: "New", scored: "Scored", briefed: "Briefed", advised: "Advised",
  routed: "Routed", acknowledged: "Acknowledged", acted_on: "Acted on",
  resolved: "Resolved", archived: "Archived",
};

export default function IntelligenceInbox() {
  const { items, briefs, observability, loading, timedOut, error, orgId, refresh, routeItem, sendFeedback } = useIntelligenceInbox();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (severityFilter !== "all" && it.severity !== severityFilter) return false;
      if (statusFilter !== "all" && it.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${it.title ?? ""} ${it.summary ?? ""} ${it.domain ?? ""} ${(it.geography || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, severityFilter, statusFilter, search]);

  const sortedByPressure = useMemo(() =>
    [...filtered].sort((a, b) =>
      (b.intelligence_relevance_scores?.decision_pressure_score ?? 0)
      - (a.intelligence_relevance_scores?.decision_pressure_score ?? 0)
    ), [filtered]);

  const showBlockingLoad = loading && items.length === 0 && briefs.length === 0 && !timedOut && !error;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Inbox className="h-7 w-7 text-primary" />
            Intelligence Inbox
          </h1>
          <p className="text-muted-foreground mt-1">
            Decision-grade intelligence consumed from AICIS, ranked by decision pressure.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {observability && (
            <div className="flex gap-3 text-sm flex-wrap">
              <Card><CardContent className="p-3"><div className="text-muted-foreground">Imports today</div><div className="text-xl font-semibold">{observability.imports_total}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-muted-foreground">Duplicates suppressed</div><div className="text-xl font-semibold">{observability.duplicates_suppressed}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-muted-foreground">Decision conversion</div><div className="text-xl font-semibold">{observability.conversion_rate}%</div></CardContent></Card>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || !orgId}>
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <IntelligenceDisclaimer />

      {!orgId && (
        <StateCard
          icon={<Database className="h-5 w-5 text-muted-foreground" />}
          title="No organization selected"
          description="Select or create an organization before using the Intelligence Inbox."
        />
      )}

      {showBlockingLoad && (
        <Card role="status" aria-live="polite">
          <CardContent className="p-8 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Loading intelligence inbox…
          </CardContent>
        </Card>
      )}

      {timedOut && !error && (
        <StateCard
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
          title="Intelligence Inbox is taking longer than expected"
          description="The intelligence query did not resolve quickly. This can happen on first-run accounts, RLS delays, or temporary network issues. Try refreshing the inbox."
          action={<Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? "animate-spin" : ""}`} />Retry</Button>}
        />
      )}

      {error && (
        <StateCard
          icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
          title="Could not load intelligence inbox"
          description={error}
          action={<Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? "animate-spin" : ""}`} />Retry</Button>}
        />
      )}

      {!showBlockingLoad && orgId && (
        <>
          <div className="flex flex-wrap gap-3">
            <Input placeholder="Search title, domain, geography…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="items">
            <TabsList>
              <TabsTrigger value="items">Signals ({filtered.length})</TabsTrigger>
              <TabsTrigger value="briefs">Briefs ({briefs.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="items" className="space-y-3 mt-4">
              {loading && (items.length > 0 || briefs.length > 0) && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Refreshing…</p>}
              {!loading && filtered.length === 0 && !error && (
                <Card className="border-dashed"><CardContent className="p-10 flex flex-col items-center text-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Inbox className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-base mb-1">No intelligence signals yet</p>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      Signals are generated automatically as your data is analysed by the AICIS engine —
                      ranked by decision pressure and ready to route to the Decision Ledger.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button size="sm" onClick={() => navigate("/data-upload")}>
                      <Database className="w-4 h-4 mr-2" /> Upload Data
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("/data-connectors")}>
                      Connect a Source
                    </Button>
                  </div>
                </CardContent></Card>
              )}
              {sortedByPressure.map((it) => {
                const scores = it.intelligence_relevance_scores;
                return (
                  <Card key={it.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                            <Badge variant={SEVERITY_VARIANT[it.severity]}>{it.severity}</Badge>
                            <Badge variant="outline">{it.urgency}</Badge>
                            <Badge variant="secondary">{STATUS_LABEL[it.status] ?? it.status}</Badge>
                            {it.global_criticality_score >= 70 && (
                              <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" />Global criticality {it.global_criticality_score}</Badge>
                            )}
                            <span className="truncate">{it.title || it.summary || "(untitled signal)"}</span>
                          </CardTitle>
                          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
                            {it.domain && <span>Domain: {it.domain}</span>}
                            {it.geography?.length > 0 && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{it.geography.slice(0, 4).join(", ")}</span>}
                            <span>Ingested: {new Date(it.ingested_at).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {it.summary && <p className="text-sm text-muted-foreground">{it.summary}</p>}
                      {scores && (
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant="outline">Relevance: {scores.organization_relevance_score}</Badge>
                          <Badge variant="outline">Impact: {scores.business_impact_score}</Badge>
                          <Badge variant="outline">Urgency: {scores.operational_urgency_score}</Badge>
                          <Badge variant={scores.decision_pressure_score >= 60 ? "default" : "outline"} className="gap-1">
                            <AlertTriangle className="h-3 w-3" />Decision pressure: {scores.decision_pressure_score}
                          </Badge>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button size="sm" variant="default" onClick={() => routeItem({ intelligence_item_id: it.id, route_type: "decision", reason: "Routed from inbox" })}>
                          <ArrowRight className="h-3 w-3 mr-1" />Create decision
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => routeItem({ intelligence_item_id: it.id, route_type: "task", reason: "Routed from inbox" })}>Create task</Button>
                        <Button size="sm" variant="outline" onClick={() => routeItem({ intelligence_item_id: it.id, route_type: "alert", reason: "Routed from inbox" })}>Trigger alert</Button>
                        <Button size="sm" variant="ghost" onClick={() => sendFeedback(it.id, "useful")}><ThumbsUp className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => sendFeedback(it.id, "false_positive")}><ThumbsDown className="h-3 w-3" /></Button>
                      </div>
                      {/* TrustStrip removed here: it used trustFromAdvisory, an
                          adapter for advisory/decision records (confidence_score,
                          evidence_sources, governance_status, source_quality). Raw
                          aicis_intelligence_items rows have none of those columns --
                          the strip always rendered five "Not Available" badges under
                          the real relevance/impact/urgency/pressure scores above,
                          which read as a broken feature rather than a data gap. */}
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            <TabsContent value="briefs" className="space-y-3 mt-4">
              {briefs.length === 0 && !error && (
                <Card><CardContent className="p-8 text-center text-muted-foreground">No briefs generated yet.</CardContent></Card>
              )}
              {briefs.map((b) => (
                <Card key={b.id}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      <Badge variant={SEVERITY_VARIANT[b.severity]}>{b.severity}</Badge>
                      <Badge variant="outline">Confidence: {Math.round(b.confidence)}%</Badge>
                      <span>{b.title}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm">{b.summary}</p>
                    {b.why_it_matters && <div className="text-sm"><span className="font-semibold">Why it matters:</span> {b.why_it_matters}</div>}
                    {b.affected_areas?.length > 0 && <div className="text-xs text-muted-foreground">Affected areas: {b.affected_areas.join(", ")}</div>}
                    {b.recommended_actions?.length > 0 && (
                      <div className="space-y-1">{b.recommended_actions.map((a, i) => <div key={i} className="text-sm"><span className="font-medium">{a.label}:</span> {a.value}</div>)}</div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={() => routeItem({ brief_id: b.id, route_type: "decision", reason: "Routed from brief" })}>Route brief → decision</Button>
                    </div>
                    <TrustStrip
                      record={trustFromExecutiveBrief(b, orgId)}
                      variant="compact"
                      className="mt-2"
                    />
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function StateCard({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          {icon}
          <div>
            <div className="font-semibold">{title}</div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
          </div>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
