export type CommercialPlan = "starter" | "growth";
export type CommercialBillingInterval = "month" | "year";

export interface CommercialSignupIntent {
  plan: CommercialPlan;
  billingInterval: CommercialBillingInterval;
  createdAt: number;
}

const COMMERCIAL_INTENT_KEY = "quantivis_commercial_signup_intent_v1";
const COMMERCIAL_INTENT_TTL_MS = 24 * 60 * 60 * 1000;

export const isCommercialPlan = (value: string | null | undefined): value is CommercialPlan =>
  value === "starter" || value === "growth";

export const saveCommercialSignupIntent = (
  plan: CommercialPlan,
  billingInterval: CommercialBillingInterval = "month",
) => {
  const intent: CommercialSignupIntent = {
    plan,
    billingInterval,
    createdAt: Date.now(),
  };
  localStorage.setItem(COMMERCIAL_INTENT_KEY, JSON.stringify(intent));
  return intent;
};

export const clearCommercialSignupIntent = () => {
  localStorage.removeItem(COMMERCIAL_INTENT_KEY);
};

export const readCommercialSignupIntent = (): CommercialSignupIntent | null => {
  const raw = localStorage.getItem(COMMERCIAL_INTENT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CommercialSignupIntent>;
    const validPlan = isCommercialPlan(parsed.plan);
    const validInterval = parsed.billingInterval === "month" || parsed.billingInterval === "year";
    const validCreatedAt = typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt);
    const ageMs = validCreatedAt ? Date.now() - parsed.createdAt! : Number.POSITIVE_INFINITY;

    if (!validPlan || !validInterval || !validCreatedAt || ageMs < 0 || ageMs > COMMERCIAL_INTENT_TTL_MS) {
      clearCommercialSignupIntent();
      return null;
    }

    return parsed as CommercialSignupIntent;
  } catch {
    clearCommercialSignupIntent();
    return null;
  }
};
