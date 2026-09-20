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

// Deduplicate organization discovery per authenticated user. Failed promises are
// evicted so retry can actually re-read membership rather than replay an error.
const orgFetchPromises = new Map<string, Promise<Organization[]>>();

export const useOrganization = () => {
  const { user, profile } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evidenceReady, setEvidenceReady] = useState(false);
  const requestSeq = useRef(0);

  const fetchMembershipOrgs = useCallback(async (): Promise<Organization[]> => {
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
        // Organization discovery is intentionally read-only. Tenant creation and
        // membership assignment are server-controlled operations; missing
        // membership evidence must never be interpreted as permission to create
        // replacement tenant state in the browser.
        promise = fetchMembershipOrgs();
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
  }, [fetchMembershipOrgs, profile?.organization_id, user]);

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
