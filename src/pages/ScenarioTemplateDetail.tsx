import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileWarning } from "lucide-react";

import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScenarioReadinessBadge } from "@/components/scenarios/ScenarioReadiness";
import ScenarioOverview from "@/components/scenarios/ScenarioOverview";
import { getScenarioTemplate } from "@/lib/scenario-template";

/**
 * ST-1 Scenario Template Detail (/enterprise/scenarios/:templateId).
 *
 * Renders one template's full playbook. An unknown template id shows a
 * clear "not found" state rather than fabricating content.
 */
const ScenarioTemplateDetailPage = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const template = templateId ? getScenarioTemplate(templateId) : null;

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 space-y-1">
        <div className="flex items-center gap-2">
          <SidebarMobileToggle />
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-muted-foreground" asChild>
            <Link to="/enterprise/scenarios">
              <ArrowLeft className="h-3.5 w-3.5" />
              Scenario Templates
            </Link>
          </Button>
        </div>
        {template ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
                {template.category}
              </Badge>
              <ScenarioReadinessBadge template={template} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{template.title}</h1>
            <p className="text-sm text-muted-foreground">{template.executive_summary}</p>
          </>
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight">Scenario Template</h1>
        )}
      </div>

      {template ? (
        <ScenarioOverview template={template} />
      ) : (
        <div
          className="flex flex-col items-center gap-3 rounded-xl border border-border/50 p-10 text-center"
          data-testid="scenario-template-not-found"
        >
          <FileWarning className="h-8 w-8 text-muted-foreground" />
          <p className="text-base font-semibold">Scenario template not found</p>
          <p className="max-w-md text-sm text-muted-foreground">
            "{templateId}" does not match any of the six scenario templates. Quantivis never generates a
            template from an unrecognized id.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/enterprise/scenarios">Browse scenario templates</Link>
          </Button>
        </div>
      )}
    </div>
  );
};

export default ScenarioTemplateDetailPage;
