import { describe, it, expect } from "vitest";

/**
 * Accessibility contract tests — verify key WCAG 2.1 AA requirements
 * are maintained in the codebase.
 */

describe("Accessibility Standards", () => {
  it("ProtectedShell has skip-to-content link", async () => {
    const mod = await import("fs");
    const content = mod.readFileSync("src/components/layout/ProtectedShell.tsx", "utf-8");
    expect(content).toContain('href="#main-content"');
    expect(content).toContain("Skip to main content");
    expect(content).toContain("sr-only");
  });

  it("ProtectedShell wraps children in <main> landmark", async () => {
    const mod = await import("fs");
    const content = mod.readFileSync("src/components/layout/ProtectedShell.tsx", "utf-8");
    expect(content).toContain('id="main-content"');
    expect(content).toContain('role="main"');
  });

  it("DashboardSidebar has navigation landmark", async () => {
    const mod = await import("fs");
    const content = mod.readFileSync("src/components/dashboard/DashboardSidebar.tsx", "utf-8");
    expect(content).toContain('aria-label');
    expect(content).toContain("<nav");
  });

  it("SystemHealthDashboard uses section landmark", async () => {
    const mod = await import("fs");
    const content = mod.readFileSync("src/components/dashboard/SystemHealthDashboard.tsx", "utf-8");
    expect(content).toContain('aria-label="System Intelligence Dashboard"');
    expect(content).toContain("<section");
  });

  it("ExecutiveDailyDriver (the live dashboard) uses section landmarks", async () => {
    const mod = await import("fs");
    const content = mod.readFileSync("src/components/dashboard/ExecutiveDailyDriver.tsx", "utf-8");
    expect(content).toContain("<section");
    expect(content).toContain("aria-labelledby");
  });

  it("Insight evidence toggle has aria-expanded / aria-controls", async () => {
    const mod = await import("fs");
    const content = mod.readFileSync("src/components/dashboard/InsightEvidencePanel.tsx", "utf-8");
    expect(content).toContain("aria-expanded");
    expect(content).toContain("aria-controls");
  });
});
