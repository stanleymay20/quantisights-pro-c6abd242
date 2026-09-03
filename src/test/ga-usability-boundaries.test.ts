import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { getAllowedPaths } from "@/hooks/useRoleNav";

describe("GA usability boundaries", () => {
  it("fails navigation closed until a verified org role exists", () => {
    expect(getAllowedPaths(null).size).toBe(0);
    expect(getAllowedPaths(undefined).size).toBe(0);
    expect(getAllowedPaths("owner").has("/dashboard")).toBe(true);
  });

  it("withholds protected navigation until authorization evidence is ready", () => {
    const shell = readFileSync("src/components/layout/ProtectedShell.tsx", "utf-8");
    expect(shell).toContain("const { evidenceReady } = usePermissions()");
    expect(shell).toContain("{evidenceReady && <DashboardSidebar />}");
    expect(shell).toContain("{evidenceReady && <MobileTabBar />}");
  });

  it("keeps one main landmark owned by ProtectedShell", () => {
    const shell = readFileSync("src/components/layout/ProtectedShell.tsx", "utf-8");
    const dashboard = readFileSync("src/pages/Dashboard.tsx", "utf-8");
    const driver = readFileSync("src/components/dashboard/ExecutiveDailyDriver.tsx", "utf-8");

    expect(shell).toContain('<main\n          id="main-content"');
    expect(dashboard).not.toContain("<main");
    expect(dashboard).not.toContain('id="main-content"');
    expect(driver).not.toContain("<main");
  });

  it("uses the executive hero for a distinct high-value action", () => {
    const driver = readFileSync("src/components/dashboard/ExecutiveDailyDriver.tsx", "utf-8");
    expect(driver).toContain('navigate("/app/copilot")');
    expect(driver).toContain("Ask Quantivis");
    expect(driver).not.toContain("Refresh intelligence");
  });

  it("uses consistent Executive Intel terminology on mobile", () => {
    const mobile = readFileSync("src/components/layout/MobileTabBar.tsx", "utf-8");
    expect(mobile).toContain('label: "Executive Intel"');
    expect(mobile).not.toContain('label: "Monitor"');
  });
});
