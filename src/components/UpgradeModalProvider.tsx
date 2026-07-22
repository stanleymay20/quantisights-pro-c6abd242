import { useEffect, useState } from "react";
import UpgradeModal from "@/components/UpgradeModal";
import type { UpgradeRequiredDetail } from "@/lib/edge-function-retry";

/**
 * App-wide listener for `quantivis:upgrade-required` events emitted by
 * `invokeWithRetry` when an edge function returns 402 Payment Required.
 * Shows the upgrade modal automatically — no per-page wiring needed.
 */
const UpgradeModalProvider = () => {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<UpgradeRequiredDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<UpgradeRequiredDetail>;
      if (!ce.detail) return;
      setDetail(ce.detail);
      setOpen(true);
    };
    window.addEventListener("quantivis:upgrade-required", handler);
    return () => window.removeEventListener("quantivis:upgrade-required", handler);
  }, []);

  if (!detail) return null;

  // Reason "tier_insufficient" with no_subscription / inactive → enterprise upsell only
  // when the message mentions enterprise; otherwise default to growth.
  const requiredTier: "growth" | "enterprise" =
    /enterprise/i.test(detail.message) || /sso|bias|counterfactual|multi-org/i.test(detail.feature)
      ? "enterprise"
      : "growth";

  return (
    <UpgradeModal
      open={open}
      onOpenChange={setOpen}
      feature={detail.feature}
      requiredTier={requiredTier}
    />
  );
};

export default UpgradeModalProvider;
