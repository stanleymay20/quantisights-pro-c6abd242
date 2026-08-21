import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

interface Dataset {
  id: string;
  name: string;
  organization_id: string;
  status: string;
  row_count: number | null;
  is_stale: boolean | null;
  created_at: string;
  file_path: string | null;
}

interface DatasetContextType {
  datasets: Dataset[];
  activeDataset: Dataset | null;
  activeDatasetId: string | null;
  loading: boolean;
  refreshDatasets: () => Promise<void>;
}

const DatasetContext = createContext<DatasetContextType | undefined>(undefined);

export const useDataset = () => {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error("useDataset must be used within DatasetProvider");
  return ctx;
};

export const DatasetProvider = ({ children }: { children: ReactNode }) => {
  const { currentProject, currentProjectId, activeDatasetId: projectActiveDatasetId, loading: projectLoading } = useProject();
  const { currentWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const requestSeq = useRef(0);

  const fetchDatasets = useCallback(async () => {
    const seq = ++requestSeq.current;

    if (workspaceLoading || projectLoading) {
      setDatasets([]);
      setLoading(true);
      return;
    }

    if (!currentWorkspaceId || !currentProjectId || !currentProject) {
      setDatasets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data: links, error: linkErr } = await supabase
      .from("project_datasets")
      .select("dataset_id")
      .eq("project_id", currentProjectId);

    if (seq !== requestSeq.current) return;

    if (linkErr) {
      console.error("[DatasetContext] Failed to fetch project_datasets:", linkErr.message);
      setDatasets([]);
      setLoading(false);
      return;
    }

    const dsIds = [...new Set((links ?? []).map((link) => link.dataset_id).filter(Boolean))];
    if (dsIds.length === 0) {
      setDatasets([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("datasets")
      .select("id, name, organization_id, status, row_count, is_stale, created_at, file_path")
      .eq("organization_id", currentProject.organization_id)
      .in("id", dsIds)
      .order("created_at", { ascending: false });

    if (seq !== requestSeq.current) return;

    if (error) {
      console.error("[DatasetContext] Failed to fetch datasets:", error.message);
      setDatasets([]);
      setLoading(false);
      return;
    }

    // A linked dataset must still belong to the same organization as the
    // project. RLS should enforce this server-side; keep the client invariant as
    // a second line of defence and to prevent stale/malformed links in the UI.
    setDatasets((data ?? []).filter((dataset) => dataset.organization_id === currentProject.organization_id));
    setLoading(false);
  }, [currentWorkspaceId, currentProjectId, currentProject, workspaceLoading, projectLoading]);

  useEffect(() => {
    // Incrementing occurs inside fetchDatasets. Clearing first ensures a previous
    // project's dataset can never remain visible while the new query resolves.
    setDatasets([]);
    setLoading(workspaceLoading || projectLoading || !!currentProjectId);
    void fetchDatasets();
  }, [fetchDatasets, workspaceLoading, projectLoading, currentProjectId]);

  const activeDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === projectActiveDatasetId) ?? null,
    [datasets, projectActiveDatasetId]
  );

  // Expose only a resolved, project-linked dataset ID. A stale
  // projects.active_dataset_id must not make downstream modules query a dataset
  // that DatasetContext could not verify.
  const activeDatasetId = activeDataset?.id ?? null;

  return (
    <DatasetContext.Provider
      value={{
        datasets,
        activeDataset,
        activeDatasetId,
        loading,
        refreshDatasets: fetchDatasets,
      }}
    >
      {children}
    </DatasetContext.Provider>
  );
};
