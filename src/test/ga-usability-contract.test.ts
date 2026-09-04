import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAllowedPaths } from "@/hooks/useRoleNav";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("GA usability contract", () => {
  it("keeps demo UI state on server-owned app metadata", () => {
    const dashboard = read("../pages/Dashboard.tsx");
    expect(dashboard).toContain("user?.app_metadata?.is_demo === true");
    expect(dashboard).not.toContain("user?.user_metadata?.is_demo");
  });

  it("uses the executive hero for review and Ask Quantivis rather than duplicate refresh", () => {
    const driver = read("../components/dashboard/ExecutiveDailyDriver.tsx");
    expect(driver).toContain("Review top decision");
    expect(driver).toContain("Ask Quantivis");
    expect(driver).not.toContain("Refresh intelligence");
  });

  it("keeps one main landmark on the core protected journey", () => {
    const shell = read("../components/layout/ProtectedShell.tsx");
    expect(shell.match(/<main\b/g)?.length ?? 0).toBe(1);
    for (const page of ["../pages/Dashboard.tsx", "../components/dashboard/ExecutiveDailyDriver.tsx", "../pages/DecisionLedger.tsx", "../pages/Outcomes.tsx", "../pages/Billing.tsx"]) {
      expect(read(page)).not.toMatch(/<main\b/);
    }
  });

  it("prioritizes Ask and Outcomes on mobile while retaining Reports", () => {
    const mobile = read("../components/layout/MobileTabBar.tsx");
    expect(mobile).toContain('label: "Ask"');
    expect(mobile).toContain('label: "Outcomes"');
    expect(mobile).toContain('label: "Reports"');
  });

  it("fails protected navigation closed until verified role evidence resolves", () => {
    expect(getAllowedPaths(null).size).toBe(0);
    expect(getAllowedPaths(undefined).size).toBe(0);
    expect(getAllowedPaths("unexpected-role" as any).size).toBe(0);
    expect(getAllowedPaths("owner").has("/dashboard")).toBe(true);

    const sidebar = read("../components/dashboard/DashboardSidebar.tsx");
    expect(sidebar).not.toContain('!orgRole || orgRole === "owner"');
    expect(sidebar).toContain('orgRole === "owner" || orgRole === "admin" || orgRole === "executive" || orgRole === "steward"');
  });

  it("requires an explicit data-source choice during onboarding", () => {
    const onboarding = read("../pages/OnboardingWizard.tsx");
    expect(onboarding).toContain('const [dataOption, setDataOption] = useState("")');
    expect(onboarding).toContain("case 4: return Boolean(dataOption);");
  });

  it("keeps annual commercial totals aligned to annual pricing", () => {
    const tiers = read("../lib/stripe-tiers.ts");
    expect(tiers).toContain("entryAnnual: TIERS.starter.price_annual * 12");
    expect(tiers).toContain("governanceAnnual: TIERS.growth.price_annual * 12");
  });
});
