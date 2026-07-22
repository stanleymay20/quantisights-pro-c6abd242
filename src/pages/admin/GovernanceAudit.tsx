/**
 * Phase 6A.1 — Governance Audit Explorer
 *
 * Filterable view of public.context_governance_audit (append-only) for
 * internal audit, procurement reviews, and regulator inspection.
 * Exports CSV.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Filter, ScrollText, Loader2 } from "lucide-react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { supabase } from "@/integrations/supabase/client";

interface AuditRow {
  id: string;
  organization_id: string;
  subject_type: string;
  subject_id: string;
  governance_model: string;
  risk_profile: string;
  governance_profile_version: number | null;
  context_pack: string | null;
  engine_version: string | null;
  thresholds_applied: Record<string, number> | null;
  approval_rules_applied: Record<string, unknown> | null;
  created_at: string;
}

const ANY = "__any__";

const GovernanceAudit = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [orgFilter, setOrgFilter] = useState("");
  const [modelFilter, setModelFilter] = useState<string>(ANY);
  const [packFilter, setPackFilter] = useState<string>(ANY);
  const [subjectFilter, setSubjectFilter] = useState<string>(ANY);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("context_governance_audit")
      .select("id, organization_id, subject_type, subject_id, governance_model, risk_profile, governance_profile_version, context_pack, engine_version, thresholds_applied, approval_rules_applied, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (orgFilter.trim()) q = q.eq("organization_id", orgFilter.trim());
    if (modelFilter !== ANY) q = q.eq("governance_model", modelFilter);
    if (packFilter !== ANY) q = q.eq("context_pack", packFilter);
    if (subjectFilter !== ANY) q = q.eq("subject_type", subjectFilter);
    if (from) q = q.gte("created_at", new Date(from).toISOString());
    if (to) q = q.lte("created_at", new Date(to).toISOString());
    const { data } = await q;
    setRows((data as AuditRow[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const packs = useMemo(() => Array.from(new Set(rows.map((r) => r.context_pack).filter(Boolean))) as string[], [rows]);

  const exportCsv = () => {
    const header = ["created_at","organization_id","subject_type","subject_id","governance_model","risk_profile","profile_version","context_pack","engine_version","thresholds_applied","approval_rules_applied"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const cells = [
        r.created_at,
        r.organization_id,
        r.subject_type,
        r.subject_id,
        r.governance_model,
        r.risk_profile,
        r.governance_profile_version ?? "",
        r.context_pack ?? "",
        r.engine_version ?? "",
        JSON.stringify(r.thresholds_applied ?? {}),
        JSON.stringify(r.approval_rules_applied ?? {}),
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `governance-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SectionErrorBoundary sectionName="Governance Audit Explorer">
      <div className="space-y-6 max-w-7xl">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ScrollText className="w-6 h-6 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Governance Audit Explorer</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-3xl">
            Append-only record of which governance configuration influenced every recommendation,
            intervention, and decision. Used for internal audit and enterprise reviews.
          </p>
        </div>

        <Card>
          <CardContent className="p-4 grid sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Organization ID</label>
              <Input value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} placeholder="uuid" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Governance Model</label>
              <Select value={modelFilter} onValueChange={setModelFilter}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any</SelectItem>
                  <SelectItem value="centralized">centralized</SelectItem>
                  <SelectItem value="distributed">distributed</SelectItem>
                  <SelectItem value="committee">committee</SelectItem>
                  <SelectItem value="founder_led">founder_led</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Context Pack</label>
              <Select value={packFilter} onValueChange={setPackFilter}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any</SelectItem>
                  {packs.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Subject Type</label>
              <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any</SelectItem>
                  <SelectItem value="decision">decision</SelectItem>
                  <SelectItem value="intervention">intervention</SelectItem>
                  <SelectItem value="advisory">advisory</SelectItem>
                  <SelectItem value="insight">insight</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="sm:col-span-3 lg:col-span-6 flex gap-2">
              <Button size="sm" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Filter className="w-3 h-3 mr-1" />}
                Apply filters
              </Button>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
                <Download className="w-3 h-3 mr-1" /> Export CSV ({rows.length})
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Subject</th>
                  <th className="text-left px-3 py-2">Model</th>
                  <th className="text-left px-3 py-2">Risk</th>
                  <th className="text-left px-3 py-2">Pack</th>
                  <th className="text-left px-3 py-2">Profile</th>
                  <th className="text-left px-3 py-2">Engine</th>
                  <th className="text-left px-3 py-2">Thresholds</th>
                  <th className="text-left px-3 py-2">Approvals</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const approvals = (r.approval_rules_applied ?? {}) as { required_approvals?: number };
                  return (
                    <tr key={r.id} className="border-t border-border/30 hover:bg-muted/20">
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{r.subject_type}</Badge><div className="font-mono text-[10px] text-muted-foreground mt-0.5">{r.subject_id.slice(0, 8)}…</div></td>
                      <td className="px-3 py-2">{r.governance_model}</td>
                      <td className="px-3 py-2">{r.risk_profile}</td>
                      <td className="px-3 py-2">{r.context_pack ?? "—"}</td>
                      <td className="px-3 py-2">v{r.governance_profile_version ?? "—"}</td>
                      <td className="px-3 py-2">{r.engine_version ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[10px] max-w-[200px] truncate" title={JSON.stringify(r.thresholds_applied)}>{JSON.stringify(r.thresholds_applied ?? {})}</td>
                      <td className="px-3 py-2">{approvals.required_approvals ?? "—"}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !loading && (
                  <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No audit records match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </SectionErrorBoundary>
  );
};

export default GovernanceAudit;
