import { useOrganization } from "@/hooks/useOrganization";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProject } from "@/contexts/ProjectContext";
import { useDataset } from "@/contexts/DatasetContext";

/**
 * Central hook that resolves the full data context for any module.
 * Every data-dependent module should use this instead of manually
 * calling useOrganization + useProject + useDataset individually.
 */
export const useActiveDataContext = () => {
  const { currentOrgId, currentOrg, loading: orgLoading } = useOrganization();
  const {
    currentWorkspaceId,
    currentWorkspace,
    loading: workspaceLoading,
    error: workspaceError,
    evidenceReady: workspaceEvidenceReady,
    refreshWorkspaces,
  } = useWorkspace();
  const {
    currentProject,
    currentProjectId,
    loading: projectLoading,
    error: projectError,
    evidenceReady: projectEvidenceReady,
    refreshProjects,
  } = useProject();
  const {
    activeDataset,
    activeDatasetId,
    loading: datasetLoading,
    error: datasetError,
    evidenceReady: datasetEvidenceReady,
    refreshDatasets,
  } = useDataset();

  const contextLoading = orgLoading || workspaceLoading || projectLoading || datasetLoading;
  const hasOrg = !!currentOrgId;
  const hasWorkspace = !!currentWorkspaceId && !!currentWorkspace;
  const hasProject = !!currentProjectId && !!currentProject;
  const hasDataset = !!activeDatasetId && !!activeDataset;

  const contextError = workspaceError ?? projectError ?? datasetError;
  const hierarchyEvidenceReady = workspaceEvidenceReady && projectEvidenceReady && datasetEvidenceReady;

  const retryContext = async () => {
    if (workspaceError || !workspaceEvidenceReady) {
      await refreshWorkspaces();
      return;
    }
    if (projectError || !projectEvidenceReady) {
      await refreshProjects();
      return;
    }
    await refreshDatasets();
  };

  const isReady = !contextLoading
    && !contextError
    && hierarchyEvidenceReady
    && hasOrg
    && hasWorkspace
    && hasProject
    && hasDataset;

  return {
    orgId: currentOrgId,
    workspaceId: currentWorkspaceId,
    projectId: currentProjectId,
    datasetId: activeDatasetId,

    orgName: currentOrg?.name ?? null,
    workspaceName: currentWorkspace?.name ?? null,
    projectName: currentProject?.name ?? null,
    datasetName: activeDataset?.name ?? null,

    hasOrg,
    hasWorkspace,
    hasProject,
    hasDataset,

    contextLoading,
    contextError,
    workspaceEvidenceReady,
    projectEvidenceReady,
    datasetEvidenceReady,
    hierarchyEvidenceReady,
    retryContext,
    refreshWorkspaces,
    refreshProjects,
    refreshDatasets,
    isReady,
  };
};
