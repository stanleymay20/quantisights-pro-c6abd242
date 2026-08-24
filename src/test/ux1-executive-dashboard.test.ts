import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("UX-1 executive dashboard contract", () => {
  it("prioritizes executive focus and governed decisions before supporting detail", () => {
    const dashboard = read("src/components/dashboard/ExecutiveDailyDriver.tsx");

    for (const marker of [
      "Executive focus",
      "What needs attention",
      "Priority decisions",
      "decision-time confidence",
      "Governed review required",
      "Evidence in view",
    ]) {
      expect(dashboard).toContain(marker);
    }

    expect(dashboard.indexOf("Executive focus")).toBeLessThan(dashboard.indexOf("Priority decisions"));
    expect(dashboard.indexOf("Priority decisions")).toBeLessThan(dashboard.indexOf("Why it matters"));
  });

  it("routes first-touch actions to review rather than approving or rejecting on the dashboard", () => {
    const dashboard = read("src/components/dashboard/ExecutiveDailyDriver.tsx");

    expect(dashboard).toContain("Review top decision");
    expect(dashboard).toContain('"/decisions?review=top"');
    expect(dashboard).toContain("Open full executive brief");
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
