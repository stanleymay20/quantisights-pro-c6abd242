import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AttentionView } from "@/hooks/useOperationalGraph";

interface Props {
  views: AttentionView[];
  level: 1 | 2 | 3;
}

const LEVEL_LABEL: Record<number, string> = {
  1: "Executive abstraction",
  2: "Operational chain",
  3: "Evidence lineage",
};

export const GraphAttentionSummary = ({ views, level }: Props) => {
  const filtered = views.filter((v) => v.abstraction_level === level);
  if (!filtered.length) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No {LEVEL_LABEL[level].toLowerCase()} surfaced. Run a graph rebuild to populate.
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {filtered.map((v) => (
        <Card key={v.id} className="p-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px]">L{v.abstraction_level}</Badge>
              <Badge variant="secondary" className="text-[10px] uppercase">{v.persona}</Badge>
            </div>
            <div className="font-medium truncate">{v.title}</div>
            <div className="text-xs text-muted-foreground mt-1">{v.compressed_summary}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-semibold tabular-nums">{v.priority_score.toFixed(0)}</div>
            <div className="text-[10px] text-muted-foreground">priority</div>
          </div>
        </Card>
      ))}
    </div>
  );
};
