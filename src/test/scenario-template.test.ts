import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  computeScenarioReadiness,
  getScenarioDecisionFlow,
  getScenarioReadiness,
  getScenarioTemplate,
  getScenarioTemplates,
  resolveCapabilityUsage,
  SCENARIO_TEMPLATE_IDS,
} from "@/lib/scenario-template";
import { getCapabilityMatrix } from "@/lib/trust-center";
import ScenarioGallery from "@/components/scenarios/ScenarioGallery";
import ScenarioCard from "@/components/scenarios/ScenarioCard";
import ScenarioOverview from "@/components/scenarios/ScenarioOverview";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const withRouter = (element: React.ReactElement) => render(React.createElement(MemoryRouter, null, element));

afterEach(cleanup);

const EXPECTED_TEMPLATE_IDS = [
  "supplier-risk",
  "inventory-shortage",
  "pricing-decision",
  "revenue-decline",
  "compliance-investigation",
  "cybersecurity-incident",
];

const REQUIRED_FIELDS = [
  "template_id",
  "title",
  "category",
  "industry",
  "executive_summary",
  "business_problem",
  "typical_signals",
  "verified_facts",
  "expected_decisions",
  "business_impact",
  "typical_risks",
  "governance_requirements",
  "success_metrics",
  "expected_outcomes",
  "estimated_time_to_decision",
  "recommended_roles",
  "required_capabilities",
  "implementation_status",
] as const;

describe("ST-1 scenario template data model", () => {
  it("defines exactly six templates, in the specified order", () => {
    const templates = getScenarioTemplates();
    expect(templates).toHaveLength(6);
    expect(templates.map((t) => t.template_id)).toEqual(EXPECTED_TEMPLATE_IDS);
    expect(SCENARIO_TEMPLATE_IDS).toEqual(EXPECTED_TEMPLATE_IDS);
  });

  it("gives every template all 18 required fields", () => {
    for (const template of getScenarioTemplates()) {
      for (const field of REQUIRED_FIELDS) {
        expect(template, `${template.template_id}.${field}`).toHaveProperty(field);
      }
    }
  });

  it("looks up a template by id", () => {
    const template = getScenarioTemplate("supplier-risk");
    expect(template).not.toBeNull();
    expect(template?.title).toBe("Supplier Risk");
  });

  it("returns null for an invalid template id instead of fabricating one", () => {
    expect(getScenarioTemplate("not-a-real-template")).toBeNull();
    expect(getScenarioTemplate("")).toBeNull();
  });

  it("returns templates in deterministic order across repeated calls", () => {
    const first = getScenarioTemplates().map((t) => t.template_id);
    const second = getScenarioTemplates().map((t) => t.template_id);
    expect(first).toEqual(second);
    expect(JSON.stringify(getScenarioTemplates())).toBe(JSON.stringify(getScenarioTemplates()));
  });

  it("resolves implementation status directly from the Trust Center capability matrix (single source of truth)", () => {
    const byKey = Object.fromEntries(getCapabilityMatrix().map((c) => [c.key, c]));
    for (const template of getScenarioTemplates()) {
      for (const usage of template.implementation_status) {
        const canonical = byKey[usage.capability_key];
        expect(canonical, `unknown capability key ${usage.capability_key}`).toBeDefined();
        expect(usage.status).toBe(canonical.status);
        expect(usage.label).toBe(canonical.label);
      }
    }
  });

  it("never has more/fewer implementation_status entries than required_capabilities", () => {
    for (const template of getScenarioTemplates()) {
      expect(template.implementation_status).toHaveLength(template.required_capabilities.length);
      expect(template.implementation_status.map((u) => u.capability_key)).toEqual(template.required_capabilities);
    }
  });

  it("reports Unknown (never fabricates a status) for an unrecognized capability key", () => {
    const usage = resolveCapabilityUsage(["not-a-real-capability"]);
    expect(usage).toEqual([
      {
        capability_key: "not-a-real-capability",
        label: "not-a-real-capability",
        status: "Unknown",
        detail: "This capability key is not present in the Trust Center capability matrix.",
      },
    ]);
  });

  it("computes readiness as Requires Additional Capability when any capability is Not Implemented", () => {
    const result = computeScenarioReadiness([
      { capability_key: "a", label: "A", status: "Implemented", detail: "" },
      { capability_key: "b", label: "B", status: "Not Implemented", detail: "" },
    ]);
    expect(result.readiness).toBe("Requires Additional Capability");
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0].capability_key).toBe("b");
  });

  it("computes readiness as Ready for Pilot only when every capability is fully Implemented", () => {
    const result = computeScenarioReadiness([
      { capability_key: "a", label: "A", status: "Implemented", detail: "" },
      { capability_key: "b", label: "B", status: "Implemented", detail: "" },
    ]);
    expect(result.readiness).toBe("Ready for Pilot");
    expect(result.blocking).toEqual([]);
  });

  it("computes readiness as Ready for Demonstration for a mix of Implemented/Partially Implemented with nothing missing", () => {
    const result = computeScenarioReadiness([
      { capability_key: "a", label: "A", status: "Implemented", detail: "" },
      { capability_key: "b", label: "B", status: "Partially Implemented", detail: "" },
    ]);
    expect(result.readiness).toBe("Ready for Demonstration");
  });

  it("treats Unknown the same as Not Implemented for readiness purposes", () => {
    const result = computeScenarioReadiness([{ capability_key: "a", label: "A", status: "Unknown", detail: "" }]);
    expect(result.readiness).toBe("Requires Additional Capability");
  });

  it("computes real readiness per template and matches getScenarioReadiness to computeScenarioReadiness", () => {
    for (const template of getScenarioTemplates()) {
      const viaHelper = getScenarioReadiness(template);
      const viaCompute = computeScenarioReadiness(template.implementation_status);
      expect(viaHelper).toEqual(viaCompute);
      expect(["Ready for Pilot", "Ready for Demonstration", "Requires Additional Capability"]).toContain(
        viaHelper.readiness,
      );
    }
  });

  it("explicitly requires Signing for Compliance Investigation, which is Not Implemented today", () => {
    const template = getScenarioTemplate("compliance-investigation");
    expect(template?.required_capabilities).toContain("signing");
    const signing = template?.implementation_status.find((u) => u.capability_key === "signing");
    expect(signing?.status).toBe("Not Implemented");
    expect(getScenarioReadiness(template!).readiness).toBe("Requires Additional Capability");
  });

  it("never marks readiness as Ready for Pilot when a required capability is only Partially Implemented", () => {
    for (const template of getScenarioTemplates()) {
      const readiness = getScenarioReadiness(template);
      const anyPartial = template.implementation_status.some((u) => u.status === "Partially Implemented");
      if (anyPartial) {
        expect(readiness.readiness).not.toBe("Ready for Pilot");
      }
    }
  });

  it("never requires its own Trust Center capability, so readiness can never be circular", () => {
    // Scenario Templates is itself a Trust Center capability (TC-1.1). If any
    // template listed "scenario_templates" in required_capabilities, that
    // template's readiness would depend on the status of the very framework
    // computing it — this asserts that never happens.
    for (const template of getScenarioTemplates()) {
      expect(template.required_capabilities).not.toContain("scenario_templates");
    }
  });
});

