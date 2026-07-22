import ScenarioCard from "@/components/scenarios/ScenarioCard";
import type { ScenarioTemplate } from "@/lib/scenario-template-types";

export interface ScenarioGalleryProps {
  templates: ScenarioTemplate[];
}

/**
 * ST-1 gallery: renders every scenario template in the fixed, deterministic
 * order returned by getScenarioTemplates(). No filtering/sorting logic that
 * could reorder templates lives here — order is a property of the data.
 */
export default function ScenarioGallery({ templates }: ScenarioGalleryProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="scenario-gallery">
      {templates.map((template) => (
        <ScenarioCard key={template.template_id} template={template} />
      ))}
    </div>
  );
}
