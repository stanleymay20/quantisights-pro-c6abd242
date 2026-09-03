import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const reconcile = read("supabase/functions/check-subscription/index.ts");
const portal = read("supabase/functions/customer-portal/index.ts");
const webhook = read("supabase/functions/stripe-webhook/index.ts");

describe("subscription reconciliation boundary", () => {
  it("does not treat Stripe trialing or past_due as unbounded access", () => {
    expect(reconcile).toContain('subscription.status === "trialing" && stripeTrialEnd > now');
    expect(reconcile).toContain('subscription.status === "past_due"');
    expect(reconcile).toContain("graceEnd > now");
    expect(reconcile).toContain('const active = subscription.status === "active" || trialActive || inGrace');
    expect(reconcile).not.toContain('subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due"');
  });

  it("does not let a newer canceled record hide a relevant Stripe subscription", () => {
    expect(reconcile).toContain('.in("status", ["active", "trialing", "past_due"])');
    expect(reconcile).toContain("for (const stored of storedSubscriptions ?? [])");
  });

  it("keeps unlinked past_due recovery fail-closed", () => {
    expect(reconcile).toContain("past_due is intentionally excluded here");
    expect(reconcile).toContain('return (s.status === "active" || trialActive)');
  });

  it("opens billing portal against the effective tenant billing customer first", () => {
    expect(portal).toContain('if (row.status === "active") return 0');
    expect(portal).toContain('if (row.status === "trialing"');
    expect(portal).toContain('if (row.status === "past_due") return 2');
    expect(portal).toContain('row.stripe_customer_id.startsWith("cus_")');
    expect(portal).toContain("customer.deleted");
  });

  it("never completes lifecycle mutations that matched zero subscription rows", () => {
    expect(webhook).toContain("payment_failed subscription not linked yet");
    expect(webhook).toContain("payment_succeeded subscription not linked yet");
    expect(webhook).toContain("Updated Stripe subscription not linked yet");
    expect(webhook).toContain("Deleted Stripe subscription not linked yet");
  });
});
