import BaseMappingIntelligencePanel from "./MappingIntelligencePanel";
import type { IngestionIntelligenceResult } from "@/lib/ingestion-intelligence";
import type { CrossSheetDiscoveryResult } from "@/lib/cross-sheet-discovery";

interface Props {
  intelligence: IngestionIntelligenceResult;
  relationships?: CrossSheetDiscoveryResult | null;
}

export default function MappingIntelligencePanelInteractive(props: Props) {
  return <BaseMappingIntelligencePanel {...props} />;
}
