import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, ListChecks, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

interface ReadinessItem {
  id: string;
  category: string;
  control_key: string;
  control_label: string;
  status: "met" | "partial" | "missing" | "unknown";
  evidence_ref: string | null;
  evidence_payload: {
    source?: string;
    method?: string;
    scope?: string;
    owner?: string;
    freshness?: string;
  } | null;
  last_verified_at: string | null;
}

const EVIDENCE_MAX_AGE_DAYS = 30;

const isVerificationOverdue = (verifiedAt: string | null) => {
  if (!verifiedAt) return false;
  const ageMs = Date.now() - new Date(verifiedAt).getTime();
  return ageMs > EVIDENCE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
};

const statusBadge = (status: string) => {
  if (status === "met") return <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Met</Badge>;
  if (status === "partial") return <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-500"><AlertTriangle className="w-3 h-3 mr-1" />Partial</Badge>;
  if (status === "missing") return (
    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600" title="This control has not been configured yet. It does not indicate a security failure — complete the setup steps to mark it as met.">
      <AlertTriangle className="w-3 h-3 mr-1" />Not set up
    </Badge>
  );
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">Unknown</Badge>;
};

const ProcurementReadinessChecklist = () => {
  const [items, setItems] = useState<ReadinessItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_procurement_readiness");
      if (error) {
        setItems([]);
        setLoading(false);
        return;
      }
      setItems((data as ReadinessItem[] | null) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <Card className="border-border/50"><CardContent className="pt-6 text-center text-xs text-muted-foreground">Loading readiness…</CardContent></Card>;
  }

  if (items.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="pt-6 text-center text-xs text-muted-foreground">
          Evidence unavailable. Readiness items will populate after a successful trust-metrics scan.
        </CardContent>
      </Card>
    );
  }

  const byCategory: Record<string, ReadinessItem[]> = {};
  for (const it of items) (byCategory[it.category] ||= []).push(it);

  const total = items.length;
  const met = items.filter((i) => i.status === "met").length;
  const pct = Math.round((met / total) * 100);

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Procurement Readiness</h2>
          </div>
          <Badge variant="outline" className="text-xs">
            {met}/{total} controls met · {pct}%
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Every control derives from real system state — RLS coverage from <code>pg_policies</code>, explainability from
          <code> decision_ledger.evidence_sources</code>, retention from <code>datasets.is_stale</code>, etc.
          No manual checkboxes.
        </p>

        <div className="space-y-4">
          {Object.entries(byCategory).map(([cat, list]) => (
            <div key={cat}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{cat}</div>
              <div className="space-y-1.5">
                {list.map((it) => (
                  <div key={it.id} className="flex items-start gap-2 p-2 rounded border border-border/40 bg-background/40">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm">{it.control_label}</span>
                        {statusBadge(it.status)}
                      </div>
                      {it.last_verified_at && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Verified {new Date(it.last_verified_at).toLocaleDateString("en-CA")}
                          {isVerificationOverdue(it.last_verified_at) && (
                            <span className="ml-1 text-amber-600">· Verification overdue</span>
                          )}
                        </div>
                      )}
                      <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[10px] text-muted-foreground">
                        {[
                          ["Source", it.evidence_payload?.source],
                          ["Method", it.evidence_payload?.method],
                          ["Scope", it.evidence_payload?.scope],
                          ["Owner", it.evidence_payload?.owner],
                          ["Freshness", it.evidence_payload?.freshness],
                        ].map(([label, value]) => (
                          <div key={label} className="flex gap-1">
                            <dt className="font-medium text-foreground/70">{label}:</dt>
                            <dd>{value || "Evidence unavailable"}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    {it.evidence_ref && (
                      <Link to={it.evidence_ref} className="text-[10px] text-primary hover:underline flex items-center gap-0.5 shrink-0">
                        Evidence <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProcurementReadinessChecklist;
