import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExecutiveBriefEmptyState,
  ExecutiveBriefHero,
} from "@/components/decisions/ExecutiveBriefHero";
import ExecutiveReviewFlow from "@/components/decisions/ExecutiveReviewFlow";
import OutcomePredictionPanel from "@/components/decisions/OutcomePredictionPanel";
import {
  DEMO_DECISION,
  EXECUTIVE_REVIEW_CHECKLIST,
  emptyReviewChecklistState,
  getExecutiveNarrative,
  isReviewChecklistComplete,
} from "@/components/decisions/executive-review-flow";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const withRouter = (element: React.ReactElement) =>
  render(React.createElement(MemoryRouter, null, element));

const renderReviewFlow = (overrides?: Partial<Parameters<typeof ExecutiveReviewFlow>[0]>) =>
  withRouter(
    React.createElement(ExecutiveReviewFlow, {
      decision: DEMO_DECISION,
      isDemo: true,
      onApprove: vi.fn(),
      onReject: vi.fn(),
      ...overrides,
    }),
  );

const completeChecklist = () => {
  for (const item of EXECUTIVE_REVIEW_CHECKLIST) {
    fireEvent.click(screen.getByTestId(`checklist-${item.key}`));
  }
};

afterEach(cleanup);

describe("UX-2 executive review flow", () => {
  it("renders the Executive Brief hero with impact, risk, confidence, evidence, and timeline", () => {
    withRouter(React.createElement(ExecutiveBriefHero, { decision: DEMO_DECISION, isDemo: true }));

    expect(screen.getByTestId("executive-brief-hero")).toBeInTheDocument();
    expect(screen.getByText(DEMO_DECISION.recommended_action as string)).toBeInTheDocument();
    expect(screen.getByText(getExecutiveNarrative(DEMO_DECISION))).toBeInTheDocument();
    expect(screen.getByText("Expected impact")).toBeInTheDocument();
    expect(screen.getByText("Risk level")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText("Estimated execution")).toBeInTheDocument();
    expect(screen.getByTestId("demo-decision-badge")).toBeInTheDocument();
    expect(screen.getByText("View Decision Ledger")).toBeInTheDocument();
  });

  it("routes the Review Decision CTA to /decisions/:id/review", () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/executive-brief"] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: "/executive-brief",
            element: React.createElement(ExecutiveBriefHero, { decision: DEMO_DECISION }),
          }),
          React.createElement(Route, {
            path: "/decisions/:id/review",
            element: React.createElement("p", null, "review-route-reached"),
          }),
        ),
      ),
    );

    fireEvent.click(screen.getByTestId("review-decision-cta"));
    expect(screen.getByText("review-route-reached")).toBeInTheDocument();
  });

  it("renders the empty state with a clearly-labelled demo option when no decision exists", () => {
    withRouter(React.createElement(ExecutiveBriefEmptyState));

    expect(screen.getByTestId("executive-brief-empty-state")).toBeInTheDocument();
    expect(screen.getByText("No decision requires your review right now")).toBeInTheDocument();
    expect(screen.getByTestId("demo-review-cta")).toHaveTextContent("demo decision (sample data)");
  });

  it("renders all 8 review sections in order", () => {
    renderReviewFlow();

    const sections = [
      "Executive Summary",
      "Decision Context",
      "Evidence",
      "Alternative Actions",
      "Business Impact",
      "Risks and Constraints",
      "Governance / Approval Checklist",
      "Final Decision Action",
    ];
    sections.forEach((title, index) => {
      const section = screen.getByTestId(`review-section-${index + 1}`);
      expect(section).toHaveAccessibleName(title);
    });
  });

  it("keeps Approve disabled until every checklist item is confirmed", () => {
    renderReviewFlow();

    const approve = screen.getByTestId("approve-button");
    expect(approve).toBeDisabled();

    // Checking all but one item must not enable approval.
    for (const item of EXECUTIVE_REVIEW_CHECKLIST.slice(0, -1)) {
      fireEvent.click(screen.getByTestId(`checklist-${item.key}`));
    }
    expect(approve).toBeDisabled();
  });

  it("enables Approve after the full checklist is confirmed and calls onApprove", () => {
    const onApprove = vi.fn();
    renderReviewFlow({ onApprove });

    completeChecklist();
    const approve = screen.getByTestId("approve-button");
    expect(approve).toBeEnabled();

    fireEvent.click(approve);
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("keeps Reject available with a working reason field", () => {
    const onReject = vi.fn();
    renderReviewFlow({ onReject });

    const rejectToggle = screen.getByTestId("reject-toggle");
    expect(rejectToggle).toBeEnabled();
    fireEvent.click(rejectToggle);

    const confirm = screen.getByTestId("confirm-reject-button");
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByTestId("reject-reason-input"), {
      target: { value: "Evidence is stale — benchmarks changed." },
    });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    expect(onReject).toHaveBeenCalledWith("Evidence is stale — benchmarks changed.");
  });

  it("hides raw JSON by default and only reveals it inside the technical disclosure", () => {
    renderReviewFlow();

    expect(screen.queryByTestId("technical-detail-json")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("technical-detail-toggle"));
    expect(screen.getByTestId("technical-detail-json")).toBeInTheDocument();
  });

  it("labels demo review actions as a simulation that is not persisted", () => {
    renderReviewFlow();

    expect(screen.getByTestId("demo-simulation-banner")).toHaveTextContent("not persisted");
    expect(screen.getByText(/Simulation \/ not persisted/)).toBeInTheDocument();
  });

  it("renders the outcome prediction panel with KPI movement, owner, criteria, and follow-up date", () => {
    withRouter(
      React.createElement(OutcomePredictionPanel, { decision: DEMO_DECISION, isDemo: true }),
    );

    expect(screen.getByTestId("outcome-prediction-panel")).toBeInTheDocument();
    expect(screen.getByText("Expected KPI movement")).toBeInTheDocument();
    expect(screen.getByText("Measurement timeline")).toBeInTheDocument();
    expect(screen.getByText("Owner / accountable role")).toBeInTheDocument();
    expect(screen.getByText("Success criteria")).toBeInTheDocument();
    expect(screen.getByText("Risks to monitor")).toBeInTheDocument();
    expect(screen.getByTestId("follow-up-review-date")).toBeInTheDocument();
    expect(screen.getByTestId("outcome-demo-badge")).toHaveTextContent("demo");
    expect(screen.getByTestId("outcome-feedback-placeholder")).toBeInTheDocument();
  });

  it("computes checklist completion deterministically", () => {
    const state = emptyReviewChecklistState();
    expect(isReviewChecklistComplete(state)).toBe(false);
    for (const item of EXECUTIVE_REVIEW_CHECKLIST) {
      state[item.key] = true;
    }
    expect(isReviewChecklistComplete(state)).toBe(true);
  });
});

