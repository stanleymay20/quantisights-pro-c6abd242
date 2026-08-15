import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COMMERCIAL_TERMS, TIERS } from "@/lib/stripe-tiers";
import { PILOT_TERMS } from "@/lib/pilot-terms";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("commercial source of truth", () => {
  it("derives published entry and governance terms from configured checkout tiers", () => {
    expect(COMMERCIAL_TERMS.entryMonthly).toBe(TIERS.starter.price);
    expect(COMMERCIAL_TERMS.entryAnnual).toBe(TIERS.starter.price * 12);
    expect(COMMERCIAL_TERMS.governanceMonthly).toBe(TIERS.growth.price);
    expect(COMMERCIAL_TERMS.trialDays).toBe(14);
  });

  it("keeps the paid Stripe checkout trial separate from the no-card pilot", () => {
    const checkout = read("supabase/functions/create-checkout/index.ts");
    expect(checkout).toContain(`trial_period_days: ${COMMERCIAL_TERMS.trialDays}`);
    expect(checkout).toContain("hadTrial ? {} :");

    expect(PILOT_TERMS.days).toBe(30);
    expect(PILOT_TERMS.tier).toBe("growth");
    expect(PILOT_TERMS.requiresCard).toBe(false);
    expect(PILOT_TERMS.autoRenews).toBe(false);
  });

  it("puts a finite no-card pilot before payment on the primary self-serve funnel", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const register = read("src/pages/Register.tsx");
    const onboarding = read("supabase/functions/complete-onboarding/index.ts");
    const activation = read("supabase/functions/activate-pilot/index.ts");
    const pilotAccess = read("supabase/functions/_shared/pilot-access.ts");
    const trialExpiry = read("supabase/migrations/20260816002500_enforce_trial_expiry.sql");

    expect(pricing).toContain('"activate-pilot"');
    expect(pricing).toContain("No card required");
    expect(pricing).toContain("does not auto-renew");
    expect(register).toContain("No card required and no automatic renewal");
    expect(onboarding).toContain("grantPilotAccess");
    expect(activation).toContain("no_card_required: true");
    expect(activation).toContain("auto_renews: false");
    expect(pilotAccess).toContain('PILOT_TIER = "growth"');
    expect(pilotAccess).toContain("PILOT_DAYS = 30");
    expect(pilotAccess).toContain("pilot_already_used");
    expect(trialExpiry).toContain("_sub.trial_end <= _now");
    expect(trialExpiry).toContain("trial_expired");
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
    expect(primary).not.toContain("90-day pilot");
  });

  it("qualifies paid checkout terms without presenting them as the only evaluation path", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const register = read("src/pages/Register.tsx");
    expect(pricing).toContain("COMMERCIAL_TERMS.trialEligibility");
    expect(pricing).toContain("COMMERCIAL_TERMS.trialCheckoutDisclosure");
    expect(register).toContain("COMMERCIAL_TERMS.trialEligibility");
    expect(pricing).toContain("Explore first, pay later");
  });
});
