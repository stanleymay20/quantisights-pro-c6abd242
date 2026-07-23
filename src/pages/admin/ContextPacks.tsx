/**
 * Phase 6A — Context Packs admin page
 *
 * Lists system context packs and lets owners/admins activate them as
 * configuration overlays. After activation the organization owns the
 * configuration; re-applying preserves overrides.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Boxes, CheckCircle2, Layers } from "lucide-react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { supabase } from "@/integrations/supabase/client";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";

interface Pack {
  pack_key: string;
  name: string;
  description: string | null;
  kpi_templates: Array<{ key: string; label: string }>;
  threshold_defaults: Record<string, number>;
  governance_defaults: Record<string, string>;
}

const ContextPacks = () => {
  const { orgId: organizationId } = useActiveDataContext();
  const { toast } = useToast();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [activated, setActivated] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: packData } = await supabase
        .from("context_packs")
        .select("pack_key,name,description,kpi_templates,threshold_defaults,governance_defaults")
        .order("name");
      if (cancelled) return;
      setPacks((packData ?? []) as Pack[]);

      if (organizationId) {
        const { data: active } = await supabase
          .from("organization_context_packs")
          .select("pack_key")
          .eq("organization_id", organizationId);
        if (!cancelled) setActivated(new Set((active ?? []).map((r) => r.pack_key)));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  const activate = async (packKey: string) => {
    if (!organizationId) return;
    setBusy(packKey);
    try {
      await invokeWithRetry("apply-context-pack", {
        body: { organization_id: organizationId, pack_key: packKey },
      });
      setActivated((s) => new Set(s).add(packKey));
      toast({ title: "Pack activated", description: "Configuration overlay applied. Organization overrides preserved." });
    } catch (e) {
      toast({ title: "Activation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const summary = useMemo(() => ({
    total: packs.length,
    enabled: activated.size,
  }), [packs, activated]);

  return (
    <SectionErrorBoundary sectionName="Context Packs">
      <div className="space-y-6 max-w-5xl">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Boxes className="w-6 h-6 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Context Packs</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Configuration overlays — KPI templates, threshold defaults, governance defaults — for common operating
            environments. Packs initialize configuration only; after activation the organization owns the configuration
            and re-applying preserves overrides. Not separate products.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">System packs</div>
            <div className="text-2xl font-bold">{loading ? "…" : summary.total}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Enabled here</div>
            <div className="text-2xl font-bold">{loading ? "…" : summary.enabled}</div>
          </CardContent></Card>
        </div>

        <div className="grid gap-4">
          {packs.map((p) => {
            const isOn = activated.has(p.pack_key);
            return (
              <Card key={p.pack_key}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary" />
                        <h3 className="font-semibold">{p.name}</h3>
                        {isOn && (
                          <Badge variant="outline" className="border-green-500/30 text-green-500">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Active
                          </Badge>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={isOn ? "outline" : "default"}
                      disabled={busy === p.pack_key || !organizationId}
                      onClick={() => activate(p.pack_key)}
                    >
                      {busy === p.pack_key ? "Applying…" : isOn ? "Re-apply" : "Activate"}
                    </Button>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-muted-foreground mb-1">KPI templates</div>
                      <ul className="space-y-0.5">
                        {(p.kpi_templates ?? []).slice(0, 4).map((k) => (
                          <li key={k.key}>• {k.label}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="font-semibold text-muted-foreground mb-1">Threshold defaults</div>
                      <ul className="space-y-0.5">
                        {Object.entries(p.threshold_defaults ?? {}).map(([k, v]) => (
                          <li key={k}><span className="text-muted-foreground">{k}:</span> {String(v)}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="font-semibold text-muted-foreground mb-1">Governance defaults</div>
                      <ul className="space-y-0.5">
                        {Object.entries(p.governance_defaults ?? {}).map(([k, v]) => (
                          <li key={k}><span className="text-muted-foreground">{k}:</span> {String(v)}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </SectionErrorBoundary>
  );
};

export default ContextPacks;
