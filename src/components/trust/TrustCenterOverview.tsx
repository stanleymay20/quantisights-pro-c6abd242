import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlatformOverview } from "@/lib/trust-center-types";

function OverviewField({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold" data-testid={`overview-value-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground/70">{note}</p>
    </div>
  );
}

export interface TrustCenterOverviewProps {
  overview: PlatformOverview;
  generatedAt: string;
}

/**
 * TC-1 Platform Overview. Only "version" and "environment" reflect
 * something this build can actually read; build timestamp, git commit, and
 * deployment status are reported as unavailable rather than guessed.
 */
export default function TrustCenterOverview({ overview, generatedAt }: TrustCenterOverviewProps) {
  return (
    <Card data-testid="trust-center-overview">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
            Platform Overview
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            Generated {new Date(generatedAt).toLocaleString()}
          </span>
        </div>
        <CardTitle className="text-xl">Quantivis operational transparency</CardTitle>
        <p className="text-sm text-muted-foreground">
          This overview surfaces only what can actually be read from the running build. Fields with no
          real source say so explicitly instead of guessing.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <OverviewField label="Version" value={overview.version} note={overview.versionSource} />
        <OverviewField label="Environment" value={overview.environment} note={overview.environmentSource} />
        <OverviewField
          label="Build timestamp"
          value={overview.buildTimestamp ?? "NOT AVAILABLE"}
          note={overview.buildTimestampNote}
        />
        <OverviewField label="Git commit" value={overview.gitCommit ?? "NOT AVAILABLE"} note={overview.gitCommitNote} />
        <OverviewField
          label="Deployment status"
          value={overview.deploymentStatus}
          note={overview.deploymentStatusNote}
        />
      </CardContent>
    </Card>
  );
}
