import { ReactNode } from "react";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Database, Upload, Sparkles, Loader2, AlertTriangle, RefreshCw } from "lucide-react";

interface DatasetRequiredProps {
  children: ReactNode;
  moduleName?: string;
  moduleDescription?: string;
}

/**
 * Gates data-dependent modules on a verified Org → Workspace → Project → Dataset
 * hierarchy. Read failures are unavailable evidence, never onboarding/empty data.
 */
const DatasetRequired = ({
  children,
  moduleName = "This feature",
  moduleDescription,
}: DatasetRequiredProps) => {
  const {
    hasOrg,
    hasWorkspace,
    hasProject,
    hasDataset,
    contextLoading,
    contextError,
    workspaceEvidenceReady,
    projectEvidenceReady,
    datasetEvidenceReady,
    retryContext,
  } = useActiveDataContext();
  const navigate = useNavigate();

  if (contextLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  const unresolvedVerifiedLayer = hasOrg && (
    !workspaceEvidenceReady
    || (hasWorkspace && !projectEvidenceReady)
    || (hasProject && !datasetEvidenceReady)
  );

  if (contextError || unresolvedVerifiedLayer) {
    return (
      <EmptyState
        icon={<AlertTriangle className="w-8 h-8 text-destructive" />}
        title="Data context unavailable"
        description={contextError ?? "Quantivis could not verify the active workspace, project, or dataset hierarchy. No empty-data claim has been made."}
        action={
          <Button size="sm" variant="outline" onClick={() => void retryContext()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry Context Verification
          </Button>
        }
      />
    );
  }

  if (!hasOrg || !hasWorkspace || !hasProject || !hasDataset) {
    const missingLayer = !hasOrg
      ? "organization"
      : !hasWorkspace
        ? "workspace"
        : !hasProject
          ? "project"
          : "dataset";

    const headline = missingLayer === "dataset"
      ? `${moduleName} needs data to work`
      : `Select a ${missingLayer} to use ${moduleName}`;

    const body = moduleDescription
      ?? (missingLayer === "dataset"
        ? `Upload a CSV or connect a data source — ${moduleName.toLowerCase()} activates once Quantivis has a verified active dataset.`
        : `Quantivis verified the current context and found no active ${missingLayer}. Select or create one before using ${moduleName.toLowerCase()}.`);

    return (
      <EmptyState
        icon={<Database className="w-8 h-8 text-primary" />}
        title={headline}
        description={body}
        action={missingLayer === "dataset" ? (
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Button size="sm" onClick={() => navigate("/data-upload")}>
              <Upload className="w-4 h-4 mr-2" />
              Upload a Dataset
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/demo")}>
              <Sparkles className="w-4 h-4 mr-2" />
              Try with Sample Data
            </Button>
          </div>
        ) : undefined}
      />
    );
  }

  return <>{children}</>;
};

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md space-y-5">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

export default DatasetRequired;