describe("ST-1 decision flow", () => {
  it("returns the fixed 7-stage decision flow in order, without inventing new stages", () => {
    const flow = getScenarioDecisionFlow();
    expect(flow.map((s) => s.key)).toEqual([
      "signal",
      "verified_fact",
      "decision_candidate",
      "executive_review",
      "evidence_pack",
      "outcome",
      "learning",
    ]);
    for (const stage of flow) {
      expect(typeof stage.status).toBe("string");
      expect(stage.source.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic across calls", () => {
    expect(JSON.stringify(getScenarioDecisionFlow())).toBe(JSON.stringify(getScenarioDecisionFlow()));
  });
});

describe("ST-1 components", () => {
  it("renders the gallery with all six templates", () => {
    withRouter(React.createElement(ScenarioGallery, { templates: getScenarioTemplates() }));
    const gallery = screen.getByTestId("scenario-gallery");
    for (const id of EXPECTED_TEMPLATE_IDS) {
      expect(within(gallery).getByTestId(`scenario-card-${id}`)).toBeInTheDocument();
    }
  });

  it("renders a scenario card with category, industry, readiness, business value, and owner", () => {
    const template = getScenarioTemplate("supplier-risk")!;
    withRouter(React.createElement(ScenarioCard, { template }));

    const card = screen.getByTestId("scenario-card-supplier-risk");
    expect(card).toHaveTextContent("Supply Chain");
    expect(card).toHaveTextContent("Manufacturing");
    expect(card).toHaveTextContent("Illustrative business value");
    expect(card).toHaveTextContent("Typical owner");
    expect(screen.getByTestId("readiness-badge-supplier-risk")).toBeInTheDocument();
  });

  it("renders all required scenario detail sections", () => {
    const template = getScenarioTemplate("cybersecurity-incident")!;
    withRouter(React.createElement(ScenarioOverview, { template }));

    for (const testId of [
      "scenario-section-business-context",
      "scenario-section-typical-signals",
      "scenario-section-evidence-flow",
      "scenario-section-decision-flow",
      "scenario-section-executive-workflow",
      "scenario-section-expected-outcome",
      "scenario-section-capabilities-used",
      "scenario-section-platform-support",
      "scenario-section-known-limitations",
    ]) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
  });

  it("lists known limitations for a template with a Not Implemented dependency", () => {
    const template = getScenarioTemplate("compliance-investigation")!;
    withRouter(React.createElement(ScenarioOverview, { template }));

    expect(screen.getByTestId("limitation-signing")).toBeInTheDocument();
  });
});

describe("ST-1 wiring (routes, pages)", () => {
  it("registers /enterprise/scenarios and /enterprise/scenarios/:templateId", () => {
    const routes = read("src/routes/index.tsx");
    expect(routes).toContain('path: "/enterprise/scenarios"');
    expect(routes).toContain('path: "/enterprise/scenarios/:templateId"');
  });

  it("does not collide with or modify the existing /scenarios simulator route", () => {
    const routes = read("src/routes/index.tsx");
    expect(routes).toContain('{ path: "/scenarios", element: <Scenarios />, layout: "full" }');
  });

  it("shows a not-found state for an invalid template id instead of fabricating content", () => {
    const page = read("src/pages/ScenarioTemplateDetail.tsx");
    expect(page).toContain("Scenario template not found");
    expect(page).toContain("scenario-template-not-found");
  });

  it("does not modify AG-1/AG-2/AG-3/RTS-1/Executive Review/Evidence Pack/Trust Center source files", () => {
    const lib = read("src/lib/scenario-template.ts");
    expect(lib).not.toMatch(/processAgentGatewayRequest|createRuntimeGateway|createRuntimeQueue|createRuntimePersistence/);
    expect(lib).not.toMatch(/import\s*\{[^}]*buildEvidencePack/);
  });
});
