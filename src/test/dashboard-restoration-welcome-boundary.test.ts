import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const dashboard = readFileSync(resolve(root, "src/pages/Dashboard.tsx"), "utf8");

describe("dashboard restoration welcome boundary", () => {
  it("does not equate finished context loading with permission to show first-run onboarding", () => {
    expect(dashboard).toContain("const [onboardingVerifiedComplete, setOnboardingVerifiedComplete] = useState(false)");
    expect(dashboard).toContain("if (orgLoading || !currentOrgId)");
    expect(dashboard).toContain("setOnboardingVerifiedComplete(false)");
    expect(dashboard).toContain("if (!data.onboarding_completed)");
    expect(dashboard).toContain("setOnboardingVerifiedComplete(true)");
    expect(dashboard).toContain(
      "const showWelcomeFlow = !isDemoUser && !isContextLoading && onboardingVerifiedComplete;",
    );
    expect(dashboard).not.toContain("const showWelcomeFlow = !isDemoUser && !isContextLoading;");
  });

  it("keeps unverified and incomplete onboarding states fail closed", () => {
    expect(dashboard).toContain('setOnboardingVerificationError("Organization onboarding status could not be verified.")');
    expect(dashboard).toContain('navigate("/onboarding", { replace: true })');
    expect(dashboard).toContain('const cacheKey = `onboarding_checked_${currentOrgId}`');
    expect(dashboard).toContain('sessionStorage.setItem(cacheKey, "done")');
  });
});
