import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { VersionEntry } from "@/lib/trust-center-types";

export interface VersionMatrixProps {
  versions: VersionEntry[];
  className?: string;
}

/**
 * TC-1 Version Matrix. Every version string is imported directly from the
 * module that defines it (see trust-center.ts) — none are typed by hand.
 */
export default function VersionMatrix({ versions, className }: VersionMatrixProps) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border/50", className)} data-testid="version-matrix">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Schema version</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((entry) => (
            <TableRow key={entry.key} data-testid={`version-row-${entry.key}`}>
              <TableCell className="font-medium">{entry.component}</TableCell>
              <TableCell className="font-mono text-xs">{entry.version}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {entry.schemaVersion ?? "—"}
              </TableCell>
              <TableCell className="text-[11px] text-muted-foreground/70">{entry.source}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
