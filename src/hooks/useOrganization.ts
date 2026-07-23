import { useCallback, useEffect, useState } from "react";
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

const ORG_STORAGE_KEY = "quantivis_org_id";

// Module-level singleton: prevents 54 concurrent fetches (one per component)
let _orgFetchPromise: Promise<void> | null = null;
let _orgFetchError: unknown = null;
let _orgFetchResult: Organization[] | null = null;

const toSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace";

export const useOrganization = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMembershipOrgs = useCallback(async () => {
    if (!user) return [];

    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id, role, organizations(id, name, industry)")
      .eq("user_id", user.id);

    if (error) throw error;

    return ((data ?? []) as unknown as OrgMemberRow[])
      .filter((m) => m.organizations?.id)
      .map((m) => ({
        id: m.organizations!.id,
        name: m.organizations!.name,
        industry: m.organizations!.industry ?? null,
        role: m.role,
      }));
  }, [user]);

  const ensurePersonalTenant = useCallback(async (): Promise<Organization | null> => {
    if (!user) return null;

    const displayName = (
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "My"
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

    await supabase.from("workspace_quotas").insert({ workspace_id: workspace.id });
    await supabase.from("workspace_members").insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: "workspace_admin",
    });

    await refreshProfile();

    return { id: org.id, name: org.name, role: "owner", industry: null };
  }, [refreshProfile, user]);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setOrganizations([]);
      setCurrentOrgId(null);
      setLoading(false);
      return;
    }

    const fetchOrCreateOrgs = async () => {
      setLoading(true);
      try {
        let orgs = await fetchMembershipOrgs();

        if (orgs.length === 0) {
          const fallbackOrg = await ensurePersonalTenant();
          orgs = fallbackOrg ? [fallbackOrg] : [];
        }

        _orgFetchResult = orgs;
        if (cancelled) return;
        setOrganizations(orgs);

        // Restore from session only if it belongs to this user.
        const stored = sessionStorage.getItem(ORG_STORAGE_KEY);
        const valid = orgs.find((o) => o.id === stored);
        const profileOrg = profile?.organization_id ? orgs.find((o) => o.id === profile.organization_id) : null;
        const nextOrgId = valid?.id ?? profileOrg?.id ?? orgs[0]?.id ?? null;

        setCurrentOrgId(nextOrgId);
        if (nextOrgId) sessionStorage.setItem(ORG_STORAGE_KEY, nextOrgId);
        else sessionStorage.removeItem(ORG_STORAGE_KEY);
      } catch (error) {
        _orgFetchError = error;
        _orgFetchPromise = null;
        // Log only once at module level, not 54 times
        if (!_orgFetchError || _orgFetchResult === null) {
          console.warn("[useOrganization] Could not load organization — platform running in reduced mode.");
        }
        if (!cancelled) {
          setOrganizations([]);
          setCurrentOrgId(null);
          sessionStorage.removeItem(ORG_STORAGE_KEY);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Deduplicate: if a fetch is already in flight, wait for it
    if (!_orgFetchPromise || _orgFetchError) {
      _orgFetchError = null;
      _orgFetchResult = null;
      _orgFetchPromise = fetchOrCreateOrgs();
    } else {
      // Another component already started the fetch — reuse
      _orgFetchPromise.then(() => {
        if (!cancelled && _orgFetchResult) {
          const stored = sessionStorage.getItem(ORG_STORAGE_KEY);
          const valid = _orgFetchResult.find((o) => o.id === stored);
          const nextOrgId = valid?.id ?? _orgFetchResult[0]?.id ?? null;
          setOrganizations(_orgFetchResult);
          setCurrentOrgId(nextOrgId);
          setLoading(false);
        }
      }).catch(() => {
        if (!cancelled) setLoading(false);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [ensurePersonalTenant, fetchMembershipOrgs, profile?.organization_id, user]);

  const switchOrganization = (orgId: string) => {
    const validOrg = organizations.find((org) => org.id === orgId);
    if (!validOrg) {
      console.error("[useOrganization] Refusing to switch to organization outside current membership scope");
      return;
    }
    setCurrentOrgId(orgId);
    sessionStorage.setItem(ORG_STORAGE_KEY, orgId);
    // Cascade: clear downstream context to prevent cross-org data leakage
    sessionStorage.removeItem("quantivis_workspace_id");
    sessionStorage.removeItem("quantivis_project_id");
    // Clear ML cache on org switch to prevent cross-tenant data
    clearMLCache();
  };

  const currentOrg = organizations.find((o) => o.id === currentOrgId) ?? null;

  return { organizations, currentOrgId, currentOrg, switchOrganization, loading };
};

/** Clears the module-level ML cache to prevent cross-org leakage */
function clearMLCache() {
  try {
    // Dispatch a custom event that useMLEngine listens to
    window.dispatchEvent(new CustomEvent("quantivis:org-switch"));
  } catch (e: unknown) {
    // Non-critical: SSR or test environment where window is unavailable
    console.error("[useOrganization] ML cache clear failed:", e instanceof Error ? e.message : e);
  }
}