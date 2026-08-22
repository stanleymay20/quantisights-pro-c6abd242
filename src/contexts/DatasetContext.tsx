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
  error: string | null;
  evidenceReady: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const [evidenceReady, setEvidenceReady] = useState(false);
  const requestSeq = useRef(0);

  const fetchDatasets = useCallback(async () => {
    const seq = ++requestSeq.current;
    setError(null);
    setEvidenceReady(false);

    if (workspaceLoading || projectLoading) {
      setDatasets([]);
      setLoading(true);
      return;
    }

    if (!currentWorkspaceId || !currentProjectId || !currentProject) {
      setDatasets([]);
      setLoading(false);
      setEvidenceReady(true);
      return;
    }

    setDatasets([]);
    setLoading(true);
    const { data: links, error: linkErr } = await supabase
      .from("project_datasets")
      .select("dataset_id")
      .eq("project_id", currentProjectId);

    if (seq !== requestSeq.current) return;

    if (linkErr) {
      const message = `Unable to verify project datasets: ${linkErr.message}`;
      console.error("[DatasetContext]", message);
      setDatasets([]);
      setError(message);
      setLoading(false);
      return;
    }

    const dsIds = [...new Set((links ?? []).map((link) => link.dataset_id).filter(Boolean))];
    if (dsIds.length === 0) {
      setDatasets([]);
      setEvidenceReady(true);
      setLoading(false);
      return;
    }

    const { data, error: datasetError } = await supabase
      .from("datasets")
      .select("id, name, organization_id, status, row_count, is_stale, created_at, file_path")
      .eq("organization_id", currentProject.organization_id)
      .in("id", dsIds)
      .order("created_at", { ascending: false });

    if (seq !== requestSeq.current) return;

    if (datasetError) {
      const message = `Unable to verify linked datasets: ${datasetError.message}`;
      console.error("[DatasetContext]", message);
      setDatasets([]);
      setError(message);
      setLoading(false);
      return;
    }

    const verified = (data ?? []).filter((dataset) => dataset.organization_id === currentProject.organization_id);
    setDatasets(verified);
    setEvidenceReady(true);
    setLoading(false);
  }, [currentWorkspaceId, currentProjectId, currentProject, workspaceLoading, projectLoading]);

  useEffect(() => {
    setDatasets([]);
    setError(null);
    setEvidenceReady(false);
    setLoading(workspaceLoading || projectLoading || !!currentProjectId);
    void fetchDatasets();
  }, [fetchDatasets, workspaceLoading, projectLoading, currentProjectId]);

  const activeDataset = useMemo(
    () => evidenceReady ? datasets.find((dataset) => dataset.id === projectActiveDatasetId) ?? null : null,
    [datasets, projectActiveDatasetId, evidenceReady]
  );

  const activeDatasetId = activeDataset?.id ?? null;

  return (
    <DatasetContext.Provider
      value={{
        datasets,
        activeDataset,
        activeDatasetId,
        loading,
        error,
        evidenceReady,
        refreshDatasets: fetchDatasets,
      }}
    >
      {children}
    </DatasetContext.Provider>
  );
};
