import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  CapabilityEntry,
  CapabilityStatus,
  DeploymentMaturity,
} from "@/lib/trust-center-types";

const STATUS_STYLES: Record<CapabilityStatus, string> = {
  Implemented: "border-success/30 bg-success/10 text-success",
  "Partially Implemented": "border-warning/30 bg-warning/10 text-warning",
  Planned: "border-primary/30 bg-primary/10 text-primary",
  "Not Implemented": "border-destructive/30 bg-destructive/10 text-destructive",
  Unknown: "border-border bg-muted text-muted-foreground",
};

const DEPLOYMENT_STYLES: Record<DeploymentMaturity, string> = {
  "Not Deployed": "border-destructive/30 bg-destructive/10 text-destructive",
  "Live In App": "border-primary/30 bg-primary/10 text-primary",
  Unknown: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: CapabilityStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("w-fit shrink-0 text-[10px] uppercase tracking-wide", STATUS_STYLES[status])}
      data-testid={`status-badge-${status.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {status}
    </Badge>
  );
}

export function DeploymentBadge({ deployment }: { deployment: DeploymentMaturity }) {
  return (
    <Badge
      variant="outline"
      className={cn("w-fit shrink-0 text-[10px] uppercase tracking-wide", DEPLOYMENT_STYLES[deployment])}
      data-testid={`deployment-badge-${deployment.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {deployment}
    </Badge>
  );
}

export interface CapabilityMatrixProps {
  capabilities: CapabilityEntry[];
  className?: string;
}

/**
 * TC-1 Capability Matrix: exactly one implementation status AND one
 * deployment maturity per subsystem. Implementation and deployment are
 * reported on separate columns so an "Implemented" label can never be
 * misread as "in production" — deployment is a strictly separate axis, and
 * neither axis alone constitutes a production-readiness claim.
 */
export default function CapabilityMatrix({ capabilities, className }: CapabilityMatrixProps) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border/50", className)} data-testid="capability-matrix">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Capability</TableHead>
            <TableHead className="w-[150px]">Implementation</TableHead>
            <TableHead className="w-[140px]">Deployment</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {capabilities.map((capability) => (
            <TableRow key={capability.key} data-testid={`capability-row-${capability.key}`}>
              <TableCell className="font-medium">{capability.label}</TableCell>
              <TableCell>
                <StatusBadge status={capability.status} />
              </TableCell>
              <TableCell>
                <DeploymentBadge deployment={capability.deployment} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                <p>{capability.detail}</p>
                {capability.evidence.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    Evidence: {capability.evidence.join(", ")}
                  </p>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

