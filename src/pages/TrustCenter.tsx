import { AlertTriangle } from "lucide-react";

import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CapabilityMatrix, { DeploymentBadge, StatusBadge } from "@/components/trust/CapabilityMatrix";
import SystemHealthCard from "@/components/trust/SystemHealthCard";
import TrustCenterOverview from "@/components/trust/TrustCenterOverview";
import VersionMatrix from "@/components/trust/VersionMatrix";
import { buildTrustCenterData } from "@/lib/trust-center";

/**
 * TC-1 Enterprise Trust Center (/enterprise/trust).
 *
 * A pure observability/transparency layer: everything rendered here comes
 * from trust-center.ts, which reads real exported version constants and
 * manually-verified, cited facts about the current implementation. Nothing
 * on this page is computed from live telemetry, because no live telemetry
 * endpoint exists yet — see the Runtime Health and Known Limitations
 * sections below.
 */
const TrustCenterPage = () => {
  const data = buildTrustCenterData();

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <SidebarMobileToggle />
          <h1 className="text-2xl font-semibold tracking-tight">Enterprise Trust Center</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          The operational transparency layer for Quantivis. This page reports on two independent
          axes — <strong>Implementation Maturity</strong> (is the code written and wired inside this
          repository?) and <strong>Deployment Maturity</strong> (is it reachable at runtime?) — and
          never conflates either with production readiness, which depends on hosting, SLOs, and
          customer configuration outside this codebase and is reported as UNKNOWN.
        </p>
      </div>

      <section aria-labelledby="tc-overview-title">
        <h2 id="tc-overview-title" className="sr-only">
          Platform Overview
        </h2>
        <TrustCenterOverview overview={data.overview} generatedAt={data.generatedAt} />
      </section>

      <section aria-labelledby="tc-capabilities-title" className="space-y-3">
        <div>
          <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
            Capability Matrix
          </Badge>
          <h2 id="tc-capabilities-title" className="mt-2 text-lg font-semibold">
            Capabilities — Implementation and Deployment
          </h2>
          <p className="text-sm text-muted-foreground">
            Two independent columns per subsystem. <strong>Implementation</strong> is a source-tree
            statement: "Implemented" means coded, tested, and imported by a live route/hook/edge
            function in this repository — nothing more. <strong>Deployment</strong> is a runtime
            statement: "Live In App" means reachable inside this app's surface only, and does NOT
            assert deployment to any specific customer environment or production readiness.
          </p>
        </div>
        <CapabilityMatrix capabilities={data.capabilities} />
      </section>

      <section aria-labelledby="tc-runtime-title" className="space-y-3">
        <div>
          <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
            Runtime Health
          </Badge>
          <h2 id="tc-runtime-title" className="mt-2 text-lg font-semibold">
            Runtime
          </h2>
          <p className="text-sm text-muted-foreground">
            No live telemetry endpoint exists for these subsystems today, so every card below reports
            NOT AVAILABLE or NOT IMPLEMENTED rather than a green indicator.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.runtimeHealth.map((entry) => (
            <SystemHealthCard key={entry.key} entry={entry} />
          ))}
        </div>
      </section>

      <section aria-labelledby="tc-evidence-title" className="space-y-3">
        <div>
          <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
            Evidence Integrity
          </Badge>
          <h2 id="tc-evidence-title" className="mt-2 text-lg font-semibold">
            Evidence
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.evidenceIntegrity.map((entry) => (
            <div
              key={entry.key}
              className="rounded-xl border border-border/50 bg-background p-4"
              data-testid={`evidence-integrity-${entry.key}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold">{entry.label}</h3>
                <StatusBadge status={entry.status} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{entry.detail}</p>
              {entry.evidence.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground/70">
                  Evidence: {entry.evidence.join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="tc-governance-title" className="space-y-3">
        <div>
          <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
            Governance Status
          </Badge>
          <h2 id="tc-governance-title" className="mt-2 text-lg font-semibold">
            Governance
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.governance.map((entry) => (
            <div
              key={entry.key}
              className="rounded-xl border border-border/50 bg-background p-4"
              data-testid={`governance-${entry.key}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold">{entry.label}</h3>
                <StatusBadge status={entry.status} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{entry.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="tc-versions-title" className="space-y-3">
        <div>
          <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
            Version Matrix
          </Badge>
          <h2 id="tc-versions-title" className="mt-2 text-lg font-semibold">
            Versions
          </h2>
          <p className="text-sm text-muted-foreground">
            Every version below is imported directly from the module that defines it — none are typed by
            hand.
          </p>
        </div>
        <VersionMatrix versions={data.versions} />
      </section>

      <section aria-labelledby="tc-readiness-title" className="space-y-3">
        <div>
          <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
            Enterprise Readiness
          </Badge>
          <h2 id="tc-readiness-title" className="mt-2 text-lg font-semibold">
            Enterprise readiness matrix
          </h2>
          <p className="text-sm text-muted-foreground">
            A matrix, not a score. Each row cites where its assessment can be verified.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border/50" data-testid="enterprise-readiness-matrix">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Dimension</th>
                <th className="px-4 py-2 font-semibold">Assessment</th>
                <th className="px-4 py-2 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {data.enterpriseReadiness.map((row) => (
                <tr key={row.key} className="border-b border-border/30 last:border-0" data-testid={`readiness-row-${row.key}`}>
                  <td className="px-4 py-3 font-medium">{row.dimension}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.assessment}</td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground/70">
                    {row.citedSources.length > 0 ? row.citedSources.join(", ") : "UNKNOWN — not independently verifiable"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="tc-limitations-title" className="space-y-3">
        <div>
          <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
            Known Limitations
          </Badge>
          <h2 id="tc-limitations-title" className="mt-2 text-lg font-semibold">
            Limitations
          </h2>
          <p className="text-sm text-muted-foreground">
            Every capability above that is not marked Implemented is listed here automatically — this
            list cannot silently fall out of sync with the Capability Matrix.
          </p>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {data.limitations.length} known limitation{data.limitations.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {data.limitations.map((limitation) => (
                <li
                  key={limitation.key}
                  className="flex flex-col gap-1 border-b border-border/30 pb-3 last:border-0 last:pb-0"
                  data-testid={`limitation-${limitation.key}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium">{limitation.label}</span>
                    <div className="flex items-center gap-1">
                      <StatusBadge status={limitation.status} />
                      <DeploymentBadge deployment={limitation.deployment} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{limitation.detail}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default TrustCenterPage;
