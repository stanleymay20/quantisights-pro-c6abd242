import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

interface Project {
  id: string;
  name: string;
  description: string | null;
  active_dataset_id: string | null;
  organization_id: string;
  workspace_id: string;
  created_at: string;
}

interface ProjectContextType {
  projects: Project[];
  currentProject: Project | null;
  currentProjectId: string | null;
  activeDatasetId: string | null;
  loading: boolean;
  error: string | null;
  evidenceReady: boolean;
  switchProject: (projectId: string) => void;
  setActiveDataset: (projectId: string, datasetId: string) => Promise<void>;
  createProject: (name: string, description?: string, workspaceIdOverride?: string) => Promise<Project>;
  attachDataset: (projectId: string, datasetId: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const useProject = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
};

const STORAGE_KEY = "quantivis_project_id";

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const {
    currentWorkspaceId,
    workspaces,
    loading: workspaceLoading,
    error: workspaceError,
    evidenceReady: workspaceEvidenceReady,
  } = useWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evidenceReady, setEvidenceReady] = useState(false);
  const requestSeq = useRef(0);

  const fetchProjects = useCallback(async () => {
    const seq = ++requestSeq.current;
    setError(null);
    setEvidenceReady(false);

    if (workspaceLoading) {
      setProjects([]);
      setCurrentProjectId(null);
      setLoading(true);
      return;
    }

    if (workspaceError || !workspaceEvidenceReady) {
      setProjects([]);
      setCurrentProjectId(null);
      sessionStorage.removeItem(STORAGE_KEY);
      setError(workspaceError ? `Workspace context unavailable: ${workspaceError}` : "Workspace context is not verified.");
      setLoading(false);
      return;
    }

    if (!currentOrgId) {
      setProjects([]);
      setCurrentProjectId(null);
      sessionStorage.removeItem(STORAGE_KEY);
      setEvidenceReady(true);
      setLoading(false);
      return;
    }

    if (!currentWorkspaceId) {
      setProjects([]);
      setCurrentProjectId(null);
      sessionStorage.removeItem(STORAGE_KEY);
      setEvidenceReady(true);
      setLoading(false);
      return;
    }

    setProjects([]);
    setCurrentProjectId(null);
    setLoading(true);
    const { data, error: projectError } = await supabase
      .from("projects")
      .select("id, name, description, active_dataset_id, organization_id, workspace_id, created_at")
      .eq("organization_id", currentOrgId)
      .eq("workspace_id", currentWorkspaceId)
      .order("created_at", { ascending: false });

    if (seq !== requestSeq.current) return;

    if (projectError) {
      const message = `Unable to verify projects: ${projectError.message}`;
      console.error("[ProjectContext]", message);
      setProjects([]);
      setCurrentProjectId(null);
      setError(message);
      sessionStorage.removeItem(STORAGE_KEY);
      setLoading(false);
      return;
    }

    const scopedProjects = (data ?? []).filter(
      (project) => project.organization_id === currentOrgId && project.workspace_id === currentWorkspaceId
    );
    setProjects(scopedProjects);

    const stored = sessionStorage.getItem(STORAGE_KEY);
    const valid = scopedProjects.find((project) => project.id === stored);
    const nextId = valid ? valid.id : scopedProjects[0]?.id ?? null;
    setCurrentProjectId(nextId);
    if (nextId) sessionStorage.setItem(STORAGE_KEY, nextId);
    else sessionStorage.removeItem(STORAGE_KEY);
    setEvidenceReady(true);
    setLoading(false);
  }, [currentOrgId, currentWorkspaceId, workspaceLoading, workspaceError, workspaceEvidenceReady]);

  useEffect(() => {
    setProjects([]);
    setCurrentProjectId(null);
    setError(null);
    setEvidenceReady(false);
    setLoading(true);
    if (!workspaceLoading) sessionStorage.removeItem(STORAGE_KEY);
    void fetchProjects();
  }, [fetchProjects, workspaceLoading]);

  const switchProject = useCallback((projectId: string) => {
    if (!evidenceReady || error) {
      console.warn("[ProjectContext] Refused project selection while evidence is unavailable", projectId);
      return;
    }
    const allowed = projects.some((project) => project.id === projectId);
    if (!allowed) {
      console.warn("[ProjectContext] Refused project outside current workspace", projectId);
      return;
    }

    if (projectId === currentProjectId) return;
    setCurrentProjectId(projectId);
    sessionStorage.setItem(STORAGE_KEY, projectId);
  }, [projects, currentProjectId, evidenceReady, error]);

  const assertProjectInCurrentScope = useCallback((projectId: string) => {
    if (!evidenceReady || error) throw new Error("Project context is not verified");
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project || !currentOrgId || !currentWorkspaceId) {
      throw new Error("Project is not available in the active workspace");
    }
    if (project.organization_id !== currentOrgId || project.workspace_id !== currentWorkspaceId) {
      throw new Error("Project is outside the active organization/workspace scope");
    }
    return project;
  }, [projects, currentOrgId, currentWorkspaceId, evidenceReady, error]);

  const assertDatasetLinked = useCallback(async (projectId: string, datasetId: string) => {
    assertProjectInCurrentScope(projectId);

    const { data: link, error: linkError } = await supabase
      .from("project_datasets")
      .select("dataset_id")
      .eq("project_id", projectId)
      .eq("dataset_id", datasetId)
      .maybeSingle();

    if (linkError) throw linkError;
    if (!link) throw new Error("Dataset is not linked to the selected project");

    const { data: dataset, error: datasetError } = await supabase
      .from("datasets")
      .select("id, organization_id")
      .eq("id", datasetId)
      .eq("organization_id", currentOrgId!)
      .maybeSingle();

    if (datasetError) throw datasetError;
    if (!dataset) throw new Error("Dataset is outside the active organization");
  }, [assertProjectInCurrentScope, currentOrgId]);

  const setActiveDataset = useCallback(async (projectId: string, datasetId: string) => {
    await assertDatasetLinked(projectId, datasetId);

    const { data: updated, error: updateError } = await supabase
      .from("projects")
      .update({ active_dataset_id: datasetId })
      .eq("id", projectId)
      .eq("organization_id", currentOrgId!)
      .eq("workspace_id", currentWorkspaceId!)
      .select("id")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) throw new Error("Project context changed before the active dataset could be saved");

    setProjects((previous) =>
      previous.map((project) => project.id === projectId ? { ...project, active_dataset_id: datasetId } : project)
    );
  }, [assertDatasetLinked, currentOrgId, currentWorkspaceId]);

  const createProject = useCallback(async (name: string, description?: string, workspaceIdOverride?: string): Promise<Project> => {
    if (!currentOrgId || !user || workspaceLoading || workspaceError || !workspaceEvidenceReady) {
      throw new Error("Verified organization and workspace context required");
    }

    const trimmed = name.trim().slice(0, 120);
    if (!trimmed) throw new Error("Project name is required");

    const workspaceId = workspaceIdOverride || currentWorkspaceId;
    if (!workspaceId || !workspaces.some((workspace) => workspace.id === workspaceId && workspace.organization_id === currentOrgId)) {
      throw new Error("Project workspace is not accessible");
    }

    const { data, error: createError } = await supabase
      .from("projects")
      .insert({
        organization_id: currentOrgId,
        name: trimmed,
        description: description?.trim().slice(0, 1000) || null,
        created_by: user.id,
        workspace_id: workspaceId,
      })
      .select("id, name, description, active_dataset_id, organization_id, workspace_id, created_at")
      .single();

    if (createError || !data) throw createError || new Error("Failed to create project");

    if (workspaceId === currentWorkspaceId) {
      setProjects((previous) => previous.some((project) => project.id === data.id) ? previous : [data, ...previous]);
      setCurrentProjectId(data.id);
      setError(null);
      setEvidenceReady(true);
      sessionStorage.setItem(STORAGE_KEY, data.id);
    }
    return data;
  }, [currentOrgId, user, workspaceLoading, workspaceError, workspaceEvidenceReady, currentWorkspaceId, workspaces]);

  const attachDataset = useCallback(async (projectId: string, datasetId: string) => {
    if (!user || !currentOrgId) throw new Error("Authenticated organization context required");
    assertProjectInCurrentScope(projectId);

    const { data: dataset, error: datasetError } = await supabase
      .from("datasets")
      .select("id")
      .eq("id", datasetId)
      .eq("organization_id", currentOrgId)
      .maybeSingle();

    if (datasetError) throw datasetError;
    if (!dataset) throw new Error("Dataset is not available in the active organization");

    const { error: attachError } = await supabase.from("project_datasets").upsert(
      { project_id: projectId, dataset_id: datasetId, added_by: user.id },
      { onConflict: "project_id,dataset_id" }
    );
    if (attachError) throw attachError;
  }, [user, currentOrgId, assertProjectInCurrentScope]);

  const currentProject = evidenceReady && !error
    ? projects.find((project) => project.id === currentProjectId) ?? null
    : null;
  const activeDatasetId = currentProject?.active_dataset_id ?? null;

  return (
    <ProjectContext.Provider
      value={{
        projects,
        currentProject,
        currentProjectId: currentProject?.id ?? null,
        activeDatasetId,
        loading,
        error,
        evidenceReady,
        switchProject,
        setActiveDataset,
        createProject,
        attachDataset,
        refreshProjects: fetchProjects,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};
