import { useOrganization } from "@/hooks/useOrganization";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProject } from "@/contexts/ProjectContext";
import { useDataset } from "@/contexts/DatasetContext";

/**
 * Central hook that resolves the full data context for any module.
 * Every data-dependent module should use this instead of manually
 * calling useOrganization + useProject + useDataset individually.
 *
 * Returns the complete hierarchy: Org → Workspace → Project → Dataset
 */
export const useActiveDataContext = () => {
  const { currentOrgId, currentOrg, loading: orgLoading } = useOrganization();
  const { currentWorkspaceId, currentWorkspace, loading: workspaceLoading } = useWorkspace();
  const { currentProject, currentProjectId, loading: projectLoading } = useProject();
  const { activeDataset, activeDatasetId, loading: datasetLoading } = useDataset();

  const contextLoading = orgLoading || workspaceLoading || projectLoading || datasetLoading;
  const hasOrg = !!currentOrgId;
  const hasWorkspace = !!currentWorkspaceId && !!currentWorkspace;
  const hasProject = !!currentProjectId && !!currentProject;
  const hasDataset = !!activeDatasetId && !!activeDataset;

  // Treat the hierarchy as ready only when every rich object has been resolved,
  // not merely when a persisted foreign-key pointer happens to be non-null.
  // DatasetContext exposes activeDatasetId only after verifying the dataset is
  // actually linked to the current project and belongs to the same organization.
  const isReady = !contextLoading && hasOrg && hasWorkspace && hasProject && hasDataset;

  return {
    // IDs for query scoping
    orgId: currentOrgId,
    workspaceId: currentWorkspaceId,
    projectId: currentProjectId,
    datasetId: activeDatasetId,

    // Rich objects for display
    orgName: currentOrg?.name ?? null,
    workspaceName: currentWorkspace?.name ?? null,
    projectName: currentProject?.name ?? null,
    datasetName: activeDataset?.name ?? null,

    // Readiness flags
    hasOrg,
    hasWorkspace,
    hasProject,
    hasDataset,

    /** True while any underlying org/workspace/project/dataset query is still resolving */
    contextLoading,

    /** True only when the complete verified hierarchy can safely scope data queries */
    isReady,
  };
};
