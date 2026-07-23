/**
 * Phase 6A — Governance Simulation (cross-domain)
 *
 * Sends a single synthetic signal through the governance-simulation edge
 * function for up to 5 organizations the user belongs to, and shows the
 * side-by-side: thresholds, escalation, approval, recommendation.
 *
 * The edge function uses the SAME resolver helpers as production engines,
 * so this is real-engine output, not mocked.
 */
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitCompareArrows, Loader2 } from "lucide-react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";

interface SimResult {
  organization_id: string;
  organization_name: string;
  profile: { risk_appetite: string; governance_model: string; version: number };
  context_pack: string | null;
  thresholds_applied: Record<string, number>;
  outcome: {
    would_trigger_decision: boolean;
    capped_confidence: number;
    raw_confidence: number;
    escalation_tier: string;
    required_approvals: number;
    approval_chain: Array<{ approval_stage: string; sequence_order: number }>;
    intervention_recommendation: string;
  };
}

const GovernanceSimulation = () => {
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<SimResult[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("organization_members")
        .select("organization_id, organizations(id, name)")
        .limit(20);
      const rows = (data ?? []).map((r: any) => r.organizations).filter(Boolean);
      setOrgs(rows);
    })();
  }, []);

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const run = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const { data } = await invokeWithRetry<{ results: SimResult[] }>("governance-simulation", {
        body: {
          organization_ids: Array.from(selected),
          signal: { risk_probability: 0.72, urgency_hours: 48, raw_confidence: 88, domain: "operational" },
        },
      });
      setResults(data?.results ?? []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionErrorBoundary sectionName="Governance Simulation">
      <div className="space-y-6 max-w-6xl">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <GitCompareArrows className="w-6 h-6 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Cross-Domain Governance Simulation</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-3xl">
            Send one synthetic operational signal through the production governance engine for multiple organizations.
            Same input → different thresholds, approval requirements, and intervention recommendations, driven entirely
            by each organization's governance profile, thresholds, and context pack.
          </p>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-semibold">Select organizations (1–5)</div>
            <div className="flex flex-wrap gap-2">
              {orgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => toggle(o.id)}
                  className={`px-3 py-1 rounded-full text-xs border transition ${
                    selected.has(o.id) ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/20 hover:bg-muted"
                  }`}
                >
                  {o.name}
                </button>
              ))}
              {orgs.length === 0 && <span className="text-xs text-muted-foreground">No organizations available.</span>}
            </div>
            <Button size="sm" onClick={run} disabled={busy || selected.size === 0}>
              {busy ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running…</> : "Run simulation"}
            </Button>
          </CardContent>
        </Card>

        {results.length >= 2 && (
          <Card>
            <CardContent className="p-0 overflow-auto">
              <div className="px-4 py-3 border-b border-border/40">
                <div className="text-sm font-semibold">Side-by-side comparison</div>
                <div className="text-[11px] text-muted-foreground">
                  Same signal · different governance · real-engine resolution (no mocks)
                </div>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Dimension</th>
                    {results.map((r) => (
                      <th key={r.organization_id} className="text-left px-3 py-2">{r.organization_name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Governance Model", get: (r: SimResult) => r.profile.governance_model },
                    { label: "Risk Appetite", get: (r: SimResult) => r.profile.risk_appetite },
                    { label: "Context Pack", get: (r: SimResult) => r.context_pack ?? "—" },
                    { label: "Risk threshold", get: (r: SimResult) => r.thresholds_applied["aicis.risk_threshold"] },
                    { label: "Urgency hours", get: (r: SimResult) => r.thresholds_applied["aicis.urgency_hours"] },
                    { label: "High-tier intervention", get: (r: SimResult) => r.thresholds_applied["intervention.high_tier"] },
                    { label: "Confidence ceiling", get: (r: SimResult) => r.thresholds_applied["governance.confidence_ceiling"] },
                    { label: "Would trigger?", get: (r: SimResult) => (r.outcome.would_trigger_decision ? "yes" : "no") },
                    { label: "Escalation tier", get: (r: SimResult) => r.outcome.escalation_tier },
                    { label: "Required approvals", get: (r: SimResult) => r.outcome.required_approvals },
                    { label: "Approval chain", get: (r: SimResult) => r.outcome.approval_chain.map((s) => s.approval_stage).join(" → ") },
                    { label: "Raw → capped confidence", get: (r: SimResult) => `${Math.round(r.outcome.raw_confidence)}% → ${Math.round(r.outcome.capped_confidence)}%` },
                    { label: "Recommendation", get: (r: SimResult) => r.outcome.intervention_recommendation },
                  ].map((row) => (
                    <tr key={row.label} className="border-t border-border/30">
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{row.label}</td>
                      {results.map((r) => (
                        <td key={r.organization_id} className="px-3 py-2 align-top">{String(row.get(r))}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {results.length > 0 && (
          <div className="grid gap-3">
            {results.map((r) => (
              <Card key={r.organization_id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{r.organization_name}</h3>
                    <div className="flex gap-2">
                      <Badge variant="outline">{r.profile.risk_appetite}</Badge>
                      <Badge variant="outline">{r.profile.governance_model}</Badge>
                      {r.context_pack && <Badge variant="outline">pack: {r.context_pack}</Badge>}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-muted-foreground mb-1">Thresholds applied</div>
                      {Object.entries(r.thresholds_applied).map(([k, v]) => (
                        <div key={k}><span className="text-muted-foreground">{k}:</span> {v}</div>
                      ))}
                    </div>
                    <div>
                      <div className="font-semibold text-muted-foreground mb-1">Approval</div>
                      <div>Required: {r.outcome.required_approvals}</div>
                      <div>Chain: {r.outcome.approval_chain.map((s) => s.approval_stage).join(" → ")}</div>
                      <div>Escalation: {r.outcome.escalation_tier}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-muted-foreground mb-1">Outcome</div>
                      <div>Triggers: {r.outcome.would_trigger_decision ? "yes" : "no"}</div>
                      <div>Raw conf: {Math.round(r.outcome.raw_confidence)}% → capped {Math.round(r.outcome.capped_confidence)}%</div>
                      <div className="mt-1 italic">{r.outcome.intervention_recommendation}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </SectionErrorBoundary>
  );
};

export default GovernanceSimulation;
