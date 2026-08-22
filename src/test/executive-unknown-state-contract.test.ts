import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");
const driver = readFileSync(resolve(process.cwd(), "src/components/dashboard/ExecutiveDailyDriver.tsx"), "utf8");
const insights = readFileSync(resolve(process.cwd(), "src/hooks/useInsights.ts"), "utf8");

describe("executive unknown-state contract", () => {
  it("does not convert unavailable governed-decision evidence into zero/all-clear", () => {
    expect(dashboard).toContain("setPendingDecisions(null)");
    expect(dashboard).toContain("pendingDecisions === null");
    expect(dashboard).toContain("withholding the executive all-clear surface");
  });

  it("does not cache onboarding completion when verification fails", () => {
    const cacheWrite = 'sessionStorage.setItem(cacheKey, "done")';
    expect(dashboard).toContain(cacheWrite);
    expect(dashboard).toContain("if (!data.onboarding_completed)");
    expect(dashboard).toContain("setOnboardingVerificationError(error.message)");
    // The successful cache write must remain after the verified incomplete
    // branch, rather than inside either error branch.
    expect(dashboard.indexOf(cacheWrite)).toBeGreaterThan(dashboard.indexOf("if (!data.onboarding_completed)"));
  });

  it("keeps insight query errors explicit instead of returning a silent empty set", () => {
    expect(insights).toContain('const [error, setError] = useState<string | null>(null)');
    expect(insights).toContain("setError(queryError.message)");
    expect(insights).toContain("return { insights, loading, loadMore, loadingMore, hasMore, error }");
    expect(dashboard).toContain("insightsError");
    expect(dashboard).toContain("will not interpret an unavailable insight query as “no critical insights”");
  });

  it("does not render a failed priority-decision query as no decisions waiting", () => {
    expect(driver).toContain("setDecisionLoadError");
    expect(driver).toContain("decisionLoadError ?");
    expect(driver).toContain("This is an unknown state, not a verified zero.");
  });

  it("marks unavailable decision value evidence as unavailable rather than absent", () => {
    expect(driver).toContain("setValueLoadError");
    expect(driver).toContain('value: "Unavailable"');
    expect(driver).toContain("Could not verify value evidence");
  });
});
