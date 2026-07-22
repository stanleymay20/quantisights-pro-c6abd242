import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Save, Loader2, Database, FileText, Eye, BarChart3, Shield } from "lucide-react";

interface RetentionPolicy {
  data_category: string;
  retention_days: number;
  auto_cleanup: boolean;
  description: string;
  enforcement_status: "configured" | "scheduled" | "enforced";
  last_cleanup_at: string | null;
  next_scheduled_at: string | null;
}

const DEFAULT_POLICIES: RetentionPolicy[] = [
  { data_category: "datasets", retention_days: 37, auto_cleanup: false, description: "Uploaded datasets and raw records", enforcement_status: "configured", last_cleanup_at: null, next_scheduled_at: null },
  { data_category: "decisions", retention_days: 60, auto_cleanup: false, description: "Decision ledger entries and outcomes", enforcement_status: "configured", last_cleanup_at: null, next_scheduled_at: null },
  { data_category: "advisories", retention_days: 60, auto_cleanup: false, description: "Advisory instances and recommendations", enforcement_status: "configured", last_cleanup_at: null, next_scheduled_at: null },
  { data_category: "copilot_messages", retention_days: 90, auto_cleanup: true, description: "Copilot conversation history", enforcement_status: "configured", last_cleanup_at: null, next_scheduled_at: null },
  { data_category: "audit_logs", retention_days: 730, auto_cleanup: false, description: "Immutable audit trail (regulatory minimum)", enforcement_status: "configured", last_cleanup_at: null, next_scheduled_at: null },
  { data_category: "session_data", retention_days: 365, auto_cleanup: true, description: "Session and usage analytics", enforcement_status: "configured", last_cleanup_at: null, next_scheduled_at: null },
];

const CATEGORY_ICONS: Record<string, typeof Database> = {
  datasets: Database,
  decisions: FileText,
  advisories: Shield,
  copilot_messages: Eye,
  audit_logs: Shield,
  session_data: BarChart3,
};

const RetentionPolicySettings = () => {
  const { currentOrgId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [policies, setPolicies] = useState<RetentionPolicy[]>(DEFAULT_POLICIES);
  const [saving, setSaving] = useState(false);

  const { data: savedPolicies, isLoading } = useQuery({
    queryKey: ["retention-policies", currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return [];
      const { data } = await supabase
        .from("data_retention_policies")
        .select("*")
        .eq("organization_id", currentOrgId);
      return data ?? [];
    },
    enabled: !!currentOrgId,
  });

  useEffect(() => {
    if (savedPolicies && savedPolicies.length > 0) {
      setPolicies((prev) =>
        prev.map((p) => {
          const saved = savedPolicies.find((s: { data_category: string; retention_days?: number; auto_cleanup?: boolean }) => s.data_category === p.data_category);
          return saved
            ? {
                ...p,
                retention_days: saved.retention_days,
                auto_cleanup: saved.auto_cleanup,
                enforcement_status: (saved.enforcement_status ?? "configured") as RetentionPolicy["enforcement_status"],
                last_cleanup_at: saved.last_cleanup_at ?? null,
                next_scheduled_at: saved.next_scheduled_at ?? null,
              }
            : p;
        })
      );
    }
  }, [savedPolicies]);

  const updatePolicy = (category: string, field: keyof RetentionPolicy, value: string | number | boolean) => {
    setPolicies((prev) =>
      prev.map((p) => (p.data_category === category ? { ...p, [field]: value } : p))
    );
  };

  const handleSave = async () => {
    if (!currentOrgId) return;
    setSaving(true);

    for (const policy of policies) {
      // Determine enforcement_status: if auto_cleanup just turned on and never run, mark as scheduled
      const effectiveStatus = policy.auto_cleanup
        ? (policy.last_cleanup_at ? "enforced" : "scheduled")
        : "configured";

      const { error } = await supabase
        .from("data_retention_policies")
        .upsert(
          {
            organization_id: currentOrgId,
            data_category: policy.data_category,
            retention_days: policy.retention_days,
            auto_cleanup: policy.auto_cleanup,
            description: policy.description,
            enforcement_status: effectiveStatus,
          },
          { onConflict: "organization_id,data_category" }
        );
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    queryClient.invalidateQueries({ queryKey: ["retention-policies"] });
    toast({ title: "Retention policies saved" });
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Data Retention Policies
          </CardTitle>
          <Button size="sm" onClick={handleSave} disabled={saving} className="text-xs gap-1.5">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure how long each data type is retained. Audit logs have a regulatory minimum.
        </p>
        {!isLoading && (!savedPolicies || savedPolicies.length === 0) && (
          <p className="text-xs text-warning mt-1.5 flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> These are unsaved defaults — nothing is persisted yet. Click Save to activate them.
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {policies.map((policy) => {
              const Icon = CATEGORY_ICONS[policy.data_category] ?? Database;
              const isLocked = policy.data_category === "audit_logs";
              return (
                <div
                  key={policy.data_category}
                  className="flex items-center gap-4 p-3.5 rounded-xl border border-border/40 bg-muted/20"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-foreground capitalize">
                        {policy.data_category.replace(/_/g, " ")}
                      </p>
                      {isLocked && (
                        <Badge variant="outline" className="text-[9px] px-1.5">Regulatory min</Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 ${
                          policy.enforcement_status === "enforced"
                            ? "text-emerald-400 border-emerald-500/20"
                            : policy.enforcement_status === "scheduled"
                            ? "text-blue-400 border-blue-500/20"
                            : "text-muted-foreground border-border"
                        }`}
                      >
                        {policy.enforcement_status}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{policy.description}</p>
                    {policy.last_cleanup_at && (
                      <p className="text-[9px] text-muted-foreground/50">
                        Last cleanup: {new Date(policy.last_cleanup_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={isLocked ? 730 : 7}
                        value={policy.retention_days}
                        onChange={(e) =>
                          updatePolicy(policy.data_category, "retention_days", parseInt(e.target.value) || 7)
                        }
                        disabled={isLocked}
                        className="w-20 h-8 text-xs text-center"
                      />
                      <span className="text-[10px] text-muted-foreground">days</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={policy.auto_cleanup}
                        onCheckedChange={(v) => updatePolicy(policy.data_category, "auto_cleanup", v)}
                        disabled={isLocked}
                      />
                      <span className="text-[10px] text-muted-foreground">Auto</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RetentionPolicySettings;
