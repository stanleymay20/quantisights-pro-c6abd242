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

  const orgRole = roleQuery.data ?? null;

  const permissionQuery = useQuery({
    queryKey: ["permissions", user?.id, organization?.id, orgRole],
    queryFn: async () => {
      if (!user?.id || !organization?.id || !orgRole) return [];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission, granted")
        .eq("organization_id", organization.id)
        .eq("role", orgRole);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id
      && !!organization?.id
      && !!orgRole
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
    && !!orgRole
    && roleQuery.isSuccess
    && permissionQuery.isSuccess
    && !authorizationError;

  const hasPermission = (permission: Permission): boolean => {
    // Authorization evidence is fail-closed. A policy-table or role lookup
    // outage must never activate fallback privileges.
    if (!evidenceReady) return false;

    const explicit = permissions.find(
      (entry: { permission: string; granted: boolean }) => entry.permission === permission
    );
    if (explicit) return explicit.granted;

    // Role defaults are allowed only after both role and policy reads succeeded.
    if (orgRole === "owner" || orgRole === "admin") return true;
    if ((orgRole === "analyst" || orgRole === "executive") && permission.endsWith(".view")) return true;
    if (orgRole === "viewer" && permission === "dashboard.view") return true;
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
      if (orgRole) await permissionQuery.refetch();
    },
  };
}
