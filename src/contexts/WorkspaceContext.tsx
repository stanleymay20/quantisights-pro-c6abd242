import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  organization_id: string;
  created_at: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  currentWorkspaceId: string | null;
  loading: boolean;
  switchWorkspace: (workspaceId: string) => void;
  createWorkspace: (name: string, description?: string) => Promise<Workspace>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
};

const STORAGE_KEY = "quantivis_workspace_id";

const toSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace";

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestSeq = useRef(0);

  const fetchWorkspaces = useCallback(async () => {
    const seq = ++requestSeq.current;

    if (!currentOrgId || !user) {
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      sessionStorage.removeItem(STORAGE_KEY);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: memberships, error: memErr } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (seq !== requestSeq.current) return;

    if (memErr) {
      console.error("[WorkspaceContext] Failed to fetch workspace membership:", memErr.message);
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      sessionStorage.removeItem(STORAGE_KEY);
      setLoading(false);
      return;
    }

    if (!memberships || memberships.length === 0) {
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      sessionStorage.removeItem(STORAGE_KEY);
      setLoading(false);
      return;
    }

    const memberWsIds = [...new Set(memberships.map((m) => m.workspace_id).filter(Boolean))];
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, slug, description, organization_id, created_at")
      .eq("organization_id", currentOrgId)
      .in("id", memberWsIds)
      .order("created_at", { ascending: true });

    if (seq !== requestSeq.current) return;

    if (error) {
      console.error("[WorkspaceContext] Failed to fetch workspaces:", error.message);
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      sessionStorage.removeItem(STORAGE_KEY);
      setLoading(false);
      return;
    }

    const accessible = data ?? [];
    setWorkspaces(accessible);

    const stored = sessionStorage.getItem(STORAGE_KEY);
    const valid = accessible.find((w) => w.id === stored);
    const nextId = valid ? valid.id : accessible[0]?.id ?? null;
    setCurrentWorkspaceId(nextId);
    if (nextId) sessionStorage.setItem(STORAGE_KEY, nextId);
    else sessionStorage.removeItem(STORAGE_KEY);
    setLoading(false);
  }, [currentOrgId, user]);

  useEffect(() => {
    // Clear the previous organization's workspace immediately so descendants can
    // never reuse it while the new membership query is in flight.
    setWorkspaces([]);
    setCurrentWorkspaceId(null);
    setLoading(true);
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  const switchWorkspace = useCallback((workspaceId: string) => {
    const allowed = workspaces.some((workspace) => workspace.id === workspaceId);
    if (!allowed) {
      console.warn("[WorkspaceContext] Refused inaccessible workspace selection", workspaceId);
      return;
    }

    if (workspaceId === currentWorkspaceId) return;
    setCurrentWorkspaceId(workspaceId);
    sessionStorage.setItem(STORAGE_KEY, workspaceId);
    // Downstream providers will resolve a project/dataset for the new workspace.
    // Remove the persisted project immediately so a reload cannot resurrect the
    // previous workspace's project during that transition.
    sessionStorage.removeItem("quantivis_project_id");
  }, [workspaces, currentWorkspaceId]);

  const createWorkspace = useCallback(async (name: string, description?: string): Promise<Workspace> => {
    if (!currentOrgId || !user) throw new Error("No org or user");

    const trimmed = name.trim().slice(0, 100);
    if (!trimmed) throw new Error("Workspace name is required");

    const slug = toSlug(trimmed);
    const { data, error } = await supabase
      .from("workspaces")
      .insert({
        organization_id: currentOrgId,
        name: trimmed,
        slug,
        description: description?.trim().slice(0, 500) || null,
        created_by: user.id,
      })
      .select("id, name, slug, description, organization_id, created_at")
      .single();

    if (error || !data) throw error || new Error("Failed to create workspace");

    // Membership is the access-control prerequisite. Do not expose/select the
    // workspace locally until the creator can actually read it through normal RLS.
    const { error: memberError } = await supabase.from("workspace_members").insert({
      workspace_id: data.id,
      user_id: user.id,
      role: "workspace_admin",
    });

    if (memberError) {
      await supabase.from("workspaces").delete().eq("id", data.id).eq("organization_id", currentOrgId);
      throw memberError;
    }

    const { error: quotaError } = await supabase.from("workspace_quotas").insert({ workspace_id: data.id });
    if (quotaError) {
      // Membership is valid, so retain the workspace rather than deleting user
      // work; surface quota provisioning failure to be corrected explicitly.
      console.error("[WorkspaceContext] Workspace quota provisioning failed:", quotaError.message);
    }

    setWorkspaces((prev) => prev.some((w) => w.id === data.id) ? prev : [...prev, data]);
    setCurrentWorkspaceId(data.id);
    sessionStorage.setItem(STORAGE_KEY, data.id);
    sessionStorage.removeItem("quantivis_project_id");
    return data;
  }, [currentOrgId, user]);

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) ?? null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        currentWorkspaceId,
        loading,
        switchWorkspace,
        createWorkspace,
        refreshWorkspaces: fetchWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};
