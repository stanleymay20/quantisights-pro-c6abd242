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
  const {
    currentOrg: organization,
    error: organizationError,
    evidenceReady: organizationEvidenceReady,
  } = useOrganization();

  const roleQuery = useQuery({
    queryKey: ["org-role", user?.id, organization?.id],
    queryFn: async () => {
      if (!user?.id || !organization?.id) return null;
      const { data, error } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("organization_id", organization.id)
        .single();
      if (error) throw error;
      if (!data?.role) throw new Error("Organization role could not be verified");
      return data.role;
    },
    enabled: !!user?.id && !!organization?.id && organizationEvidenceReady && !organizationError,
    retry: 1,
  });

  const verifiedRole = roleQuery.data ?? null;

  const permissionQuery = useQuery({
    queryKey: ["permissions", user?.id, organization?.id, verifiedRole],
    queryFn: async () => {
      if (!user?.id || !organization?.id || !verifiedRole) return [];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission, granted")
        .eq("organization_id", organization.id)
        .eq("role", verifiedRole);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id
      && !!organization?.id
      && !!verifiedRole
      && organizationEvidenceReady
      && !organizationError
      && !roleQuery.error,
    retry: 1,
  });

  const permissions = permissionQuery.data ?? [];
  const authorizationError = organizationError
    ?? (roleQuery.error instanceof Error ? roleQuery.error.message : roleQuery.error ? String(roleQuery.error) : null)
    ?? (permissionQuery.error instanceof Error ? permissionQuery.error.message : permissionQuery.error ? String(permissionQuery.error) : null);

  const evidenceReady = organizationEvidenceReady
    && !organizationError
    && !!user?.id
    && !!organization?.id
    && !!verifiedRole
    && roleQuery.isSuccess
    && permissionQuery.isSuccess
    && !authorizationError;

  // Public role exposure is itself authorization evidence because a number of
  // UI/action surfaces gate capabilities directly on owner/admin. Withhold it
  // until the policy read has succeeded as well as the membership-role read.
  const orgRole = evidenceReady ? verifiedRole : null;

  const hasPermission = (permission: Permission): boolean => {
    if (!evidenceReady) return false;

    const explicit = permissions.find(
      (entry: { permission: string; granted: boolean }) => entry.permission === permission
    );
    if (explicit) return explicit.granted;

    if (verifiedRole === "owner" || verifiedRole === "admin") return true;
    if ((verifiedRole === "analyst" || verifiedRole === "executive") && permission.endsWith(".view")) return true;
    if (verifiedRole === "viewer" && permission === "dashboard.view") return true;
    return false;
  };

  const isLoading = roleQuery.isLoading || permissionQuery.isLoading;

  return {
    hasPermission,
    orgRole,
    isLoading,
    error: authorizationError,
    evidenceReady,
    refresh: async () => {
      await roleQuery.refetch();
      if (verifiedRole) await permissionQuery.refetch();
    },
  };
}