describe("UX-2 wiring (routes, navigation, pages)", () => {
  it("registers the three UX-2 routes in the central route config", () => {
    const routes = read("src/routes/index.tsx");
    expect(routes).toContain('path: "/executive-brief"');
    expect(routes).toContain('path: "/decisions/:id/review"');
    expect(routes).toContain('path: "/decisions/:id/outcome"');
  });

  it("adds exactly one Executive Brief item to the sidebar", () => {
    const sidebar = read("src/components/dashboard/DashboardSidebar.tsx");
    const occurrences = sidebar.match(/label: "Executive Brief"/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(sidebar).toContain('path: "/executive-brief"');
  });

  it("links the Dashboard to the Executive Brief", () => {
    const dashboard = read("src/components/dashboard/ExecutiveDailyDriver.tsx");
    expect(dashboard).toContain('navigate("/executive-brief")');
    expect(dashboard).toContain("Open Executive Brief");
  });

  it("keeps the Executive Brief free of trust/status surface links", () => {
    const page = read("src/pages/ExecutiveBrief.tsx");
    const hero = read("src/components/decisions/ExecutiveBriefHero.tsx");
    for (const source of [page, hero]) {
      expect(source).not.toContain('"/trust"');
      expect(source).not.toContain('"/status"');
      expect(source).not.toContain('"/system-status"');
    }
  });

  it("routes approval onward to the outcome page via the atomic approve_decision RPC", () => {
    const review = read("src/pages/DecisionReview.tsx");
    // Approval, audit, execution-plan, and outcome-tracking creation must
    // commit as one privileged server-side transaction — the browser must
    // never write decision_status or audit_log directly (see
    // decision-approval-atomicity.test.ts for the full regression suite).
    expect(review).toContain('supabase.rpc("approve_decision"');
    expect(review).toContain('supabase.rpc("reject_decision"');
    expect(review).not.toContain('decision_status: "approved"');
    expect(review).not.toContain("onDecisionApproved");
    expect(review).toContain("/outcome");
    expect(review).toContain("DEMO_DECISION");
    expect(review).toContain("isDemoDecisionId");
  });
});
