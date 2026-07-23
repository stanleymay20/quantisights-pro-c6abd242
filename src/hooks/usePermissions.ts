import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";

export type Permission =
  | "dashboard.view" | "dashboard.edit"
  | "decisions.view" | "decisions.approve"
  | "data.upload" | "data.delete"
  | "team.manage" | "billing.manage" | "settings.manage"
  | "reports.generate" | "simulations.run" | "copilot.use"
  | "embed.manage" | "branding.manage";

export function usePermissions() {
  const { user } = useAuth();
  const { currentOrg: organization } = useOrganization();

  const { data: orgRole } = useQuery({
    queryKey: ["org-role", user?.id, organization?.id],
    queryFn: async () => {
      if (!user?.id || !organization?.id) return null;
      const { data } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("organization_id", organization.id)
        .single();
      return data?.role ?? null;
    },
    enabled: !!user?.id && !!organization?.id,
  });

  const { data: permissions = [], isLoading } = useQuery({
    queryKey: ["permissions", user?.id, organization?.id, orgRole],
    queryFn: async () => {
      if (!user?.id || !organization?.id || !orgRole) return [];
      // Only fetch permissions for the user's actual role in this org
      const { data } = await supabase
        .from("role_permissions")
        .select("permission, granted")
        .eq("organization_id", organization.id)
        .eq("role", orgRole);
      return data ?? [];
    },
    enabled: !!user?.id && !!organization?.id && !!orgRole,
  });


  const hasPermission = (permission: Permission): boolean => {
    // Check explicit permissions first
    const explicit = permissions.find((p: { permission: string; granted: boolean }) => p.permission === permission);
    if (explicit) return explicit.granted;

    // Fallback defaults by role
    if (orgRole === "owner" || orgRole === "admin") return true;
    if ((orgRole === "analyst" || orgRole === "executive") && permission.endsWith(".view")) return true;
    if (orgRole === "viewer" && permission === "dashboard.view") return true;
    return false;
  };

  return { hasPermission, orgRole, isLoading };
}
