import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildTrustCenterData,
  getCapabilityMatrix,
  getEnterpriseReadinessMatrix,
  getEvidenceIntegrity,
  getGovernanceStatus,
  getKnownLimitations,
  getPlatformOverview,
  getRuntimeHealth,
  getVersionMatrix,
} from "@/lib/trust-center";
import CapabilityMatrix from "@/components/trust/CapabilityMatrix";
import SystemHealthCard from "@/components/trust/SystemHealthCard";
import VersionMatrix from "@/components/trust/VersionMatrix";
import TrustCenterOverview from "@/components/trust/TrustCenterOverview";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

afterEach(cleanup);

describe("TC-1 Enterprise Trust Center — data model", () => {
  it("produces deterministic output for identical inputs", () => {
    const a = buildTrustCenterData(() => "2026-07-09T00:00:00.000Z");
    const b = buildTrustCenterData(() => "2026-07-09T00:00:00.000Z");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("keeps capability content stable across calls (no randomness)", () => {
    expect(JSON.stringify(getCapabilityMatrix())).toBe(JSON.stringify(getCapabilityMatrix()));
    expect(JSON.stringify(getVersionMatrix())).toBe(JSON.stringify(getVersionMatrix()));
  });

  it("gives every capability exactly one of the four defined statuses, never inferred without evidence", () => {
    const allowed = new Set(["Implemented", "Partially Implemented", "Planned", "Not Implemented", "Unknown"]);
    for (const capability of getCapabilityMatrix()) {
      expect(allowed.has(capability.status)).toBe(true);
      if (capability.status === "Implemented" || capability.status === "Partially Implemented") {
        expect(capability.evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it("marks subsystems with no live consumer as not Implemented (never fabricates readiness)", () => {
    const byKey = Object.fromEntries(getCapabilityMatrix().map((c) => [c.key, c]));
    // Verified by direct source inspection: these libraries have zero live consumers today.
    expect(byKey.rts_1.status).not.toBe("Implemented");
    expect(byKey.agent_gateway.status).not.toBe("Implemented");
    expect(byKey.runtime_gateway.status).not.toBe("Implemented");
    expect(byKey.runtime_service.status).not.toBe("Implemented");
    expect(byKey.queue.status).not.toBe("Implemented");
    expect(byKey.persistence.status).not.toBe("Implemented");
    expect(byKey.signing.status).toBe("Not Implemented");
    expect(byKey.http_runtime.status).toBe("Not Implemented");
  });

  it("includes Runtime Service as a capability distinct from Runtime Gateway", () => {
    const byKey = Object.fromEntries(getCapabilityMatrix().map((c) => [c.key, c]));
    expect(byKey.runtime_service).toBeDefined();
    expect(byKey.runtime_service.key).not.toBe(byKey.runtime_gateway.key);
    expect(byKey.runtime_service.evidence).toContain("src/lib/runtime-service.ts");
  });

  it("marks live, wired systems as Implemented with cited evidence", () => {
    const byKey = Object.fromEntries(getCapabilityMatrix().map((c) => [c.key, c]));
    for (const key of [
      "executive_review",
      "authentication",
      "authorization",
      "audit",
      "trust_center",
      "scenario_templates",
    ]) {
      expect(byKey[key].status).toBe("Implemented");
      expect(byKey[key].evidence.length).toBeGreaterThan(0);
    }
  });

  it("reflects ST-1: Scenario Templates is Implemented, citing actual ST-1 files and tests, and is no longer a known limitation", () => {
    const byKey = Object.fromEntries(getCapabilityMatrix().map((c) => [c.key, c]));
    const scenarioTemplates = byKey.scenario_templates;

    expect(scenarioTemplates.status).toBe("Implemented");
    expect(scenarioTemplates.evidence).toContain("src/lib/scenario-template.ts");
    expect(scenarioTemplates.evidence).toContain("src/pages/ScenarioTemplates.tsx");
    expect(scenarioTemplates.evidence).toContain("src/pages/ScenarioTemplateDetail.tsx");
    expect(scenarioTemplates.evidence).toContain("src/test/scenario-template.test.ts");

    // Honest boundaries: covers the template gallery/detail only, not adjacent capabilities.
    expect(scenarioTemplates.detail).toMatch(/no custom template/i);
    expect(scenarioTemplates.detail).toMatch(/no AI-generated template/i);
    expect(scenarioTemplates.detail).toMatch(/no runtime execution/i);
    expect(scenarioTemplates.detail).toMatch(/no direct connector onboarding/i);

    const limitations = getKnownLimitations();
    expect(limitations.some((l) => l.key === "scenario_templates")).toBe(false);
  });

  it("never reports a green/healthy runtime status — only NOT AVAILABLE or NOT IMPLEMENTED", () => {
    const health = getRuntimeHealth();
    expect(health.length).toBeGreaterThan(0);
    for (const entry of health) {
      expect(["NOT AVAILABLE", "NOT IMPLEMENTED"]).toContain(entry.health);
    }
  });

  it("derives known limitations automatically from every non-Implemented capability", () => {
    const capabilities = getCapabilityMatrix();
    const limitations = getKnownLimitations();
    const nonImplemented = capabilities.filter((c) => c.status !== "Implemented");

    expect(limitations).toHaveLength(nonImplemented.length);
    for (const capability of nonImplemented) {
      expect(limitations.some((l) => l.key === capability.key)).toBe(true);
    }
    // Nothing marked Implemented may leak into limitations.
    for (const limitation of limitations) {
      expect(limitation.status).not.toBe("Implemented");
    }
  });

  it("lists signing, PDF export, and observability gaps as known limitations", () => {
    const limitations = getKnownLimitations();
    const keys = limitations.map((l) => l.key);
    expect(keys).toContain("signing");
    expect(limitations.find((l) => l.key === "evidence_pack")?.detail).toMatch(/PDF/);
    expect(limitations.find((l) => l.key === "observability")?.detail).toMatch(/metrics|tracing/i);
  });

  it("computes the enterprise readiness matrix without any numeric score", () => {
    const readiness = getEnterpriseReadinessMatrix();
    expect(readiness.length).toBeGreaterThan(0);
    for (const row of readiness) {
      expect(typeof row.dimension).toBe("string");
      expect(typeof row.assessment).toBe("string");
      expect(Array.isArray(row.citedSources)).toBe(true);
      // No row may claim a bare numeric/percentage score as its assessment.
      expect(row.assessment).not.toMatch(/^\d+%?$/);
    }
    const dimensions = readiness.map((row) => row.dimension);
    for (const expected of [
      "Architecture",
      "Runtime",
      "Governance",
      "Evidence",
      "Operations",
      "Security",
      "Pilot Readiness (Implementation only)",
      "Deployment Readiness",
      "Production Readiness",
    ]) {
      expect(dimensions).toContain(expected);
    }
  });

  it("reports UNKNOWN rather than assuming production readiness", () => {
    const readiness = getEnterpriseReadinessMatrix();
    const production = readiness.find((row) => row.dimension === "Production Readiness");
    expect(production?.assessment).toMatch(/UNKNOWN/);
    expect(production?.citedSources).toEqual([]);
  });

  it("builds a version matrix from real exported constants, not hand-typed strings", () => {
    const versions = getVersionMatrix();
    expect(versions.length).toBeGreaterThanOrEqual(10);
    for (const entry of versions) {
      expect(entry.version.length).toBeGreaterThan(0);
      expect(entry.source.length).toBeGreaterThan(0);
    }
    const byKey = Object.fromEntries(versions.map((v) => [v.key, v]));
    expect(byKey.runtime_persistence.version).toBe("ag-3e.1");
    expect(byKey.runtime_queue.version).toBe("ag-3d.1");
    expect(byKey.agent_gateway.version).toBe("ag-2.0.0");
  });

  it("reports platform overview honestly — only version/environment are live values", () => {
    const overview = getPlatformOverview();
    expect(overview.version.length).toBeGreaterThan(0);
    expect(overview.environment.length).toBeGreaterThan(0);
    expect(overview.buildTimestamp).toBeNull();
    expect(overview.gitCommit).toBeNull();
    expect(overview.deploymentStatus).toBe("NOT AVAILABLE");
  });

  it("supplies status, detail, and evidence for every evidence-integrity and governance entry", () => {
    for (const entries of [getEvidenceIntegrity(), getGovernanceStatus()]) {
      for (const entry of entries) {
        expect(entry.label.length).toBeGreaterThan(0);
        expect(entry.detail.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("TC-1 Enterprise Trust Center — components", () => {
  it("renders the capability matrix with implemented and unavailable systems distinguished", () => {
    render(React.createElement(CapabilityMatrix, { capabilities: getCapabilityMatrix() }));

    const matrix = screen.getByTestId("capability-matrix");
    expect(matrix).toBeInTheDocument();
    expect(within(matrix).getByTestId("capability-row-executive_review")).toHaveTextContent("Executive Review");
    expect(within(matrix).getByTestId("capability-row-executive_review")).toHaveTextContent("Implemented");
    expect(within(matrix).getByTestId("capability-row-scenario_templates")).toHaveTextContent("Implemented");
    expect(within(matrix).getByTestId("capability-row-rts_1")).toHaveTextContent("Partially Implemented");
  });

  it("keeps unavailable systems unavailable in the rendered health card (never a healthy badge)", () => {
    const entry = getRuntimeHealth().find((e) => e.key === "runtime_gateway")!;
    render(React.createElement(SystemHealthCard, { entry }));

    const card = screen.getByTestId("health-card-runtime_gateway");
    expect(card).toHaveAttribute("data-health", "NOT AVAILABLE");
    expect(card).toHaveTextContent("NOT AVAILABLE");
    expect(card).not.toHaveTextContent("Healthy");
  });

  it("renders the version matrix with every row's component and version", () => {
    render(React.createElement(VersionMatrix, { versions: getVersionMatrix() }));

    const matrix = screen.getByTestId("version-matrix");
    expect(within(matrix).getByTestId("version-row-runtime_persistence")).toHaveTextContent("ag-3e.1");
    expect(within(matrix).getByTestId("version-row-evidence_pack")).toBeInTheDocument();
  });

  it("renders the platform overview without fabricating a build timestamp or commit", () => {
    render(
      React.createElement(TrustCenterOverview, {
        overview: getPlatformOverview(),
        generatedAt: "2026-07-09T00:00:00.000Z",
      }),
    );

    expect(screen.getByTestId("trust-center-overview")).toBeInTheDocument();
    expect(screen.getByTestId("overview-value-build-timestamp")).toHaveTextContent("NOT AVAILABLE");
    expect(screen.getByTestId("overview-value-git-commit")).toHaveTextContent("NOT AVAILABLE");
    expect(screen.getByTestId("overview-value-deployment-status")).toHaveTextContent("NOT AVAILABLE");
  });
});

describe("TC-1 Enterprise Trust Center — page and routing", () => {
  it("registers /enterprise/trust and preserves the existing /trust route", () => {
    const routes = read("src/routes/index.tsx");
    expect(routes).toContain('path: "/enterprise/trust"');
    expect(routes).toContain('path: "/trust"');
    expect(routes).toContain("SecurityTrustCenter");
  });

  it("contains the required sections: Overview, Capability Matrix, Runtime, Governance, Evidence, Versions, Limitations", () => {
    const page = read("src/pages/TrustCenter.tsx");
    for (const marker of [
      "Platform Overview",
      "Capability Matrix",
      "Runtime Health",
      "Governance Status",
      "Evidence Integrity",
      "Version Matrix",
      "Known Limitations",
    ]) {
      expect(page).toContain(marker);
    }
  });

  it("contains no fake dashboards, graphs, or uptime claims", () => {
    const page = read("src/pages/TrustCenter.tsx");
    expect(page).not.toMatch(/uptime.*99\.\d/i);
    expect(page).not.toContain("recharts");
    expect(page).not.toContain("<LineChart");
    expect(page).not.toContain("<BarChart");
  });

  it("only imports version constants, never behavior, from AG/RTS/Evidence Pack modules", () => {
    const lib = read("src/lib/trust-center.ts");
    const importBlock = lib.slice(0, lib.indexOf("export const TRUST_CENTER_SCHEMA_VERSION") === -1
      ? lib.indexOf("export function getPlatformOverview")
      : lib.indexOf("export const TRUST_CENTER_SCHEMA_VERSION"));
    // The import section must never pull in a runtime/gateway/evidence-pack factory or processor function.
    expect(importBlock).not.toMatch(/createRuntimeGateway|createRuntimeQueue|createRuntimePersistence|processAgentGatewayRequest\s*,|\{\s*processAgentGatewayRequest/);
    expect(importBlock).not.toMatch(/import\s*\{\s*buildEvidencePack/);
  });
});
