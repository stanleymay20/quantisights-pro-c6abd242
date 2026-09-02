import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Organization {
  id: string;
  name: string;
  role: string;
  industry: string | null;
}

interface OrgMemberRow {
  organization_id: string;
  role: string;
  organizations: { id: string; name: string; industry: string | null } | null;
}

interface OrganizationSwitchDetail {
  organizationId?: string;
}

const ORG_STORAGE_KEY = "quantivis_org_id";
const ORG_SWITCH_EVENT = "quantivis:org-switch";
const ONBOARDING_PROVISION_KEY = "quantivis_onboarding_provisioning";

// Deduplicate organization discovery per authenticated user. Failed promises are
// evicted so retry can actually re-read membership rather than replay an error.
const orgFetchPromises = new Map<string, Promise<Organization[]>>();

const toSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace";

export const useOrganization = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evidenceReady, setEvidenceReady] = useState(false);
  const requestSeq = useRef(0);

  const fetchMembershipOrgs = useCallback(async () => {
    if (!user) return [];

    const { data, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id, role, organizations(id, name, industry)")
      .eq("user_id", user.id);

    if (membershipError) throw membershipError;

    return ((data ?? []) as unknown as OrgMemberRow[])
      .filter((membership) => membership.organizations?.id)
      .map((membership) => ({
        id: membership.organizations!.id,
        name: membership.organizations!.name,
        industry: membership.organizations!.industry ?? null,
        role: membership.role,
      }));
  }, [user]);

  const ensurePersonalTenant = useCallback(async (): Promise<Organization | null> => {
    if (!user) return null;

    const provisioningAuthorized =
      typeof window !== "undefined" &&
      sessionStorage.getItem(ONBOARDING_PROVISION_KEY) === "allowed" &&
      user.user_metadata?.quantivis_onboarding_started === true;

    if (!provisioningAuthorized) {
      throw new Error("Tenant provisioning is restricted to an explicitly verified signup onboarding flow.");
    }

    // Consume the one-shot browser authorization before any write. A retry must
    // be explicitly re-authorized by the onboarding boundary.
    sessionStorage.removeItem(ONBOARDING_PROVISION_KEY);

    // Re-read membership immediately before provisioning so a concurrent
    // restore/invite cannot race us into creating a duplicate tenant.
    const existing = await fetchMembershipOrgs();
    if (existing.length > 0) return existing[0];

    const displayName = (
      user.user_metadata?.full_name
      || user.email?.split("@")[0]
      || "My"
    ).trim();
    const orgName = `${displayName}'s Organization`.slice(0, 200);

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: orgName, created_by: user.id })
      .select("id, name")
      .single();

    if (orgError || !org) throw orgError || new Error("Failed to create organization");

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        full_name: user.user_metadata?.full_name ?? user.email ?? null,
        avatar_url: user.user_metadata?.avatar_url ?? null,
        organization_id: org.id,
      }, { onConflict: "user_id" });
    if (profileError) throw profileError;

    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({ organization_id: org.id, user_id: user.id, role: "owner" });
    if (memberError) throw memberError;

    const workspaceName = "Default Workspace";
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .insert({
        organization_id: org.id,
        name: workspaceName,
        slug: toSlug(workspaceName),
        created_by: user.id,
      })
      .select("id")
      .single();
    if (workspaceError || !workspace) throw workspaceError || new Error("Failed to create workspace");

    const { error: workspaceMemberError } = await supabase.from("workspace_members").insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: "workspace_admin",
    });
    if (workspaceMemberError) throw workspaceMemberError;

    const { error: quotaError } = await supabase.from("workspace_quotas").insert({ workspace_id: workspace.id });
    if (quotaError) {
      console.error("[useOrganization] Default workspace quota provisioning failed:", quotaError.message);
    }

    // Once a tenant exists, remove the authority to create another one. Keep a
    // durable non-authorizing marker so legitimate incomplete onboarding can be
    // resumed later without treating a returning user as a migration failure.
    const { error: metadataError } = await supabase.auth.updateUser({
      data: {
        quantivis_onboarding_started: false,
        quantivis_onboarding_provisioned: true,
      },
    });
    if (metadataError) {
      throw new Error(`Tenant created but onboarding provenance could not be recorded: ${metadataError.message}`);
    }

    await refreshProfile();
    return { id: org.id, name: org.name, role: "owner", industry: null };
  }, [fetchMembershipOrgs, refreshProfile, user]);

  const fetchOrCreateOrgs = useCallback(async (): Promise<Organization[]> => {
    let orgs = await fetchMembershipOrgs();
    const provisioningAuthorized =
      typeof window !== "undefined" &&
      sessionStorage.getItem(ONBOARDING_PROVISION_KEY) === "allowed" &&
      user?.user_metadata?.quantivis_onboarding_started === true;

    if (orgs.length === 0 && provisioningAuthorized) {
      const fallbackOrg = await ensurePersonalTenant();
      orgs = fallbackOrg ? [fallbackOrg] : [];
    }
    return orgs;
  }, [ensurePersonalTenant, fetchMembershipOrgs, user]);

  const resolveOrganizations = useCallback(async (force = false) => {
    const seq = ++requestSeq.current;
    setError(null);
    setEvidenceReady(false);

    if (!user) {
      setOrganizations([]);
      setCurrentOrgId(null);
      sessionStorage.removeItem(ORG_STORAGE_KEY);
      setEvidenceReady(true);
      setLoading(false);
      return;
    }

    const userId = user.id;
    setOrganizations([]);
    setCurrentOrgId(null);
    setLoading(true);

    try {
      if (force) orgFetchPromises.delete(userId);
      let promise = orgFetchPromises.get(userId);
      if (!promise) {
        promise = fetchOrCreateOrgs();
        orgFetchPromises.set(userId, promise);
      }

      const orgs = await promise;
      if (seq !== requestSeq.current) return;

      setOrganizations(orgs);
      const stored = sessionStorage.getItem(ORG_STORAGE_KEY);
      const validStored = orgs.find((organization) => organization.id === stored);
      const profileOrg = profile?.organization_id
        ? orgs.find((organization) => organization.id === profile.organization_id)
        : null;
      const nextOrgId = validStored?.id ?? profileOrg?.id ?? orgs[0]?.id ?? null;

      setCurrentOrgId(nextOrgId);
      if (nextOrgId) sessionStorage.setItem(ORG_STORAGE_KEY, nextOrgId);
      else sessionStorage.removeItem(ORG_STORAGE_KEY);
      setEvidenceReady(true);
    } catch (resolutionError) {
      orgFetchPromises.delete(userId);
      if (seq !== requestSeq.current) return;
      const message = resolutionError instanceof Error ? resolutionError.message : String(resolutionError);
      console.warn("[useOrganization] Organization evidence unavailable:", message);
      setOrganizations([]);
      setCurrentOrgId(null);
      sessionStorage.removeItem(ORG_STORAGE_KEY);
      setError(`Unable to verify organization membership: ${message}`);
      setEvidenceReady(false);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [fetchOrCreateOrgs, profile?.organization_id, user]);

  useEffect(() => {
    void resolveOrganizations(false);
  }, [resolveOrganizations]);

  // useOrganization is a hook rather than a singleton provider, so every mounted
  // consumer owns local React state. Synchronize a validated organization switch
  // across those instances through the existing tenant-switch event bus.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOrgSwitch = (event: Event) => {
      const detail = (event as CustomEvent<OrganizationSwitchDetail>).detail;
      const requested = detail?.organizationId ?? sessionStorage.getItem(ORG_STORAGE_KEY);
      const valid = organizations.find((organization) => organization.id === requested);
      if (!valid) return;
      setCurrentOrgId(valid.id);
      setError(null);
      setEvidenceReady(true);
    };
    window.addEventListener(ORG_SWITCH_EVENT, handleOrgSwitch);
    return () => window.removeEventListener(ORG_SWITCH_EVENT, handleOrgSwitch);
  }, [organizations]);

  const switchOrganization = useCallback((orgId: string) => {
    if (!evidenceReady || error) {
      console.error("[useOrganization] Refusing organization switch while membership evidence is unavailable");
      return;
    }
    const validOrg = organizations.find((organization) => organization.id === orgId);
    if (!validOrg) {
      console.error("[useOrganization] Refusing to switch to organization outside current membership scope");
      return;
    }

    setCurrentOrgId(orgId);
    sessionStorage.setItem(ORG_STORAGE_KEY, orgId);
    sessionStorage.removeItem("quantivis_workspace_id");
    sessionStorage.removeItem("quantivis_project_id");

    try {
      window.dispatchEvent(new CustomEvent<OrganizationSwitchDetail>(ORG_SWITCH_EVENT, {
        detail: { organizationId: orgId },
      }));
    } catch (dispatchError) {
      console.error("[useOrganization] Organization switch event failed:", dispatchError instanceof Error ? dispatchError.message : dispatchError);
    }
  }, [organizations, evidenceReady, error]);

  const currentOrg = evidenceReady && !error
    ? organizations.find((organization) => organization.id === currentOrgId) ?? null
    : null;

  return {
    organizations,
    currentOrgId: currentOrg?.id ?? null,
    currentOrg,
    switchOrganization,
    loading,
    error,
    evidenceReady,
    refreshOrganizations: () => resolveOrganizations(true),
  };
};
