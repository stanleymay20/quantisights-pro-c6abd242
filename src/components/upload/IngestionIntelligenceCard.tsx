import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { IngestionIntelligenceResult } from "@/lib/ingestion-intelligence";

interface Props {
  intelligence: IngestionIntelligenceResult;
}

export default function IngestionIntelligenceCard({ intelligence }: Props) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            Locale: {intelligence.locale.locale}
          </Badge>
          <Badge variant="outline">
            Trust: {intelligence.repairReport.summary.trustSignal}
          </Badge>
          <Badge variant="outline">
            PII: {intelligence.dictionary.summary.piiCount}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div>Recovered Headers: {intelligence.repairReport.headerRecovery.recoveredCount}</div>
          <div>Mixed-Type Repairs: {intelligence.repairReport.mixedTypes.repairedColumnCount}</div>
          <div>Dictionary Fields: {intelligence.dictionary.fieldCount}</div>
          <div>Column Groups: {intelligence.columnSimilarity.groups.length}</div>
        </div>

        <p className="text-xs text-muted-foreground">
          {intelligence.repairReport.summary.recommendedAction}
        </p>
      </CardContent>
    </Card>
  );
}
