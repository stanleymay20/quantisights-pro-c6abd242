import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Users, CheckCircle2, AlertTriangle, Database, Loader2 } from "lucide-react";

interface MemberWithProfile {
  user_id: string;
  role: string;
  full_name: string | null;
}

interface DatasetOwnership {
  id: string;
  name: string;
  uploaded_by: string;
  steward_user_id: string | null;
  has_quality_check: boolean;
  steward_name: string | null;
}

const StewardDrillDown = () => {
  const { currentOrgId } = useOrganization();

  const { data, isLoading } = useQuery({
    queryKey: ["steward-drilldown", currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return null;

      const [membersRes, datasetsRes, qualityRes, profilesRes] = await Promise.all([
        supabase
          .from("organization_members")
          .select("user_id, role")
          .eq("organization_id", currentOrgId),
        supabase
          .from("datasets")
          .select("id, name, uploaded_by, steward_user_id")
          .eq("organization_id", currentOrgId)
          // "completed" is what the standard CSV upload flow writes on
          // success; "active" is only written by the demo seed and
          // API-ingest paths. Both mean "usable dataset."
          .in("status", ["active", "completed"]),
        supabase
          .from("data_quality_checks")
          .select("dataset_id")
          .eq("organization_id", currentOrgId),
        supabase
          .from("profiles")
          .select("user_id, full_name")
          .eq("organization_id", currentOrgId),
      ]);

      const profiles = (profilesRes.data ?? []) as { user_id: string; full_name: string | null }[];
      const profileMap = new Map(profiles.map((p) => [p.user_id, p.full_name]));

      const members: MemberWithProfile[] = (membersRes.data ?? []).map((m) => ({
        user_id: String((m as any).user_id ?? ""),
        role: String((m as any).role ?? ""),
        full_name: profileMap.get(String((m as any).user_id ?? "")) ?? "Unknown",
      }));

      const qualityDatasetIds = new Set((qualityRes.data ?? []).map((q: { dataset_id?: string | null }) => q.dataset_id).filter(Boolean));

      const datasets: DatasetOwnership[] = (datasetsRes.data ?? []).map((d) => {
        const row = d as any;
        const id = String(row.id ?? "");
        const stewardId = row.steward_user_id ? String(row.steward_user_id) : null;
        return {
          id,
          name: String(row.name ?? ""),
          uploaded_by: String(row.uploaded_by ?? ""),
          steward_user_id: stewardId,
          has_quality_check: qualityDatasetIds.has(id),
          steward_name: stewardId ? (profileMap.get(stewardId) ?? "Unknown") : null,
        };
      });

      const stewards = members.filter((m) => m.role === "steward");

      // Unowned = no explicit steward_user_id AND uploader is not a steward
      const stewardUserIds = new Set(stewards.map((s) => s.user_id));
      const unownedDatasets = datasets.filter(
        (d) => d.steward_user_id == null && !stewardUserIds.has(d.uploaded_by)
      );

      return { stewards, datasets, unownedDatasets, profileMap };
    },
    enabled: !!currentOrgId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const stewards = data?.stewards ?? [];
  const unowned = data?.unownedDatasets ?? [];
  const totalDatasets = data?.datasets?.length ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Steward & Ownership Coverage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stewards */}
        <div>
          <p className="text-[10px] text-muted-foreground font-semibold mb-2">
            ASSIGNED STEWARDS ({stewards.length})
          </p>
          {stewards.length === 0 ? (
            <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/5 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              No Data Stewards assigned. Assign the steward role in Team settings.
            </div>
          ) : (
            <div className="space-y-1.5">
              {stewards.map((s, i) => (
                <motion.div
                  key={s.user_id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-border/40 bg-muted/20"
                >
                  
                  <span className="text-xs font-medium text-foreground">{s.full_name}</span>
                  <Badge variant="outline" className="text-[9px] ml-auto">steward</Badge>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Unowned Datasets */}
        <div>
          <p className="text-[10px] text-muted-foreground font-semibold mb-2">
            DATASETS WITHOUT STEWARD OVERSIGHT ({unowned.length}/{totalDatasets})
          </p>
          {unowned.length === 0 && totalDatasets > 0 ? (
            <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              All datasets have steward oversight.
            </div>
          ) : unowned.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 p-2">No datasets found.</p>
          ) : (
            <div className="space-y-1.5">
              {unowned.slice(0, 8).map((d, i) => (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-border/40 bg-muted/20"
                >
                  <Database className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground truncate">{d.name}</span>
                  <div className="flex items-center gap-1.5 ml-auto shrink-0">
                    {d.has_quality_check ? (
                      <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/20">QC ✓</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] text-destructive border-destructive/20">No QC</Badge>
                    )}
                    <Badge variant="outline" className="text-[9px] text-yellow-400 border-yellow-500/20">No steward</Badge>
                  </div>
                </motion.div>
              ))}
              {unowned.length > 8 && (
                <p className="text-[10px] text-muted-foreground/60 text-center">
                  +{unowned.length - 8} more unowned datasets
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default StewardDrillDown;
