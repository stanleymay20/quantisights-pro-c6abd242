import { Link } from "react-router-dom";
import { ArrowRight, Building2, Gauge, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScenarioReadinessBadge } from "@/components/scenarios/ScenarioReadiness";
import type { ScenarioTemplate } from "@/lib/scenario-template-types";

export interface ScenarioCardProps {
  template: ScenarioTemplate;
}

/**
 * ST-1 gallery card. Shows category, industry, pilot readiness, an
 * illustrative business-value band, and the typical executive owner — all
 * sourced from the template's own fields, never fabricated per-view.
 */
export default function ScenarioCard({ template }: ScenarioCardProps) {
  const owner = template.recommended_roles[0] ?? "Not specified";

  return (
    <Card className="flex h-full flex-col" data-testid={`scenario-card-${template.template_id}`}>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
            {template.category}
          </Badge>
          <ScenarioReadinessBadge template={template} />
        </div>
        <CardTitle className="text-lg leading-snug">{template.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{template.executive_summary}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <div className="grid gap-3 text-xs">
          <div className="flex items-start gap-2">
            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-muted-foreground">{template.industry.join(", ")}</span>
          </div>
          <div className="flex items-start gap-2">
            <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-muted-foreground">
              Illustrative business value: <span className="font-medium text-foreground">{template.business_impact.band}</span>
            </span>
          </div>
          <div className="flex items-start gap-2">
            <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-muted-foreground">Typical owner: {owner}</span>
          </div>
        </div>
        <Link
          to={`/enterprise/scenarios/${template.template_id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          data-testid={`scenario-card-link-${template.template_id}`}
        >
          View scenario template
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
