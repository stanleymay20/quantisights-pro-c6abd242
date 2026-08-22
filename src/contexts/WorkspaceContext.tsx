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
  error: string | null;
  evidenceReady: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const [evidenceReady, setEvidenceReady] = useState(false);
  const requestSeq = useRef(0);

  const fetchWorkspaces = useCallback(async () => {
    const seq = ++requestSeq.current;
    setError(null);
    setEvidenceReady(false);

    if (!currentOrgId || !user) {
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      sessionStorage.removeItem(STORAGE_KEY);
      setEvidenceReady(true);
      setLoading(false);
      return;
    }

    setWorkspaces([]);
    setCurrentWorkspaceId(null);
    setLoading(true);

    const { data: memberships, error: membershipError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (seq !== requestSeq.current) return;

    if (membershipError) {
      const message = `Unable to verify workspace membership: ${membershipError.message}`;
      console.error("[WorkspaceContext]", message);
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      setError(message);
      sessionStorage.removeItem(STORAGE_KEY);
      setLoading(false);
      return;
    }

    if (!memberships || memberships.length === 0) {
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      sessionStorage.removeItem(STORAGE_KEY);
      setEvidenceReady(true);
      setLoading(false);
      return;
    }

    const memberWorkspaceIds = [...new Set(memberships.map((membership) => membership.workspace_id).filter(Boolean))];
    const { data, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, name, slug, description, organization_id, created_at")
      .eq("organization_id", currentOrgId)
      .in("id", memberWorkspaceIds)
      .order("created_at", { ascending: true });

    if (seq !== requestSeq.current) return;

    if (workspaceError) {
      const message = `Unable to verify accessible workspaces: ${workspaceError.message}`;
      console.error("[WorkspaceContext]", message);
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      setError(message);
      sessionStorage.removeItem(STORAGE_KEY);
      setLoading(false);
      return;
    }

    const accessible = (data ?? []).filter((workspace) => workspace.organization_id === currentOrgId);
    setWorkspaces(accessible);

    const stored = sessionStorage.getItem(STORAGE_KEY);
    const valid = accessible.find((workspace) => workspace.id === stored);
    const nextId = valid ? valid.id : accessible[0]?.id ?? null;
    setCurrentWorkspaceId(nextId);
    if (nextId) sessionStorage.setItem(STORAGE_KEY, nextId);
    else sessionStorage.removeItem(STORAGE_KEY);
    setEvidenceReady(true);
    setLoading(false);
  }, [currentOrgId, user]);

  useEffect(() => {
    setWorkspaces([]);
    setCurrentWorkspaceId(null);
    setError(null);
    setEvidenceReady(false);
    setLoading(true);
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  const switchWorkspace = useCallback((workspaceId: string) => {
    if (!evidenceReady || error) {
      console.warn("[WorkspaceContext] Refused workspace selection while evidence is unavailable", workspaceId);
      return;
    }
    const allowed = workspaces.some((workspace) => workspace.id === workspaceId);
    if (!allowed) {
      console.warn("[WorkspaceContext] Refused inaccessible workspace selection", workspaceId);
      return;
    }

    if (workspaceId === currentWorkspaceId) return;
    setCurrentWorkspaceId(workspaceId);
    sessionStorage.setItem(STORAGE_KEY, workspaceId);
    sessionStorage.removeItem("quantivis_project_id");
  }, [workspaces, currentWorkspaceId, evidenceReady, error]);

  const createWorkspace = useCallback(async (name: string, description?: string): Promise<Workspace> => {
    if (!currentOrgId || !user) throw new Error("No organization or authenticated user");

    const trimmed = name.trim().slice(0, 100);
    if (!trimmed) throw new Error("Workspace name is required");

    const slug = toSlug(trimmed);
    const { data, error: createError } = await supabase
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

    if (createError || !data) throw createError || new Error("Failed to create workspace");

    const { error: memberError } = await supabase.from("workspace_members").insert({
      workspace_id: data.id,
      user_id: user.id,
      role: "workspace_admin",
    });

    if (memberError) {
      const { error: rollbackError } = await supabase.from("workspaces").delete().eq("id", data.id).eq("organization_id", currentOrgId);
      if (rollbackError) console.error("[WorkspaceContext] Failed to roll back inaccessible workspace:", rollbackError.message);
      throw memberError;
    }

    const { error: quotaError } = await supabase.from("workspace_quotas").insert({ workspace_id: data.id });
    if (quotaError) {
      console.error("[WorkspaceContext] Workspace quota provisioning failed:", quotaError.message);
    }

    setWorkspaces((previous) => previous.some((workspace) => workspace.id === data.id) ? previous : [...previous, data]);
    setCurrentWorkspaceId(data.id);
    setError(null);
    setEvidenceReady(true);
    sessionStorage.setItem(STORAGE_KEY, data.id);
    sessionStorage.removeItem("quantivis_project_id");
    return data;
  }, [currentOrgId, user]);

  const currentWorkspace = evidenceReady && !error
    ? workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null
    : null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        currentWorkspaceId: currentWorkspace?.id ?? null,
        loading,
        error,
        evidenceReady,
        switchWorkspace,
        createWorkspace,
        refreshWorkspaces: fetchWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};
