export type BillingTier = "starter" | "growth" | "enterprise";
export type SelfServeBillingTier = "starter" | "growth";
export type BillingInterval = "month" | "year";

export type SelfServeCatalogEntry = {
  tier: SelfServeBillingTier;
  interval: BillingInterval;
  priceId: string;
  productId: string;
};

const SELF_SERVE_CATALOG: Record<SelfServeBillingTier, Record<BillingInterval, SelfServeCatalogEntry>> = {
  starter: {
    month: {
      tier: "starter",
      interval: "month",
      priceId: "price_1T6Ji8JYFIBeCvef4RkHSCfw",
      productId: "prod_U4SdCda1dcZAtu",
    },
    year: {
      tier: "starter",
      interval: "year",
      priceId: "price_1TiqhyJYFIBeCvefcRRwNfor",
      productId: "prod_U4SdCda1dcZAtu",
    },
  },
  growth: {
    month: {
      tier: "growth",
      interval: "month",
      priceId: "price_1TCfwlJYFIBeCvefvzY9z5m9",
      productId: "prod_UB202T0yfALsxx",
    },
    year: {
      tier: "growth",
      interval: "year",
      priceId: "price_1TiqiLJYFIBeCvef3CEFlzIL",
      productId: "prod_UB202T0yfALsxx",
    },
  },
};

const PRODUCT_TIERS: Record<string, BillingTier> = {
  prod_U4SdCda1dcZAtu: "starter",
  prod_UB202T0yfALsxx: "growth",
  prod_U1oN5CDeptb9uY: "enterprise",
};

const PRICE_INDEX = new Map<string, SelfServeCatalogEntry>(
  Object.values(SELF_SERVE_CATALOG).flatMap((byInterval) => Object.values(byInterval).map((entry) => [entry.priceId, entry] as const)),
);

export function isSelfServeBillingTier(value: unknown): value is SelfServeBillingTier {
  return value === "starter" || value === "growth";
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "month" || value === "year";
}

export function getSelfServeCatalogEntry(
  tier: SelfServeBillingTier,
  interval: BillingInterval,
): SelfServeCatalogEntry {
  return SELF_SERVE_CATALOG[tier][interval];
}

export function getSelfServeCatalogEntryByPrice(priceId: string): SelfServeCatalogEntry | null {
  return PRICE_INDEX.get(priceId) ?? null;
}

export function getTierForProduct(productId: string): BillingTier | null {
  return PRODUCT_TIERS[productId] ?? null;
}
