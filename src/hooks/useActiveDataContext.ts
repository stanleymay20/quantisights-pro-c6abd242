import { useOrganization } from "@/hooks/useOrganization";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProject } from "@/contexts/ProjectContext";
import { useDataset } from "@/contexts/DatasetContext";

/**
 * Central hook that resolves the complete data scope:
 * Organization → Workspace → Project → Dataset.
 *
 * Every layer exposes verified-empty separately from unavailable evidence so
 * downstream modules cannot convert a scope-query failure into onboarding.
 */
export const useActiveDataContext = () => {
  const {
    currentOrgId,
    currentOrg,
    loading: orgLoading,
    error: orgError,
    evidenceReady: orgEvidenceReady,
    refreshOrganizations,
  } = useOrganization();
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
  const hasOrg = !!currentOrgId && !!currentOrg;
  const hasWorkspace = !!currentWorkspaceId && !!currentWorkspace;
  const hasProject = !!currentProjectId && !!currentProject;
  const hasDataset = !!activeDatasetId && !!activeDataset;

  const contextError = orgError ?? workspaceError ?? projectError ?? datasetError;
  const hierarchyEvidenceReady = orgEvidenceReady
    && workspaceEvidenceReady
    && projectEvidenceReady
    && datasetEvidenceReady;

  const retryContext = async () => {
    if (orgError || !orgEvidenceReady) {
      await refreshOrganizations();
      return;
    }
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
    orgEvidenceReady,
    workspaceEvidenceReady,
    projectEvidenceReady,
    datasetEvidenceReady,
    hierarchyEvidenceReady,
    retryContext,
    refreshOrganizations,
    refreshWorkspaces,
    refreshProjects,
    refreshDatasets,
    isReady,
  };
};
