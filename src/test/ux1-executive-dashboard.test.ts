import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("UX-1 executive dashboard contract", () => {
  it("prioritizes the executive brief before operational detail", () => {
    const dashboard = read("src/components/dashboard/ExecutiveDailyDriver.tsx");

    expect(dashboard).toContain("Executive Brief");
    expect(dashboard).toContain("Next Best Decision");
    expect(dashboard).toContain("Verified by AICIS");
    expect(dashboard).toContain("Business Health");
    expect(dashboard).toContain("Recent Outcomes");

    expect(dashboard.indexOf("Executive Brief")).toBeLessThan(
      dashboard.indexOf("Next Best Decision"),
    );
    expect(dashboard.indexOf("Next Best Decision")).toBeLessThan(
      dashboard.indexOf("Business Health"),
    );
  });

  it("does not expose approve or reject as first-touch dashboard actions", () => {
    const dashboard = read("src/components/dashboard/ExecutiveDailyDriver.tsx");

    expect(dashboard).toContain("Review evidence");
    expect(dashboard).toContain("What happens if you approve");
    expect(dashboard).not.toContain(">Approve<");
    expect(dashboard).not.toContain(">Reject<");
  });

  it("uses executive-facing navigation labels and avoids broken workspace links", () => {
    const sidebar = read("src/components/dashboard/DashboardSidebar.tsx");
    const mobileTabs = read("src/components/layout/MobileTabBar.tsx");
    const routes = read("src/routes/index.tsx");

    for (const label of ["Dashboard", "Decisions", "Operations", "Reports", "Governance", "Settings"]) {
      expect(sidebar).toContain(`label: "${label}"`);
    }

    expect(sidebar).not.toContain('label: "Home"');
    expect(sidebar).not.toContain('label: "Outcomes"');
    expect(sidebar).not.toContain('label: "Workspace"');
    expect(sidebar).not.toContain('path: "/workspace"');
    expect(mobileTabs).not.toContain('label: "Workspace"');
    expect(routes).toContain('path: "/workspace"');
  });
});
