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
  const { currentWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { currentProject, currentProjectId, activeDatasetId, loading: projectLoading } = useProject();
  const { activeDataset, loading: datasetLoading } = useDataset();

  // Any one of these still resolving means hasOrg/hasProject/hasDataset
  // below could be false negatives, not a real "no data" state. Consumers
  // like DatasetRequired must check this before showing an empty state —
  // without it, a real user with real data sees a false "needs data to
  // work" / "connect your data" flash on every cold navigation, simply
  // because the org/project/dataset queries hadn't resolved yet.
  const contextLoading = orgLoading || workspaceLoading || projectLoading || datasetLoading;

  return {
    // IDs for query scoping
    orgId: currentOrgId,
    workspaceId: currentWorkspaceId,
    projectId: currentProjectId,
    datasetId: activeDatasetId,

    // Rich objects for display
    orgName: currentOrg?.name ?? null,
    projectName: currentProject?.name ?? null,
    datasetName: activeDataset?.name ?? null,

    // Readiness flags
    hasOrg: !!currentOrgId,
    hasProject: !!currentProjectId,
    hasDataset: !!activeDatasetId,

    /** True while any underlying org/workspace/project/dataset query is still resolving */
    contextLoading,

    /** True when the full context is resolved and data queries can proceed */
    isReady: !!currentOrgId && !!currentProjectId && !!activeDatasetId,
  };
};
