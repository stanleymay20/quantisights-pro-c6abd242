import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COMMERCIAL_TERMS, TIERS } from "@/lib/stripe-tiers";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("commercial source of truth", () => {
  it("derives published entry and governance terms from configured checkout tiers", () => {
    expect(COMMERCIAL_TERMS.entryMonthly).toBe(TIERS.starter.price);
    expect(COMMERCIAL_TERMS.entryAnnual).toBe(TIERS.starter.price * 12);
    expect(COMMERCIAL_TERMS.governanceMonthly).toBe(TIERS.growth.price);
    expect(COMMERCIAL_TERMS.trialDays).toBe(14);
  });

  it("matches the first-subscriber trial enforced by checkout", () => {
    const checkout = read("supabase/functions/create-checkout/index.ts");
    expect(checkout).toContain(`trial_period_days: ${COMMERCIAL_TERMS.trialDays}`);
    expect(checkout).toContain("hadTrial ? {} :");
  });

  it("does not publish superseded prices on primary commercial surfaces", () => {
    const primary = [
      "src/pages/Pricing.tsx",
      "src/pages/Register.tsx",
      "src/pages/Index.tsx",
      "src/pages/Compare.tsx",
      "src/pages/CompetitiveAnalysis.tsx",
      "src/components/landing/ComparisonSection.tsx",
    ].map(read).join("\n");
    expect(primary).not.toContain("€99");
    expect(primary).not.toContain("€2,400");
    expect(primary).not.toContain("30-day pilot");
    expect(primary).not.toContain("90-day pilot");
  });

  it("qualifies trial eligibility and checkout terms", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const register = read("src/pages/Register.tsx");
    expect(pricing).toContain("COMMERCIAL_TERMS.trialEligibility");
    expect(pricing).toContain("COMMERCIAL_TERMS.trialCheckoutDisclosure");
    expect(register).toContain("Terms shown at checkout");
  });
});
