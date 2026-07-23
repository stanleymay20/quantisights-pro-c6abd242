import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import ScenarioGallery from "@/components/scenarios/ScenarioGallery";
import { getScenarioTemplates } from "@/lib/scenario-template";

/**
 * ST-1 Scenario Template gallery (/enterprise/scenarios).
 *
 * These are structured enterprise playbooks, not mock decisions — nothing
 * on this page executes, calls a connector, or invokes AI. Every readiness
 * badge is computed from the live Trust Center capability matrix.
 */
const ScenarioTemplatesPage = () => {
  const templates = getScenarioTemplates();

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <SidebarMobileToggle />
          <h1 className="text-2xl font-semibold tracking-tight">Scenario Templates</h1>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every enterprise decision starts from a reusable playbook. Each template explains the business
          problem, the evidence it relies on, and exactly which platform capabilities are implemented
          today — never more than that.
        </p>
      </div>

      <ScenarioGallery templates={templates} />
    </div>
  );
};

export default ScenarioTemplatesPage;
